# Billions Network Token (BILL)

Upgradeable ERC20 token with ERC20Permit and Timelock-controlled governance.

## Token Details

-   **Symbol**: BILL
-   **Total Supply**: 10,000,000,000 (10 billion)
-   **Decimals**: 18
-   **Pattern**: Transparent Proxy
-   **Governance**: TimelockController (2-day delay)

## Setup

```bash
npm install
cp .env.example .env  # Add your keys
```

## Deploy

### 1. Configure Multisig

Update `scripts/input.json` with your multisig address:

```json
{
    "MULTISIG": "0xYourMultisigAddress"
}
```

### 2. Generate Deterministic Deployment Transactions

```bash
npm run generate:deployment:sepolia
npm run generate:deployment:mainnet
```

This creates `scripts/deployment/output-deployment.json` with deployment transactions that use CREATE2 for deterministic addresses:

-   TimelockController: starts with `0x00ad`
-   Implementation: starts with `0x001b`
-   Proxy: starts with `0xb1110`

### 3. Deploy to Network

```bash
npm run deploy:sepolia   # Sepolia testnet
npm run deploy:mainnet   # Ethereum mainnet
```

### 4. Verify Contracts

```bash
npm run verify:sepolia   # Verify on Sepolia
npm run verify:mainnet   # Verify on Mainnet
```

This verifies all contracts on Etherscan and validates deployment parameters.

### What Gets Deployed

1. **TimelockController** - Governance contract with 2-day delay
2. **BillionsNetworkToken** - Token implementation
3. **TransparentUpgradeableProxy** - Proxy pointing to implementation
4. **ProxyAdmin** - Owned by TimelockController (deployed by proxy constructor)

## Deploy with Safe Multisig

1. Create `scripts/safe/safe-config-<network>.json` for the configuration of the Safe account filling the owners, threshold, private key for the sender of the tx, etc. for your new Safe Multisig.

        Example for Ethereum Sepolia:
        ```
        {
        "chain": {
                "id": 11155111,
                "rpcUrls": {
                "default": {
                        "http": ["https://eth-sepolia.g.alchemy.com/v2/<your_apiKey>"]
                }
                }
        },
        "owners": ["ethAddress1", "ethAddress2"],
        "privateKeySender": "privateKeySender",
        "threshold": 2,
        "apiKey": "your_safe_api_key",
        "safeAddress": ""
        }
        ```

        To get Safe API Key you can get information [here](https://docs.safe.global/core-api/how-to-use-api-keys)

2. Deploy new Safe. Signer will be first owner by default (safeConfig.privateKeys[0] in `scripts/safe/deploySafe.ts`)
        ```bash
        npm run safe:deploy:sepolia
        ```
3. Copy the safe address deployed to the `safeAddress` parameter of your `safe-config-<network>.json`
4. Configure `input.json` with `MULTISIG` value properly. Be sure the address is a checksum address.
5. Generate the transactions for the deployment that will be needed to be executed by each owner of the Safe Multisig.
        ```bash
        npm run generate:deployment:sepolia
        ```
        This will generate `output-deployment.json` with the transactions to be proposed, confirmed and executed later.
6. Propose first transaction for the owner configured in your `hardhat.config.ts` (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) with `scripts/safe/deployment/proposeTransaction.ts`. The transaction will be confirmed also for this owner.
        ```
        const transactionIndex = 0; // Index of the transaction to propose
        ```
        
        Then execute:
        
        ```bash
        npm run safe:propose:deployment:transaction:sepolia
        ```
7. Confirm the first transaction with the other owners needed for the threshold (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) checking `transactionIndex` in `scripts/safe/deployment/confirmTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to confirm
        ```

        Then execute:
        
        ```bash
        npm run safe:confirm:deployment:transaction:sepolia
        ```
8. Once you have confirmed the first transaction with the different owners you can execute the transaction. Check `transactionIndex` in `scripts/safe/deployment/executeTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to execute
        
        ```

        ```bash
        npm run safe:execute:deployment:transaction:sepolia
        ```
9. Once done the process for the first transaction proceed in the same way from the step `6.` but for the second (transactionIndex = 1) and third transaction (transactionIndex = 2) for the deployment in order to complete the deployment with the Safe Multisig.
10. Verify the upgrade
        ```bash
        npm run verify:deployment:sepolia
        ```

## Upgrade Process

All upgrades go through the Timelock (2-day minimum delay):

1. Deploy new implementation contract
2. Propose upgrade transaction via Timelock (call `ProxyAdmin.upgradeAndCall`)
3. Wait 2 days (minimum delay)
4. Execute upgrade transaction

## Upgrade with Safe Multisig

1. Having `scripts/safe/safe-config-<network>.json` and `input.json` from deployment, fill `TIMELOCK_PROXY` and `BILLIONS_TOKEN_PROXY` with checksum address in `input.json` and follow next steps.
2. Generate the transactions for the upgrade that will be needed to be executed by each owner of the Safe Multisig.
        ```bash
        npm run generate:upgrade:sepolia
        ```
        This will generate `output-schedule-upgrade.json` and `output-execute-upgrade.json` with the transactions to be proposed, confirmed and executed later.
3. Propose first transaction for the owner configured in your `hardhat.config.ts` (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) with `scripts/safe/schedule-upgrade/proposeTransaction.ts`. The transaction will be confirmed also for this owner.
        ```
        const transactionIndex = 0; // Index of the transaction to propose
        ```
        
        Then execute:
        
        ```bash
        npm run safe:propose:schedule:upgrade:transaction:sepolia
        ```
4. Confirm the first transaction with the other owners needed for the threshold (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) checking `transactionIndex` in `scripts/safe/schedule-upgrade/confirmTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to confirm
        ```

        Then execute:
        
        ```bash
        npm run safe:confirm:schedule:upgrade:transaction:sepolia
        ```
5. Once you have confirmed the first transaction with the different owners you can execute the transaction. Check `transactionIndex` in `scripts/safe/schedule-upgrade/executeTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to execute
        
        ```

        ```bash
        npm run safe:execute:schedule:upgrade:transaction:sepolia
        ```
6. Once done the process for the first transaction proceed in the same way from the step `3.` but for the second (transactionIndex = 1) for the schedule-upgrade in order to complete the schedule-upgrade with the Safe Multisig.
7. Wait 2 days (minimum delay) for the execution of the upgrade.
8. Propose first transaction for the owner configured in your `hardhat.config.ts` (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) with `scripts/safe/execute-upgrade/proposeTransaction.ts`. The transaction will be confirmed also for this owner.
        ```
        const transactionIndex = 0; // Index of the transaction to propose
        ```
        
        Then execute:
        
        ```bash
        npm run safe:propose:execute:upgrade:transaction:sepolia
        ```
9. Confirm the first transaction with the other owners needed for the threshold (change `PRIVATE_KEY` or `LEDGER_ACCOUNT` from your `.env` for each owner) checking `transactionIndex` in `scripts/safe/execute-upgrade/confirmTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to confirm
        ```

        Then execute:
        
        ```bash
        npm run safe:confirm:execute:upgrade:transaction:sepolia
        ```
10. Once you have confirmed the first transaction with the different owners you can execute the transaction. Check `transactionIndex` in `scripts/safe/execute-upgrade/executeTransaction.ts`.
        ```
        const transactionIndex = 0; // Index of the transaction to execute
        
        ```

        ```bash
        npm run safe:execute:execute:upgradetransaction:sepolia
        ```
11. Verify the upgrade
        ```bash
        npm run verify:upgrade:sepolia
        ```

## Architecture

```
TimelockController (2-day delay)
    └── owns ProxyAdmin
            └── manages Proxy upgrades
                    └── BillionsNetworkToken Implementation
```

## Features

✅ ERC20 Standard  
✅ ERC20Permit (Gasless approvals)  
✅ Upgradeable (Transparent Proxy)  
✅ Timelock-controlled upgrades  
✅ Fixed supply (no mint/burn)  
✅ Deterministic deployment addresses (CREATE2)

## Security

-   Upgrades require 2-day timelock
-   ProxyAdmin controlled by Timelock
-   No emergency pause or admin functions on token
-   All token supply minted at initialization

## Ethereum Mainnet Deployment
The deployment in Ethereum Mainnet was done with the Safe Multisig `0xa31c18d0e9EBab1cB4d4B96193DCb44058F4bb75`.
|     Smart contract      |     Address                                |
|:-----------------------:|:------------------------------------------:|
|    **TimelockController**        | [0x00ad9eb03caf7c5e616ed843d46294e1932cc8ca](https://etherscan.io/address/0x00ad9eb03caf7c5e616ed843d46294e1932cc8ca) |
|    **BillionsNetworkToken (proxy)**    | [0xb1110919016846972056ab995054d65560d5f05e](https://etherscan.io/address/0xb1110919016846972056ab995054d65560d5f05e) |

