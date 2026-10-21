# Billions Network Token (BILL)

Upgradeable ERC20 token with ERC20Permit and Timelock-controlled governance.

## Token Details

- **Symbol**: BILL
- **Total Supply**: 10,000,000,000 (10 billion)
- **Decimals**: 18
- **Pattern**: Transparent Proxy
- **Governance**: TimelockController (2-day delay)

## Setup

```bash
npm install
cp .env.example .env  # Add your keys
```

---

## Token Deployment

### 1. Configure Multisig

Update `scripts/deployToken/input.json` with your multisig address:

```json
{
    "MULTISIG": "0xYourMultisigAddress"
}
```

### 2. Generate Deterministic Deployment Transactions

```bash
npm run token:generate
```

This creates `scripts/deployToken/output.json` with deployment transactions that use CREATE2 for deterministic addresses:

- TimelockController: starts with `0x00ad`
- Implementation: starts with `0x001b`
- Proxy: starts with `0xb1110`

### 3. Deploy to Network

```bash
npm run token:deploy:sepolia   # Sepolia testnet
npm run token:deploy:mainnet   # Ethereum mainnet
```

### 4. Verify Contracts

```bash
npm run token:verify:sepolia   # Verify on Sepolia
npm run token:verify:mainnet   # Verify on Mainnet
```

This verifies all contracts on Etherscan and validates deployment parameters.

### What Gets Deployed (Token)

1. **TimelockController** - Governance contract with 2-day delay
2. **BillionsNetworkToken** - Token implementation
3. **TransparentUpgradeableProxy** - Proxy pointing to implementation
4. **ProxyAdmin** - Owned by TimelockController (deployed by proxy constructor)

---

## StakingRewards Deployment

### 1. Configure Staking

Update `scripts/deployStakingRewards/input.json`:

```json
{
    "MULTISIG": "0xYourMultisigAddress",
    "BILLIONS_TOKEN": "0xBillionsTokenAddress",
    "REWARDS_DURATION": 604800,
    "TIMELOCK_MIN_DELAY": 172800
}
```

| Parameter            | Description                                     |
| -------------------- | ----------------------------------------------- |
| `MULTISIG`           | Address that controls the staking contract      |
| `BILLIONS_TOKEN`     | BILL token address (used for staking & rewards) |
| `REWARDS_DURATION`   | Reward period in seconds (default: 7 days)      |
| `TIMELOCK_MIN_DELAY` | Upgrade delay in seconds (default: 2 days)      |

### 2. Deploy to Network

```bash
npm run staking:deploy:sepolia   # Sepolia testnet
npm run staking:deploy:mainnet   # Ethereum mainnet
```

### 3. Verify Contracts

```bash
npm run staking:verify:sepolia   # Verify on Sepolia
npm run staking:verify:mainnet   # Verify on Mainnet
```

### What Gets Deployed (Staking)

1. **TimelockController** - Controls upgrades (2-day delay)
2. **StakingRewards** - Staking implementation
3. **TransparentUpgradeableProxy** - Proxy pointing to implementation
4. **ProxyAdmin** - Owned by TimelockController

### Staking Architecture

```
Multisig
    ├── Owner of StakingRewards (pause, setRewardsDuration, recoverERC20)
    ├── RewardsDistribution (notifyRewardAmount)
    └── Proposer/Executor/Admin of Timelock

TimelockController (2-day delay)
    └── Owner of ProxyAdmin (controls upgrades)
```

### Post-Deployment Steps

1. Transfer reward tokens to the StakingRewards proxy address
2. Call `notifyRewardAmount(amount)` from the Multisig to start the reward period
3. Users can now stake tokens and earn rewards

---

## Upgrade Process

All upgrades go through the Timelock (2-day minimum delay):

1. Deploy new implementation contract
2. Propose upgrade transaction via Timelock (call `ProxyAdmin.upgradeAndCall`)
3. Wait 2 days (minimum delay)
4. Execute upgrade transaction

---

## Features

### Token (BILL)

✅ ERC20 Standard  
✅ ERC20Permit (Gasless approvals)  
✅ Upgradeable (Transparent Proxy)  
✅ Timelock-controlled upgrades  
✅ Fixed supply (no mint/burn)  
✅ Deterministic deployment addresses (CREATE2)

### StakingRewards

✅ Stake tokens to earn rewards  
✅ Time-locked staking (optional lock for users)  
✅ Upgradeable (Transparent Proxy)  
✅ Timelock-controlled upgrades  
✅ Pausable (owner can pause staking)  
✅ ERC20 recovery (owner can recover stuck tokens)

---

## Security

- Upgrades require 2-day timelock
- ProxyAdmin controlled by Timelock
- Multisig controls day-to-day operations
- Reentrancy protection on all mutative functions
- Pausable staking in case of emergency

## Deployments

### Token (BILL)


|     Network      |     Address                                | Bridge |
|:-----------------------:|:------------------------------------------:|:------:|
|       **Ethereum**        | [0xb1110919016846972056ab995054d65560d5f05e](https://etherscan.io/address/0xb1110919016846972056ab995054d65560d5f05e) | — |
|    **Billions Network**    | [0xb060E40C3B053C33D458f7105F95DA52741CAb62](https://explorer.billions.network/address/0xb060E40C3B053C33D458f7105F95DA52741CAb62) | AggLayer |
|    **BNB Smart Chain**    | [0xDf24f8c21Cb404B3031a450D8e049D6E39FC1fA5](https://bscscan.com/address/0xDf24f8c21Cb404B3031a450D8e049D6E39FC1fA5) | LayerZero |
|    **Base**    | [0x42Bdfa05945dB355D59fE0B65124e3636F7fEdB5](https://basescan.org/address/0x42Bdfa05945dB355D59fE0B65124e3636F7fEdB5) | LayerZero |
|    **Polygon**    | [0x0a1ac7A9CD9Af4fCd7321A8a090De580a1C037D6](https://polygonscan.com/address/0x0a1ac7A9CD9Af4fCd7321A8a090De580a1C037D6) | LayerZero |
|    **Arbitrum**    | [0x55b9f84605B30Df9Bb9d817A6900219F25218157](https://arbiscan.io/address/0x55b9f84605B30Df9Bb9d817A6900219F25218157) | LayerZero |
|    **Optimism**    | [0x55b9f84605B30Df9Bb9d817A6900219F25218157](https://optimistic.etherscan.io/address/0x55b9f84605B30Df9Bb9d817A6900219F25218157) | LayerZero |
|    **Mantle**    | [0x55b9f84605B30Df9Bb9d817A6900219F25218157](https://mantlescan.xyz/address/0x55b9f84605B30Df9Bb9d817A6900219F25218157) | LayerZero |


### StakingRewards
|     Network      |     Address                                |
|:-----------------------:|:------------------------------------------:|
|    **Billions Network**    | [0x58201A4826Dc07443d1280bA194604B12A3b8FaB](https://explorer.billions.network/address/0x58201A4826Dc07443d1280bA194604B12A3b8FaB) |


## Security Audits
1. [HALBORN](https://www.halborn.com/audits) has performed a security audit of `BillionsNetworkToken` smart contract and compiled report on Dec 5, 2025: [billions-token-7661d8](https://github.com/BillionsNetwork/billions-token/blob/main/audits/Billions_Token_SSC.pdf).  
2. [HALBORN](https://www.halborn.com/audits) has performed a security audit of `StakingRewards` smart contract and compiled report on Jan 5, 2026: [staking-rewards-0b472f](https://github.com/BillionsNetwork/billions-token/blob/main/audits/Staking_Rewards_SSC_1.pdf).
3. [HALBORN](https://www.halborn.com/audits) has performed a security audit of `StakingRewards` smart contract and compiled report on March 23, 2026: [staking-rewards-2c6ee6](https://github.com/BillionsNetwork/billions-token/blob/main/audits/Staking_Rewards_SSC_2.pdf).
