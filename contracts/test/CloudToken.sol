// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CloudToken is ERC20 {
    constructor() ERC20("Cloud Token", "CT") {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
