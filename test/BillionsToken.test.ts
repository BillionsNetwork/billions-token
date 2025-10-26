import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { BillionsToken } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('Billions Network Token (BILL)', function () {
    let token: BillionsToken;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const TOKEN_NAME = 'Billions Network Token';
    const TOKEN_SYMBOL = 'BILL';
    const DECIMALS = 18;
    const TOTAL_SUPPLY = ethers.parseUnits('10000000000', DECIMALS); // 10 billion tokens

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy upgradeable token with Transparent Proxy
        const BillionsToken = await ethers.getContractFactory('BillionsToken');
        token = (await upgrades.deployProxy(BillionsToken, [TOKEN_NAME, TOKEN_SYMBOL, owner.address, TOTAL_SUPPLY], {
            initializer: 'initialize',
            kind: 'transparent',
        })) as unknown as BillionsToken;
        await token.waitForDeployment();
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
        it('Should be upgradeable with preserved state', async function () {
            const proxyAddress = await token.getAddress();

            // Perform some actions
            const transferAmount = ethers.parseUnits('500000', DECIMALS);
            await token.transfer(user1.address, transferAmount);

            // Upgrade
            const BillionsTokenV2 = await ethers.getContractFactory('BillionsToken');
            const upgraded = await upgrades.upgradeProxy(proxyAddress, BillionsTokenV2);

            // Verify proxy address unchanged
            expect(await upgraded.getAddress()).to.equal(proxyAddress);

            // Verify state is preserved
            expect(await upgraded.name()).to.equal(TOKEN_NAME);
            expect(await upgraded.symbol()).to.equal(TOKEN_SYMBOL);
            expect(await upgraded.totalSupply()).to.equal(TOTAL_SUPPLY);
            expect(await upgraded.balanceOf(user1.address)).to.equal(transferAmount);
        });
    });
});
