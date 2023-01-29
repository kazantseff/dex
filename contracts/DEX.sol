// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/** @notice Simple DEX contract that implements basic features of a DEX */
contract DEX is ERC20 {
  /* ========= GLOBAL VARIABLES ========= */

  using SafeMath for uint256;
  ERC20 token;
  uint256 private s_liquidity;
  mapping(address => uint256) private s_userLiquidity;
  uint256 private fee = 3; // 0.3%

  /* ========= EVENTS ========= */
  event LiquidityInitialized(uint256 indexed amount); // LPTs tokens / argument
  event LiquidityAdded(uint256 indexed amount); // LPTs tokens / argument
  event LiquidityRemoved(uint256 indexed amount); // amount of LP tokens
  event ETHSwapped(uint256 indexed ETHPayed, uint256 indexed TokensBought);
  event TokenSwapped(uint256 indexed TokensPaye, uint256 indexed ETHBought);

  /* ========= CONSTRUCTOR ========= */
  constructor(address _token) ERC20("Ballons LP Token", "BLP") {
    token = ERC20(_token); // token that will be deposited alongside ETH
  }

  /*========= FUNCTIONS =========*/

  /** @notice initializes the amount of tokens that will be sent to the DEX from ERC20 contract
   * @param _tokens amount to be transfered to DEX
   */
  function init(uint256 _tokens) public payable {
    require(s_liquidity == 0, "DEX - init: already has liquidity");
    s_liquidity = address(this).balance;
    s_userLiquidity[msg.sender] = s_liquidity;
    require(
      token.transferFrom(msg.sender, address(this), _tokens),
      "DEX - init: transfer did not transact"
    );
    _mint(msg.sender, s_liquidity); // Mint the LPTs
    emit LiquidityInitialized(s_liquidity);
  }

  /** @notice adds additional liquidity to a contract
   * @param _tokens of tokens to be transfered to the DEX
   */
  function addLiquidity(uint256 _tokens) public payable {
    require(
      msg.value > 0,
      "DEX - addLiquidity: Must send value while depositing"
    );
    require(
      _tokens > 0,
      "DEX - addLiquidity: Must send value while depositing"
    );

    // EthReserve should be the current ethBalance subtracted by the value of ether sent by the user
    // in the current `addLiquidity` call
    uint256 ethReserve = address(this).balance - msg.value;

    // Ratio should always be maintained so that there are no major price impacts when adding liquidity
    // Ratio here is -> (token user can add/token in the contract) = (Eth Sent by the user/Eth Reserve in the contract);
    // So doing some maths, (token user can add) = (Eth Sent by the user * tokenReserve /Eth Reserve);
    uint256 proportionalTokenAmount = (getReserve() * msg.value) / ethReserve;
    require(
      _tokens >= proportionalTokenAmount,
      "DEX - addLiquidity: Amount of tokens sent is less than the minimum token required"
    );
    token.transferFrom(msg.sender, address(this), proportionalTokenAmount);
    uint256 amountMinted = (s_liquidity * msg.value) / ethReserve;
    _mint(msg.sender, amountMinted);
    s_liquidity += amountMinted; // Total liquidity of the contract (LTPs)
    s_userLiquidity[msg.sender] += amountMinted; // The amount of LPTs that user now have

    emit LiquidityAdded(amountMinted);
  }

  function removeLiquidity(uint256 _amount) public {
    require(
      _amount > 0,
      "DEX - removeLiquidity: The amount of LP you want to withdraw should be greater than 0."
    );
    uint256 ethReserve = address(this).balance;
    uint256 lpReserve = getLPTS();
    uint256 tokenReserve = getReserve();

    // The amount of Eth that would be sent back to the user is based
    // on a ratio
    // Ratio is -> (Eth sent back to the user) / (current Eth reserve)
    // = (amount of LP tokens that user wants to withdraw) / (total supply of LP tokens)
    uint256 proportionalETHAmount = (_amount * ethReserve) / lpReserve;

    // The amount of token that would be sent back to the user is based
    // on a ratio
    // Ratio is -> (token sent back to the user) / (current token reserve)
    // = (amount of LP tokens that user wants to withdraw) / (total supply of LP tokens)
    uint256 proportionalTokenAmount = (_amount * tokenReserve) / lpReserve;

    token.transfer(msg.sender, proportionalTokenAmount);
    (bool success, ) = payable(msg.sender).call{value: proportionalETHAmount}(
      ""
    );
    require(success, "DEX - removeLiquidity: Transaction failed.");

    _burn(msg.sender, _amount);
    s_liquidity -= _amount;
    s_userLiquidity[msg.sender] -= _amount;

    emit LiquidityRemoved(_amount);
  }

  /** @notice Function to see how much of tokenY will we get for some amount of tokenX
   * @param _token accepts address as an argument and tell which token we want to sell
   * @param _xInput amount of tokenX that we want to sell
   * @return yOutput amount of tokenY that we will get
   */
  function price(
    address _token,
    uint256 _xInput
  ) public view returns (uint256) {
    uint256 yOutput;
    uint256 xReserve;
    uint256 yReserve;

    // If it's ETH that is being sold
    if (_token == address(0)) {
      xReserve = address(this).balance;
      yReserve = getReserve();
      // If it's other ERC20 token
    } else {
      xReserve = getReserve();
      yReserve = address(this).balance;
    }

    // The ratio here is x*y = k, where k is constant
    // (x + xInput) * (y - yOutput) = k
    // yOutput = y - (k / x + xInput)
    // yOutput = y - (x*y / x + xInput)
    yOutput = yReserve - ((xReserve * yReserve) / (xReserve + _xInput));
    return yOutput;
  }

  /** @notice Function to swap tokens
   * @param _token Which token to sell
   * @param _amount The amount to sell
   */
  function swap(address _token, uint256 _amount) public payable {
    // If its ETH that is being sold
    if (_token == address(0)) {
      require(
        msg.value > 0,
        "DEX - swap: The amount should be greater than 0."
      );
      require(
        _amount == 0,
        "DEX - swap: Do not send other tokens when selling ETH"
      );
      // Tokens to receive before Tax
      uint256 tokensBought = price(_token, _amount);
      // The amount of tokens to actually receive after Tax
      uint256 tokensToReceive = (tokensBought * (1000 - fee)) / 1000;
      token.transfer(msg.sender, tokensToReceive);
      emit ETHSwapped(_amount, tokensToReceive);
    } else {
      require(_amount > 0, "DEX - swap: The amount should be greater than 0.");
      require(
        msg.value == 0,
        "DEX - swap: Do not send ETH when selling any other token"
      );

      uint256 tokensBought = price(_token, _amount);
      uint256 tokensToReceive = (tokensBought * (1000 - fee)) / 1000;
      (bool success, ) = payable(msg.sender).call{value: tokensToReceive}("");
      require(success, "DEX - swap: Transaction failed.");
      emit TokenSwapped(_amount, tokensToReceive);
    }
  }

  /*========= PURE/VIEW FUNCTIONS =========*/
  function getReserve() public view returns (uint256) {
    return token.balanceOf(address(this));
  }

  function getBalance() public view returns (uint256) {
    return address(this).balance;
  }

  /** @notice Returns a total supply of LP tokens */
  function getLPTS() public view returns (uint256) {
    return s_liquidity;
  }

  function getTokenInstance() public view returns (ERC20) {
    return token;
  }

  function getUserLiquidity(address user) public view returns (uint256) {
    return s_userLiquidity[user];
  }
}
