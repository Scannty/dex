const { network } = require('hardhat')

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    if (network.config.chainId != 31337) return

    log('Local network detected deploying token mocks...')
    const thunderToken = await deploy('ThunderToken', {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: 1
    })
    const cloudToken = await deploy('CloudToken', {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: 1
    })
    log('-------------------')
}

module.exports.tags = ['all', 'tokens']