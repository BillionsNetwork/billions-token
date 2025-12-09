// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

/**
 * @title Billions Network Token
 * @dev Upgradeable ERC20 token with Permit using Transparent Proxy pattern
 */
contract BillionsNetworkToken is ERC20PermitUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract
     * @param name Token name
     * @param symbol Token symbol
     * @param initialOwner Initial owner address
     * @param initialSupply Initial token supply
     */
    function initialize(
        string memory name,
        string memory symbol,
        address initialOwner,
        uint256 initialSupply
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Permit_init(name);
        _mint(initialOwner, initialSupply);
    }
}

