import path from 'path';
import { proposeTransaction } from '../../../helpers/safe';

async function main() {
    const transactionIndex = 0; // Index of the transaction to propose
    // Read transactions from output-execute-upgrade.json
    const transactionsOutputPath = path.join(__dirname, '../../upgrade/output-execute-upgrade.json');
    await proposeTransaction(transactionIndex, transactionsOutputPath);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('\n❌ Deployment failed:', error);
        process.exit(1);
    });
