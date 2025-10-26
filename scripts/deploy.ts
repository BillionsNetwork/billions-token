import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';

async function main() {
    const [deployer] = await ethers.getSigners();

    // Replace with correct addresses
    const INITIAL_OWNER = '';
    const TIMELOCK_ADMIN_ADDRESS = '';

    console.log('Deploying Billions Network Token with account:', deployer.address);
    console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Billions Network Token Parameters
    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18;
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion tokens

    // Timelock Parameters
    const MIN_DELAY = 2 * 24 * 60 * 60; // 172_800 seconds = 2 days

    console.log('\n--- Token Configuration ---');
    console.log('Name:', TOKEN_NAME);
    console.log('Symbol:', TOKEN_SYMBOL);
    console.log('Initial Owner:', INITIAL_OWNER);
    console.log('Total Supply:', ethers.formatUnits(TOTAL_SUPPLY, DECIMALS), TOKEN_SYMBOL);

    console.log('\n--- Timelock Configuration ---');
    console.log('Min Delay:', MIN_DELAY, 'seconds (', MIN_DELAY / (24 * 60 * 60), 'days)');
    console.log('Timelock Admin:', TIMELOCK_ADMIN_ADDRESS);

    // Deploy upgradeable token using Transparent Proxy
    const BillionsNetworkToken = await ethers.getContractFactory('BillionsNetworkToken');
    console.log('\nDeploying with Transparent Proxy...');

    const token = await upgrades.deployProxy(
        BillionsNetworkToken,
        [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_OWNER, TOTAL_SUPPLY],
        {
            initializer: 'initialize',
            kind: 'transparent', // Use Transparent Proxy pattern
        }
    );

    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();

    console.log('\n--- Deployment Complete ---');
    console.log('✅ Token deployed successfully!');
    console.log('\nProxy (Token Address):', tokenAddress);
    console.log('Token name:', await token.name());
    console.log('Token symbol:', await token.symbol());
    console.log('Decimals:', await token.decimals());
    console.log('Total supply:', ethers.formatUnits(await token.totalSupply(), DECIMALS), TOKEN_SYMBOL);

    // Get implementation and admin addresses
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(tokenAddress);
    const adminAddress = await upgrades.erc1967.getAdminAddress(tokenAddress);

    console.log('\n--- Proxy Architecture ---');
    console.log('Implementation:', implementationAddress);
    console.log('ProxyAdmin:', adminAddress);

    // Deploy TimelockController
    console.log('\n--- Deploying TimelockController ---');
    const TimelockController = await ethers.getContractFactory('TimelockController');

    const proposers = [TIMELOCK_ADMIN_ADDRESS]; // Addresses that can propose
    const executors = [TIMELOCK_ADMIN_ADDRESS]; // Addresses that can execute
    const admin = TIMELOCK_ADMIN_ADDRESS; // Admin address (can grant/revoke roles)

    const timelock = await TimelockController.deploy(MIN_DELAY, proposers, executors, admin);
    await timelock.waitForDeployment();

    const timelockAddress = await timelock.getAddress();
    console.log('✅ TimelockController deployed at:', timelockAddress);

    // Transfer ProxyAdmin ownership to Timelock
    console.log('\n--- Transferring ProxyAdmin Ownership to Timelock ---');
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
    const transferTx = await proxyAdmin.transferOwnership(timelockAddress);
    await transferTx.wait();

    const newOwner = await proxyAdmin.owner();
    expect(newOwner).to.equal(timelockAddress);
    console.log('✅ ProxyAdmin ownership transferred to Timelock:');

    console.log('\n=================================');
    console.log('📋 DEPLOYMENT SUMMARY');
    console.log('=================================');
    console.log('\n🪙 Token:');
    console.log('  Proxy (Token Address):', tokenAddress);
    console.log('  Name:', await token.name());
    console.log('  Symbol:', await token.symbol());
    console.log('  Decimals:', await token.decimals());
    console.log('  Total Supply:', ethers.formatUnits(await token.totalSupply(), 18), TOKEN_SYMBOL);
    console.log('  Initial Owner:', INITIAL_OWNER);

    console.log('\n🏛️ Governance:');
    console.log('  TimelockController:', timelockAddress);
    console.log('  Min Delay:', MIN_DELAY / (24 * 60 * 60), 'days');

    console.log('\n📝 Save these addresses:');
    console.log('----------------------------------');
    console.log('TOKEN_PROXY=', tokenAddress);
    console.log('TIMELOCK=', timelockAddress);
    console.log('PROXY_ADMIN=', adminAddress);
    console.log('IMPLEMENTATION=', implementationAddress);
    console.log('----------------------------------');

    console.log('\nTo verify on Etherscan:');
    console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK} ${tokenAddress}`);
    console.log(
        `npx hardhat verify --network ${process.env.HARDHAT_NETWORK} ${timelockAddress} ${MIN_DELAY} '${JSON.stringify(
            proposers
        )}' '${JSON.stringify(executors)}' ${admin}`
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
