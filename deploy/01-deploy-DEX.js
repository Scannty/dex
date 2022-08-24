const { network } = require('hardhat')
const { verify } = require('../utils/verify')
require('dotenv').config()

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    log(`Deploying the DEX contract at ${network.name}...`)
    const dexContract = await deploy('DEX', {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: 1
    })
    log('---------------------------------')

    if (network.config.chainId != 31337 && process.env.ETHERSCAN_API_KEY) {
        log('Verifying...')
        verify(dexContract.address, [])
        log('--------------')
    }
}

module.exports.tags = ['all', 'dex']