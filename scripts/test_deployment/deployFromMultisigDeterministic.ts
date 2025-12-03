import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const inputPath = path.join(__dirname, 'input.json');
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const MULTISIG = input.MULTISIG;

    if (!ethers.isAddress(MULTISIG)) {
        throw new Error('Invalid MULTISIG address in input.json');
    }

    // Constants
    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18;
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion tokens
    const MIN_DELAY = 2 * 24 * 60 * 60; // 2 days

    // Factory address (Arachnid's Deterministic Deployment Proxy)
    const FACTORY_ADDRESS = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

    console.log('Starting deterministic deployment generation...');
    console.log('Multisig:', MULTISIG);

    const transactions: any[] = [];

    // --- 1. Mine Timelock (Starts with 00ad) ---
    console.log('\n--- 1. Mining Timelock (Starts with 00ad) ---');
    const TimelockController = await ethers.getContractFactory('TimelockController');
    const proposers = [MULTISIG];
    const executors = [MULTISIG];
    const admin = MULTISIG;

    // Get creation code with constructor args
    const timelockDeployTx = await TimelockController.getDeployTransaction(MIN_DELAY, proposers, executors, admin);
    const timelockCreationCode = timelockDeployTx.data;
    const timelockInitCodeHash = ethers.keccak256(timelockCreationCode);

    const timelockResult = mineSalt(timelockInitCodeHash, FACTORY_ADDRESS, '0x00ad', '');
    console.log(`Found Timelock Salt: ${timelockResult.salt}`);
    console.log(`Timelock Address: ${timelockResult.address}`);

    transactions.push({
        name: 'Deploy TimelockController',
        to: FACTORY_ADDRESS,
        value: '0',
        data: ethers.concat([timelockResult.salt, timelockCreationCode]),
        predictedAddress: timelockResult.address,
    });

    // --- 2. Mine Implementation (Starts with 001b) ---
    console.log('\n--- 2. Mining Implementation (Starts with 001b) ---');
    const BillionsNetworkToken = await ethers.getContractFactory('BillionsNetworkToken');
    const implCreationCode = (await BillionsNetworkToken.getDeployTransaction()).data;
    const implInitCodeHash = ethers.keccak256(implCreationCode);

    const implResult = mineSalt(implInitCodeHash, FACTORY_ADDRESS, '0x001b', '');
    console.log(`Found Implementation Salt: ${implResult.salt}`);
    console.log(`Implementation Address: ${implResult.address}`);

    transactions.push({
        name: 'Deploy Implementation',
        to: FACTORY_ADDRESS,
        value: '0',
        data: ethers.concat([implResult.salt, implCreationCode]),
        predictedAddress: implResult.address,
    });

    // --- 3. Mine Proxy (Starts with b111) ---
    console.log('\n--- 3. Mining Proxy (Starts with b111) ---');

    // We need the Proxy creation code with constructor args: (logic, initialOwner, data)
    // logic = implResult.address
    // initialOwner = timelockResult.address
    // data = initialize(NAME, SYMBOL, MULTISIG, SUPPLY)

    const initFragment = BillionsNetworkToken.interface.getFunction('initialize');
    const initData = BillionsNetworkToken.interface.encodeFunctionData(initFragment!, [
        TOKEN_NAME,
        TOKEN_SYMBOL,
        MULTISIG, // Initial owner of the token logic (OwnableUpgradeable)
        TOTAL_SUPPLY,
    ]);

    // We use TransparentUpgradeableProxy
    // Constructor: constructor(address _logic, address initialOwner, bytes memory _data)
    const ProxyArtifact = await ethers.getContractFactory('TransparentUpgradeableProxy');
    const proxyCreationCode = (
        await ProxyArtifact.getDeployTransaction(implResult.address, timelockResult.address, initData)
    ).data;
    const proxyInitCodeHash = ethers.keccak256(proxyCreationCode);

    const proxyResult = mineSalt(proxyInitCodeHash, FACTORY_ADDRESS, '0xb1110', '');
    console.log(`Found Proxy Salt: ${proxyResult.salt}`);
    console.log(`Proxy Address: ${proxyResult.address}`);

    transactions.push({
        name: 'Deploy TransparentUpgradeableProxy',
        to: FACTORY_ADDRESS,
        value: '0',
        data: ethers.concat([proxyResult.salt, proxyCreationCode]),
        predictedAddress: proxyResult.address,
    });

    // Output to file
    const outputPath = path.join(__dirname, 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 2));
    console.log(`\nSaved ${transactions.length} transactions to output.json`);
}

function mineSalt(
    initCodeHash: string,
    factory: string,
    prefix: string,
    suffix: string
): { salt: string; address: string } {
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
            return { salt: saltHex, address: address };
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
