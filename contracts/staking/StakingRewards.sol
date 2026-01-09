// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
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
 * - Replaced ReentrancyGuard with ReentrancyGuardUpgradeable
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
 * - Refactored setRewardsDistribution() and setRewardsDuration() to use internal functions
 * - Created _setRewardsDistribution() internal function for code reuse
 * - Created _setRewardsDuration() internal function for code reuse
 * - Both internal functions are called by initialize() and their respective public functions
 * - _setRewardsDuration() includes periodFinish check to prevent changing duration during active reward periods
 *
 * Token Locking (separate from staking):
 * - Added LockedStake struct with amount, lockDuration, and unlockTimestamp fields
 * - Added addressToLockedStake mapping to track user's single lock per address
 * - Added lockStake() to lock already-staked tokens for a duration
 * - lockStake() enforces: cannot reduce locked amount, cannot shorten lock duration
 * - Added stakeAndLock() convenience function to stake and lock tokens in a single transaction
 * - withdraw() checks locked balance and only allows withdrawing unlocked tokens
 * - Modified exit() to withdraw only unlocked tokens (skips withdraw if all tokens are locked)
 * - Added getLockedStakeAmount() view to query currently locked amount (returns 0 if expired)
 *
 * Interface:
 * - Updated IStakingRewards interface with all public functions and state variable getters
 * - Added LockedStake struct to interface for external accessibility
 *
 * Security & Input Validation:
 * - Added zero address validation in initialize() for owner, rewardsDistribution, rewardsToken, stakingToken
 * - Added zero value validation for rewardsDuration in initialize() and setRewardsDuration()
 * - Added zero address validation in setRewardsDistribution()
 * - Fixed notifyRewardAmount() balance check when stakingToken == rewardsToken (subtracts _totalSupply)
 * - Added StakeLocked event for lock tracking
 * - Added NatSpec documentation to all functions
 * - Consolidated validation logic into internal functions to reduce code duplication
 * - Removed duplicate validation checks from initialize() (now handled by internal functions)
 */
contract StakingRewards is
    IStakingRewards,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
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

    mapping(address => LockedStake) public addressToLockedStake;

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
        require(_rewardsToken != address(0), "RewardsToken cannot be zero address");
        require(_stakingToken != address(0), "StakingToken cannot be zero address");

        // Initialize inherited OZ contracts
        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __Pausable_init();

        rewardsToken = IERC20(_rewardsToken);
        stakingToken = IERC20(_stakingToken);

        _setRewardsDistribution(_rewardsDistribution);
        _setRewardsDuration(_rewardsDuration);
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
            rewardPerTokenStored +
            (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / _totalSupply);
    }

    /**
     * @notice Calculates the earned rewards for an account
     * @param account The address to query
     * @return The amount of rewards earned by the account
     */
    function earned(address account) public view returns (uint256) {
        return
            (balanceOf(account) * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 +
            rewards[account];
    }

    /**
     * @notice Returns the total rewards to be distributed over the reward duration
     * @return The total reward amount for the current duration
     */
    function getRewardForDuration() external view returns (uint256) {
        return rewardRate * rewardsDuration;
    }

    /**
     * @notice Returns the currently locked stake amount for an account
     * @param account The address to query
     * @return amount The locked stake amount (0 if no lock or lock expired)
     */
    function getLockedStakeAmount(address account) public view returns (uint256 amount) {
        if (addressToLockedStake[account].unlockTimestamp > block.timestamp) {
            return addressToLockedStake[account].amount;
        } else {
            return 0;
        }
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @notice Stakes tokens
     * @dev Tokens are staked unlocked by default. Use lockStake() to lock staked tokens.
     * @param amount The amount of tokens to stake
     */
    function stake(uint256 amount) public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        _totalSupply = _totalSupply + amount;
        _balances[msg.sender] = _balances[msg.sender] + amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Locks staked tokens for a specified duration
     * @dev User must have enough staked balance to cover the new lock amount. If a lock already exists,
     *      the new amount cannot be less than the currently locked amount and the new unlock timestamp
     *      cannot be earlier than the current unlock timestamp. Increasing the lock amount uses additional
     *      unlocked staked balance on top of the already locked tokens.
     * @param amount The amount of staked tokens to lock
     * @param lockDuration The duration in seconds to lock the tokens
     */
    function lockStake(uint256 amount, uint256 lockDuration) public whenNotPaused {
        require(lockDuration > 0, "Lock duration must be greater than 0");
        require(amount > 0, "Amount must be greater than 0");

        // Check that user has enough unlocked staked balance to lock
        uint256 currentLockedStakeAmount = getLockedStakeAmount(msg.sender);
        uint256 newUnlockTimestamp = block.timestamp + lockDuration;

        // Check if user has any locked tokens
        if (currentLockedStakeAmount != 0) {
            require(
                amount >= currentLockedStakeAmount,
                "Cannot reduce the amount of locked tokens"
            );
            require(
                newUnlockTimestamp >= addressToLockedStake[msg.sender].unlockTimestamp,
                "Cannot shorten the lock duration"
            );
        }

        // Check that user has enough staked balance to lock
        require(_balances[msg.sender] >= amount, "Not enough staked balance to lock");

        // Update the locked tokens
        addressToLockedStake[msg.sender].lockDuration = lockDuration;
        addressToLockedStake[msg.sender].unlockTimestamp = newUnlockTimestamp;
        addressToLockedStake[msg.sender].amount = amount;

        emit StakeLocked(msg.sender, amount, lockDuration);
    }

    /**
     * @notice Stakes tokens and locks them for a specified duration
     * @dev This function is a convenience function that combines stake() and lockStake()
     * @param amount The amount of tokens to stake and lock
     * @param lockDuration The duration in seconds to lock the tokens
     */
    function stakeAndLock(uint256 amount, uint256 lockDuration) public {
        stake(amount);
        lockStake(amount, lockDuration);
    }

    /**
     * @notice Withdraws unlocked staked tokens
     * @dev Cannot withdraw tokens that are currently locked
     * @param amount The amount to withdraw
     */
    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");

        // Check if there are any locked tokens
        uint256 lockedStakeAmount = getLockedStakeAmount(msg.sender);

        // Check that the user has enough unlocked balance to withdraw
        require(
            _balances[msg.sender] >= lockedStakeAmount + amount,
            "Insufficient unlocked balance to withdraw"
        );

        _totalSupply = _totalSupply - amount;
        _balances[msg.sender] = _balances[msg.sender] - amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
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
     * @notice Withdraws all unlocked staked tokens and claims rewards
     */
    function exit() external {
        withdraw(_balances[msg.sender] - getLockedStakeAmount(msg.sender));
        getReward();
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /**
     * @notice Notifies the contract of a new reward amount to be distributed
     * @dev Can only be called by the rewards distribution address
     * @param reward The amount of reward tokens to distribute over the reward duration
     */
    function notifyRewardAmount(
        uint256 reward
    ) external onlyRewardsDistribution updateReward(address(0)) {
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
        _setRewardsDistribution(_rewardsDistribution);
    }

    /**
     * @notice Recovers ERC20 tokens accidentally sent to the contract
     * @dev Cannot recover staking tokens to protect user funds
     * @param tokenAddress The address of the token to recover
     * @param tokenAmount The amount of tokens to recover
     */
    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        if (address(rewardsToken) != address(stakingToken)) {
            require(tokenAddress != address(stakingToken), "Cannot withdraw the staking token");
        } else {
            uint256 availableRewardsBalance = rewardsToken.balanceOf(address(this)) - _totalSupply;
            require(tokenAmount <= availableRewardsBalance, "Cannot withdraw more rewards than available");
        }
        IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);
        emit Recovered(tokenAddress, tokenAmount);
    }

    /**
     * @notice Sets the rewards duration for future reward periods
     * @param _rewardsDuration The duration in seconds for reward distribution
     */
    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        _setRewardsDuration(_rewardsDuration);
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

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Internal function to set the rewards distribution address
     * @param _rewardsDistribution The address authorized to call notifyRewardAmount
     */
    function _setRewardsDistribution(address _rewardsDistribution) internal {
        require(_rewardsDistribution != address(0), "RewardsDistribution cannot be zero address");
        rewardsDistribution = _rewardsDistribution;
        emit RewardsDistributionUpdated(_rewardsDistribution);
    }

    /**
     * @notice Internal function to set the rewards duration
     * @param _rewardsDuration The duration in seconds for reward distribution
     */
    function _setRewardsDuration(uint256 _rewardsDuration) internal {
        require(_rewardsDuration > 0, "RewardsDuration must be greater than 0");
        require(
            block.timestamp > periodFinish,
            "Previous rewards period must be complete before changing the duration for the new period"
        );
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(_rewardsDuration);
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
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event Recovered(address token, uint256 amount);
    event RewardsDistributionUpdated(address indexed newRewardsDistribution);
    event StakeLocked(address indexed user, uint256 amount, uint256 lockDuration);
}
