/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, prefer-destructuring */
/**
 * Deploy Gnosis Safe Multisig on Multiple Networks
 *
 * This script deploys a Gnosis Safe (v1.3.0) multisig wallet to one or more networks.
 * Using the same salt nonce and owners will result in the same Safe address across all networks
 * (deterministic deployment via CREATE2).
 *
 * ==================== USAGE ====================
 *
 * 1. Configure the script (see CONFIGURATION section below):
 *    - Set NETWORKS: array of network names from hardhat.config.ts
 *    - Set OWNERS: array of owner addresses for the Safe
 *    - Set THRESHOLD: number of signatures required to execute transactions
 *    - Set SALT_NONCE: use same value across networks for same address
 *
 * 2. Run the script:
 *    npx hardhat run tools/safeTools/deploySafe/deploySafe.ts
 *
 * ==================== ENVIRONMENT ====================
 *
 * The script looks for credentials in this order:
 *   1. PRIVATE_KEY env var
 *   2. Mnemonic from network config or MNEMONIC env var
 *   3. Private keys array from network config
 *
 * Example:
 *   npx hardhat run tools/safeTools/deploySafe/deploySafe.ts
 *
 * ==================== DETERMINISTIC ADDRESSES ====================
 *
 * To get the same Safe address on multiple networks:
 *   - Use the same OWNERS array (same addresses, same order)
 *   - Use the same THRESHOLD
 *   - Use the same SALT_NONCE
 *   - Deploy from any account (deployer address doesn't affect Safe address)
 *
 * ==================== CONTRACT ADDRESSES ====================
 *
 * The script uses the canonical Gnosis Safe v1.3.0 factory addresses which are
 * deployed at the same address on most EVM chains. If deploying to a chain where
 * these aren't available, you'll need to update the addresses below.
 */
import { ethers, config } from 'hardhat';

// ============== CONFIGURATION ==============
// Safe Proxy Factory (same address on all networks)
const PROXY_FACTORY_ADDRESS = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';

// Safe Singleton (GnosisSafe 1.3.0 - same address on all networks)
const SAFE_SINGLETON_ADDRESS = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552';

// Fallback Handler (CompatibilityFallbackHandler 1.3.0 - optional, set to ZeroAddress if not needed)
const FALLBACK_HANDLER_ADDRESS = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4';

// Safe configuration
const OWNERS = [
    '0x4697a6315371eB737Fb5dbf254ff6A56D79B0e2b',
    '0x62d686E1648DED493926C21ACd4042dc2d5a4487',
    '0xAe15d2023A76174a940cbb2b7F44012C728B9d74',
    '0x2084d9f77828cDE61b0f4e8B97576116cB9265Be'
];

const THRESHOLD = 2; // Number of signatures required

// Salt nonce for deterministic address (same salt = same address on both networks)
const SALT_NONCE = 1;
// ============================================

// ABI for the contracts
const PROXY_FACTORY_ABI = [
    'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) public returns (address proxy)',
    'event ProxyCreation(address proxy, address singleton)',
];

const SAFE_ABI = [
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

async function deploySafe(signer: any): Promise<string> {
    console.log(`Deployer: ${await signer.getAddress()}`);

    // Create contract instances
    const proxyFactory = new ethers.Contract(PROXY_FACTORY_ADDRESS, PROXY_FACTORY_ABI, signer);
    const safeInterface = new ethers.Interface(SAFE_ABI);

    // Encode the setup call (initializer)
    const initializer = safeInterface.encodeFunctionData('setup', [
        OWNERS, // _owners
        THRESHOLD, // _threshold
        ethers.ZeroAddress, // to (no delegate call)
        '0x', // data (no delegate call)
        FALLBACK_HANDLER_ADDRESS, // fallbackHandler
        ethers.ZeroAddress, // paymentToken (ETH)
        0, // payment
        ethers.ZeroAddress, // paymentReceiver
    ]);

    console.log(`Owners: ${OWNERS.join(', ')}`);
    console.log(`Threshold: ${THRESHOLD}`);
    console.log(`Salt nonce: ${SALT_NONCE}`);

    // Deploy the Safe
    console.log('\nSending createProxyWithNonce transaction...');
    const tx = await proxyFactory.createProxyWithNonce(SAFE_SINGLETON_ADDRESS, initializer, SALT_NONCE);

    console.log(`Tx hash: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    // Get the deployed Safe address from the event
    const proxyCreationEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('ProxyCreation(address,address)'),
    );

    let safeAddress: string;
    if (proxyCreationEvent) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'address'], proxyCreationEvent.data);
        safeAddress = decoded[0];
    } else {
        // Fallback: calculate the address
        safeAddress = 'Could not decode from event';
    }

    console.log(`\n✓ Safe deployed at: ${safeAddress}`);
    console.log(`  Block: ${receipt.blockNumber}`);

    return safeAddress;
}

async function main() {
    console.log('='.repeat(60));
    console.log('Deploy Safe');
    console.log('='.repeat(60));

    // Validate configuration
    if (OWNERS.length === 0 || OWNERS.some((o) => o === '0x...')) {
        throw new Error('Please configure OWNERS array with valid addresses');
    }
    if (THRESHOLD < 1 || THRESHOLD > OWNERS.length) {
        throw new Error(`Threshold must be between 1 and ${OWNERS.length}`);
    }

    // Deploy on each network
    const [deployer] = await ethers.getSigners();
    const safeAddress = await deploySafe(deployer);

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('DEPLOYMENT SUMMARY');
    console.log('='.repeat(60));

    console.log(`Deployed Safe at: ${safeAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
