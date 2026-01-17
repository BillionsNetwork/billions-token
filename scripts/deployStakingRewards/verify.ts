import { ethers, upgrades } from 'hardhat';
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

async function main() {
    console.log('='.repeat(60));
    console.log('StakingRewards - Deployment Verification');
    console.log('='.repeat(60));

    // Read input and output files
    const inputPath = path.join(__dirname, 'input.json');
    const outputPath = path.join(__dirname, 'output.json');

    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    const timelockAddress = output.addresses.timelock;
    const proxyAddress = output.addresses.proxy;
    const implementationAddress = output.addresses.implementation;
    const proxyAdminAddress = output.addresses.proxyAdmin;

    console.log('\n📋 Deployed Addresses:');
    console.log(`   Timelock:        ${timelockAddress}`);
    console.log(`   Proxy:           ${proxyAddress}`);
    console.log(`   Implementation:  ${implementationAddress}`);
    console.log(`   ProxyAdmin:      ${proxyAdminAddress}`);

    // ============================================================
    // SECTION 1: VERIFY CONTRACTS ON ETHERSCAN
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('SECTION 1: ETHERSCAN VERIFICATION');
    console.log('='.repeat(60));

    // 1.1 Verify TimelockController
    console.log('\n🔍 Verifying TimelockController...');
    try {
        await hre.run('verify:verify', {
            address: timelockAddress,
            constructorArguments: [input.TIMELOCK_MIN_DELAY, [input.MULTISIG], [input.MULTISIG], input.MULTISIG],
        });
        console.log('   ✅ TimelockController verified');
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('   ✅ TimelockController already verified');
        } else {
            console.log(`   ❌ TimelockController verification failed: ${error.message}`);
        }
    }

    // 1.2 Verify Implementation
    console.log('\n🔍 Verifying Implementation (StakingRewards)...');
    try {
        await hre.run('verify:verify', {
            address: implementationAddress,
            constructorArguments: [],
        });
        console.log('   ✅ Implementation verified');
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('   ✅ Implementation already verified');
        } else {
            console.log(`   ❌ Implementation verification failed: ${error.message}`);
        }
    }

    // 1.3 Verify ProxyAdmin
    console.log('\n🔍 Verifying ProxyAdmin...');
    try {
        await hre.run('verify:verify', {
            address: proxyAdminAddress,
            constructorArguments: [timelockAddress],
        });
        console.log('   ✅ ProxyAdmin verified');
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('   ✅ ProxyAdmin already verified');
        } else {
            console.log(`   ❌ ProxyAdmin verification failed: ${error.message}`);
        }
    }

    // ============================================================
    // SECTION 2: CHECK DEPLOYED PARAMETERS
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('SECTION 2: PARAMETER VERIFICATION');
    console.log('='.repeat(60));

    // Get contract instances
    const stakingRewards = await ethers.getContractAt('StakingRewards', proxyAddress);
    const timelock = await ethers.getContractAt('TimelockController', timelockAddress);

    // 2.1 Check tokens (both should be BILLIONS_TOKEN)
    console.log('\n📦 Token Parameters:');
    const rewardsToken = await stakingRewards.rewardsToken();
    const stakingToken = await stakingRewards.stakingToken();

    console.log(`   Rewards Token:  ${rewardsToken}`);
    console.log(`   Staking Token:  ${stakingToken}`);

    expect(rewardsToken.toLowerCase()).to.equal(input.BILLIONS_TOKEN.toLowerCase(), 'Rewards token mismatch');
    console.log('   ✅ Rewards token matches BILLIONS_TOKEN');

    expect(stakingToken.toLowerCase()).to.equal(input.BILLIONS_TOKEN.toLowerCase(), 'Staking token mismatch');
    console.log('   ✅ Staking token matches BILLIONS_TOKEN');

    expect(rewardsToken.toLowerCase()).to.equal(
        stakingToken.toLowerCase(),
        'Rewards and staking token should be the same',
    );
    console.log('   ✅ Rewards and staking token are the same');

    // 2.2 Check StakingRewards owner
    console.log('\n🔐 StakingRewards Owner Check:');
    const owner = await stakingRewards.owner();
    console.log(`   Owner: ${owner}`);

    expect(owner.toLowerCase()).to.equal(input.MULTISIG.toLowerCase(), 'Owner mismatch');
    console.log('   ✅ Owner is Multisig');

    // 2.3 Check rewards distribution
    console.log('\n📤 Rewards Distribution Check:');
    const rewardsDistribution = await stakingRewards.rewardsDistribution();
    console.log(`   Rewards Distribution: ${rewardsDistribution}`);

    expect(rewardsDistribution.toLowerCase()).to.equal(input.MULTISIG.toLowerCase(), 'Rewards distribution mismatch');
    console.log('   ✅ Rewards distribution is Multisig');

    // 2.4 Check rewards duration
    console.log('\n⏱️ Rewards Duration:');
    const rewardsDuration = await stakingRewards.rewardsDuration();
    console.log(`   Rewards Duration: ${rewardsDuration} seconds (${Number(rewardsDuration) / 86400} days)`);

    expect(rewardsDuration).to.equal(input.REWARDS_DURATION, 'Rewards duration mismatch');
    console.log('   ✅ Rewards duration matches');

    // 2.5 Check ProxyAdmin owner is Timelock
    console.log('\n🔒 ProxyAdmin Owner Check:');
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
    const proxyAdminOwner = await proxyAdmin.owner();
    console.log(`   ProxyAdmin Owner: ${proxyAdminOwner}`);

    expect(proxyAdminOwner.toLowerCase()).to.equal(
        timelockAddress.toLowerCase(),
        'ProxyAdmin should be owned by Timelock',
    );
    console.log('   ✅ ProxyAdmin owner is Timelock');

    // 2.6 Check Timelock roles
    console.log('\n⏰ Timelock Roles Check:');

    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

    const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, input.MULTISIG);
    console.log(`   Multisig has PROPOSER_ROLE:  ${hasProposerRole}`);
    expect(hasProposerRole).to.be.true;
    console.log('   ✅ Multisig has PROPOSER_ROLE');

    const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, input.MULTISIG);
    console.log(`   Multisig has EXECUTOR_ROLE:  ${hasExecutorRole}`);
    expect(hasExecutorRole).to.be.true;
    console.log('   ✅ Multisig has EXECUTOR_ROLE');

    const hasCancellerRole = await timelock.hasRole(CANCELLER_ROLE, input.MULTISIG);
    console.log(`   Multisig has CANCELLER_ROLE: ${hasCancellerRole}`);
    expect(hasCancellerRole).to.be.true;
    console.log('   ✅ Multisig has CANCELLER_ROLE');

    const hasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, input.MULTISIG);
    console.log(`   Multisig has ADMIN_ROLE:     ${hasAdminRole}`);
    expect(hasAdminRole).to.be.true;
    console.log('   ✅ Multisig has DEFAULT_ADMIN_ROLE');

    // 2.7 Check Timelock min delay
    console.log('\n⏱️ Timelock Min Delay:');
    const minDelay = await timelock.getMinDelay();
    console.log(`   Min Delay: ${minDelay} seconds (${Number(minDelay) / 86400} days)`);
    expect(minDelay).to.equal(input.TIMELOCK_MIN_DELAY, 'Min delay mismatch');
    console.log('   ✅ Min delay matches');

    // 2.8 Check not paused
    console.log('\n⏸️ Pause Status:');
    const paused = await stakingRewards.paused();
    console.log(`   Paused: ${paused}`);
    expect(paused).to.be.false;
    console.log('   ✅ Contract is not paused');

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('\n✅ All checks passed!');
    console.log('\nArchitecture:');
    console.log(`   Multisig (${input.MULTISIG})`);
    console.log(`       └── Proposer/Executor/Admin of Timelock`);
    console.log(`       └── Owner of StakingRewards (pause, setRewardsDuration, recoverERC20)`);
    console.log(`       └── RewardsDistribution (notifyRewardAmount)`);
    console.log(`   Timelock (${timelockAddress})`);
    console.log(`       └── Owner of ProxyAdmin (controls upgrades)`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    });
