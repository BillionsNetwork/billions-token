// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IStakingRewards
 * @notice Interface for the StakingRewards contract
 * @dev Based on Synthetix StakingRewards with token locking support
 */
interface IStakingRewards {
    /* ========== STRUCTS ========== */

    struct LockedStake {
        uint256 amount;
        uint256 lockDuration;
        uint256 unlockTimestamp;
    }

    /* ========== VIEWS ========== */

    function rewardsToken() external view returns (IERC20);

    function stakingToken() external view returns (IERC20);

    function periodFinish() external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function rewardsDuration() external view returns (uint256);

    function lastUpdateTime() external view returns (uint256);

    function rewardPerTokenStored() external view returns (uint256);

    function rewardsDistribution() external view returns (address);

    function userRewardPerTokenPaid(address account) external view returns (uint256);

    function rewards(address account) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function lastTimeRewardApplicable() external view returns (uint256);

    function rewardPerToken() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function getRewardForDuration() external view returns (uint256);

    function addressToLockedStake(
        address account
    ) external view returns (uint256 amount, uint256 lockDuration, uint256 unlockTimestamp);

    function getLockedStakeAmount(address account) external view returns (uint256 amount);

    /* ========== MUTATIVE FUNCTIONS ========== */

    function stake(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function lockStake(uint256 amount, uint256 lockDuration) external;

    function stakeAndLock(uint256 amount, uint256 lockDuration) external;

    function getReward() external;

    function exit() external;

    /* ========== RESTRICTED FUNCTIONS ========== */

    function notifyRewardAmount(uint256 reward) external;

    function setRewardsDistribution(address _rewardsDistribution) external;

    function recoverERC20(address tokenAddress, uint256 tokenAmount) external;

    function setRewardsDuration(uint256 _rewardsDuration) external;

    function pause() external;

    function unpause() external;
}
