import type { HardhatUserConfig } from 'hardhat/config';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : undefined;
const MNEMONIC = process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : undefined;

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.30',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            evmVersion: 'cancun',
        },
    },
    networks: {
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts: PRIVATE_KEY || MNEMONIC,
            chainId: 11155111,
        },
        mainnet: {
            url: process.env.MAINNET_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts: PRIVATE_KEY || MNEMONIC,
            chainId: 1,
        },
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
