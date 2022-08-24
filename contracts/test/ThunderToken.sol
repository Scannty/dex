// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ThunderToken is ERC20 {
    constructor() ERC20("Thunder Token", "TT") {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
