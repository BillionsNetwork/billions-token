import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log('='.repeat(60));
    console.log('Billions Network Token - Deploy from Output');
    console.log('='.repeat(60));
    console.log('\nDeployer:', deployer.address);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');

    // Read transactions from output-deployment.json
    const outputPath = path.join(__dirname, './output-deployment.json');
    const transactions = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    console.log(`\nFound ${transactions.length} transactions to send\n`);

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        console.log('-'.repeat(60));
        console.log(`[${i + 1}/${transactions.length}] ${tx.name}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Predicted Address: ${tx.predictedAddress}`);

        // Check if contract is already deployed
        const existingCode = await ethers.provider.getCode(tx.predictedAddress);
        if (existingCode !== '0x') {
            console.log('   ⏭️  Already deployed, skipping...');
            continue;
        }

        // Send the transaction
        console.log('   📤 Sending transaction...');
        const txResponse = await deployer.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value,
        });

        console.log(`   ⏳ Tx hash: ${txResponse.hash}`);
        const receipt = await txResponse.wait();
        console.log(`   ⛽ Gas used: ${receipt?.gasUsed.toString()}`);

        // Verify the contract was deployed at predicted address
        const deployedCode = await ethers.provider.getCode(tx.predictedAddress);
        if (deployedCode === '0x') {
            console.log('   ❌ Contract NOT deployed at predicted address!');
            throw new Error(`Deployment failed for ${tx.name}`);
        }

        console.log(`   ✅ Deployed at: ${tx.predictedAddress}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('DEPLOYMENT COMPLETE');
    console.log('='.repeat(60));

    for (const tx of transactions) {
        console.log(`\n${tx.name}:`);
        console.log(`   ${tx.predictedAddress}`);
    }

    console.log('\n✅ All contracts deployed successfully!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    });
