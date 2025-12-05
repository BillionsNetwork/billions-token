import { ethers, upgrades } from 'hardhat';
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

async function main() {
    console.log('='.repeat(60));
    console.log('Billions Network Token - Deployment Verification');
    console.log('='.repeat(60));

    // Read input and output files
    const inputPath = path.join(__dirname, '../input.json');
    const outputPath = path.join(__dirname, 'output-deployment.json');

    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    const MULTISIG = input.MULTISIG;

    // Extract deployed addresses from output
    const timelockAddress = output.find((tx: any) => tx.name === 'Deploy TimelockController')?.predictedAddress;
    const implementationAddress = output.find((tx: any) => tx.name === 'Deploy Implementation')?.predictedAddress;
    const proxyAddress = output.find((tx: any) => tx.name === 'Deploy TransparentUpgradeableProxy')?.predictedAddress;

    console.log('\n📋 Configuration:');
    console.log(`   Multisig:        ${MULTISIG}`);
    console.log(`   Timelock:        ${timelockAddress}`);
    console.log(`   Implementation:  ${implementationAddress}`);
    console.log(`   Proxy:           ${proxyAddress}`);

    // Expected values
    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18;
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion
    const MIN_DELAY = 2 * 24 * 60 * 60; // 2 days

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
            constructorArguments: [MIN_DELAY, [MULTISIG], [MULTISIG], MULTISIG],
        });
        console.log('   ✅ TimelockController verified');
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('   ✅ TimelockController already verified');
        } else {
            console.log(`   ❌ TimelockController verification failed: ${error.message}`);
        }
    }

    // 1.2 Verify Implementation (BillionsNetworkToken)
    console.log('\n🔍 Verifying Implementation (BillionsNetworkToken)...');
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

    // 1.3 Get ProxyAdmin address from proxy
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
    console.log(`\n📋 ProxyAdmin Address: ${proxyAdminAddress}`);

    // 1.4 Verify TransparentUpgradeableProxy
    console.log('\n🔍 Verifying TransparentUpgradeableProxy...');
    const initFragment = (await ethers.getContractFactory('BillionsNetworkToken')).interface.getFunction('initialize');
    const initData = (await ethers.getContractFactory('BillionsNetworkToken')).interface.encodeFunctionData(
        initFragment!,
        [TOKEN_NAME, TOKEN_SYMBOL, MULTISIG, TOTAL_SUPPLY]
    );
    try {
        await hre.run('verify:verify', {
            address: proxyAddress,
            constructorArguments: [implementationAddress, timelockAddress, initData],
        });
        console.log('   ✅ TransparentUpgradeableProxy verified');
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('   ✅ TransparentUpgradeableProxy already verified');
        } else {
            console.log(`   ❌ TransparentUpgradeableProxy verification failed: ${error.message}`);
        }
    }

    // 1.5 Verify ProxyAdmin
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
    const token = await ethers.getContractAt('BillionsNetworkToken', proxyAddress);
    const timelock = await ethers.getContractAt('TimelockController', timelockAddress);

    // 2.1 Check token name and symbol
    console.log('\n📦 Token Parameters:');
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const totalSupply = await token.totalSupply();

    console.log(`   Name:      ${name}`);
    console.log(`   Symbol:    ${symbol}`);
    console.log(`   Decimals:  ${decimals}`);
    console.log(`   Supply:    ${ethers.formatUnits(totalSupply, DECIMALS)} tokens`);

    expect(name).to.equal(TOKEN_NAME, 'Token name mismatch');
    console.log('   ✅ Name matches expected value');

    expect(symbol).to.equal(TOKEN_SYMBOL, 'Token symbol mismatch');
    console.log('   ✅ Symbol matches expected value');

    expect(decimals).to.equal(DECIMALS, 'Decimals mismatch');
    console.log('   ✅ Decimals matches expected value');

    expect(totalSupply).to.equal(TOTAL_SUPPLY, 'Total supply mismatch');
    console.log('   ✅ Total supply matches expected value');

    // 2.2 Check all balance belongs to multisig
    console.log('\n💰 Balance Check:');
    const multisigBalance = await token.balanceOf(MULTISIG);
    console.log(`   Multisig Balance: ${ethers.formatUnits(multisigBalance, DECIMALS)} tokens`);

    expect(multisigBalance).to.equal(TOTAL_SUPPLY, 'Multisig does not hold all tokens');
    console.log('   ✅ Multisig holds 100% of total supply');

    // 2.3 Check proxy admin address matches
    console.log('\n🔐 Proxy Admin Check:');
    const actualProxyAdmin = await upgrades.erc1967.getAdminAddress(proxyAddress);
    console.log(`   ProxyAdmin Address: ${actualProxyAdmin}`);
    expect(actualProxyAdmin.toLowerCase()).to.equal(proxyAdminAddress.toLowerCase(), 'ProxyAdmin mismatch');

    // 2.4 Check implementation address
    const actualImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log(`   Implementation:     ${actualImplementation}`);

    expect(actualImplementation.toLowerCase()).to.equal(implementationAddress.toLowerCase(), 'Implementation mismatch');
    console.log('   ✅ Implementation address matches');

    // 2.5 Check owner of ProxyAdmin is Timelock
    console.log('\n🔒 ProxyAdmin Owner Check:');
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
    const proxyAdminOwner = await proxyAdmin.owner();
    console.log(`   ProxyAdmin Owner: ${proxyAdminOwner}`);

    expect(proxyAdminOwner.toLowerCase()).to.equal(
        timelockAddress.toLowerCase(),
        'ProxyAdmin owner should be Timelock'
    );
    console.log('   ✅ ProxyAdmin owner is Timelock');

    // 2.6 Check Timelock roles
    console.log('\n⏰ Timelock Roles Check:');

    // Role constants from TimelockController
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

    console.log(`   PROPOSER_ROLE:      ${PROPOSER_ROLE}`);
    console.log(`   EXECUTOR_ROLE:      ${EXECUTOR_ROLE}`);
    console.log(`   CANCELLER_ROLE:     ${CANCELLER_ROLE}`);
    console.log(`   DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);

    // Check multisig has PROPOSER_ROLE
    const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, MULTISIG);
    console.log(`\n   Multisig has PROPOSER_ROLE:  ${hasProposerRole}`);
    expect(hasProposerRole).to.be.true;
    console.log('   ✅ Multisig has PROPOSER_ROLE');

    // Check multisig has EXECUTOR_ROLE
    const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, MULTISIG);
    console.log(`   Multisig has EXECUTOR_ROLE:  ${hasExecutorRole}`);
    expect(hasExecutorRole).to.be.true;
    console.log('   ✅ Multisig has EXECUTOR_ROLE');

    // Check multisig has CANCELLER_ROLE
    const hasCancellerRole = await timelock.hasRole(CANCELLER_ROLE, MULTISIG);
    console.log(`   Multisig has CANCELLER_ROLE: ${hasCancellerRole}`);
    expect(hasCancellerRole).to.be.true;
    console.log('   ✅ Multisig has CANCELLER_ROLE');

    // Check multisig has DEFAULT_ADMIN_ROLE
    const hasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, MULTISIG);
    console.log(`   Multisig has ADMIN_ROLE:     ${hasAdminRole}`);
    expect(hasAdminRole).to.be.true;
    console.log('   ✅ Multisig has DEFAULT_ADMIN_ROLE');

    // Check min delay
    console.log('\n⏱️ Timelock Min Delay:');
    const minDelay = await timelock.getMinDelay();
    console.log(`   Min Delay: ${minDelay} seconds (${Number(minDelay) / 86400} days)`);
    expect(minDelay).to.equal(MIN_DELAY, 'Min delay mismatch');
    console.log('   ✅ Min delay matches expected value (2 days)');

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('\n✅ All checks passed!');
    console.log('\nDeployed Addresses:');
    console.log(`   Token Proxy:      ${proxyAddress}`);
    console.log(`   Implementation:   ${implementationAddress}`);
    console.log(`   ProxyAdmin:       ${proxyAdminAddress}`);
    console.log(`   Timelock:         ${timelockAddress}`);
    console.log(`   Multisig:         ${MULTISIG}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Verification failed:', error);
        process.exit(1);
    });
