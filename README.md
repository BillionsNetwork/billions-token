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
npm run generate
```

This creates `scripts/output.json` with deployment transactions that use CREATE2 for deterministic addresses:

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

## Upgrade Process

All upgrades go through the Timelock (2-day minimum delay):

1. Deploy new implementation contract
2. Propose upgrade transaction via Timelock (call `ProxyAdmin.upgradeAndCall`)
3. Wait 2 days (minimum delay)
4. Execute upgrade transaction

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
