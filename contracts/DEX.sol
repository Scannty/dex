// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./Pool.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

contract DEX {
    event PoolCreated(
        address indexed poolAddress,
        address indexed tokenOne,
        address indexed tokenTwo,
        uint256 initAmountOne,
        uint256 initAmountTwo,
        address poolCreator
    );

    function createNewPair(
        address tokenOne,
        address tokenTwo,
        uint256 amountOne,
        uint256 amountTwo
    ) public {
        Pool newPool = new Pool(
            msg.sender,
            tokenOne,
            tokenTwo,
            amountOne,
            amountTwo
        );

        require(
            IERC20(tokenOne).transferFrom(
                msg.sender,
                address(newPool),
                amountOne
            )
        );
        require(
            IERC20(tokenTwo).transferFrom(
                msg.sender,
                address(newPool),
                amountTwo
            )
        );

        emit PoolCreated(
            address(newPool),
            tokenOne,
            tokenTwo,
            amountOne,
            amountTwo,
            msg.sender
        );
    }
}
