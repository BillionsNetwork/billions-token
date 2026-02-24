import type { HardhatUserConfig } from 'hardhat/config';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ledger';
import 'dotenv/config';

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined;
const MNEMONIC = process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : undefined;
const LEDGER_ACCOUNT = process.env.LEDGER_ACCOUNT ? [process.env.LEDGER_ACCOUNT] : undefined;

const accounts = LEDGER_ACCOUNT ? { ledgerAccounts: LEDGER_ACCOUNT } : { accounts: PRIVATE_KEY || MNEMONIC };

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.30',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            evmVersion: 'shanghai',
        },
    },
    networks: {
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            ...accounts,
            chainId: 11155111,
        },
        mainnet: {
            url: process.env.MAINNET_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            ...accounts,
            chainId: 1,
        },
        'billions-testnet': {
            url: `${process.env.BILLIONS_TESTNET_RPC_URL}`,
            ...accounts,
            chainId: 6913,
        },
        'billions-mainnet': {
            url: `${process.env.BILLIONS_MAINNET_RPC_URL}`,
            ...accounts,
            chainId: 45056,
        },
        // hardhat: {
        //     chainId: 6913,
        //     forking: {
        //         url: `${process.env.BILLIONS_TESTNET_RPC_URL}`,
        //     },
        //     chains: {
        //         6913: {
        //             hardforkHistory: {
        //                 london: 100000,
        //             },
        //         },
        //     },
        //     accounts: [
        //         {
        //             privateKey: process.env.PRIVATE_KEY as string,
        //             balance: '1000000000000000000000000',
        //         },
        //     ],
        // },
        localhost: {
            url: 'http://127.0.0.1:8545',
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_API_KEY || '',
            sepolia: process.env.ETHERSCAN_API_KEY || '',
            'billions-testnet': 'test',
            'billions-mainnet': 'main',
        },
        customChains: [
            {
                network: 'billions-testnet',
                chainId: 6913,
                urls: {
                    apiURL: 'https://explorer-testnet.billions.network/api/',
                    browserURL: 'https://explorer-testnet.billions.network',
                },
            },
            {
                network: 'billions-mainnet',
                chainId: 45056,
                urls: {
                    apiURL: 'https://explorer.billions.network/api/',
                    browserURL: 'https://explorer.billions.network',
                },
            },
        ],
    },
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
};

export default config;
