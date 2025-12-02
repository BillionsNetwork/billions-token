import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { BillionsNetworkToken, TimelockController } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('Billions Network Token (BILL)', function () {
    let token: BillionsNetworkToken;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let timelock: TimelockController;

    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18;
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion tokens
    // Timelock Parameters
    const MIN_DELAY = 2 * 24 * 60 * 60; // 172_800 seconds = 2 days

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy upgradeable token with Transparent Proxy
        const BillionsNetworkToken = await ethers.getContractFactory('BillionsNetworkToken');
        token = (await upgrades.deployProxy(
            BillionsNetworkToken,
            [TOKEN_NAME, TOKEN_SYMBOL, owner.address, TOTAL_SUPPLY],
            {
                initializer: 'initialize',
                kind: 'transparent',
            }
        )) as unknown as BillionsNetworkToken;
        await token.waitForDeployment();

        const tokenAddress = await token.getAddress();
        const adminAddress = await upgrades.erc1967.getAdminAddress(tokenAddress);

        const TimelockController = await ethers.getContractFactory('TimelockController');

        const proposers = [user1.address]; // Addresses that can propose upgrades
        const executors = [user2.address]; // Addresses that can execute upgrades
        const admin = owner.address; // Admin address (can grant/revoke roles)

        timelock = (await TimelockController.deploy(
            MIN_DELAY,
            proposers,
            executors,
            admin
        )) as unknown as TimelockController;
        await timelock.waitForDeployment();

        const timelockAddress = await timelock.getAddress();

        // Transfer ProxyAdmin ownership to Timelock
        const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
        const transferTx = await proxyAdmin.transferOwnership(timelockAddress);
        await transferTx.wait();
    });

    describe('Deployment', function () {
        it('Should deploy with transparent proxy', async function () {
            const proxyAddress = await token.getAddress();
            const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

            expect(implementationAddress).to.not.equal(ethers.ZeroAddress);
            expect(adminAddress).to.not.equal(ethers.ZeroAddress);
        });

        it('Should set the correct name and symbol', async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it('Should have 18 decimals', async function () {
            expect(await token.decimals()).to.equal(DECIMALS);
        });

        it('Should mint total supply to initial owner', async function () {
            const ownerBalance = await token.balanceOf(owner.address);
            expect(ownerBalance).to.equal(TOTAL_SUPPLY);
        });

        it('Should set the correct total supply (10 billion)', async function () {
            const totalSupply = await token.totalSupply();
            expect(totalSupply).to.equal(TOTAL_SUPPLY);
            expect(ethers.formatUnits(totalSupply, DECIMALS)).to.equal('10000000000.0');
        });
    });

    describe('Transfers', function () {
        it('Should transfer tokens between accounts', async function () {
            const transferAmount = ethers.parseUnits('1000', DECIMALS);

            await token.transfer(user1.address, transferAmount);
            expect(await token.balanceOf(user1.address)).to.equal(transferAmount);

            await token.connect(user1).transfer(user2.address, transferAmount);
            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
            expect(await token.balanceOf(user1.address)).to.equal(0);
        });

        it('Should fail if sender does not have enough tokens', async function () {
            await expect(token.connect(user1).transfer(owner.address, 1)).to.be.reverted;
        });

        it('Should update balances after transfers', async function () {
            const initialOwnerBalance = await token.balanceOf(owner.address);
            const amount1 = ethers.parseUnits('100000', DECIMALS);
            const amount2 = ethers.parseUnits('50000', DECIMALS);

            await token.transfer(user1.address, amount1);
            await token.transfer(user2.address, amount2);

            const finalOwnerBalance = await token.balanceOf(owner.address);
            expect(finalOwnerBalance).to.equal(initialOwnerBalance - amount1 - amount2);

            expect(await token.balanceOf(user1.address)).to.equal(amount1);
            expect(await token.balanceOf(user2.address)).to.equal(amount2);
        });
    });

    describe('ERC20Permit (Gasless Approvals)', function () {
        it('Should support ERC20Permit interface', async function () {
            // Check that permit function exists
            expect(token.permit).to.exist;
        });

        it('Should allow gasless approval via permit', async function () {
            const tokenAddress = await token.getAddress();
            const value = ethers.parseUnits('1000', DECIMALS);
            const nonce = await token.nonces(owner.address);
            const deadline = ethers.MaxUint256;

            const domain = {
                name: TOKEN_NAME,
                version: '1',
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: tokenAddress,
            };

            const types = {
                Permit: [
                    { name: 'owner', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
            };

            const message = {
                owner: owner.address,
                spender: user1.address,
                value: value,
                nonce: nonce,
                deadline: deadline,
            };

            const signature = await owner.signTypedData(domain, types, message);
            const sig = ethers.Signature.from(signature);

            // Execute permit
            await token.permit(owner.address, user1.address, value, deadline, sig.v, sig.r, sig.s);

            // Check allowance was set
            expect(await token.allowance(owner.address, user1.address)).to.equal(value);
        });

        it('Should increment nonce after permit', async function () {
            const tokenAddress = await token.getAddress();
            const value = ethers.parseUnits('1000', DECIMALS);
            const nonceBefore = await token.nonces(owner.address);
            const deadline = ethers.MaxUint256;

            const domain = {
                name: TOKEN_NAME,
                version: '1',
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: tokenAddress,
            };

            const types = {
                Permit: [
                    { name: 'owner', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
            };

            const message = {
                owner: owner.address,
                spender: user1.address,
                value: value,
                nonce: nonceBefore,
                deadline: deadline,
            };

            const signature = await owner.signTypedData(domain, types, message);
            const sig = ethers.Signature.from(signature);

            await token.permit(owner.address, user1.address, value, deadline, sig.v, sig.r, sig.s);

            const nonceAfter = await token.nonces(owner.address);
            expect(nonceAfter).to.equal(nonceBefore + 1n);
        });

        it('Should fail with expired deadline', async function () {
            const tokenAddress = await token.getAddress();
            const value = ethers.parseUnits('1000', DECIMALS);
            const nonce = await token.nonces(owner.address);
            const deadline = 1; // Expired deadline

            const domain = {
                name: TOKEN_NAME,
                version: '1',
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: tokenAddress,
            };

            const types = {
                Permit: [
                    { name: 'owner', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
            };

            const message = {
                owner: owner.address,
                spender: user1.address,
                value: value,
                nonce: nonce,
                deadline: deadline,
            };

            const signature = await owner.signTypedData(domain, types, message);
            const sig = ethers.Signature.from(signature);

            await expect(
                token.permit(owner.address, user1.address, value, deadline, sig.v, sig.r, sig.s)
            ).to.be.revertedWithCustomError(token, 'ERC2612ExpiredSignature');
        });
    });

    describe('Upgradability', function () {
        it('Should be upgradeable via TimelockController with preserved state', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Perform some actions
            const transferAmount = ethers.parseUnits('500000', DECIMALS);
            await token.transfer(user1.address, transferAmount);

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by the proposer
            const proposeTx = await timelock
                .connect(user1)
                .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY);
            await proposeTx.wait();

            // Increase time to surpass minimum delay
            await ethers.provider.send('evm_increaseTime', [MIN_DELAY + 1]);
            await ethers.provider.send('evm_mine', []);

            // Execute the upgrade via timelock by the executor
            const executeTx = await timelock
                .connect(user2)
                .execute(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash);
            await executeTx.wait();

            // Get upgraded contract instance
            const upgraded = (await ethers.getContractAt(
                'BillionsNetworkToken',
                proxyAddress
            )) as unknown as BillionsNetworkToken;

            // Verify proxy address unchanged
            expect(await upgraded.getAddress()).to.equal(proxyAddress);

            // Verify state is preserved
            expect(await upgraded.name()).to.equal(TOKEN_NAME);
            expect(await upgraded.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await upgraded.totalSupply()).to.equal(TOTAL_SUPPLY);
            expect(await upgraded.balanceOf(user1.address)).to.equal(transferAmount);
        });

        it('Should fail if TimelockController proposer is invalid', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by invalid proposer
            await expect(
                timelock
                    .connect(user2)
                    .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY)
            ).to.be.revertedWithCustomError(timelock, 'AccessControlUnauthorizedAccount');
        });

        it('Should fail if TimelockController executor is invalid', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by the proposer
            const proposeTx = await timelock
                .connect(user1)
                .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY);
            await proposeTx.wait();

            // Increase time to surpass minimum delay
            await ethers.provider.send('evm_increaseTime', [MIN_DELAY + 1]);
            await ethers.provider.send('evm_mine', []);

            // Execute the upgrade via timelock by the executor
            await expect(
                timelock
                    .connect(user1)
                    .execute(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash)
            ).to.be.revertedWithCustomError(timelock, 'AccessControlUnauthorizedAccount');
        });

        it('Should fail if proposed schedule is less than TimelockController minimum delay', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by the proposer
            await expect(
                timelock
                    .connect(user1)
                    .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY - 1)
            ).to.be.revertedWithCustomError(timelock, 'TimelockInsufficientDelay');
        });

        it('Should fail if execution happens before TimelockController delay scheduled', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by the proposer
            const proposeTx = await timelock
                .connect(user1)
                .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY);
            await proposeTx.wait();

            // Execute the upgrade via timelock by the executor
            await expect(
                timelock
                    .connect(user2)
                    .execute(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash)
            ).to.be.revertedWithCustomError(timelock, 'TimelockUnexpectedOperationState');
        });

        it('Should fail if scheduled data transaction TimelockController differs from executed data transaction', async function () {
            const proxyAddress = await token.getAddress();
            const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
            const proxyAdmin = await ethers.getContractAt('ProxyAdmin', adminAddress);
            const proxyAdminAddress = await proxyAdmin.getAddress();

            // Perform some actions
            const transferAmount = ethers.parseUnits('500000', DECIMALS);
            await token.transfer(user1.address, transferAmount);

            // Propose and execute upgrade via Timelock

            // Deploy new implementation
            const BillionsNetworkTokenV2 = await ethers.getContractFactory('BillionsNetworkToken');
            const newImplementation = await BillionsNetworkTokenV2.deploy();
            await newImplementation.waitForDeployment();
            const newImplementationAddress = await newImplementation.getAddress();

            // As we are working with same proxy the storage is already initialized
            const initializeData = '0x';

            // Encode upgradeAndCall transaction for the token ProxyAdmin to be executed by Timelock
            const upgradeAndCallData = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementationAddress,
                initializeData,
            ]);

            // propose and execute via timelock by the proposer
            const proposeTx = await timelock
                .connect(user1)
                .schedule(proxyAdminAddress, 0, upgradeAndCallData, ethers.ZeroHash, ethers.ZeroHash, MIN_DELAY);
            await proposeTx.wait();

            // Increase time to surpass minimum delay
            await ethers.provider.send('evm_increaseTime', [MIN_DELAY + 1]);
            await ethers.provider.send('evm_mine', []);

            // Deploy another new implementation to create different upgrade data for execution
            const newImplementation2 = await BillionsNetworkTokenV2.deploy();
            await newImplementation2.waitForDeployment();
            const newImplementation2Address = await newImplementation2.getAddress();

            const upgradeAndCallData2 = proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
                proxyAddress,
                newImplementation2Address,
                initializeData,
            ]);

            // Execute the upgrade via timelock by the executor
            await expect(
                timelock
                    .connect(user2)
                    .execute(proxyAdminAddress, 0, upgradeAndCallData2, ethers.ZeroHash, ethers.ZeroHash)
            ).to.be.revertedWithCustomError(timelock, 'TimelockUnexpectedOperationState');
        });
    });
});
