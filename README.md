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

⚠️ **Before deploying**: Update `INITIAL_OWNER` and `TIMELOCK_ADMIN_ADDRESS` in `scripts/deploy.ts`

```bash
npm run deploy:sepolia
npm run deploy:mainnet
```

### What Gets Deployed

1. **TimelockController** - Governance contract with 2-day delay
2. **BillionsToken** - Token implementation + Transparent Proxy
3. **ProxyAdmin** - Owned by TimelockController (for upgrades)

## Deploy with Safe Multisig

1. Create `scripts/safe/deployment/safe-config-<network>.json` for the configuration of the Safe account filling the number of owners, private keys, etc. for your new Safe Multisig.

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
        "privateKeys": ["privateKey1", "privateKey2"],
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
4. Generate the transactions for the deployment that will be needed to be executed by each owner of the Safe Multisig.
        ```bash
        npm run generate:deployment:sepolia
        ```
        This will generate `output.json` with the transactions to be proposed, confirmed and executed later.
5. Propose first transaction with first owner (by default). The transaction will be confirmed also for this owner.
        ```
        const ownerIndex = 0; // Use the owner from safe-config json to send deployment transactions
        const transactionIndex = 0; // Index of the transaction to propose
        ```
        
        Then execute:
        
        ```bash
        npm run safe:propose:transaction:sepolia
        ```
6. Confirm the first transaction with the other owners to the threshold changing `ownerIndex` each time in `scripts/safe/deployment/confirmTransaction.ts`.
        ```
        const ownerIndex = 1 // for second owner because it starts with 0 for first owner. Third would be 2.
        const transactionIndex = 0; // Index of the transaction to confirm
        ```

        Then execute:
        
        ```bash
        npm run safe:confirm:transaction:sepolia
        ```
7. Once you have confirmed the first transaction with the different owners you can execute the transaction. Check also `ownerIndex` and `transactionIndex` in `scripts/safe/deployment/executeTransaction.ts`.
        ```
        const ownerIndex = 0; // Use the owner from safe-config json to execute deployment transactions
        const transactionIndex = 0; // Index of the transaction to execute
        
        ```

        ```bash
        npm run safe:execute:transaction:sepolia
        ```
8. Once done the process for the first transaction proceed in the same way from the step `5.` but for the second and third transaction for the deployment in order to complete the deployment with the Safe Multisig.


## Upgrade Process

All upgrades go through the Timelock (2-day minimum delay):

1. Propose upgrade transaction via Timelock `schedule`
2. Wait 2 days (minimum delay)
3. Execute upgrade transaction via Timelock `execute`

```bash
# Example upgrade flow (requires Timelock interaction)
TOKEN_PROXY_ADDRESS=0x... npm run upgrade:schedule:sepolia
TOKEN_PROXY_ADDRESS=0x... npm run upgrade:execute:sepolia
```

## Architecture

```
TimelockController (2-day delay)
    └── owns ProxyAdmin
            └── manages Proxy upgrades
                    └── BillionsToken Implementation
```

## Features

✅ ERC20 Standard  
✅ ERC20Permit (Gasless approvals)  
✅ Upgradeable (Transparent Proxy)  
✅ Timelock-controlled upgrades  
✅ Fixed supply (no mint/burn)

## Security

-   Upgrades require 2-day timelock
-   ProxyAdmin controlled by Timelock
-   No emergency pause or admin functions on token
-   All token supply minted at initialization
