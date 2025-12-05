import { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { TimelockController } from '../../typechain-types';

async function main() {
    const inputPath = path.join(__dirname, '../input.json');
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const MULTISIG = input.MULTISIG;
    const TIMELOCK_PROXY = input.TIMELOCK_PROXY;
    const BILLIONS_TOKEN_PROXY = input.BILLIONS_TOKEN_PROXY;
    const MIN_DELAY = process.env.TIMELOCK_MIN_DELAY ? parseInt(process.env.TIMELOCK_MIN_DELAY) : 2 * 24 * 60 * 60; // Default to 2 days

    if (!ethers.isAddress(MULTISIG)) {
        throw new Error('Invalid MULTISIG address in input.json');
    }
    if (!ethers.isAddress(TIMELOCK_PROXY)) {
        throw new Error('Invalid TIMELOCK_PROXY address in input.json');
    }
    if (!ethers.isAddress(BILLIONS_TOKEN_PROXY)) {
        throw new Error('Invalid BILLIONS_TOKEN_PROXY address in input.json');
    }

    // Factory address (Arachnid's Deterministic Deployment Proxy)
    const FACTORY_ADDRESS = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

    console.log('Starting schedule upgrade generation...');
    console.log('Multisig:', MULTISIG);

    const scheduleTransactions: any[] = [];
    const executeTransactions: any[] = [];

    // --- 1. Mine Implementation (Starts with 001b) ---
    console.log('\n--- 1. Mining Implementation (Starts with 001b) ---');
    const BillionsNetworkToken = await ethers.getContractFactory('BillionsNetworkToken');
    const implCreationCode = (await BillionsNetworkToken.getDeployTransaction()).data;
    const implInitCodeHash = ethers.keccak256(implCreationCode);

    const implResult = await mineSalt(implInitCodeHash, FACTORY_ADDRESS, '0x001b', '');
    console.log(`Found Implementation Salt: ${implResult.salt}`);
    console.log(`Implementation Address: ${implResult.address}`);

    scheduleTransactions.push({
        name: 'Deploy new Implementation',
        to: FACTORY_ADDRESS,
        value: '0',
        data: ethers.concat([implResult.salt, implCreationCode]),
        predictedAddress: implResult.address,
    });

    // --- 2. Call TimelockController schedule ---
    console.log('\n--- 2. Calling TimelockController schedule ---');

    const adminAddress = await upgrades.erc1967.getAdminAddress(BILLIONS_TOKEN_PROXY);
    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
    const proxyAdminAddress = await proxyAdmin.getAddress();

    const initData = "0x"; // No initialization data for upgrade

    // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
    const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
        BILLIONS_TOKEN_PROXY,
        implResult.address,
        initData,
    ]);

    const timelock = (await ethers.getContractAt(
        'TimelockController',
        TIMELOCK_PROXY
    )) as unknown as TimelockController;

    // schedule via timelock
    const encodeScheduleCallData = await timelock.interface.encodeFunctionData('schedule', [
        proxyAdminAddress,
        0,
        upgradeAndCallData,
        ethers.ZeroHash,
        ethers.ZeroHash,
        MIN_DELAY,
    ]);

    scheduleTransactions.push({
        name: 'Schedule upgrade via Timelock',
        to: TIMELOCK_PROXY,
        value: '0',
        data: encodeScheduleCallData,
        predictedAddress: '',
    });

    // Output to file
    const outputPath = path.join(__dirname, 'output-schedule-upgrade.json');
    fs.writeFileSync(outputPath, JSON.stringify(scheduleTransactions, null, 2));
    console.log(`\nSaved ${scheduleTransactions.length} transactions to output-schedule-upgrade.json`);

    // execute execute via timelock
    const encodeExecuteCallData = await timelock.interface.encodeFunctionData('execute', [
        proxyAdminAddress,
        0,
        upgradeAndCallData,
        ethers.ZeroHash,
        ethers.ZeroHash,
    ]);

    executeTransactions.push({
        name: 'Execute upgrade via Timelock',
        to: TIMELOCK_PROXY,
        value: '0',
        data: encodeExecuteCallData,
        predictedAddress: '',
    });

    // Output to file
    const outputPathExecute = path.join(__dirname, 'output-execute-upgrade.json');
    fs.writeFileSync(outputPathExecute, JSON.stringify(executeTransactions, null, 2));
    console.log(`\nSaved ${executeTransactions.length} transactions to output-execute-upgrade.json`);
}

async function mineSalt(
    initCodeHash: string,
    factory: string,
    prefix: string,
    suffix: string
): Promise<{ salt: string; address: string }> {
    let salt = 0n;
    let address = '';
    const prefixLower = prefix.toLowerCase();
    const suffixLower = suffix.toLowerCase();

    const start = Date.now();
    let lastLog = start;

    while (true) {
        const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
        address = ethers.getCreate2Address(factory, saltHex, initCodeHash).toLowerCase();

        if (address.startsWith(prefixLower) && address.endsWith(suffixLower)) {
            // Check if contract is already deployed
            const existingCode = await ethers.provider.getCode(address);
            if (existingCode === '0x') {
                return { salt: saltHex, address: address };
            }
        }

        salt++;

        if (salt % 100000n === 0n) {
            const now = Date.now();
            if (now - lastLog > 5000) {
                console.log(`Mining... Checked ${salt} salts. Current: ${address}`);
                lastLog = now;
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
