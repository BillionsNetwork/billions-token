// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardTransientUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {IStakingRewards} from "./interfaces/IStakingRewards.sol";

/**
 * @title StakingRewards
 * @notice This contract is heavily inspired by Synthetix's StakingRewards contract.
 *         Original implementation: https://github.com/Synthetixio/synthetix/blob/develop/contracts/StakingRewards.sol
 * @dev A staking rewards contract that allows users to stake tokens and earn rewards over time.
 *      Rewards are distributed by a designated rewards distribution contract.
 *
 * CHANGELOG (from original Synthetix implementation):
 * ===================================================
 *
 * v1.0.0 - Upgradeable version with time-locked staking
 * -----------------------------------------------------
 *
 * Solidity & Compiler:
 * - Migrated from Solidity 0.5.16 to 0.8.30
 * - Removed SafeMath library (built-in overflow checks in Solidity 0.8+)
 * - Updated all arithmetic operations to use native Solidity 0.8+ syntax
 *
 * Upgradeable Pattern (OpenZeppelin):
 * - Converted to upgradeable pattern using OpenZeppelin's upgradeable contracts
 * - Replaced Owned with OwnableUpgradeable
 * - Replaced ReentrancyGuard with ReentrancyGuardTransientUpgradeable (EIP-1153 transient storage)
 * - Replaced custom Pausable with PausableUpgradeable
 * - Replaced constructor with initialize() function
 * - Added constructor with _disableInitializers() for implementation contract safety
 *
 * Contract Consolidation:
 * - Merged RewardsDistributionRecipient logic directly into StakingRewards contract
 * - Added RewardsDistributionUpdated event for better event tracking
 *
 * Admin Functions:
 * - Added pause() and unpause() functions for owner control
 * - Made rewardsDuration configurable via initialize() parameter
 *
 * Time-Locked Staking:
 * - Added LockedStake struct with amount, lockDuration, and unlockTimestamp fields
 * - Added addressToLockedStakes mapping to track user's locked stakes
 * - Updated stake() to require lockDuration parameter - each stake creates a new lock entry
 * - Updated withdraw() to require lockIndexToWithdraw[] - users specify which locks to withdraw from
 * - Updated exit() to require lockIndexToWithdraw[] parameter
 * - Added duplicate index validation in withdraw() to prevent double-counting exploits
 * - Added partial withdrawal support - can withdraw less than full lock amount
 *
 * Interface:
 * - Moved LockedStake struct to IStakingRewards interface for external accessibility
 * - Updated IStakingRewards interface with all public functions and state variable getters
 * - Added getLockedStakesCount() to interface for querying user lock count
 *
 * Security & Input Validation:
 * - Added zero address validation in initialize() for owner, rewardsDistribution, rewardsToken, stakingToken
 * - Added zero value validation for rewardsDuration in initialize() and setRewardsDuration()
 * - Added zero address validation in setRewardsDistribution()
 * - Fixed notifyRewardAmount() balance check when stakingToken == rewardsToken (subtracts _totalSupply)
 * - Updated Staked event to include lockDuration and lockIndex for better off-chain tracking
 * - Added getLockedStakesCount() view function for querying user's lock count
 * - Added comprehensive NatSpec documentation to all functions
 */
contract StakingRewards is IStakingRewards, OwnableUpgradeable, ReentrancyGuardTransientUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    IERC20 public rewardsToken;
    IERC20 public stakingToken;
    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public rewardsDuration;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    address public rewardsDistribution;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    
    /* ========== LOCK VARIABLES ========== */

    mapping(address => LockedStake[]) public addressToLockedStakes;
 
    /* ========== CONSTRUCTOR ========== */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the staking rewards contract
     * @param _owner The address that will own the contract
     * @param _rewardsDistribution The address authorized to notify reward amounts
     * @param _rewardsToken The token used for rewards
     * @param _stakingToken The token users stake
     * @param _rewardsDuration The duration in seconds for each reward period
     */
    function initialize(
        address _owner,
        address _rewardsDistribution,
        address _rewardsToken,
        address _stakingToken,
        uint256 _rewardsDuration
    ) external initializer {
        require(_owner != address(0), "Owner cannot be zero address");
        require(_rewardsDistribution != address(0), "RewardsDistribution cannot be zero address");
        require(_rewardsToken != address(0), "RewardsToken cannot be zero address");
        require(_stakingToken != address(0), "StakingToken cannot be zero address");
        require(_rewardsDuration > 0, "RewardsDuration must be greater than 0");

        // Initialize inherited OZ contracts
        __Ownable_init(_owner);
        __ReentrancyGuardTransient_init();
        __Pausable_init();

        rewardsToken = IERC20(_rewardsToken);
        stakingToken = IERC20(_stakingToken);
        rewardsDistribution = _rewardsDistribution;
        rewardsDuration = _rewardsDuration;

        emit RewardsDistributionUpdated(_rewardsDistribution);
    }

    /* ========== VIEWS ========== */

    /**
     * @notice Returns the total amount of tokens staked in the contract
     * @return The total supply of staked tokens
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Returns the staked balance for an account
     * @param account The address to query
     * @return The staked balance of the account
     */
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Returns the last time rewards are applicable (min of now and periodFinish)
     * @return The timestamp until which rewards are applicable
     */
    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /**
     * @notice Calculates the reward per token accumulated
     * @return The current reward per token value
     */
    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored + (
                ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / _totalSupply
            );
    }

    /**
     * @notice Calculates the earned rewards for an account
     * @param account The address to query
     * @return The amount of rewards earned by the account
     */
    function earned(address account) public view returns (uint256) {
        return ( balanceOf(account) * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 + rewards[account];
    }

    /**
     * @notice Returns the total rewards to be distributed over the reward duration
     * @return The total reward amount for the current duration
     */
    function getRewardForDuration() external view returns (uint256) {
        return rewardRate * rewardsDuration;
    }

    /**
     * @notice Returns the number of locked stakes for a user
     * @param account The address to query
     * @return The number of locked stake entries for the user
     */
    function getLockedStakesCount(address account) external view returns (uint256) {
        return addressToLockedStakes[account].length;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Stakes tokens with a specified lock duration
     * @param amount The amount of tokens to stake
     * @param lockDuration The duration in seconds the stake will be locked
     */
    function stake(uint256 amount, uint256 lockDuration) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        _totalSupply = _totalSupply + amount;
        _balances[msg.sender] = _balances[msg.sender] + amount;

        // Add the new locked stake to the user's list of locked stakes
        uint256 lockIndex = addressToLockedStakes[msg.sender].length;
        addressToLockedStakes[msg.sender].push(LockedStake({
            amount: amount,
            lockDuration: lockDuration,
            unlockTimestamp: block.timestamp + lockDuration
        }));

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, lockDuration, lockIndex);
    }

    /**
     * @notice Withdraws staked tokens from specified unlocked locks
     * @param withdrawalAmount The total amount to withdraw
     * @param lockIndexToWithdraw Array of lock indices to withdraw from
     */
    function withdraw(uint256 withdrawalAmount, uint256[] calldata lockIndexToWithdraw) public nonReentrant updateReward(msg.sender) {
        require(withdrawalAmount > 0, "Cannot withdraw 0");

        // Check that the user has enough unlocked tokens to withdraw from locks provided
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < lockIndexToWithdraw.length; i++) {
            uint256 index = lockIndexToWithdraw[i];
            require(index < addressToLockedStakes[msg.sender].length, "Invalid lock index");
            
            LockedStake storage currentLock = addressToLockedStakes[msg.sender][index];
            require(block.timestamp >= currentLock.unlockTimestamp, "Stake is still locked");

            uint256 currentLockAmount = currentLock.amount;
            require(currentLockAmount > 0, "Stake lock already withdrawn");

            if(totalAmount + currentLockAmount >= withdrawalAmount) {
                // Partial amount, note that can be zero
                uint256 partialAmount = withdrawalAmount - totalAmount; 

                currentLock.amount -= partialAmount;
                totalAmount += partialAmount;
                break; // Exit the loop as we've met the withdrawal amount
            } else {
                // Full stake withdrawal, prevent double-counting and duplicate indexes
                currentLock.amount = 0;
                totalAmount += currentLockAmount;
            }
        }
        require(totalAmount == withdrawalAmount, "Insufficient unlocked balance to withdraw");

        _totalSupply = _totalSupply - withdrawalAmount;
        _balances[msg.sender] = _balances[msg.sender] - withdrawalAmount;
        stakingToken.safeTransfer(msg.sender, withdrawalAmount);
        emit Withdrawn(msg.sender, withdrawalAmount);
    }

    /**
     * @notice Claims all pending rewards for the caller
     */
    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /**
     * @notice Withdraws all staked tokens and claims rewards
     * @param lockIndexToWithdraw Array of lock indices to withdraw from
     */
    function exit(uint256[] calldata lockIndexToWithdraw) external {
        withdraw(_balances[msg.sender], lockIndexToWithdraw);
        getReward();
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /**
     * @notice Notifies the contract of a new reward amount to be distributed
     * @dev Can only be called by the rewards distribution address
     * @param reward The amount of reward tokens to distribute over the reward duration
     */
    function notifyRewardAmount(uint256 reward) external onlyRewardsDistribution updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        // Ensure the provided reward amount is not more than the balance in the contract.
        // This keeps the reward rate in the right range, preventing overflows due to
        // very high values of rewardRate in the earned and rewardsPerToken functions;
        // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
        uint256 balance = rewardsToken.balanceOf(address(this));
        // If staking and rewards tokens are the same, subtract staked tokens from available balance
        if (address(rewardsToken) == address(stakingToken)) {
            balance = balance - _totalSupply;
        }
        require(rewardRate <= balance / rewardsDuration, "Provided reward too high");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardAdded(reward);
    }

    /**
     * @notice Sets the rewards distribution address
     * @param _rewardsDistribution The address authorized to call notifyRewardAmount
     */
    function setRewardsDistribution(address _rewardsDistribution) external onlyOwner {
        require(_rewardsDistribution != address(0), "RewardsDistribution cannot be zero address");
        rewardsDistribution = _rewardsDistribution;
        emit RewardsDistributionUpdated(_rewardsDistribution);
    }

    /**
     * @notice Recovers ERC20 tokens accidentally sent to the contract
     * @dev Cannot recover staking tokens to protect user funds
     * @param tokenAddress The address of the token to recover
     * @param tokenAmount The amount of tokens to recover
     */
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(stakingToken), "Cannot withdraw the staking token");
        IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    /**
     * @notice Sets the rewards duration for future reward periods
     * @param _rewardsDuration The duration in seconds for reward distribution
     */
    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(_rewardsDuration > 0, "RewardsDuration must be greater than 0");
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration for the new period"
        );
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(rewardsDuration);
    }

    /**
     * @notice Pauses staking functionality
     * @dev Only owner can pause. Withdrawals and reward claims remain available
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses staking functionality
     * @dev Only owner can unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }  

    /* ========== MODIFIERS ========== */

    modifier onlyRewardsDistribution() {
        require(msg.sender == rewardsDistribution, "Caller is not RewardsDistribution contract");
        _;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /* ========== EVENTS ========== */

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount, uint256 lockDuration, uint256 lockIndex);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
    event RewardsDistributionUpdated(address indexed newRewardsDistribution);
}
