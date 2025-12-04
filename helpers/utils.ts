import hre, { ethers, run } from 'hardhat';

export async function verifyContract(
    contractAddress: any,
    opts: {
        contract?: string;
        constructorArgsProxy?: any[];
        constructorArgsProxyAdmin?: any[];
        constructorArgsImplementation: any[];
        libraries: any;
    }
): Promise<boolean> {
    if (hre.network.name === 'localhost') {
        return true;
    }
    // When verifying if the proxy contract is not verified yet we need to pass the arguments
    // for the proxy contract first, then for proxy admin and finally for the implementation contract
    if (opts.constructorArgsProxy) {
        try {
            await run('verify:verify', {
                address: contractAddress,
                contract: opts.contract,
                constructorArguments: opts.constructorArgsProxy,
                libraries: opts.libraries,
            });
        } catch (error) {}
    }

    if (opts.constructorArgsProxyAdmin) {
        try {
            await run('verify:verify', {
                address: contractAddress,
                contract: opts.contract,
                constructorArguments: opts.constructorArgsProxyAdmin,
                libraries: opts.libraries,
            });
        } catch (error) {}
    }

    try {
        await run('verify:verify', {
            address: contractAddress,
            contract: opts.contract,
            constructorArguments: opts.constructorArgsImplementation,
            libraries: opts.libraries,
        });
        console.log(`✅ Verification successful for ${contractAddress}\n`);
        return true;
    } catch (error) {
        console.log(`❌ Error verifying ${contractAddress}: ${error}\n`);
    }

    return false;
}

async function isTxHashSignedWithPrefix(txHash: string, signature: string, ownerAddress: string) {
    let hasPrefix;
    try {
        const recoveredAddress = ethers.recoverAddress(txHash, signature);
        hasPrefix = !(
            !!recoveredAddress &&
            !!ownerAddress &&
            recoveredAddress.toLowerCase() === ownerAddress.toLowerCase()
        );
    } catch (e) {
        hasPrefix = true;
    }
    return hasPrefix;
}

async function adjustVInSignature(signature: string, safeTxHash: string, signerAddress: string) {
    const ETHEREUM_V_VALUES = [0, 1, 27, 28];
    const MIN_VALID_V_VALUE_FOR_SAFE_ECDSA = 27;
    let signatureV = parseInt(signature.slice(-2), 16);
    if (!ETHEREUM_V_VALUES.includes(signatureV)) {
        throw new Error('Invalid signature');
    }
    if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
        signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
    }
    const adjustedSignature = signature.slice(0, -2) + signatureV.toString(16);
    const signatureHasPrefix = await isTxHashSignedWithPrefix(safeTxHash, adjustedSignature, signerAddress);
    if (signatureHasPrefix) {
        signatureV += 4;
    }
    signature = signature.slice(0, -2) + signatureV.toString(16);
    return signature;
}

export async function signHash(signer: any, safeTxHash: string): Promise<string> {
    const signedMessage = await signer.signMessage(ethers.getBytes(safeTxHash));
    // Adjust V in signature if needed (required by Safe API)
    const adjustedSignature = await adjustVInSignature(signedMessage, safeTxHash, signer.address);

    return adjustedSignature;
}
