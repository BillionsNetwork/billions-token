import { ethers, upgrades } from 'hardhat';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log('Deploying Billions Network Token with account:', deployer.address);
    console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Billions Network Token Parameters
    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18; // Default decimals (not configurable in ERC20)
    const INITIAL_OWNER = deployer.address; // Initial owner
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion tokens

    console.log('\n--- Token Configuration ---');
    console.log('Name:', TOKEN_NAME);
    console.log('Symbol:', TOKEN_SYMBOL);
    console.log('Decimals:', DECIMALS);
    console.log('Initial Owner:', INITIAL_OWNER);
    console.log('Total Supply:', ethers.formatUnits(TOTAL_SUPPLY, DECIMALS), TOKEN_SYMBOL);

    // Deploy upgradeable token using Transparent Proxy
    const BillionsToken = await ethers.getContractFactory('BillionsToken');
    console.log('\nDeploying with Transparent Proxy...');

    const token = await upgrades.deployProxy(BillionsToken, [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_OWNER, TOTAL_SUPPLY], {
        initializer: 'initialize',
        kind: 'transparent', // Use Transparent Proxy pattern
    });

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

    console.log('\n--- Features ---');
    console.log('✅ ERC20 Standard');
    console.log('✅ ERC20Permit (Gasless Approvals)');
    console.log('✅ Upgradeable (Transparent Proxy)');

    console.log('\n💡 Important: Save these addresses for future upgrades and verification!');
    console.log('\nTo verify on Etherscan:');
    console.log(`npx hardhat verify --network <network> ${tokenAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
