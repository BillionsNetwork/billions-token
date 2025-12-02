import hre, { run } from "hardhat";

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
