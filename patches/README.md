# Issue with Polygon CDK networks
For supporting Polygon CDK networks we execute a patch in postinstall through `package.json` that patches hardhat-ledger plugin
```
"postinstall": "patch-package"
```

## Patch fixes
- `eth_accounts` it's not supported in Polygon CDK RPC or other chains.
- Hardhat ledger plugin doesn't work with Polygon CDK and chains that doesn't support type `EIP-1559` transactions.
