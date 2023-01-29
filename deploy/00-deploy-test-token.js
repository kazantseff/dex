const { network } = require("hardhat");
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  const chainId = network.config.chainId;

  if (chainId == 31337) {
    log("Local network detected, deploying testToken...");
    await deploy("Balloons", {
      from: deployer,
      log: true,
    });
    log("TestToken deployed...");
    log("----------------------------------");
  }
};

module.exports.tags = ["all", "testToken"];
