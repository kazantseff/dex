const { expect } = require("chai");
const { network, ethers, getNamedAccounts, deployments } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("DEX", function () {
      let dex,
        balloons,
        deployer,
        etherValue,
        tokenValue,
        tokenAllowance,
        zeroAddress;
      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        dex = await ethers.getContract("DEX", deployer);
        balloons = await ethers.getContract("Balloons", deployer);
        etherValue = ethers.utils.parseEther("1");
        tokenValue = ethers.utils.parseEther("1000");
        tokenAllowance = ethers.utils.parseEther("10000");
        zeroAddress = "0x0000000000000000000000000000000000000000";
      });

      describe("constructor", function () {
        it("sets the token instance correctly", async function () {
          const response = await dex.getTokenInstance();
          expect(response).to.equal(balloons.address);
        });
      });

      describe("init", function () {
        beforeEach(async function () {
          await balloons.increaseAllowance(dex.address, tokenValue);
        });
        it("reverts if there is already liquidity in the DEX", async function () {
          await dex.init(tokenValue, { value: etherValue });
          await expect(
            dex.init(tokenValue, { value: etherValue })
          ).to.be.revertedWith("DEX - init: already has liquidity");
        });

        it("sets the liquidity of the DEX", async function () {
          const response = await dex.getLPTS();
          expect(response.toString()).to.equal("0");
          await dex.init(tokenValue, { value: etherValue });
          const actual = await dex.getLPTS();
          expect(actual.toString()).to.equal(etherValue.toString());
        });

        it("sets the amount of LP tokens of a user correctly", async function () {
          const response = await dex.getUserLiquidity(deployer);
          expect(response.toString()).to.equal("0");
          await dex.init(tokenValue, { value: etherValue });
          const actual = await dex.getUserLiquidity(deployer);
          expect(actual.toString()).to.equal(etherValue.toString());
        });

        it("transfers tokens from user to the DEX", async function () {
          const response = await balloons.balanceOf(dex.address);
          expect(response.toString()).to.equal("0");
          await dex.init(tokenValue, { value: etherValue });
          const actual = await balloons.balanceOf(dex.address);
          expect(actual.toString()).to.equal(tokenValue.toString());
        });

        it("transfer ETH from user to the DEX", async function () {
          const response = await dex.getBalance();
          expect(response.toString()).to.equal("0");
          await dex.init(tokenValue, { value: etherValue });
          const actual = await dex.getBalance();
          expect(actual.toString()).to.equal(etherValue.toString());
        });

        it("mints the LP tokens to a user's wallet", async function () {
          const response = await dex.balanceOf(deployer);
          expect(response.toString()).to.equal("0");
          await dex.init(tokenValue, { value: etherValue });
          const actual = await dex.balanceOf(deployer);
          expect(actual.toString()).to.equal(etherValue.toString());
        });

        it("emits the event", async function () {
          await expect(dex.init(tokenValue, { value: etherValue }))
            .to.emit(dex, "LiquidityInitialized")
            .withArgs(etherValue);
        });
      });

      describe("addLiquidity", function () {
        beforeEach(async function () {
          await balloons.increaseAllowance(dex.address, tokenAllowance);
          await dex.init(tokenValue, { value: etherValue });
        });

        it("reverts if no token is being sent", async function () {
          await expect(
            dex.addLiquidity("0", { value: etherValue })
          ).to.be.revertedWith(
            "DEX - addLiquidity: Must send value while depositing"
          );
        });

        it("reverts if no ETH is being sent", async function () {
          await expect(
            dex.addLiquidity(tokenValue, { value: "0" })
          ).to.be.revertedWith(
            "DEX - addLiquidity: Must send value while depositing"
          );
        });

        it("transfers ETH to DEX", async function () {
          const startingDEXBalance = await dex.provider.getBalance(dex.address);
          expect(startingDEXBalance.toString()).to.equal(etherValue.toString());
          await dex.addLiquidity(tokenValue, { value: etherValue });
          const endingDEXBalance = await dex.provider.getBalance(dex.address);
          expect(endingDEXBalance.toString())
            .to.equal(startingDEXBalance.add(etherValue))
            .toString();
        });

        it("transfers tokens to DEX", async function () {
          const startingDEXBalance = await balloons.balanceOf(dex.address);
          expect(startingDEXBalance.toString()).to.equal(tokenValue.toString());
          await dex.addLiquidity(tokenValue, { value: etherValue });
          const endingDEXBalance = await balloons.balanceOf(dex.address);
          expect(endingDEXBalance.toString())
            .to.equal(startingDEXBalance.add(tokenValue))
            .toString();
        });

        it("adds the liquidity correctly and mints additional LP tokens", async function () {
          // Setting up the initial liquidity at the 2 : 1000 ratio
          const initialLiquidity = await dex.getLPTS();
          expect(initialLiquidity.toString()).to.equal(
            ethers.utils.parseEther("1").toString()
          );

          const startingLPBalance = await dex.balanceOf(deployer);
          expect(startingLPBalance.toString()).to.equal(
            ethers.utils.parseEther("1").toString()
          );

          // Adding 1 eth and 1000
          await dex.addLiquidity(tokenValue, { value: etherValue });
          const liquidity = await dex.getLPTS();
          const userLiquidity = await dex.getUserLiquidity(deployer);
          expect(userLiquidity.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );
          expect(liquidity.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );

          // Checcking if the additional lp token have been minted
          // Calculated them myself
          const endingLPBalance = await dex.balanceOf(deployer);
          expect(endingLPBalance.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );
        });

        it("emits an event", async function () {
          await expect(
            dex.addLiquidity(tokenValue, { value: etherValue })
          ).to.emit(dex, "LiquidityAdded");
        });
      });

      describe("removeLiquidity", function () {
        beforeEach(async function () {
          await balloons.increaseAllowance(dex.address, tokenAllowance);
          await dex.init(tokenValue, { value: ethers.utils.parseEther("2") });
        });

        it("reverts if the LP amount to withdraw is not greater than 0", async function () {
          await expect(
            dex.removeLiquidity(ethers.utils.parseEther("0"))
          ).to.be.revertedWith(
            "DEX - removeLiquidity: The amount of LP you want to withdraw should be greater than 0."
          );
        });

        it("it removes the liquidity correctly", async function () {
          // Now we have 2 : 1000 liquidity pool
          // By withdrawing 1 LP user should get 1 ETH and 500 Tokens back
          const startungUserLPBalance = await dex.balanceOf(deployer);
          const startingTokenBalance = await balloons.balanceOf(deployer);
          const startingUserETHBalance = await dex.provider.getBalance(
            deployer
          );
          expect(startungUserLPBalance.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );

          const tx = await dex.removeLiquidity(ethers.utils.parseEther("1"));
          const txReceipt = await tx.wait(1);
          const { gasUsed, effectiveGasPrice } = txReceipt;
          const gasCost = gasUsed.mul(effectiveGasPrice);
          const endingUserLPBalance = await dex.balanceOf(deployer);
          const endingTokenBalance = await balloons.balanceOf(deployer);
          const endingUserETHBalance = await dex.provider.getBalance(deployer);
          expect(endingTokenBalance.toString())
            .to.equal(startingTokenBalance.add(ethers.utils.parseEther("500")))
            .toString();
          expect(endingUserLPBalance.toString())
            .to.equal(startungUserLPBalance.sub(etherValue))
            .toString();
          expect(endingUserETHBalance.add(gasCost).toString()).to.equal(
            startingUserETHBalance.add(etherValue.toString())
          );
        });

        it("updates the liquidity variables", async function () {
          const liquidity = await dex.getLPTS();
          expect(liquidity.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );
          const userLiquidity = await dex.getUserLiquidity(deployer);
          expect(userLiquidity.toString()).to.equal(
            ethers.utils.parseEther("2").toString()
          );

          await dex.removeLiquidity(etherValue);
          const newLiquidity = await dex.getLPTS();
          expect(newLiquidity.toString()).to.equal(
            liquidity.sub(etherValue).toString()
          );
          const newUserLiquidity = await dex.getUserLiquidity(deployer);
          expect(newUserLiquidity.toString()).to.equal(
            userLiquidity.sub(etherValue).toString()
          );
        });

        it("emits an event", async function () {
          await expect(dex.removeLiquidity(etherValue))
            .to.emit(dex, "LiquidityRemoved")
            .withArgs(etherValue);
        });
      });
    });
