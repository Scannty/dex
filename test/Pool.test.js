const { network, ethers, deployments } = require('hardhat')
const { assert, expect } = require('chai')

const INITIAL_ACCOUNT_BALANCE = ethers.utils.parseEther('1000')
const INITIAL_TOKEN_AMOUNT = ethers.utils.parseEther('100')
const LIQUIDITY_ADDITION = ethers.utils.parseEther('1')
const POOL_FEE_PERCENTAGE = 3

network.config.chainId != 31337
    ? describe.skip
    : describe('Pool Contract Unit Tests', () => {
        let deployer, user, user_two
        let dex, pool, thunderToken, cloudToken, liqToken

        beforeEach(async () => {
            const accounts = await ethers.getSigners()
            deployer = accounts[0]
            user = accounts[1]
            user_two = accounts[2]
            await deployments.fixture(['all'])
            dex = await ethers.getContract('DEX', user)
            thunderToken = await ethers.getContract('ThunderToken', user)
            cloudToken = await ethers.getContract('CloudToken', user)
            await thunderToken.mint(INITIAL_ACCOUNT_BALANCE)
            await cloudToken.mint(INITIAL_ACCOUNT_BALANCE)
            await thunderToken.connect(user_two).mint(INITIAL_ACCOUNT_BALANCE)
            await cloudToken.connect(user_two).mint(INITIAL_ACCOUNT_BALANCE)
            await thunderToken.approve(dex.address, INITIAL_TOKEN_AMOUNT)
            await cloudToken.approve(dex.address, INITIAL_TOKEN_AMOUNT)
            const txResponse = await dex.createNewPair(
                thunderToken.address,
                cloudToken.address,
                INITIAL_TOKEN_AMOUNT,
                INITIAL_TOKEN_AMOUNT
            )
            const txReceipt = await txResponse.wait(1)
            const poolAddress = txReceipt.events[5].args.poolAddress
            pool = await ethers.getContractAt('Pool', poolAddress, user)
            const liqTokenAddress = await pool.getLiquidityTokenAddress()
            liqToken = await ethers.getContractAt('LiquidityToken', liqTokenAddress, user)
        })

        describe('constructor', () => {
            it('initializes variables correctly', async () => {
                const poolCreator = await pool.getPoolCreator()
                const thunderTokenAddress = await pool.getTokenOneAddress()
                const cloudTokenAddress = await pool.getTokenTwoAddress()
                const liqTokenAddress = await pool.getLiquidityTokenAddress()

                assert.equal(poolCreator, user.address)
                assert.equal(thunderTokenAddress, thunderToken.address)
                assert.equal(cloudTokenAddress, cloudToken.address)
                assert.notEqual(liqTokenAddress, ethers.constants.AddressZero)
            })

            it('mints a correct amount of liquidity tokens to the pool creator', async () => {
                assert.equal(
                    (await liqToken.balanceOf(user.address)).toString(),
                    INITIAL_TOKEN_AMOUNT.toString()
                )
            })
        })

        describe('checkLiquidityProportion', () => {
            it('returns the same amounts if the token proportions are correct', async () => {
                const [amountOne, amountTwo] = await pool.checkLiquidityProportion(INITIAL_TOKEN_AMOUNT, INITIAL_TOKEN_AMOUNT)
                assert.equal(amountOne.toString(), INITIAL_TOKEN_AMOUNT.toString())
                assert.equal(amountTwo.toString(), INITIAL_TOKEN_AMOUNT.toString())
            })

            it('adjusts the amounts correctly if the input proportion of tokens is lower then the pool proportion', async () => {
                // 1) When the inputProportion(tokenOne/tokenTwo) < poolProportion => it should adjust to 50:50
                const inputAmountOne = ethers.utils.parseEther('50')
                const inputAmountTwo = ethers.utils.parseEther('70')
                const [adjAmountOne, adjAmountTwo] = await pool.checkLiquidityProportion(inputAmountOne, inputAmountTwo)
                assert.equal(adjAmountOne.toString(), inputAmountOne.toString())
                assert.equal(adjAmountTwo.toString(), inputAmountOne.toString())
            })

            it('adjusts the amounts correctly if the input proportion of tokens is higher then the pool proportion', async () => {
                // 2) When the inputProportion(tokenOne/tokenTwo) > poolProportion => it should adjust to 4:4
                const inputAmountOne = ethers.utils.parseEther('10')
                const inputAmountTwo = ethers.utils.parseEther('4')

                const [adjAmountOne, adjAmountTwo] = await pool.checkLiquidityProportion(inputAmountOne, inputAmountTwo)
                assert.equal(adjAmountOne.toString(), inputAmountTwo.toString())
                assert.equal(adjAmountTwo.toString(), inputAmountTwo.toString())
            })
        })

        describe('addLiquidity', () => {
            beforeEach(async () => {
                await thunderToken.approve(pool.address, LIQUIDITY_ADDITION)
                await cloudToken.approve(pool.address, LIQUIDITY_ADDITION)
            })

            it('reverts with a custom error if token inputs are zero or lower', async () => {
                await expect(pool.addLiquidity(0, 0)).to.be.revertedWithCustomError(pool, 'Pool__MustSendSomeTokens')
            })

            it('sends the tokens from the liquidity provider to the pool', async () => {
                const initialThunderBalance = await thunderToken.balanceOf(pool.address)
                const initialCloudBalance = await cloudToken.balanceOf(pool.address)

                await pool.addLiquidity(LIQUIDITY_ADDITION, LIQUIDITY_ADDITION)

                const newThunderBalance = await thunderToken.balanceOf(pool.address)
                const newCloudBalance = await cloudToken.balanceOf(pool.address)

                assert.equal(newThunderBalance.toString(), initialThunderBalance.add(LIQUIDITY_ADDITION).toString())
                assert.equal(newCloudBalance.toString(), initialCloudBalance.add(LIQUIDITY_ADDITION).toString())
            })

            it('mints a correct amount of liquidity tokens to the liquidity provider', async () => {
                const initialLiqTokenBalance = await liqToken.balanceOf(user.address)

                await pool.addLiquidity(LIQUIDITY_ADDITION, LIQUIDITY_ADDITION)

                const newLiqTokenBalance = await liqToken.balanceOf(user.address)
                const expectedMintAmount = (LIQUIDITY_ADDITION.mul(INITIAL_TOKEN_AMOUNT)).div(INITIAL_TOKEN_AMOUNT.add(LIQUIDITY_ADDITION))

                assert.equal(newLiqTokenBalance.toString(), initialLiqTokenBalance.add(expectedMintAmount))
            })

            it('emits a correct event upon completion', async () => {
                const expectedMintAmount = (LIQUIDITY_ADDITION.mul(INITIAL_TOKEN_AMOUNT)).div(INITIAL_TOKEN_AMOUNT.add(LIQUIDITY_ADDITION))
                await expect(pool.addLiquidity(LIQUIDITY_ADDITION, LIQUIDITY_ADDITION))
                    .to.emit(pool, 'LiquidityAdded')
                    .withArgs(
                        user.address,
                        LIQUIDITY_ADDITION,
                        LIQUIDITY_ADDITION,
                        expectedMintAmount
                    )
            })
        })

        describe('removeLiquidity', () => {
            let expectedThunderTransfer, expectedCloudTransfer

            beforeEach(async () => {
                await thunderToken.connect(user_two).approve(pool.address, LIQUIDITY_ADDITION)
                await cloudToken.connect(user_two).approve(pool.address, LIQUIDITY_ADDITION)
                await pool.connect(user_two).addLiquidity(LIQUIDITY_ADDITION, LIQUIDITY_ADDITION)
            })

            it('reverts with custom error if the user is not a liquidity provider', async () => {
                await expect(pool.connect(deployer).removeLiquidity())
                    .to.be.revertedWithCustomError(pool, 'Pool__NoLiquidityAvailable')
            })

            it('removes the correct amount of liquidity from the contract to the user', async () => {
                const initialThunderBalance = await thunderToken.balanceOf(pool.address)
                const initialCloudBalance = await cloudToken.balanceOf(pool.address)
                const initialLiqBalance = await liqToken.balanceOf(user_two.address)
                const initialLiqSupply = await liqToken.totalSupply()
                const initialAccountThunderBalance = await thunderToken.balanceOf(user_two.address)
                const initialAccountCloudBalance = await cloudToken.balanceOf(user_two.address)

                await pool.connect(user_two).removeLiquidity()

                expectedThunderTransfer = (initialLiqBalance.mul(initialThunderBalance)).div(initialLiqSupply)
                expectedCloudTransfer = (initialLiqBalance.mul(initialCloudBalance)).div(initialLiqSupply)

                assert.equal(
                    (await thunderToken.balanceOf(pool.address)).toString(),
                    initialThunderBalance.sub(expectedThunderTransfer).toString()
                )
                assert.equal(
                    (await cloudToken.balanceOf(pool.address)).toString(),
                    initialCloudBalance.sub(expectedCloudTransfer).toString()
                )
                assert.equal(
                    (await thunderToken.balanceOf(user_two.address)).toString(),
                    initialAccountThunderBalance.add(expectedThunderTransfer).toString()
                )
                assert.equal(
                    (await cloudToken.balanceOf(user_two.address)).toString(),
                    initialAccountCloudBalance.add(expectedCloudTransfer).toString()
                )
            })

            it('successfully burns all liquidity tokens from the user', async () => {
                await pool.connect(user_two).removeLiquidity()

                assert.equal((await liqToken.balanceOf(user_two.address)).toString(), '0')
            })

            it('emits a correct event upon completion', async () => {
                await expect(pool.connect(user_two).removeLiquidity())
                    .to.emit(pool, 'LiquidityRemoved')
                    .withArgs(user_two.address, expectedThunderTransfer, expectedCloudTransfer)
            })
        })

        describe('getTokenTwoQuantity', () => {
            it('returns a correct output quantity', async () => {
                const tokenInAmount = ethers.utils.parseEther('3')
                const product = INITIAL_TOKEN_AMOUNT.mul(INITIAL_TOKEN_AMOUNT)
                const expectedTokenOutAmountWithoutFee = INITIAL_TOKEN_AMOUNT.sub(
                    product.div(INITIAL_TOKEN_AMOUNT.add(tokenInAmount))
                )
                const fee = (expectedTokenOutAmountWithoutFee.mul(POOL_FEE_PERCENTAGE)).div(100)
                const expectedTokenOutAmount = expectedTokenOutAmountWithoutFee.sub(fee)
                const actualTokenOutAmount = await pool.getTokenTwoQuantity(tokenInAmount)
                assert.equal(expectedTokenOutAmount.toString(), actualTokenOutAmount.toString())
            })
        })

        describe('getTokenOneQuantity', () => {
            it('returns a correct output quantity', async () => {
                const tokenInAmount = ethers.utils.parseEther('7')
                const product = INITIAL_TOKEN_AMOUNT.mul(INITIAL_TOKEN_AMOUNT)
                const expectedTokenOutAmountWithoutFee = INITIAL_TOKEN_AMOUNT.sub(
                    product.div(INITIAL_TOKEN_AMOUNT.add(tokenInAmount))
                )
                const fee = (expectedTokenOutAmountWithoutFee.mul(POOL_FEE_PERCENTAGE)).div(100)
                const expectedTokenOutAmount = expectedTokenOutAmountWithoutFee.sub(fee)
                const actualTokenOutAmount = await pool.getTokenOneQuantity(tokenInAmount)
                assert.equal(expectedTokenOutAmount.toString(), actualTokenOutAmount.toString())
            })
        })

        describe('swapTokenOneForTwo', () => {
            const TOKEN_INPUT = ethers.utils.parseEther('5')

            it('reverts with a custom error if token input is zero or lower', async () => {
                await expect(pool.swapTokenOneForTwo(0))
                    .to.be.revertedWithCustomError(pool, 'Pool__MustSendSomeTokens')
            })

            it('transfers correct amounts of tokens to contract and to user', async () => {
                const tokensOut = await pool.getTokenTwoQuantity(TOKEN_INPUT)
                await thunderToken.approve(pool.address, TOKEN_INPUT)
                await pool.swapTokenOneForTwo(TOKEN_INPUT)

                assert.equal(
                    INITIAL_TOKEN_AMOUNT.add(TOKEN_INPUT).toString(),
                    (await thunderToken.balanceOf(pool.address)).toString()
                )
                assert.equal(
                    INITIAL_TOKEN_AMOUNT.sub(tokensOut).toString(),
                    (await cloudToken.balanceOf(pool.address)).toString()
                )
                assert.equal(
                    INITIAL_ACCOUNT_BALANCE.sub(INITIAL_TOKEN_AMOUNT).sub(TOKEN_INPUT).toString(),
                    (await thunderToken.balanceOf(user.address)).toString()
                )
                assert.equal(
                    INITIAL_ACCOUNT_BALANCE.sub(INITIAL_TOKEN_AMOUNT).add(tokensOut).toString(),
                    (await cloudToken.balanceOf(user.address)).toString()
                )
            })

            it('emits an event upon completion', async () => {
                const tokensOut = await pool.getTokenTwoQuantity(TOKEN_INPUT)
                await thunderToken.approve(pool.address, TOKEN_INPUT)
                await expect(pool.swapTokenOneForTwo(TOKEN_INPUT))
                    .to.emit(pool, 'Swap')
                    .withArgs(
                        user.address,
                        thunderToken.address,
                        cloudToken.address,
                        TOKEN_INPUT,
                        tokensOut
                    )
            })
        })

        describe('swapTokenTwoForOne', () => {
            const TOKEN_INPUT = ethers.utils.parseEther('2.4')

            it('reverts with a custom error if token input is zero or lower', async () => {
                await expect(pool.swapTokenTwoForOne(0))
                    .to.be.revertedWithCustomError(pool, 'Pool__MustSendSomeTokens')
            })

            it('transfers correct amounts of tokens to contract and to user', async () => {
                const tokensOut = await pool.getTokenOneQuantity(TOKEN_INPUT)
                await cloudToken.approve(pool.address, TOKEN_INPUT)
                await pool.swapTokenTwoForOne(TOKEN_INPUT)

                assert.equal(
                    INITIAL_TOKEN_AMOUNT.add(TOKEN_INPUT).toString(),
                    (await cloudToken.balanceOf(pool.address)).toString()
                )
                assert.equal(
                    INITIAL_TOKEN_AMOUNT.sub(tokensOut).toString(),
                    (await thunderToken.balanceOf(pool.address)).toString()
                )
                assert.equal(
                    INITIAL_ACCOUNT_BALANCE.sub(INITIAL_TOKEN_AMOUNT).sub(TOKEN_INPUT).toString(),
                    (await cloudToken.balanceOf(user.address)).toString()
                )
                assert.equal(
                    INITIAL_ACCOUNT_BALANCE.sub(INITIAL_TOKEN_AMOUNT).add(tokensOut).toString(),
                    (await thunderToken.balanceOf(user.address)).toString()
                )
            })

            it('emits an event upon completion', async () => {
                const tokensOut = await pool.getTokenOneQuantity(TOKEN_INPUT)
                await cloudToken.approve(pool.address, TOKEN_INPUT)
                await expect(pool.swapTokenTwoForOne(TOKEN_INPUT))
                    .to.emit(pool, 'Swap')
                    .withArgs(
                        user.address,
                        cloudToken.address,
                        thunderToken.address,
                        TOKEN_INPUT,
                        tokensOut
                    )
            })
        })
    })