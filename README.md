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
