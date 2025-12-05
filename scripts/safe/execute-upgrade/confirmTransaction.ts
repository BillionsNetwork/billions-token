import path from 'path';
import { confirmTransaction } from '../../../helpers/safe';

async function main() {
    const transactionIndex = 0; // Index of the transaction to confirm
    // Read transactions from output-execute-upgrade.json
    const transactionsOutputPath = path.join(__dirname, '../../upgrade/output-execute-upgrade.json');
    await confirmTransaction(transactionIndex, transactionsOutputPath);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    });
