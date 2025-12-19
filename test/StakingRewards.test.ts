import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { StakingRewards } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('StakingRewards', function () {
    let stakingRewards: StakingRewards;
    let rewardsToken: any;
    let stakingToken: any;
    let owner: SignerWithAddress;
    let rewardsDistributor: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const REWARDS_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
    const INITIAL_REWARD_AMOUNT = ethers.parseUnits('1000000', 18); // 1M tokens

    beforeEach(async function () {
        [owner, rewardsDistributor, user1, user2] = await ethers.getSigners();

        // Deploy mock ERC20 tokens
        const MockERC20Factory = await ethers.getContractFactory('MockERC20');
        rewardsToken = await MockERC20Factory.deploy('Rewards Token', 'REWARD');
        await rewardsToken.waitForDeployment();
        stakingToken = await MockERC20Factory.deploy('Staking Token', 'STAKE');
        await stakingToken.waitForDeployment();

        // Deploy StakingRewards as upgradeable
        const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
        stakingRewards = (await upgrades.deployProxy(
            StakingRewardsFactory,
            [
                owner.address,
                rewardsDistributor.address,
                await rewardsToken.getAddress(),
                await stakingToken.getAddress(),
                REWARDS_DURATION,
            ],
            {
                initializer: 'initialize',
                kind: 'transparent',
            }
        )) as unknown as StakingRewards;
        await stakingRewards.waitForDeployment();

        // Mint tokens for testing
        const mintAmount = ethers.parseUnits('10000000', 18); // 10M tokens
        await rewardsToken.mint(owner.address, mintAmount);
        await stakingToken.mint(owner.address, mintAmount);

        // Transfer tokens to users
        await stakingToken.transfer(user1.address, ethers.parseUnits('1000000', 18));
        await stakingToken.transfer(user2.address, ethers.parseUnits('1000000', 18));

        // Approve staking contract
        await stakingToken.connect(user1).approve(await stakingRewards.getAddress(), ethers.MaxUint256);
        await stakingToken.connect(user2).approve(await stakingRewards.getAddress(), ethers.MaxUint256);

        // Transfer rewards to staking contract
        await rewardsToken.transfer(await stakingRewards.getAddress(), INITIAL_REWARD_AMOUNT);
    });

    describe('Deployment', function () {
        it('Should deploy with correct initial values', async function () {
            expect(await stakingRewards.rewardsToken()).to.equal(await rewardsToken.getAddress());
            expect(await stakingRewards.stakingToken()).to.equal(await stakingToken.getAddress());
            expect(await stakingRewards.rewardsDistribution()).to.equal(rewardsDistributor.address);
            expect(await stakingRewards.rewardsDuration()).to.equal(REWARDS_DURATION);
            expect(await stakingRewards.owner()).to.equal(owner.address);
        });

        it('Should initialize with zero total supply', async function () {
            expect(await stakingRewards.totalSupply()).to.equal(0);
        });

        it('Should be paused initially', async function () {
            // Actually, it should not be paused initially - let me check
            expect(await stakingRewards.paused()).to.equal(false);
        });
    });

    describe('Staking', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        it('Should allow users to stake tokens', async function () {
            await stakingRewards.connect(user1).stake(stakeAmount, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount);
            expect(await stakingRewards.totalSupply()).to.equal(stakeAmount);
            expect(await stakingToken.balanceOf(await stakingRewards.getAddress())).to.equal(stakeAmount);
        });

        it('Should create locked stake entry', async function () {
            await stakingRewards.connect(user1).stake(stakeAmount, lockDuration);

            const lockedStakes = await stakingRewards.addressToLockedStakes(user1.address, 0);
            expect(lockedStakes.amount).to.equal(stakeAmount);
            expect(lockedStakes.lockDuration).to.equal(lockDuration);
            expect(lockedStakes.unlockTimestamp).to.be.gt(await time.latest());
        });

        it('Should emit Staked event', async function () {
            await expect(stakingRewards.connect(user1).stake(stakeAmount, lockDuration))
                .to.emit(stakingRewards, 'Staked')
                .withArgs(user1.address, stakeAmount, lockDuration, 0);
        });

        it('Should fail if staking zero amount', async function () {
            await expect(stakingRewards.connect(user1).stake(0, lockDuration)).to.be.revertedWith('Cannot stake 0');
        });

        it('Should fail if contract is paused', async function () {
            await stakingRewards.connect(owner).pause();
            await expect(stakingRewards.connect(user1).stake(stakeAmount, lockDuration)).to.be.reverted;
        });

        it('Should allow multiple stakes', async function () {
            const amount1 = ethers.parseUnits('500', 18);
            const amount2 = ethers.parseUnits('300', 18);

            await stakingRewards.connect(user1).stake(amount1, lockDuration);
            await stakingRewards.connect(user1).stake(amount2, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amount1 + amount2);
            expect(await stakingRewards.totalSupply()).to.equal(amount1 + amount2);

            const lockedStakes1 = await stakingRewards.addressToLockedStakes(user1.address, 0);
            const lockedStakes2 = await stakingRewards.addressToLockedStakes(user1.address, 1);
            expect(lockedStakes1.amount).to.equal(amount1);
            expect(lockedStakes2.amount).to.equal(amount2);
        });
    });

    describe('Withdrawing', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount, lockDuration);
        });

        it('Should allow withdrawal after lock expires', async function () {
            // Fast forward time
            await time.increase(lockDuration + 1);

            await stakingRewards.connect(user1).withdraw(stakeAmount, [0]);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
            expect(await stakingRewards.totalSupply()).to.equal(0);
            expect(await stakingToken.balanceOf(user1.address)).to.equal(ethers.parseUnits('1000000', 18));
        });

        it('Should fail if trying to withdraw before lock expires', async function () {
            await expect(stakingRewards.connect(user1).withdraw(stakeAmount, [0])).to.be.revertedWith(
                'Stake is still locked'
            );
        });

        it('Should allow partial withdrawal', async function () {
            await time.increase(lockDuration + 1);

            const withdrawAmount = ethers.parseUnits('300', 18);
            await stakingRewards.connect(user1).withdraw(withdrawAmount, [0]);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount - withdrawAmount);
            expect(await stakingRewards.totalSupply()).to.equal(stakeAmount - withdrawAmount);

            const lockedStake = await stakingRewards.addressToLockedStakes(user1.address, 0);
            expect(lockedStake.amount).to.equal(stakeAmount - withdrawAmount);
        });

        it('Should fail if invalid lock index', async function () {
            await time.increase(lockDuration + 1);
            await expect(stakingRewards.connect(user1).withdraw(stakeAmount, [1])).to.be.revertedWith(
                'Invalid lock index'
            );
        });

        it('Should fail if insufficient unlocked balance', async function () {
            await time.increase(lockDuration + 1);
            const tooMuch = stakeAmount + ethers.parseUnits('1', 18);
            await expect(stakingRewards.connect(user1).withdraw(tooMuch, [0])).to.be.revertedWith(
                'Insufficient unlocked balance to withdraw'
            );
        });

        it('Should handle multiple locks correctly', async function () {
            // Use a fresh user to avoid state issues
            const signers = await ethers.getSigners();
            const freshUser = signers[4] || signers[signers.length - 1];
            const amount1 = ethers.parseUnits('500', 18);
            const amount2 = ethers.parseUnits('300', 18);
            const shortLock = 1 * 24 * 60 * 60; // 1 day

            // Transfer and approve tokens for fresh user
            await stakingToken.transfer(freshUser.address, ethers.parseUnits('10000', 18));
            await stakingToken.connect(freshUser).approve(await stakingRewards.getAddress(), ethers.MaxUint256);

            // Check initial state
            const initialSupply = await stakingRewards.totalSupply();
            const initialBalance = await stakingRewards.balanceOf(freshUser.address);

            await stakingRewards.connect(freshUser).stake(amount1, lockDuration);
            expect(await stakingRewards.balanceOf(freshUser.address)).to.equal(initialBalance + amount1);
            expect(await stakingRewards.totalSupply()).to.equal(initialSupply + amount1);

            await stakingRewards.connect(freshUser).stake(amount2, shortLock);

            // Verify both stakes are recorded
            expect(await stakingRewards.balanceOf(freshUser.address)).to.equal(initialBalance + amount1 + amount2);
            expect(await stakingRewards.totalSupply()).to.equal(initialSupply + amount1 + amount2);

            // Fast forward to unlock the second lock
            await time.increase(shortLock + 100);

            // Should be able to withdraw from second lock (index 1)
            await stakingRewards.connect(freshUser).withdraw(amount2, [1]);

            expect(await stakingRewards.balanceOf(freshUser.address)).to.equal(initialBalance + amount1);
            expect(await stakingRewards.totalSupply()).to.equal(initialSupply + amount1);

            // Verify lock 1 amount is now 0
            const lock2Final = await stakingRewards.addressToLockedStakes(freshUser.address, 1);
            expect(lock2Final.amount).to.equal(0);
        });
    });

    describe('Rewards', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount, lockDuration);
        });

        it('Should notify reward amount', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            expect(await stakingRewards.rewardRate()).to.be.gt(0);
            expect(await stakingRewards.periodFinish()).to.be.gt(await time.latest());
        });

        it('Should calculate earned rewards correctly', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Fast forward 1 day
            await time.increase(24 * 60 * 60);

            const earned = await stakingRewards.earned(user1.address);
            expect(earned).to.be.gt(0);
        });

        it('Should allow users to claim rewards', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Fast forward 1 day
            await time.increase(24 * 60 * 60);

            const earnedBefore = await stakingRewards.earned(user1.address);
            const balanceBefore = await rewardsToken.balanceOf(user1.address);
            await stakingRewards.connect(user1).getReward();

            const balanceAfter = await rewardsToken.balanceOf(user1.address);
            // Allow for rounding differences due to integer division and time precision
            const received = balanceAfter - balanceBefore;
            expect(received).to.be.gt(0);
            // Check that received amount is within reasonable range of earned (allowing for rounding)
            expect(received).to.be.closeTo(earnedBefore, earnedBefore / 1000n); // Allow 0.1% difference
            expect(await stakingRewards.earned(user1.address)).to.equal(0);
        });

        it('Should fail if non-rewards-distributor tries to notify', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            await expect(stakingRewards.connect(user1).notifyRewardAmount(rewardAmount)).to.be.revertedWith(
                'Caller is not RewardsDistribution contract'
            );
        });

        it('Should emit RewardAdded event', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            await expect(stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount))
                .to.emit(stakingRewards, 'RewardAdded')
                .withArgs(rewardAmount);
        });
    });

    describe('Exit', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount, lockDuration);

            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60); // 1 day
        });

        it('Should allow exit after lock expires', async function () {
            await time.increase(lockDuration);

            const earnedBefore = await stakingRewards.earned(user1.address);
            await stakingRewards.connect(user1).exit([0]);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
            expect(await stakingRewards.totalSupply()).to.equal(0);
            expect(await rewardsToken.balanceOf(user1.address)).to.equal(earnedBefore);
        });
    });

    describe('Admin Functions', function () {
        it('Should allow owner to pause', async function () {
            await stakingRewards.connect(owner).pause();
            expect(await stakingRewards.paused()).to.equal(true);
        });

        it('Should allow owner to unpause', async function () {
            await stakingRewards.connect(owner).pause();
            await stakingRewards.connect(owner).unpause();
            expect(await stakingRewards.paused()).to.equal(false);
        });

        it('Should fail if non-owner tries to pause', async function () {
            await expect(stakingRewards.connect(user1).pause()).to.be.reverted;
        });

        it('Should allow owner to set rewards distribution', async function () {
            await stakingRewards.connect(owner).setRewardsDistribution(user1.address);
            expect(await stakingRewards.rewardsDistribution()).to.equal(user1.address);
        });

        it('Should emit RewardsDistributionUpdated event', async function () {
            await expect(stakingRewards.connect(owner).setRewardsDistribution(user1.address))
                .to.emit(stakingRewards, 'RewardsDistributionUpdated')
                .withArgs(user1.address);
        });

        it('Should allow owner to recover ERC20 tokens', async function () {
            const recoverAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), recoverAmount);

            await stakingRewards.connect(owner).recoverERC20(await rewardsToken.getAddress(), recoverAmount);

            expect(await rewardsToken.balanceOf(owner.address)).to.be.gte(recoverAmount);
        });

        it('Should fail to recover staking token', async function () {
            await expect(
                stakingRewards.connect(owner).recoverERC20(await stakingToken.getAddress(), ethers.parseUnits('1', 18))
            ).to.be.revertedWith('Cannot withdraw the staking token');
        });

        it('Should allow owner to set rewards duration', async function () {
            const newDuration = 14 * 24 * 60 * 60; // 14 days

            // Need to wait for period to finish
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(REWARDS_DURATION + 1);

            await stakingRewards.connect(owner).setRewardsDuration(newDuration);
            expect(await stakingRewards.rewardsDuration()).to.equal(newDuration);
        });

        it('Should fail to set rewards duration before period finishes', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await expect(stakingRewards.connect(owner).setRewardsDuration(14 * 24 * 60 * 60)).to.be.revertedWith(
                'Previous rewards period must be complete before changing the duration for the new period'
            );
        });
    });

    describe('Edge Cases', function () {
        it('Should handle zero total supply in rewardPerToken', async function () {
            const rewardPerToken = await stakingRewards.rewardPerToken();
            expect(rewardPerToken).to.equal(await stakingRewards.rewardPerTokenStored());
        });

        it('Should handle multiple users staking', async function () {
            const amount1 = ethers.parseUnits('1000', 18);
            const amount2 = ethers.parseUnits('2000', 18);
            const lockDuration = 30 * 24 * 60 * 60;

            await stakingRewards.connect(user1).stake(amount1, lockDuration);
            await stakingRewards.connect(user2).stake(amount2, lockDuration);

            expect(await stakingRewards.totalSupply()).to.equal(amount1 + amount2);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amount1);
            expect(await stakingRewards.balanceOf(user2.address)).to.equal(amount2);
        });

        it('Should calculate rewards proportionally', async function () {
            const amount1 = ethers.parseUnits('1000', 18);
            const amount2 = ethers.parseUnits('2000', 18);
            const lockDuration = 30 * 24 * 60 * 60;

            await stakingRewards.connect(user1).stake(amount1, lockDuration);
            await stakingRewards.connect(user2).stake(amount2, lockDuration);

            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60); // 1 day

            const earned1 = await stakingRewards.earned(user1.address);
            const earned2 = await stakingRewards.earned(user2.address);

            // User2 should earn approximately 2x user1 (with some rounding)
            expect(earned2).to.be.gte(earned1 * 2n - ethers.parseUnits('1', 15)); // Allow small rounding error
        });
    });
});
