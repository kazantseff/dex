const { ethers } = require("hardhat");
const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  const testToken = await ethers.getContract("Balloons", deployer);

  const args = [testToken.address];
  const DEX = await deploy("DEX", {
    from: deployer,
    args: args,
    log: true,
  });

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...");
    await verify(DEX.address, args);
  }
  log("---------------------");
};

module.exports.tags = ["all", "DEX"];
