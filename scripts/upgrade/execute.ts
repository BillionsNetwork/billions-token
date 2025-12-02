import { ethers, upgrades } from 'hardhat';
import { TimelockController } from '../../typechain-types';

async function main() {
    const [deployer] = await ethers.getSigners();

    // Replace with your deployed proxy address
    const TOKEN_PROXY_ADDRESS = process.env.TOKEN_PROXY_ADDRESS;
    const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS;
    const TOKEN_NEW_IMPLEMENTATION_ADDRESS = process.env.TOKEN_NEW_IMPLEMENTATION_ADDRESS;

    if (!TOKEN_PROXY_ADDRESS) {
        console.error('❌ Please set TOKEN_PROXY_ADDRESS environment variable');
        console.error('Example: TOKEN_PROXY_ADDRESS=0x... npm run upgrade:sepolia');
        process.exit(1);
    }
    if (!TIMELOCK_ADDRESS) {
        console.error('❌ Please set TIMELOCK_ADDRESS environment variable');
        console.error('Example: TIMELOCK_ADDRESS=0x... npm run upgrade:sepolia');
        process.exit(1);
    }
    if (!TOKEN_NEW_IMPLEMENTATION_ADDRESS) {
        console.error('❌ Please set TOKEN_NEW_IMPLEMENTATION_ADDRESS environment variable');
        console.error('Example: TOKEN_NEW_IMPLEMENTATION_ADDRESS=0x... npm run upgrade:sepolia');
        process.exit(1);
    }

    console.log('Executing upgrade for BillionsNetworkToken at:', TOKEN_PROXY_ADDRESS);
    console.log('Executor account:', deployer.address);

    // As we are working with same proxy the storage is already initialized
    const initializeData = '0x';

    const adminAddress = await upgrades.erc1967.getAdminAddress(TOKEN_PROXY_ADDRESS);
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
    const proxyAdminAddress = await proxyAdmin.getAddress();

    // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
    const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
        TOKEN_PROXY_ADDRESS,
        TOKEN_NEW_IMPLEMENTATION_ADDRESS,
        initializeData,
    ]);

    const timelock = (await ethers.getContractAt(
        'TimelockController',
        TIMELOCK_ADDRESS
    )) as unknown as TimelockController;

    // Execute the upgrade via timelock by the executor
    const executeTx = await timelock
        .connect(deployer)
        .execute(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash);
    await executeTx.wait();
    console.log('tx hash for Timelock execute:', executeTx.hash);
    console.log('✅ Upgrade executed via Timelock!');

    const upgraded = await ethers.getContractAt('BillionsNetworkToken', TOKEN_PROXY_ADDRESS);
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(TOKEN_PROXY_ADDRESS);
    console.log('New implementation address:', implementationAddress);
    
    // Verify state is preserved
    console.log('\n--- Verifying State ---');
    console.log('Token name:', await upgraded.name());
    console.log('Token symbol:', await upgraded.symbol());
    console.log('Total supply:', ethers.formatEther(await upgraded.totalSupply()));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
