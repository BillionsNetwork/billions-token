import path from 'path';
import { executeTransaction } from '../../../helpers/safe';

async function main() {
    const transactionIndex = 0; // Index of the transaction to execute
    // Read transactions from output-schedule-upgrade.json
    const transactionsOutputPath = path.join(__dirname, '../../upgrade/output-schedule-upgrade.json');
    await executeTransaction(transactionIndex, transactionsOutputPath);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    });
