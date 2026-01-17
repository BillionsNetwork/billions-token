import { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log('='.repeat(60));
    console.log('StakingRewards - Upgradeable Deployment with Timelock');
    console.log('='.repeat(60));
    console.log('\nDeployer:', deployer.address);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');

    // Read configuration from input.json
    const inputPath = path.join(__dirname, 'input.json');
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // Validate input
    if (!ethers.isAddress(input.MULTISIG)) {
        throw new Error('Invalid MULTISIG address in input.json');
    }
    if (!ethers.isAddress(input.BILLIONS_TOKEN)) {
        throw new Error('Invalid BILLIONS_TOKEN address in input.json');
    }
    if (!input.REWARDS_DURATION || input.REWARDS_DURATION <= 0) {
        throw new Error('Invalid REWARDS_DURATION in input.json (must be > 0)');
    }
    if (!input.TIMELOCK_MIN_DELAY || input.TIMELOCK_MIN_DELAY <= 0) {
        throw new Error('Invalid TIMELOCK_MIN_DELAY in input.json (must be > 0)');
    }

    console.log('\n📋 Configuration:');
    console.log(`   Multisig:            ${input.MULTISIG}`);
    console.log(`   Billions Token:      ${input.BILLIONS_TOKEN} (stake & rewards)`);
    console.log(`   Rewards Duration:    ${input.REWARDS_DURATION} seconds (${input.REWARDS_DURATION / 86400} days)`);
    console.log(
        `   Timelock Min Delay:  ${input.TIMELOCK_MIN_DELAY} seconds (${input.TIMELOCK_MIN_DELAY / 86400} days)`,
    );

    // ============================================================
    // STEP 1: Deploy TimelockController
    // ============================================================
    console.log('\n' + '-'.repeat(60));
    console.log('STEP 1: Deploying TimelockController...');
    console.log('-'.repeat(60));

    const TimelockController = await ethers.getContractFactory('TimelockController');
    const proposers = [input.MULTISIG];
    const executors = [input.MULTISIG];
    const admin = input.MULTISIG; // Multisig can manage roles

    const timelock = await TimelockController.deploy(input.TIMELOCK_MIN_DELAY, proposers, executors, admin);
    await timelock.waitForDeployment();
    const timelockAddress = await timelock.getAddress();

    console.log(`   ✅ TimelockController deployed: ${timelockAddress}`);

    // ============================================================
    // STEP 2: Deploy StakingRewards as upgradeable proxy
    // ============================================================
    console.log('\n' + '-'.repeat(60));
    console.log('STEP 2: Deploying StakingRewards (Upgradeable Proxy)...');
    console.log('-'.repeat(60));

    // The owner of the StakingRewards contract will be the Multisig (for pause/unpause, setRewardsDuration, etc)
    // The rewardsDistribution will also be the Multisig (can notify reward amounts)
    // The ProxyAdmin will be owned by the Timelock (for upgrades) - set via initialOwner option
    const StakingRewardsFactory = await ethers.getContractFactory('StakingRewards');
    const stakingRewards = await upgrades.deployProxy(
        StakingRewardsFactory,
        [input.MULTISIG, input.MULTISIG, input.BILLIONS_TOKEN, input.BILLIONS_TOKEN, input.REWARDS_DURATION],
        {
            initializer: 'initialize',
            kind: 'transparent',
            initialOwner: timelockAddress, // ProxyAdmin will be owned by Timelock
        },
    );

    await stakingRewards.waitForDeployment();
    const proxyAddress = await stakingRewards.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

    console.log(`   ✅ StakingRewards Proxy deployed: ${proxyAddress}`);
    console.log(`   ✅ Implementation deployed:       ${implementationAddress}`);
    console.log(`   ✅ ProxyAdmin deployed:           ${proxyAdminAddress}`);

    // Verify ProxyAdmin owner is Timelock
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
    const proxyAdminOwner = await proxyAdmin.owner();
    if (proxyAdminOwner.toLowerCase() !== timelockAddress.toLowerCase()) {
        throw new Error(`ProxyAdmin owner mismatch! Expected ${timelockAddress}, got ${proxyAdminOwner}`);
    }
    console.log(`   ✅ ProxyAdmin owner verified:     ${proxyAdminOwner} (Timelock)`);

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('DEPLOYMENT COMPLETE');
    console.log('='.repeat(60));
    console.log('\nDeployed Addresses:');
    console.log(`   TimelockController:     ${timelockAddress}`);
    console.log(`   StakingRewards (Proxy): ${proxyAddress}`);
    console.log(`   Implementation:         ${implementationAddress}`);
    console.log(`   ProxyAdmin:             ${proxyAdminAddress}`);
    console.log('\nOwnership:');
    console.log(`   StakingRewards Owner:      ${input.MULTISIG} (Multisig)`);
    console.log(`   Rewards Distribution:      ${input.MULTISIG} (Multisig)`);
    console.log(`   ProxyAdmin Owner:          ${timelockAddress} (Timelock)`);
    console.log(`   Timelock Proposer/Executor: ${input.MULTISIG} (Multisig)`);

    // Save output
    const output = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        addresses: {
            timelock: timelockAddress,
            proxy: proxyAddress,
            implementation: implementationAddress,
            proxyAdmin: proxyAdminAddress,
        },
        config: {
            multisig: input.MULTISIG,
            billionsToken: input.BILLIONS_TOKEN,
            rewardsDuration: input.REWARDS_DURATION,
            timelockMinDelay: input.TIMELOCK_MIN_DELAY,
        },
    };

    const outputPath = path.join(__dirname, 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n📁 Saved deployment info to output.json`);

    // Verification instructions
    console.log('\n' + '='.repeat(60));
    console.log('NEXT STEPS');
    console.log('='.repeat(60));
    console.log('\n1. Verify contracts on Etherscan:');
    console.log(`   npm run staking:verify:sepolia  # or staking:verify:mainnet`);
    console.log('\n2. Transfer reward tokens to the StakingRewards contract');
    console.log('\n3. Call notifyRewardAmount() from the Multisig to start rewards');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    });
