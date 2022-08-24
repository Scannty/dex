// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error LiquidityToken__NotOwner();

contract LiquidityToken is ERC20 {
    address private immutable owner;

    constructor() ERC20("LiquidityToken", "LT") {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert LiquidityToken__NotOwner();
        }
        _;
    }

    function mint(address receiver, uint256 amount) external onlyOwner {
        _mint(receiver, amount);
    }

    function burn(address burner, uint256 amount) external onlyOwner {
        _burn(burner, amount);
    }
}
