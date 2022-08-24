const { network, ethers, deployments } = require('hardhat')
const { assert, expect } = require('chai')

const INITIAL_TOKEN_AMOUNT = ethers.utils.parseEther('100')

network.config.chainId != 31337
    ? describe.skip
    : describe('DEX Contract Unit Tests', () => {
        let deployer, user
        let dex, thunderToken, cloudToken

        beforeEach(async () => {
            const accounts = await ethers.getSigners()
            deployer = accounts[0]
            user = accounts[1]
            await deployments.fixture(['all'])
            dex = await ethers.getContract('DEX', user)
            thunderToken = await ethers.getContract('ThunderToken', user)
            cloudToken = await ethers.getContract('CloudToken', user)
            const initialBalance = ethers.utils.parseEther('1000')
            await thunderToken.mint(initialBalance)
            await cloudToken.mint(initialBalance)
        })

        describe('createNewPair', () => {
            beforeEach(async () => {
                await thunderToken.approve(dex.address, INITIAL_TOKEN_AMOUNT)
                await cloudToken.approve(dex.address, INITIAL_TOKEN_AMOUNT)
            })

            it('emits an event once pool is deployed', async () => {
                await expect(dex.createNewPair(
                    thunderToken.address,
                    cloudToken.address,
                    INITIAL_TOKEN_AMOUNT,
                    INITIAL_TOKEN_AMOUNT
                )).to.emit(dex, 'PoolCreated')
            })

            it('deploys a new pool contract for the pair with correct data', async () => {
                const txResponse = await dex.createNewPair(
                    thunderToken.address,
                    cloudToken.address,
                    INITIAL_TOKEN_AMOUNT,
                    INITIAL_TOKEN_AMOUNT
                )
                const txReceipt = await txResponse.wait(1)
                const poolAddress = txReceipt.events[5].args.poolAddress
                const tokenOneAmount = txReceipt.events[5].args.initAmountOne
                const tokenTwoAmount = txReceipt.events[5].args.initAmountTwo
                const tokenOneAddress = txReceipt.events[5].args.tokenOne
                const tokenTwoAddress = txReceipt.events[5].args.tokenTwo
                const poolCreator = txReceipt.events[5].args.poolCreator

                assert.notEqual(poolAddress.toString(), ethers.constants.AddressZero.toString())
                assert.equal(tokenOneAmount.toString(), INITIAL_TOKEN_AMOUNT.toString())
                assert.equal(tokenTwoAmount.toString(), INITIAL_TOKEN_AMOUNT.toString())
                assert.equal(tokenOneAddress, thunderToken.address)
                assert.equal(tokenTwoAddress, cloudToken.address)
                assert.equal(poolCreator, user.address)
            })

            it('sends the initial liquidity to the pool contract', async () => {
                const txResponse = await dex.createNewPair(
                    thunderToken.address,
                    cloudToken.address,
                    INITIAL_TOKEN_AMOUNT,
                    INITIAL_TOKEN_AMOUNT
                )
                const txReceipt = await txResponse.wait(1)
                const poolAddress = txReceipt.events[5].args.poolAddress

                assert.equal((await thunderToken.balanceOf(poolAddress)).toString(), INITIAL_TOKEN_AMOUNT)
                assert.equal((await cloudToken.balanceOf(poolAddress)).toString(), INITIAL_TOKEN_AMOUNT)
            })
        })
    })