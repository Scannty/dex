// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./LiquidityToken.sol";

error Pool__MustSendSomeTokens();
error Pool__NoLiquidityAvailable();
error Pool__NotEnoughTokensInPool(uint256 tokenBalance);

contract Pool is ReentrancyGuard {
    using SafeMath for uint256;

    IERC20 private immutable tokenOne;
    IERC20 private immutable tokenTwo;
    LiquidityToken private immutable liqToken;

    address private immutable poolCreator;
    uint256 private constant FEE_PERCENTAGE = 3;

    event LiquidityAdded(
        address indexed liqProvider,
        uint256 indexed amountOne,
        uint256 indexed amountTwo,
        uint256 liqTokenAmount
    );
    event LiquidityRemoved(
        address indexed liqProvider,
        uint256 indexed amountOne,
        uint256 indexed amountTwo
    );
    event Swap(
        address indexed buyer,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(
        address poolCreatorAddress,
        address tokenOneAddress,
        address tokenTwoAddress,
        uint256 initAmountOne,
        uint256 initAmountTwo
    ) {
        poolCreator = poolCreatorAddress;
        tokenOne = IERC20(tokenOneAddress);
        tokenTwo = IERC20(tokenTwoAddress);
        liqToken = new LiquidityToken();

        _initializePool(initAmountOne, initAmountTwo);
    }

    modifier onlyLps() {
        if (liqToken.balanceOf(msg.sender) <= 0) {
            revert Pool__NoLiquidityAvailable();
        }
        _;
    }

    function addLiquidity(uint256 amountOne, uint256 amountTwo)
        public
        nonReentrant
    {
        if (amountOne <= 0 || amountTwo <= 0) {
            revert Pool__MustSendSomeTokens();
        }

        (uint256 adjAmountOne, uint256 adjAmountTwo) = checkLiquidityProportion(
            amountOne,
            amountTwo
        );
        uint256 liqTokenAmount = _calcLiquidityTokenAmount(
            adjAmountOne,
            adjAmountTwo
        );

        require(tokenOne.transferFrom(msg.sender, address(this), adjAmountOne));
        require(tokenTwo.transferFrom(msg.sender, address(this), adjAmountTwo));
        liqToken.mint(msg.sender, liqTokenAmount);

        emit LiquidityAdded(
            msg.sender,
            adjAmountOne,
            adjAmountTwo,
            liqTokenAmount
        );
    }

    function removeLiquidity() public onlyLps nonReentrant {
        (uint256 amountOne, uint256 amountTwo) = _removeLiquidity();

        require(tokenOne.transfer(msg.sender, amountOne));
        require(tokenTwo.transfer(msg.sender, amountTwo));
        liqToken.burn(msg.sender, liqToken.balanceOf(msg.sender));

        emit LiquidityRemoved(msg.sender, amountOne, amountTwo);
    }

    function swapTokenOneForTwo(uint256 amountOne) public nonReentrant {
        if (amountOne <= 0) {
            revert Pool__MustSendSomeTokens();
        }

        uint256 amountTwo = getTokenTwoQuantity(amountOne);

        require(tokenOne.transferFrom(msg.sender, address(this), amountOne));
        require(tokenTwo.transfer(msg.sender, amountTwo));

        emit Swap(
            msg.sender,
            address(tokenOne),
            address(tokenTwo),
            amountOne,
            amountTwo
        );
    }

    function swapTokenTwoForOne(uint256 amountTwo) public nonReentrant {
        if (amountTwo <= 0) {
            revert Pool__MustSendSomeTokens();
        }

        uint256 amountOne = getTokenOneQuantity(amountTwo);

        require(tokenTwo.transferFrom(msg.sender, address(this), amountTwo));
        require(tokenOne.transfer(msg.sender, amountOne));

        emit Swap(
            msg.sender,
            address(tokenTwo),
            address(tokenOne),
            amountTwo,
            amountOne
        );
    }

    function checkLiquidityProportion(uint256 amountOne, uint256 amountTwo)
        public
        view
        returns (uint256, uint256)
    {
        uint256 correctProportion = (tokenOne.balanceOf(address(this))).div(
            tokenTwo.balanceOf(address(this))
        );
        uint256 inputProportion = amountOne.div(amountTwo);

        if (inputProportion == correctProportion) {
            return (amountOne, amountTwo);
        }
        if (inputProportion > correctProportion) {
            return (amountTwo.mul(correctProportion), amountTwo);
        }
        if (inputProportion < correctProportion) {
            return (amountOne, amountOne.div(correctProportion));
        }
    }

    function getTokenTwoQuantity(uint256 amount) public view returns (uint256) {
        uint256 product = _getCurrentProduct();
        uint256 amountBeforeFee = tokenTwo.balanceOf(address(this)).sub(
            product.div((tokenOne.balanceOf(address(this))).add(amount))
        );
        uint256 fee = getFeeAmount(amountBeforeFee);

        return amountBeforeFee.sub(fee);
    }

    function getTokenOneQuantity(uint256 amount) public view returns (uint256) {
        uint256 product = _getCurrentProduct();
        uint256 amountBeforeFee = tokenOne.balanceOf(address(this)).sub(
            product.div((tokenTwo.balanceOf(address(this))).add(amount))
        );
        uint256 fee = getFeeAmount(amountBeforeFee);

        return amountBeforeFee.sub(fee);
    }

    function getTokenOneAddress() public view returns (address) {
        return address(tokenOne);
    }

    function getTokenTwoAddress() public view returns (address) {
        return address(tokenTwo);
    }

    function getLiquidityTokenAddress() public view returns (address) {
        return address(liqToken);
    }

    function getPoolCreator() public view returns (address) {
        return poolCreator;
    }

    function getFeeAmount(uint256 amount) public pure returns (uint256) {
        return (amount.mul(FEE_PERCENTAGE)).div(100);
    }

    function getFeePercentage() public pure returns (uint256) {
        return FEE_PERCENTAGE;
    }

    function _initializePool(uint256 initAmountOne, uint256 initAmountTwo)
        private
    {
        uint256 initialLiquidity = Math.sqrt(initAmountOne.mul(initAmountTwo));
        liqToken.mint(poolCreator, initialLiquidity);
    }

    function _getCurrentProduct() private view returns (uint256) {
        uint256 tokenOneBalance = tokenOne.balanceOf(address(this));
        uint256 tokenTwoBalance = tokenTwo.balanceOf(address(this));
        return tokenOneBalance.mul(tokenTwoBalance);
    }

    function _calcLiquidityTokenAmount(uint256 amountOne, uint256 amountTwo)
        private
        view
        returns (uint256)
    {
        return
            (amountOne.mul(liqToken.totalSupply())).div(
                amountOne.add(tokenOne.balanceOf(address(this)))
            );
    }

    function _removeLiquidity() private view returns (uint256, uint256) {
        uint256 amountOne = (
            liqToken.balanceOf(msg.sender).mul(
                tokenOne.balanceOf(address(this))
            )
        ).div(liqToken.totalSupply());

        uint256 amountTwo = (
            liqToken.balanceOf(msg.sender).mul(
                tokenTwo.balanceOf(address(this))
            )
        ).div(liqToken.totalSupply());

        return (amountOne, amountTwo);
    }
}
