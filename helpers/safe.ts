import hre, { ethers } from 'hardhat';
import { defineChain } from 'viem';
import fs from 'fs';
import path from 'path';
import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';
import { signHash } from './utils';

export async function confirmTransaction(transactionIndex: number, transactionsOutputPath: string) {
    // Get signer to sign the transaction hash for the confirmation
    // This allows to configure LEDGER if we need for signing with hardhat plugin
    const [signer] = await ethers.getSigners();

    const network = hre.network.name;
    const safeConfigPath = path.join(__dirname, `../scripts/safe/safe-config-${network}.json`);

    if (!fs.existsSync(safeConfigPath)) {
        throw new Error(`Safe config file not found: ${safeConfigPath}`);
    }
    const safeConfig = JSON.parse(fs.readFileSync(safeConfigPath, 'utf-8'));
    if (!safeConfig.chain) {
        throw new Error(`chain not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.safeAddress) {
        throw new Error(`safeAddress not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.privateKeySender) {
        throw new Error('privateKeySender not set in safe config file');
    }
    const chain = defineChain(safeConfig.chain);

    const protocolKit = await Safe.init({
        provider: chain.rpcUrls.default.http[0],
        signer: safeConfig.privateKeySender,
        safeAddress: safeConfig.safeAddress,
    });

    const safeAddress = await protocolKit.getAddress();
    console.log('Safe Address:', safeAddress);

    // Read transactions from the specified file
    const transactions = JSON.parse(fs.readFileSync(transactionsOutputPath, 'utf8'));
    if (transactionIndex >= transactions.length) {
        throw new Error(`Invalid transaction index: ${transactionIndex}`);
    }

    const tx = transactions[transactionIndex];
    const wallet = new ethers.Wallet(safeConfig.privateKeySender);
    const owner = wallet.address;

    console.log('='.repeat(80));
    console.log(
        `Billions Network Token - Confirming transaction ${transactionIndex + 1}/${transactions.length} "${tx.name}"`
    );
    console.log('='.repeat(80));
    console.log('\nOwner signer:', owner);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(owner)), 'ETH');

    console.log(
        `\nFound ${transactions.length} transactions to propose and confirm.\n[${transactions
            .map((tx: any) => tx.name)
            .join(', ')}]\n`
    );

    const apiKit = new SafeApiKit({
        chainId: BigInt(safeConfig.chain.id),
        apiKey: safeConfig.apiKey,
    });

    let pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        'Pending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );

    console.log('-'.repeat(80));
    console.log(`[${transactionIndex + 1}/${transactions.length}] ${tx.name}`);
    console.log(`   To: ${tx.to}`);

    // Only check if contract is deployed when using the Factory address for deployment
    if (tx.to === '0x4e59b44847b379578588920cA78FbF26c0B4956C') {
        console.log(`   Predicted Address: ${tx.predictedAddress}`);

        // Check if contract is already deployed
        const existingCode = await ethers.provider.getCode(tx.predictedAddress);
        if (existingCode !== '0x') {
            throw new Error('   ⏭️  Already deployed');
        }
    }

    const safeTransactionData: MetaTransactionData = {
        to: tx.to,
        value: tx.value,
        data: tx.data,
        operation: OperationType.Call,
    };

    // Generate the Safe transaction to get safeTxHash
    const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData],
    });

    // Deterministic hash based on transaction parameters
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

    const signedMessage = await signHash(signer, safeTxHash);
    // Send the transaction
    console.log('   📤 Confirming Safe transaction...', safeTxHash);
    await apiKit.confirmTransaction(safeTxHash, signedMessage);

    pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        '\nPending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );
}

export async function executeTransaction(transactionIndex: number, transactionsOutputPath: string) {
    const network = hre.network.name;
    const safeConfigPath = path.join(__dirname, `../scripts/safe/safe-config-${network}.json`);

    if (!fs.existsSync(safeConfigPath)) {
        throw new Error(`Safe config file not found: ${safeConfigPath}`);
    }
    const safeConfig = JSON.parse(fs.readFileSync(safeConfigPath, 'utf-8'));
    if (!safeConfig.chain) {
        throw new Error(`chain not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.safeAddress) {
        throw new Error(`safeAddress not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.privateKeySender) {
        throw new Error('privateKeySender not set in safe config file');
    }
    const chain = defineChain(safeConfig.chain);

    const protocolKit = await Safe.init({
        provider: chain.rpcUrls.default.http[0],
        signer: safeConfig.privateKeySender,
        safeAddress: safeConfig.safeAddress,
    });

    const safeAddress = await protocolKit.getAddress();
    console.log('Safe Address:', safeAddress);

    // Read transactions from the specified file
    const transactions = JSON.parse(fs.readFileSync(transactionsOutputPath, 'utf8'));
    if (transactionIndex >= transactions.length) {
        throw new Error(`Invalid transaction index: ${transactionIndex}`);
    }

    const tx = transactions[transactionIndex];
    const wallet = new ethers.Wallet(safeConfig.privateKeySender);
    const owner = wallet.address;

    console.log('='.repeat(80));
    console.log(
        `Billions Network Token - Executing transaction ${transactionIndex + 1}/${transactions.length} "${tx.name}"`
    );
    console.log('='.repeat(80));
    console.log('\nOwner signer:', owner);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(owner)), 'ETH');

    console.log(
        `\nFound ${transactions.length} transactions to propose and confirm.\n[${transactions
            .map((tx: any) => tx.name)
            .join(', ')}]\n`
    );

    const apiKit = new SafeApiKit({
        chainId: BigInt(safeConfig.chain.id),
        apiKey: safeConfig.apiKey,
    });

    let pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        'Pending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );

    console.log('-'.repeat(80));
    console.log(`[${transactionIndex + 1}/${transactions.length}] ${tx.name}`);
    console.log(`   To: ${tx.to}`);

    // Only check if contract is deployed when using the Factory address for deployment
    if (tx.to === '0x4e59b44847b379578588920cA78FbF26c0B4956C') {
        console.log(`   Predicted Address: ${tx.predictedAddress}`);

        // Check if contract is already deployed
        const existingCode = await ethers.provider.getCode(tx.predictedAddress);
        if (existingCode !== '0x') {
            throw new Error('   ⏭️  Already deployed');
        }
    }

    const safeTransactionData: MetaTransactionData = {
        to: tx.to,
        value: tx.value,
        data: tx.data,
        operation: OperationType.Call,
    };

    // Generate the Safe transaction to get safeTxHash
    const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData],
    });

    // Deterministic hash based on transaction parameters
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);

    const safeTransactionFromService = await apiKit.getTransaction(safeTxHash);
    if (!safeTransactionFromService) {
        throw new Error(`Safe transaction not found in Safe Services: ${safeTxHash}`);
    }

    if (safeTransactionFromService.isExecuted) {
        throw new Error(' ⏭️  Transaction already executed');
    }
    const confirmations = safeTransactionFromService.confirmations
        ? safeTransactionFromService.confirmations.length
        : 0;
    if (safeTransactionFromService.confirmationsRequired > confirmations) {
        throw new Error(
            `Not enough confirmations to execute the transaction. Required: ${safeTransactionFromService.confirmationsRequired}, Current: ${confirmations}`
        );
    }

    // Send the transaction
    console.log('   🚀 Executing Safe transaction...', safeTxHash);
    await protocolKit.executeTransaction(safeTransactionFromService);

    pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        '\nPending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );
}

export async function proposeTransaction(transactionIndex: number, transactionsOutputPath: string) {
    const network = hre.network.name;
    const safeConfigPath = path.join(__dirname, `../scripts/safe/safe-config-${network}.json`);

    if (!fs.existsSync(safeConfigPath)) {
        throw new Error(`Safe config file not found: ${safeConfigPath}`);
    }
    const safeConfig = JSON.parse(fs.readFileSync(safeConfigPath, 'utf-8'));
    if (!safeConfig.chain) {
        throw new Error(`chain not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.safeAddress) {
        throw new Error(`safeAddress not found in safe config file: ${safeConfigPath}`);
    }
    if (!safeConfig.privateKeySender) {
        throw new Error('privateKeySender not set in safe config file');
    }
    const chain = defineChain(safeConfig.chain);

    const protocolKit = await Safe.init({
        provider: chain.rpcUrls.default.http[0],
        signer: safeConfig.privateKeySender,
        safeAddress: safeConfig.safeAddress,
    });

    const safeAddress = await protocolKit.getAddress();
    console.log('Safe Address:', safeAddress);

    // Read transactions from the specified file
    const transactions = JSON.parse(fs.readFileSync(transactionsOutputPath, 'utf8'));
    if (transactionIndex >= transactions.length) {
        throw new Error(`Invalid transaction index: ${transactionIndex}`);
    }

    const tx = transactions[transactionIndex];
    const wallet = new ethers.Wallet(safeConfig.privateKeySender);
    const owner = wallet.address;

    console.log('='.repeat(80));
    console.log(
        `Billions Network Token - Proposing transaction ${transactionIndex + 1}/${transactions.length} "${tx.name}"`
    );
    console.log('='.repeat(80));
    console.log('\nOwner signer:', owner);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(owner)), 'ETH');

    console.log(
        `\nFound ${transactions.length} transactions to propose and confirm.\n[${transactions
            .map((tx: any) => tx.name)
            .join(', ')}]\n`
    );

    const apiKit = new SafeApiKit({
        chainId: BigInt(safeConfig.chain.id),
        apiKey: safeConfig.apiKey,
    });

    let pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        'Pending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );

    console.log('-'.repeat(80));
    console.log(`[${transactionIndex + 1}/${transactions.length}] ${tx.name}`);
    console.log(`   To: ${tx.to}`);

    // Only check if contract is deployed when using the Factory address for deployment
    if (tx.to === '0x4e59b44847b379578588920cA78FbF26c0B4956C') {
        console.log(`   Predicted Address: ${tx.predictedAddress}`);

        // Check if contract is already deployed
        const existingCode = await ethers.provider.getCode(tx.predictedAddress);
        if (existingCode !== '0x') {
            throw new Error('   ⏭️  Already deployed');
        }
    }

    const safeTransactionData: MetaTransactionData = {
        to: tx.to,
        value: tx.value,
        data: tx.data,
        operation: OperationType.Call,
    };

    console.log('   📄 Creating Safe transaction...');

    const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData],
    });

    // Deterministic hash based on transaction parameters
    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    console.log('   🆔 Safe Transaction Hash:', safeTxHash);

    // Sign transaction to verify that the transaction is coming from owner 1
    const senderSignature = await protocolKit.signHash(safeTxHash);

    // Send the transaction
    console.log('   📤 Proposing Safe transaction...', safeTxHash);
    await apiKit.proposeTransaction({
        safeAddress,
        safeTransactionData: safeTransaction.data,
        safeTxHash,
        senderAddress: owner,
        senderSignature: senderSignature.data,
    });

    pendingTransactions = (await apiKit.getPendingTransactions(safeAddress)).results;
    console.log(
        '\nPending transactions in Safe Services for this deployment:',
        pendingTransactions.map((tx) => tx.safeTxHash)
    );
}
