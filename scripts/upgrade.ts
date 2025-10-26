import { ethers, upgrades } from 'hardhat';

async function main() {
    const [deployer] = await ethers.getSigners();

    // Replace with your deployed proxy address
    const PROXY_ADDRESS = process.env.PROXY_ADDRESS || '';

    if (!PROXY_ADDRESS) {
        console.error('❌ Please set PROXY_ADDRESS environment variable');
        console.error('Example: PROXY_ADDRESS=0x... npm run upgrade:sepolia');
        process.exit(1);
    }

    console.log('Upgrading BillionsNetworkToken at:', PROXY_ADDRESS);
    console.log('Upgrader account:', deployer.address);

    // Deploy new implementation
    const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
    console.log('Upgrading to new implementation...');

    const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, BillionsNetworkTokenV2);
    await upgraded.waitForDeployment();

    console.log('✅ Upgrade complete!');
    console.log('Proxy address (unchanged):', await upgraded.getAddress());

    const newImplementation = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
    console.log('New implementation:', newImplementation);

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
