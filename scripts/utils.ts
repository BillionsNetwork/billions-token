import { ethers } from 'hardhat';

/**
 * Check if all params are present in the expectedParams
 * @param {Object} objParams - object with parameters
 * @param {Array} expectedParams - array of expected parameters in string (supports dot notation for nested objects)
 * @param {Boolean} checkAddresses - check if the parameter is a correct address in case has Address string in param name
 */
export function checkParams(objParams, expectedParams, checkAddresses = false) {
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of expectedParams) {
        let value;
        let actualParameterName = parameterName;

        // Support dot notation for nested objects (e.g., 'network.chainID')
        if (parameterName.includes('.')) {
            const keys = parameterName.split('.');
            value = objParams;
            for (const key of keys) {
                value = value?.[key];
                if (value === undefined || value === '') {
                    throw new Error(`Missing parameter: ${parameterName}`);
                }
            }
            // For address checking, use the last part of the dot notation
            actualParameterName = keys[keys.length - 1];
        } else {
            // Backward compatibility: direct parameter access
            value = objParams[parameterName];
            if (value === undefined || value === '') {
                throw new Error(`Missing parameter: ${parameterName}`);
            }
        }

        if (checkAddresses) {
            // Check addresses - support both direct parameter names and nested parameter names
            if (actualParameterName.includes('Address') && !ethers.isAddress(value)) {
                throw new Error(`Invalid parameter address: ${parameterName}`);
            }
        }
    }
}