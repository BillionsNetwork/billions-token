import { ethers, upgrades } from 'hardhat';
import { TimelockController } from '../../typechain-types';
import { verifyContract } from '../../helpers/utils';

async function main() {
    const [deployer] = await ethers.getSigners();

    // Replace with your deployed proxy address
    const TOKEN_PROXY_ADDRESS = process.env.TOKEN_PROXY_ADDRESS;
    const TIMELOCK_ADDRESS = process.env.TIMELOCK_ADDRESS;
    const MIN_DELAY = process.env.TIMELOCK_MIN_DELAY ? parseInt(process.env.TIMELOCK_MIN_DELAY) : 2 * 24 * 60 * 60; // Default to 2 days

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

    console.log('Scheduling upgrade for BillionsNetworkToken at:', TOKEN_PROXY_ADDRESS);
    console.log('Proposer account:', deployer.address);

    // Deploy new implementation
    const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');

    console.log('Deploying new implementation...');
    const newImplementation = await BillionsNetworkTokenV2.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();

    console.log('New implementation:', newImplementationAddress);

    // As we are working with same proxy the storage is already initialized
    const initializeData = '0x';

    const adminAddress = await upgrades.erc1967.getAdminAddress(TOKEN_PROXY_ADDRESS);
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
    const proxyAdminAddress = await proxyAdmin.getAddress();

    // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
    const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
        TOKEN_PROXY_ADDRESS,
        newImplementationAddress,
        initializeData,
    ]);

    const timelock = (await ethers.getContractAt(
        'TimelockController',
        TIMELOCK_ADDRESS
    )) as unknown as TimelockController;

    // propose and execute via timelock by the proposer
    const proposeTx = await timelock
        .connect(deployer)
        .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY);
    await proposeTx.wait();
    console.log('tx hash for Timelock schedule:', proposeTx.hash);
    console.log('✅ Upgrade scheduled via Timelock!');

    console.log('\n📝 Save these addresses:');
    console.log('----------------------------------');
    console.log('TOKEN_NEW_IMPLEMENTATION_ADDRESS=', newImplementationAddress);
    console.log('----------------------------------');

    await verifyContract(newImplementationAddress, {
        constructorArgsImplementation: [],
        libraries: {},
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
