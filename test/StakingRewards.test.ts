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
            },
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
            expect(
                await stakingRewards.hasRole(
                    await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(),
                    rewardsDistributor.address,
                ),
            ).to.equal(true);
            expect(await stakingRewards.rewardsDuration()).to.equal(REWARDS_DURATION);
            expect(await stakingRewards.owner()).to.equal(owner.address);
        });

        it('Should initialize with zero total supply', async function () {
            expect(await stakingRewards.totalSupply()).to.equal(0);
        });

        it('Should not be paused initially', async function () {
            expect(await stakingRewards.paused()).to.equal(false);
        });

        it('Should fail initialization with zero owner address', async function () {
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            await expect(
                upgrades.deployProxy(
                    StakingRewardsFactory,
                    [
                        ethers.ZeroAddress,
                        rewardsDistributor.address,
                        await rewardsToken.getAddress(),
                        await stakingToken.getAddress(),
                        REWARDS_DURATION,
                    ],
                    { initializer: 'initialize', kind: 'transparent' },
                ),
            ).to.be.revertedWith('Owner cannot be zero address');
        });

        it('Should fail initialization with zero rewardsDistribution address', async function () {
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            await expect(
                upgrades.deployProxy(
                    StakingRewardsFactory,
                    [
                        owner.address,
                        ethers.ZeroAddress,
                        await rewardsToken.getAddress(),
                        await stakingToken.getAddress(),
                        REWARDS_DURATION,
                    ],
                    { initializer: 'initialize', kind: 'transparent' },
                ),
            ).to.be.revertedWith('RewardsDistribution cannot be zero address');
        });

        it('Should fail initialization with zero rewardsToken address', async function () {
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            await expect(
                upgrades.deployProxy(
                    StakingRewardsFactory,
                    [
                        owner.address,
                        rewardsDistributor.address,
                        ethers.ZeroAddress,
                        await stakingToken.getAddress(),
                        REWARDS_DURATION,
                    ],
                    { initializer: 'initialize', kind: 'transparent' },
                ),
            ).to.be.revertedWith('RewardsToken cannot be zero address');
        });

        it('Should fail initialization with zero stakingToken address', async function () {
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            await expect(
                upgrades.deployProxy(
                    StakingRewardsFactory,
                    [
                        owner.address,
                        rewardsDistributor.address,
                        await rewardsToken.getAddress(),
                        ethers.ZeroAddress,
                        REWARDS_DURATION,
                    ],
                    { initializer: 'initialize', kind: 'transparent' },
                ),
            ).to.be.revertedWith('StakingToken cannot be zero address');
        });

        it('Should fail initialization with zero rewardsDuration', async function () {
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            await expect(
                upgrades.deployProxy(
                    StakingRewardsFactory,
                    [
                        owner.address,
                        rewardsDistributor.address,
                        await rewardsToken.getAddress(),
                        await stakingToken.getAddress(),
                        0,
                    ],
                    { initializer: 'initialize', kind: 'transparent' },
                ),
            ).to.be.revertedWith('RewardsDuration must be greater than 0');
        });

        it('Should fail setRewardsDuration with zero value', async function () {
            // Wait for period to finish first
            await time.increase(REWARDS_DURATION + 1);
            await expect(stakingRewards.connect(owner).setRewardsDuration(0)).to.be.revertedWith(
                'RewardsDuration must be greater than 0',
            );
        });
    });

    describe('Staking', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);

        it('Should allow users to stake tokens', async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount);
            expect(await stakingRewards.totalSupply()).to.equal(stakeAmount);
            expect(await stakingToken.balanceOf(await stakingRewards.getAddress())).to.equal(stakeAmount);
        });

        it('Should emit Staked event', async function () {
            await expect(stakingRewards.connect(user1).stake(stakeAmount))
                .to.emit(stakingRewards, 'Staked')
                .withArgs(user1.address, stakeAmount);
        });

        it('Should fail if staking zero amount', async function () {
            await expect(stakingRewards.connect(user1).stake(0)).to.be.revertedWith('Cannot stake 0');
        });

        it('Should fail if contract is paused', async function () {
            await stakingRewards.connect(owner).pause();
            await expect(stakingRewards.connect(user1).stake(stakeAmount)).to.be.reverted;
        });

        it('Should allow multiple stakes', async function () {
            const amount1 = ethers.parseUnits('500', 18);
            const amount2 = ethers.parseUnits('300', 18);

            await stakingRewards.connect(user1).stake(amount1);
            await stakingRewards.connect(user1).stake(amount2);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amount1 + amount2);
            expect(await stakingRewards.totalSupply()).to.equal(amount1 + amount2);
        });

        it('Should fail stakeOnBehalf with unallowed staker on behalf', async function () {
            const amountToStake = ethers.parseUnits('500', 18);

            await expect(stakingRewards.connect(user2).stakeOnBehalf(user1.address, amountToStake))
                .to.be.revertedWithCustomError(stakingRewards, 'AccessControlUnauthorizedAccount')
                .withArgs(user2.address, await stakingRewards.STAKER_ON_BEHALF_ROLE());
        });

        it('Should fail stakeOnBehalf with zero address account', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            await stakingRewards.connect(owner).grantRole(await stakingRewards.STAKER_ON_BEHALF_ROLE(), user2.address);

            await expect(
                stakingRewards.connect(user2).stakeOnBehalf(ethers.ZeroAddress, amountToStake),
            ).to.be.revertedWith('Cannot stake for the zero address');
        });

        it('Should allow stakeOnBehalf on behalf of the user', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const user2BalanceBefore = await stakingToken.balanceOf(user2.address);

            await stakingRewards.connect(owner).grantRole(await stakingRewards.STAKER_ON_BEHALF_ROLE(), user2.address);

            await stakingRewards.connect(user2).stakeOnBehalf(user1.address, amountToStake);

            const user2BalanceAfter = await stakingToken.balanceOf(user2.address);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToStake);
            expect(user2BalanceBefore - user2BalanceAfter).to.equal(amountToStake);
        });
    });

    describe('Token Locking', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
        });

        it('Should allow locking staked tokens', async function () {
            const lockAmount = ethers.parseUnits('500', 18);
            await stakingRewards.connect(user1).lockStake(lockAmount, lockDuration);

            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(lockAmount);
        });

        it('Should emit StakeLocked event', async function () {
            const lockAmount = ethers.parseUnits('500', 18);
            await expect(stakingRewards.connect(user1).lockStake(lockAmount, lockDuration))
                .to.emit(stakingRewards, 'StakeLocked')
                .withArgs(user1.address, lockAmount, lockDuration);
        });

        it('Should fail if lock duration is zero', async function () {
            await expect(stakingRewards.connect(user1).lockStake(stakeAmount, 0)).to.be.revertedWith(
                'Lock duration must be greater than 0',
            );
        });

        it('Should fail if amount is zero', async function () {
            await expect(stakingRewards.connect(user1).lockStake(0, lockDuration)).to.be.revertedWith(
                'Amount must be greater than 0',
            );
        });

        it('Should fail if not enough staked balance to lock', async function () {
            const tooMuch = stakeAmount + ethers.parseUnits('1', 18);
            await expect(stakingRewards.connect(user1).lockStake(tooMuch, lockDuration)).to.be.revertedWith(
                'Not enough staked balance to lock',
            );
        });

        it('Should fail if contract is paused', async function () {
            await stakingRewards.connect(owner).pause();
            await expect(stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration)).to.be.reverted;
        });

        it('Should allow increasing lock amount', async function () {
            const amount1 = ethers.parseUnits('300', 18);
            const amount2 = ethers.parseUnits('500', 18);

            await stakingRewards.connect(user1).lockStake(amount1, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amount1);

            // Lock more with same or longer duration
            await stakingRewards.connect(user1).lockStake(amount2, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amount2);
        });

        it('Should fail if trying to reduce lock amount', async function () {
            const amount1 = ethers.parseUnits('500', 18);
            const amount2 = ethers.parseUnits('300', 18);

            await stakingRewards.connect(user1).lockStake(amount1, lockDuration);
            await expect(stakingRewards.connect(user1).lockStake(amount2, lockDuration)).to.be.revertedWith(
                'Cannot reduce the amount of locked tokens',
            );
        });

        it('Should fail if trying to shorten lock duration', async function () {
            const shorterDuration = 15 * 24 * 60 * 60; // 15 days

            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            await expect(stakingRewards.connect(user1).lockStake(stakeAmount, shorterDuration)).to.be.revertedWith(
                'Cannot shorten the lock duration',
            );
        });

        it('Should return 0 locked tokens after lock expires', async function () {
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);

            // Fast forward past lock duration
            await time.increase(lockDuration + 1);

            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(0);
        });

        it('Should store lock info correctly', async function () {
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            const lockInfo = await stakingRewards.addressToLockedStake(user1.address);
            expect(lockInfo.amount).to.equal(stakeAmount);
            expect(lockInfo.lockDuration).to.equal(lockDuration);
            expect(lockInfo.unlockTimestamp).to.be.gt(await time.latest());
        });
    });

    describe('Withdrawing', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);
        const lockDuration = 30 * 24 * 60 * 60; // 30 days

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
        });

        it('Should allow withdrawal of unlocked tokens', async function () {
            await stakingRewards.connect(user1).withdraw(stakeAmount);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
            expect(await stakingRewards.totalSupply()).to.equal(0);
        });

        it('Should allow partial withdrawal', async function () {
            const withdrawAmount = ethers.parseUnits('300', 18);
            await stakingRewards.connect(user1).withdraw(withdrawAmount);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount - withdrawAmount);
        });

        it('Should fail if trying to withdraw locked tokens', async function () {
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            await expect(stakingRewards.connect(user1).withdraw(stakeAmount)).to.be.revertedWith(
                'Insufficient unlocked balance to withdraw',
            );
        });

        it('Should allow withdraw of unlocked portion when some tokens are locked', async function () {
            const lockAmount = ethers.parseUnits('600', 18);
            const unlockedAmount = stakeAmount - lockAmount;

            await stakingRewards.connect(user1).lockStake(lockAmount, lockDuration);
            await stakingRewards.connect(user1).withdraw(unlockedAmount);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(lockAmount);
        });

        it('Should allow full withdrawal after lock expires', async function () {
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            // Fast forward time
            await time.increase(lockDuration + 1);

            await stakingRewards.connect(user1).withdraw(stakeAmount);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
        });

        it('Should fail if withdrawing zero', async function () {
            await expect(stakingRewards.connect(user1).withdraw(0)).to.be.revertedWith('Cannot withdraw 0');
        });

        it('Should emit Withdrawn event', async function () {
            await expect(stakingRewards.connect(user1).withdraw(stakeAmount))
                .to.emit(stakingRewards, 'Withdrawn')
                .withArgs(user1.address, stakeAmount);
        });
    });

    describe('Rewards', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
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
            const received = balanceAfter - balanceBefore;
            expect(received).to.be.gt(0);
            expect(received).to.be.closeTo(earnedBefore, earnedBefore / 1000n);
            expect(await stakingRewards.earned(user1.address)).to.equal(0);
        });

        it('Should fail if non-rewards-distributor tries to notify', async function () {
            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            await expect(stakingRewards.connect(user1).notifyRewardAmount(rewardAmount))
                .to.be.revertedWithCustomError(stakingRewards, 'AccessControlUnauthorizedAccount')
                .withArgs(user1.address, await stakingRewards.REWARDS_DISTRIBUTOR_ROLE());
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

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);

            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60); // 1 day
        });

        it('Should allow exit with unlocked tokens', async function () {
            const earnedBefore = await stakingRewards.earned(user1.address);
            await stakingRewards.connect(user1).exit();

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
            expect(await stakingRewards.totalSupply()).to.equal(0);
            expect(await rewardsToken.balanceOf(user1.address)).to.be.closeTo(earnedBefore, earnedBefore / 1000n);
        });

        it('Should allow exit if tokens are locked (skips withdraw if all tokens are locked)', async function () {
            const lockDuration = 30 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            // Verify user has staked balance
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount);
            // Verify tokens are locked
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);

            await expect(stakingRewards.connect(user1).exit()).not.to.be.reverted;
        });

        it('Should allow exit after lock expires', async function () {
            const lockDuration = 30 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            await time.increase(lockDuration + 1);

            await stakingRewards.connect(user1).exit();
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
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
            await stakingRewards
                .connect(owner)
                .grantRole(await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(), user1.address);
            expect(
                await stakingRewards.hasRole(await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(), user1.address),
            ).to.equal(true);
        });

        it('Should allow owner to recover ERC20 tokens', async function () {
            const recoverAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), recoverAmount);

            await stakingRewards.connect(owner).recoverERC20(await rewardsToken.getAddress(), recoverAmount);

            expect(await rewardsToken.balanceOf(owner.address)).to.be.gte(recoverAmount);
        });

        it('Should fail to recover staking token', async function () {
            await expect(
                stakingRewards.connect(owner).recoverERC20(await stakingToken.getAddress(), ethers.parseUnits('1', 18)),
            ).to.be.revertedWith('Cannot withdraw user staked tokens');
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
                'Previous rewards period must be complete before changing the duration for the new period',
            );
        });

        it('Should allow owner to set initial lock period', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            expect(await stakingRewards.initialLockPeriodDuration()).to.equal(duration);
            expect(await stakingRewards.initialLockPeriodFinish()).to.equal((await time.latest()) + duration);
        });

        it('Should fail to set initial lock period 0', async function () {
            await expect(stakingRewards.connect(owner).setInitialLockPeriod(0)).to.be.revertedWith(
                'Initial lock period must be greater than 0',
            );
        });

        it('Should fail to set initial lock period longer than 2 years', async function () {
            await expect(stakingRewards.connect(owner).setInitialLockPeriod(731 * 24 * 60 * 60)).to.be.revertedWith(
                'Initial lock period cannot be longer than 2 years',
            );
        });

        it('Should fail to set initial lock period before period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            expect(await stakingRewards.initialLockPeriodDuration()).to.equal(duration);

            await expect(stakingRewards.connect(owner).setInitialLockPeriod(duration)).to.be.revertedWith(
                'Previous initial lock period must be complete before changing the duration for the new period',
            );
        });

        it('Should fail to set initial lock period before period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            expect(await stakingRewards.initialLockPeriodDuration()).to.equal(duration);

            await expect(stakingRewards.connect(owner).setInitialLockPeriod(duration)).to.be.revertedWith(
                'Previous initial lock period must be complete before changing the duration for the new period',
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

            await stakingRewards.connect(user1).stake(amount1);
            await stakingRewards.connect(user2).stake(amount2);

            expect(await stakingRewards.totalSupply()).to.equal(amount1 + amount2);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amount1);
            expect(await stakingRewards.balanceOf(user2.address)).to.equal(amount2);
        });

        it('Should calculate rewards proportionally', async function () {
            const amount1 = ethers.parseUnits('1000', 18);
            const amount2 = ethers.parseUnits('2000', 18);

            await stakingRewards.connect(user1).stake(amount1);
            await stakingRewards.connect(user2).stake(amount2);

            const rewardAmount = ethers.parseUnits('10000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60); // 1 day

            const earned1 = await stakingRewards.earned(user1.address);
            const earned2 = await stakingRewards.earned(user2.address);

            // User2 should earn approximately 2x user1 (with some rounding)
            expect(earned2).to.be.gte(earned1 * 2n - ethers.parseUnits('1', 15));
        });

        it('Should return 0 for getLockedStakeAmount if no lock exists', async function () {
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(0);
        });

        it('Should handle getReward with zero rewards', async function () {
            // User stakes but no rewards notified
            const stakeAmount = ethers.parseUnits('1000', 18);
            await stakingRewards.connect(user1).stake(stakeAmount);

            // getReward should not fail when there are no rewards
            await stakingRewards.connect(user1).getReward();
            expect(await stakingRewards.earned(user1.address)).to.equal(0);
        });

        it('Should handle lastTimeRewardApplicable when periodFinish is in the past', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await stakingRewards.connect(user1).stake(stakeAmount);

            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Fast forward past the reward period
            await time.increase(REWARDS_DURATION + 1);

            // lastTimeRewardApplicable should return periodFinish
            const lastTime = await stakingRewards.lastTimeRewardApplicable();
            const periodFinish = await stakingRewards.periodFinish();
            expect(lastTime).to.equal(periodFinish);
        });

        it('Should handle lastTimeRewardApplicable when periodFinish is in the future', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await stakingRewards.connect(user1).stake(stakeAmount);

            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // lastTimeRewardApplicable should return block.timestamp
            const lastTime = await stakingRewards.lastTimeRewardApplicable();
            const latestBlock = await time.latest();
            expect(lastTime).to.be.lte(latestBlock);
        });

        it('Should return correct reward for duration', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await stakingRewards.connect(user1).stake(stakeAmount);

            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            const rewardRate = await stakingRewards.rewardRate();
            const duration = await stakingRewards.rewardsDuration();
            const rewardForDuration = await stakingRewards.getRewardForDuration();

            expect(rewardForDuration).to.equal(rewardRate * duration);
        });

        it('Should allow stakeAndLock in one call', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const amountToLock = ethers.parseUnits('300', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToStake);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amountToLock);
        });

        it('Should allow stakeAndLock with different stake and lock amounts', async function () {
            const amountToStake = ethers.parseUnits('1000', 18);
            const amountToLock = ethers.parseUnits('500', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToStake);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amountToLock);

            // Should be able to withdraw unlocked portion
            const unlockedAmount = amountToStake - amountToLock;
            await stakingRewards.connect(user1).withdraw(unlockedAmount);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToLock);
        });

        it('Should fail stakeAndLock if amountToLock exceeds user total amount staked', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const amountToLock = ethers.parseUnits('600', 18); // More than staked
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await expect(
                stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration),
            ).to.be.revertedWith('Not enough staked balance to lock');
        });

        it('Should not fail stakeAndLock if amountToLock does not exceed user total amount staked', async function () {
            const preStakeAmount = ethers.parseUnits('100', 18);
            const amountToStake = ethers.parseUnits('500', 18);
            const amountToLock = ethers.parseUnits('600', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).stake(preStakeAmount); // Pre-stake to cover amountToLock

            await expect(stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration)).not.to
                .be.reverted;
        });

        it('Should fail stakeAndLockOnBehalf with unallowed staker on behalf', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await expect(stakingRewards.connect(user2).stakeAndLockOnBehalf(user1.address, amountToStake, lockDuration))
                .to.be.revertedWithCustomError(stakingRewards, 'AccessControlUnauthorizedAccount')
                .withArgs(user2.address, await stakingRewards.STAKER_ON_BEHALF_ROLE());
        });

        it('Should allow stakeAndLockOnBehalf in one call without user previous stake', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days
            const user2BalanceBefore = await stakingToken.balanceOf(user2.address);

            await stakingRewards.connect(owner).grantRole(await stakingRewards.STAKER_ON_BEHALF_ROLE(), user2.address);

            await stakingRewards.connect(user2).stakeAndLockOnBehalf(user1.address, amountToStake, lockDuration);

            const user2BalanceAfter = await stakingToken.balanceOf(user2.address);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToStake);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amountToStake);
            expect(user2BalanceBefore - user2BalanceAfter).to.equal(amountToStake);
        });

        it('Should allow stakeAndLockOnBehalf in one call with user with previous stake locked', async function () {
            const amountToStake = ethers.parseUnits('500', 18);
            const amountToLock = ethers.parseUnits('300', 18);
            const amountToStakeOnBehalf = ethers.parseUnits('200', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days
            const user2BalanceBefore = await stakingToken.balanceOf(user2.address);

            await stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration);

            await stakingRewards.connect(owner).grantRole(await stakingRewards.STAKER_ON_BEHALF_ROLE(), user2.address);

            await stakingRewards
                .connect(user2)
                .stakeAndLockOnBehalf(user1.address, amountToStakeOnBehalf, lockDuration);
            const user2BalanceAfter = await stakingToken.balanceOf(user2.address);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(amountToStake + amountToStakeOnBehalf);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(
                amountToLock + amountToStakeOnBehalf,
            );
            expect(user2BalanceBefore - user2BalanceAfter).to.equal(amountToStakeOnBehalf);
        });

        it('Should add leftover rewards when notifying during active period', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await stakingRewards.connect(user1).stake(stakeAmount);

            // First notification
            const firstReward = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), firstReward);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(firstReward);

            const rewardRateBefore = await stakingRewards.rewardRate();

            // Wait 1 day (partial period)
            await time.increase(24 * 60 * 60);

            // Second notification during active period (else branch)
            const secondReward = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), secondReward);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(secondReward);

            const rewardRateAfter = await stakingRewards.rewardRate();

            // Reward rate should include leftover from first period
            expect(rewardRateAfter).to.be.gt(rewardRateBefore);
        });
    });

    describe('Same Token (Staking = Rewards)', function () {
        let sameTokenStaking: any;
        let sameToken: any;

        beforeEach(async function () {
            // Deploy a token to use as both staking and rewards
            const MockERC20Factory = await ethers.getContractFactory('MockERC20');
            sameToken = await MockERC20Factory.deploy('Same Token', 'SAME');
            await sameToken.waitForDeployment();

            // Deploy StakingRewards with same token for staking and rewards
            const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
            sameTokenStaking = await upgrades.deployProxy(
                StakingRewardsFactory,
                [
                    owner.address,
                    rewardsDistributor.address,
                    await sameToken.getAddress(),
                    await sameToken.getAddress(), // Same token!
                    REWARDS_DURATION,
                ],
                {
                    initializer: 'initialize',
                    kind: 'transparent',
                },
            );
            await sameTokenStaking.waitForDeployment();

            // Mint and distribute tokens
            const mintAmount = ethers.parseUnits('10000000', 18);
            await sameToken.mint(owner.address, mintAmount);
            await sameToken.transfer(user1.address, ethers.parseUnits('100000', 18));
            await sameToken.connect(user1).approve(await sameTokenStaking.getAddress(), ethers.MaxUint256);
        });

        it('Should correctly calculate available rewards when stakingToken == rewardsToken', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await sameTokenStaking.connect(user1).stake(stakeAmount);

            // Transfer rewards (same token as staking)
            const rewardAmount = ethers.parseUnits('7000', 18);
            await sameToken.transfer(await sameTokenStaking.getAddress(), rewardAmount);

            // This should work - balance check subtracts _totalSupply
            await sameTokenStaking.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            expect(await sameTokenStaking.rewardRate()).to.be.gt(0);
        });

        it('Should fail if reward too high relative to available balance (same token)', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await sameTokenStaking.connect(user1).stake(stakeAmount);

            // Only transfer a small amount of rewards
            const smallReward = ethers.parseUnits('100', 18);
            await sameToken.transfer(await sameTokenStaking.getAddress(), smallReward);

            // Try to notify with more than available (should fail)
            const bigReward = ethers.parseUnits('10000', 18);
            await expect(sameTokenStaking.connect(rewardsDistributor).notifyRewardAmount(bigReward)).to.be.revertedWith(
                'Provided reward too high',
            );
        });

        it('Should stake, earn and claim rewards with same token', async function () {
            const stakeAmount = ethers.parseUnits('1000', 18);
            await sameTokenStaking.connect(user1).stake(stakeAmount);

            const rewardAmount = ethers.parseUnits('7000', 18);
            await sameToken.transfer(await sameTokenStaking.getAddress(), rewardAmount);
            await sameTokenStaking.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);
            const earned = await sameTokenStaking.earned(user1.address);
            expect(earned).to.be.gt(0);

            await sameTokenStaking.connect(user1).getReward();
        });

        it('Should fail recoverERC20 with amount more than available rewards', async function () {
            await expect(
                sameTokenStaking.connect(owner).recoverERC20(await sameToken.getAddress(), 1),
            ).to.be.revertedWith('Cannot withdraw user staked tokens');
        });

        it('recoverERC20: should succeed with amount less than available rewards', async function () {
            // Send some rewards token to contract
            const amount = ethers.parseUnits('100', 18);
            await sameToken.transfer(await sameTokenStaking.getAddress(), amount);

            // Should recover rewards token (not staking token)
            await sameTokenStaking.connect(owner).recoverERC20(await sameToken.getAddress(), amount);
        });
    });

    describe('Branch Coverage - Additional Cases', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
        });

        it('Should cover lockStake when no existing lock', async function () {
            const lockDuration = 7 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);
        });

        it('Should cover notifyRewardAmount when period already finished', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(REWARDS_DURATION + 1);

            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        it('Should cover updateReward modifier with address(0)', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.lastUpdateTime()).to.be.gt(0);
        });

        it('Should cover rewardPerToken when totalSupply > 0', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            const rewardPerToken = await stakingRewards.rewardPerToken();
            expect(rewardPerToken).to.be.gt(0);
        });

        it('Should cover getLockedStakeAmount expired lock path', async function () {
            const lockDuration = 100;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);

            await time.increase(lockDuration + 1);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(0);
        });

        it('Should cover getReward when reward > 0 path', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            const earnedBefore = await stakingRewards.earned(user1.address);
            expect(earnedBefore).to.be.gt(0);

            const balBefore = await rewardsToken.balanceOf(user1.address);
            await stakingRewards.connect(user1).getReward();
            const balAfter = await rewardsToken.balanceOf(user1.address);

            expect(balAfter).to.be.gt(balBefore);
        });

        it('Should cover different tokens path in notifyRewardAmount', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        it('Should cover lastTimeRewardApplicable during active period', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            const lastTime = await stakingRewards.lastTimeRewardApplicable();
            const periodFinish = await stakingRewards.periodFinish();
            expect(lastTime).to.be.lt(periodFinish);
        });

        it('Should cover exit with all unlocked tokens', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);
            await stakingRewards.connect(user1).exit();
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(0);
        });

        it('Should cover withdraw partial unlocked amount when some locked', async function () {
            // Stake more tokens
            await stakingRewards.connect(user1).stake(stakeAmount);

            // Lock half
            const lockDuration = 30 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            // Withdraw the unlocked half
            await stakingRewards.connect(user1).withdraw(stakeAmount);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount);
        });

        it('Should fail recoverERC20 with rewards token (same as staking)', async function () {
            // In the main stakingRewards, staking != rewards, so this tests the path
            // where we try to recover the staking token
            await expect(
                stakingRewards.connect(owner).recoverERC20(await stakingToken.getAddress(), 1),
            ).to.be.revertedWith('Cannot withdraw user staked tokens');
        });

        it('Should cover balanceOf view function', async function () {
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount);
            expect(await stakingRewards.balanceOf(user2.address)).to.equal(0);
        });

        it('Should cover totalSupply view function', async function () {
            expect(await stakingRewards.totalSupply()).to.equal(stakeAmount);
        });

        it('Should cover earned with zero balance user', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            // User2 never staked, should have 0 earned
            expect(await stakingRewards.earned(user2.address)).to.equal(0);
        });

        it('Should cover onlyRewardsDistribution modifier success path', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            // Should succeed with correct caller
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        it('Should cover successful pause/unpause cycle', async function () {
            await stakingRewards.connect(owner).pause();
            expect(await stakingRewards.paused()).to.be.true;

            await stakingRewards.connect(owner).unpause();
            expect(await stakingRewards.paused()).to.be.false;
        });

        it('Should cover addressToLockedStake direct access', async function () {
            const lockDuration = 7 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            const lockInfo = await stakingRewards.addressToLockedStake(user1.address);
            expect(lockInfo.amount).to.equal(stakeAmount);
            expect(lockInfo.lockDuration).to.equal(lockDuration);
            expect(lockInfo.unlockTimestamp).to.be.gt(0);
        });

        it('Should cover userRewardPerTokenPaid and rewards mappings', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            // Trigger update
            await stakingRewards.connect(user1).getReward();

            const userRewardPerTokenPaid = await stakingRewards.userRewardPerTokenPaid(user1.address);
            expect(userRewardPerTokenPaid).to.be.gt(0);

            // After claiming, rewards should be 0
            expect(await stakingRewards.rewards(user1.address)).to.equal(0);
        });

        it('Should cover rewardPerTokenStored getter', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            // Force update by staking more
            await stakingRewards.connect(user1).stake(ethers.parseUnits('1', 18));

            expect(await stakingRewards.rewardPerTokenStored()).to.be.gt(0);
        });
    });

    describe('Modifier Branch Coverage', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
        });

        // onlyRewardsDistribution modifier - SUCCESS path
        it('onlyRewardsDistribution: should pass when caller is rewardsDistribution', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        // onlyRewardsDistribution modifier - FAILURE path
        it('onlyRewardsDistribution: should fail when caller is not rewardsDistribution', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await expect(stakingRewards.connect(user1).notifyRewardAmount(rewardAmount))
                .to.be.revertedWithCustomError(stakingRewards, 'AccessControlUnauthorizedAccount')
                .withArgs(user1.address, await stakingRewards.REWARDS_DISTRIBUTOR_ROLE());
        });

        // updateReward modifier - account != address(0) path
        it('updateReward: should update rewards when account is not zero', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            // stake triggers updateReward with msg.sender (not zero)
            await stakingRewards.connect(user1).stake(ethers.parseUnits('1', 18));

            // userRewardPerTokenPaid should be updated
            expect(await stakingRewards.userRewardPerTokenPaid(user1.address)).to.be.gt(0);
        });

        // updateReward modifier - account == address(0) path
        it('updateReward: should not update user rewards when account is zero', async function () {
            // notifyRewardAmount calls updateReward(address(0))
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);

            // Before notify
            const userRewardsBefore = await stakingRewards.rewards(user1.address);

            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // User rewards should not change (address(0) path skips user update)
            const userRewardsAfter = await stakingRewards.rewards(user1.address);
            expect(userRewardsAfter).to.equal(userRewardsBefore);
        });

        // whenNotPaused modifier - SUCCESS path (not paused)
        it('whenNotPaused: should allow stake when not paused', async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount * 2n);
        });

        // whenNotPaused modifier - FAILURE path (paused)
        it('whenNotPaused: should fail stake when paused', async function () {
            await stakingRewards.connect(owner).pause();
            await expect(stakingRewards.connect(user1).stake(stakeAmount)).to.be.reverted;
        });

        // whenNotPaused modifier - lockStake SUCCESS path
        it('whenNotPaused: should allow lockStake when not paused', async function () {
            const lockDuration = 7 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);
        });

        // whenNotPaused modifier - lockStake FAILURE path
        it('whenNotPaused: should fail lockStake when paused', async function () {
            await stakingRewards.connect(owner).pause();
            const lockDuration = 7 * 24 * 60 * 60;
            await expect(stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration)).to.be.reverted;
        });

        // nonReentrant modifier - tested implicitly (success path)
        it('nonReentrant: stake should complete successfully', async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount * 2n);
        });

        it('nonReentrant: withdraw should complete successfully', async function () {
            await stakingRewards.connect(user1).withdraw(stakeAmount / 2n);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount / 2n);
        });

        it('nonReentrant: getReward should complete successfully', async function () {
            const rewardAmount = ethers.parseUnits('7000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            await time.increase(24 * 60 * 60);

            await stakingRewards.connect(user1).getReward();
        });

        // onlyOwner modifier - tested via admin functions
        it('onlyOwner: pause should succeed for owner', async function () {
            await stakingRewards.connect(owner).pause();
            expect(await stakingRewards.paused()).to.be.true;
        });

        it('onlyOwner: pause should fail for non-owner', async function () {
            await expect(stakingRewards.connect(user1).pause()).to.be.reverted;
        });

        it('onlyOwner: unpause should succeed for owner', async function () {
            await stakingRewards.connect(owner).pause();
            await stakingRewards.connect(owner).unpause();
            expect(await stakingRewards.paused()).to.be.false;
        });

        it('onlyOwner: unpause should fail for non-owner', async function () {
            await stakingRewards.connect(owner).pause();
            await expect(stakingRewards.connect(user1).unpause()).to.be.reverted;
        });

        it('onlyOwner: setRewardsDistribution should succeed for owner', async function () {
            await stakingRewards
                .connect(owner)
                .grantRole(await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(), user2.address);
            expect(await stakingRewards.hasRole(await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(), user2.address)).to.be
                .true;
        });

        it('onlyOwner: grantRole REWARDS_DISTRIBUTOR_ROLE should fail for non-owner', async function () {
            await expect(
                stakingRewards.connect(user1).grantRole(await stakingRewards.REWARDS_DISTRIBUTOR_ROLE(), user2.address),
            ).to.be.reverted;
        });

        it('onlyOwner: recoverERC20 should fail for non-owner', async function () {
            await expect(stakingRewards.connect(user1).recoverERC20(await rewardsToken.getAddress(), 1)).to.be.reverted;
        });

        it('onlyOwner: setRewardsDuration should fail for non-owner', async function () {
            await expect(stakingRewards.connect(user1).setRewardsDuration(86400)).to.be.reverted;
        });

        it('onlyOwner: setInitialLockPeriod should fail for non-owner', async function () {
            await expect(stakingRewards.connect(user1).setInitialLockPeriod(7776000)).to.be.reverted;
        });
    });

    describe('Require Statement Branch Coverage', function () {
        const stakeAmount = ethers.parseUnits('1000', 18);

        beforeEach(async function () {
            await stakingRewards.connect(user1).stake(stakeAmount);
        });

        // Provided reward too high check - success path (reward is valid)
        it('notifyRewardAmount: should succeed with valid reward amount', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        // Provided reward too high check - failure path (already tested in Same Token section)
        it('notifyRewardAmount: should fail if reward too high', async function () {
            // Note: The top-level beforeEach transfers 1M tokens, so we need a much bigger amount
            // to exceed the balance. This is already well tested in "Same Token" section.
            // Just verify the revert condition by trying to notify 10x the balance
            const currentBalance = await rewardsToken.balanceOf(await stakingRewards.getAddress());
            const hugeReward = currentBalance * 100n;

            await expect(stakingRewards.connect(rewardsDistributor).notifyRewardAmount(hugeReward)).to.be.revertedWith(
                'Provided reward too high',
            );
        });

        // Period not finished check - success path
        it('setRewardsDuration: should succeed when period finished', async function () {
            // Notify rewards first
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Wait for period to finish
            await time.increase(REWARDS_DURATION + 1);

            // Now should succeed
            await stakingRewards.connect(owner).setRewardsDuration(86400);
            expect(await stakingRewards.rewardsDuration()).to.equal(86400);
        });

        // Period not finished check - failure path (tested elsewhere but explicit here)
        it('setRewardsDuration: should fail when period not finished', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Period is active
            await expect(stakingRewards.connect(owner).setRewardsDuration(86400)).to.be.revertedWith(
                'Previous rewards period must be complete before changing the duration for the new period',
            );
        });

        // Insufficient unlocked balance - success path
        it('withdraw: should succeed with sufficient unlocked balance', async function () {
            await stakingRewards.connect(user1).withdraw(stakeAmount / 2n);
            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount / 2n);
        });

        // Insufficient unlocked balance - failure path
        it('withdraw: should fail with insufficient unlocked balance', async function () {
            const lockDuration = 30 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            await expect(stakingRewards.connect(user1).withdraw(stakeAmount)).to.be.revertedWith(
                'Insufficient unlocked balance to withdraw',
            );
        });

        // Cannot recover staking token - success path (different token)
        it('recoverERC20: should succeed with non-staking token', async function () {
            // Send some rewards token to contract
            const amount = ethers.parseUnits('100', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), amount);

            // Should recover rewards token (not staking token)
            await stakingRewards.connect(owner).recoverERC20(await rewardsToken.getAddress(), amount);
        });

        // Cannot recover staking token - failure path
        it('recoverERC20: should fail with 0 token amount', async function () {
            await expect(
                stakingRewards.connect(owner).recoverERC20(await stakingRewards.getAddress(), 0),
            ).to.be.revertedWith('Cannot recover 0 tokens');
        });

        // Cannot recover staking token - failure path
        it('recoverERC20: should fail with staking token', async function () {
            await expect(
                stakingRewards.connect(owner).recoverERC20(await stakingToken.getAddress(), 1),
            ).to.be.revertedWith('Cannot withdraw user staked tokens');
        });

        // Not enough staked balance to lock - failure path
        it('lockStake: should fail if not enough staked balance', async function () {
            const tooMuch = stakeAmount + ethers.parseUnits('1', 18);
            const lockDuration = 7 * 24 * 60 * 60;
            await expect(stakingRewards.connect(user1).lockStake(tooMuch, lockDuration)).to.be.revertedWith(
                'Not enough staked balance to lock',
            );
        });

        // Ternary in lastTimeRewardApplicable - both paths
        it('lastTimeRewardApplicable: returns timestamp when before periodFinish', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // During period
            const lastTime = await stakingRewards.lastTimeRewardApplicable();
            const periodFinish = await stakingRewards.periodFinish();
            expect(lastTime).to.be.lt(periodFinish);
        });

        it('lastTimeRewardApplicable: returns periodFinish when after periodFinish', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // After period
            await time.increase(REWARDS_DURATION + 1);

            const lastTime = await stakingRewards.lastTimeRewardApplicable();
            const periodFinish = await stakingRewards.periodFinish();
            expect(lastTime).to.equal(periodFinish);
        });

        // rewardPerToken when totalSupply is zero
        it('rewardPerToken: returns stored value when totalSupply is 0', async function () {
            // Withdraw all to make supply 0
            await stakingRewards.connect(user1).withdraw(stakeAmount);
            expect(await stakingRewards.totalSupply()).to.equal(0);

            const rewardPerToken = await stakingRewards.rewardPerToken();
            const stored = await stakingRewards.rewardPerTokenStored();
            expect(rewardPerToken).to.equal(stored);
        });

        // rewardPerToken when totalSupply > 0
        it('rewardPerToken: calculates value when totalSupply > 0', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            const rewardPerToken = await stakingRewards.rewardPerToken();
            expect(rewardPerToken).to.be.gt(0);
        });

        // Edge case: periodFinish exactly equals block.timestamp
        it('notifyRewardAmount: should handle periodFinish == block.timestamp', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            // Wait until exactly periodFinish
            const periodFinish = await stakingRewards.periodFinish();
            const currentTime = await time.latest();
            await time.increase(Number(periodFinish) - Number(currentTime));

            // Notify again at exactly periodFinish
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            expect(await stakingRewards.rewardRate()).to.be.gt(0);
        });

        // Edge case: unlockTimestamp exactly equals block.timestamp
        it('getLockedStakeAmount: should return 0 when unlockTimestamp == block.timestamp', async function () {
            const lockDuration = 100;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            // Wait until exactly unlockTimestamp
            const lockInfo = await stakingRewards.addressToLockedStake(user1.address);
            const currentTime = await time.latest();
            const timeToWait = Number(lockInfo.unlockTimestamp) - Number(currentTime);
            await time.increase(timeToWait);

            // At exact unlock time, should return 0 (unlockTimestamp > block.timestamp is false)
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(0);
        });

        // Test all public getters to ensure they're covered
        it('Should cover all public getters', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(24 * 60 * 60);

            // Call all getters
            await stakingRewards.rewardsToken();
            await stakingRewards.stakingToken();
            await stakingRewards.periodFinish();
            await stakingRewards.rewardRate();
            await stakingRewards.rewardsDuration();
            await stakingRewards.lastUpdateTime();
            await stakingRewards.rewardPerTokenStored();
            await stakingRewards.userRewardPerTokenPaid(user1.address);
            await stakingRewards.rewards(user1.address);
            await stakingRewards.totalSupply();
            await stakingRewards.balanceOf(user1.address);
            await stakingRewards.lastTimeRewardApplicable();
            await stakingRewards.rewardPerToken();
            await stakingRewards.earned(user1.address);
            await stakingRewards.getRewardForDuration();
            await stakingRewards.addressToLockedStake(user1.address);
            await stakingRewards.getLockedStakeAmount(user1.address);
            await stakingRewards.paused();
            await stakingRewards.owner();
            await stakingRewards.initialLockPeriodDuration();
        });

        // Test lockStake when currentLockedStakeAmount == 0 path explicitly
        it('lockStake: should skip validation when no existing lock', async function () {
            // Ensure no lock exists
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(0);

            // Lock should succeed without checking reduction/shortening
            const lockDuration = 7 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount);
        });

        // Test lockStake when currentLockedStakeAmount != 0 path
        it('lockStake: should validate when existing lock exists', async function () {
            const lockDuration = 7 * 24 * 60 * 60;
            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            // Try to reduce amount - should fail
            await expect(
                stakingRewards.connect(user1).lockStake(stakeAmount / 2n, lockDuration * 2),
            ).to.be.revertedWith('Cannot reduce the amount of locked tokens');

            // Try to shorten duration - should fail
            await expect(
                stakingRewards.connect(user1).lockStake(stakeAmount, Math.floor(lockDuration / 2)),
            ).to.be.revertedWith('Cannot shorten the lock duration');
        });

        // Test earned calculation with different scenarios
        it('earned: should calculate correctly with existing rewards', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);

            await time.increase(12 * 60 * 60); // 12 hours

            // Stake more to trigger updateReward
            await stakingRewards.connect(user1).stake(ethers.parseUnits('100', 18));

            // Should have accumulated rewards
            const earned = await stakingRewards.earned(user1.address);
            expect(earned).to.be.gt(0);
        });

        // Test notifyRewardAmount when period finished and when not finished
        it('notifyRewardAmount: should use correct branch based on periodFinish', async function () {
            const rewardAmount = ethers.parseUnits('1000', 18);

            // First notification - period finished (no existing period)
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            const rate1 = await stakingRewards.rewardRate();

            // Wait partial period
            await time.increase(Number(REWARDS_DURATION) / 2);

            // Second notification - period not finished (else branch)
            await rewardsToken.transfer(await stakingRewards.getAddress(), rewardAmount);
            await stakingRewards.connect(rewardsDistributor).notifyRewardAmount(rewardAmount);
            const rate2 = await stakingRewards.rewardRate();

            // Rate should be different (includes leftover)
            expect(rate2).to.not.equal(rate1);
        });

        it('Should fail to get rewards before initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await expect(stakingRewards.connect(user1).getReward()).to.be.revertedWith(
                'Get rewards not allowed during initial lock period',
            );
        });

        it('Should fail to withdraw before initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await expect(stakingRewards.connect(user1).withdraw(stakeAmount / 2n)).to.be.revertedWith(
                'Withdraw not allowed during initial lock period',
            );
        });

        it('Should succeed to get rewards after initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await time.increase(duration); // Fast forward time to after the lock period
            await expect(stakingRewards.connect(user1).getReward()).to.not.be.reverted;
        });

        it('Should succeed to withdraw after initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await time.increase(duration); // Fast forward time to after the initial lock period
            await expect(stakingRewards.connect(user1).withdraw(stakeAmount / 2n)).to.not.be.reverted;
        });

        it('Should allow stakeAndLock with lock period after initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await time.increase(duration); // Fast forward time to after the initial lock period

            const amountToStake = ethers.parseUnits('500', 18);
            const amountToLock = ethers.parseUnits('300', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).stakeAndLock(amountToStake, amountToLock, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount + amountToStake); // Previous stake + new stake
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(amountToLock);
        });

        it('Should allow stakeAndLockOnBehalf with lock period after initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await stakingRewards.connect(owner).grantRole(await stakingRewards.STAKER_ON_BEHALF_ROLE(), user1.address);

            await time.increase(duration); // Fast forward time to after the initial lock period

            const amount = ethers.parseUnits('300', 18);
            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).stakeAndLockOnBehalf(user2, amount, lockDuration);

            expect(await stakingRewards.balanceOf(user2.address)).to.equal(amount);
            expect(await stakingRewards.getLockedStakeAmount(user2.address)).to.equal(amount);
        });

        it('Should allow lockStake with lock period after initial lock period finishes', async function () {
            const duration = 90 * 24 * 60 * 60; // 90 days
            await stakingRewards.connect(owner).setInitialLockPeriod(duration);
            await time.increase(duration); // Fast forward time to after the initial lock period

            const lockDuration = 7 * 24 * 60 * 60; // 7 days

            await stakingRewards.connect(user1).lockStake(stakeAmount, lockDuration);

            expect(await stakingRewards.balanceOf(user1.address)).to.equal(stakeAmount); // Previous staked amount
            expect(await stakingRewards.getLockedStakeAmount(user1.address)).to.equal(stakeAmount); // All should be locked
        });
    });
});
