import Safe, { PredictedSafeProps, SafeAccountConfig, SafeDeploymentConfig } from '@safe-global/protocol-kit';
import { defineChain } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';
import fs from 'fs';
import path from 'path';
import hre, { ethers } from 'hardhat';

async function main() {
    const network = hre.network.name;
    const safeConfigPath = path.join(__dirname, `./safe-config-${network}.json`);

    if (!fs.existsSync(safeConfigPath)) {
        throw new Error(`Safe config file not found: ${safeConfigPath}`);
    }
    const safeConfig = JSON.parse(fs.readFileSync(safeConfigPath, 'utf-8'));
    if (!safeConfig.chain) {
        throw new Error(`chain not found in safe config file: ${safeConfigPath}`);
    }
    const chain = defineChain(safeConfig.chain);

    const safeAccountConfig: SafeAccountConfig = {
        owners: safeConfig.owners,
        threshold: Number(safeConfig.threshold),
        // More optional properties
        to: ethers.ZeroAddress,
        data: '0x',
        fallbackHandler:
            safeConfig.contractNetworks?.[chain.id.toString()]?.fallbackHandlerAddress || ethers.ZeroAddress,
        paymentToken: ethers.ZeroAddress,
        payment: 0,
        paymentReceiver: ethers.ZeroAddress,
    };

    const safeDeploymentConfig: SafeDeploymentConfig = {
        saltNonce: '0',
        safeVersion: '1.3.0',
        deploymentType: 'canonical',
    };

    const predictedSafe: PredictedSafeProps = {
        safeAccountConfig,
        safeDeploymentConfig
    };

    const protocolKit = await Safe.init({
        provider: chain.rpcUrls.default.http[0],
        signer: safeConfig.privateKeySender,
        predictedSafe,
        contractNetworks: safeConfig.contractNetworks,
    });

    const safeAddress = await protocolKit.getAddress();
    console.log('Predicted Safe Address:', safeAddress);

    const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

    const client = await protocolKit.getSafeProvider().getExternalSigner();

    if (!client) {
        throw new Error('No external signer available');
    }

    const transactionHash = await client.sendTransaction({
        to: deploymentTransaction.to as `0x${string}`,
        value: BigInt(deploymentTransaction.value),
        data: deploymentTransaction.data as `0x${string}`,
        chain: chain as any,
    });

    await waitForTransactionReceipt(client, { hash: transactionHash });

    console.log(`Transaction mined: ${transactionHash}`);
    console.log('Safe deployed successfully!');

    const newProtocolKit = await protocolKit.connect({
        safeAddress,
    });

    const isSafeDeployed = await newProtocolKit.isSafeDeployed(); // True
    const safeAddressDeployed = await newProtocolKit.getAddress();
    const safeOwners = await newProtocolKit.getOwners();
    const safeThreshold = await newProtocolKit.getThreshold();
    console.log('Is Safe Deployed:', isSafeDeployed);
    console.log('Safe Address:', safeAddressDeployed);
    console.log('Safe Owners:', safeOwners);
    console.log('Safe Threshold:', safeThreshold);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
