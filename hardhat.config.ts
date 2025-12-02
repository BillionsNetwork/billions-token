import type { HardhatUserConfig } from 'hardhat/config';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ledger';
import 'dotenv/config';
import { HttpNetworkUserConfig } from 'hardhat/types';

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined;
const MNEMONIC = process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : undefined;
const LEDGER_ACCOUNT = process.env.LEDGER_ACCOUNT ? [process.env.LEDGER_ACCOUNT] : undefined;

const sharedNetworkConfig: HttpNetworkUserConfig = {};
if (LEDGER_ACCOUNT) {
    sharedNetworkConfig.ledgerAccounts = LEDGER_ACCOUNT;
} else {
    sharedNetworkConfig.accounts = PRIVATE_KEY || MNEMONIC;
}

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.30',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        sepolia: {
            ...sharedNetworkConfig,
            url: process.env.ETHEREUM_SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            chainId: 11155111,
        },
        mainnet: {
            ...sharedNetworkConfig,
            url: process.env.ETHEREUM_MAINNET_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            chainId: 1,
        },
        // hardhat: {
        //   chainId: 11155111,
        //   forking: {
        //     url: `${process.env.ETHEREUM_SEPOLIA_RPC_URL}`,
        //   },
        //   chains: {
        //     11155111: {
        //       hardforkHistory: {
        //         london: 100000,
        //       },
        //     },
        //   },
        //   accounts: [
        //     {
        //       privateKey: process.env.PRIVATE_KEY as string,
        //       balance: "1000000000000000000000000",
        //     },
        //   ],
        // },
        localhost: {
            url: 'http://127.0.0.1:8545',
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
};

export default config;
