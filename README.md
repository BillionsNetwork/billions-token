# Billions Network Token (BILL)

Upgradeable ERC20 token with ERC20Permit for gasless approvals.

## Token Details

-   **Symbol**: BILL
-   **Total Supply**: 10,000,000,000 (10 billion)
-   **Decimals**: 18
-   **Pattern**: Transparent Proxy

## Setup

```bash
npm install
cp .env.example .env  # Add your keys
npm run compile
npm test
```

## Deploy

```bash
npm run deploy:sepolia
npm run deploy:mainnet
```

## Upgrade

```bash
PROXY_ADDRESS=0x... npm run upgrade:sepolia
```

## Features

✅ ERC20 Standard  
✅ ERC20Permit (Gasless approvals)  
✅ Upgradeable  
✅ Fixed supply (no mint/burn)
