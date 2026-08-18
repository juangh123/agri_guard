// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
}

contract AgriGuardParametric {
    address public oracleAdmin;
    address public usdcToken;

    struct Policy {
        address farmerWallet;
        uint256 coverageAmount;
        string geoHash;      // GNSS bounding box hash (Galileo geo-fence)
        bool isActive;
    }

    mapping(uint256 => Policy) public policies;
    uint256 public policyCount;

    event PolicyCreated(uint256 policyId, address farmer, uint256 amount, string geoHash);
    event PayoutTriggered(uint256 policyId, address farmer, uint256 amount, string disasterType);

    constructor(address _usdcToken) {
        oracleAdmin = msg.sender;  // AgriGuard backend = trusted EO Oracle
        usdcToken = _usdcToken;
    }

    function createPolicy(
        address _farmerWallet,
        uint256 _coverageAmount,
        string memory _geoHash
    ) public {
        require(msg.sender == oracleAdmin, "Only EO Oracle can create policies");
        policyCount++;
        policies[policyCount] = Policy(_farmerWallet, _coverageAmount, _geoHash, true);
        emit PolicyCreated(policyCount, _farmerWallet, _coverageAmount, _geoHash);
    }

    function triggerPayout(uint256 _policyId, string memory _disasterType) public {
        require(msg.sender == oracleAdmin, "Only EO Oracle can trigger payouts");
        Policy storage p = policies[_policyId];
        require(p.isActive, "Policy is not active");

        require(IERC20(usdcToken).transfer(p.farmerWallet, p.coverageAmount), "USDC transfer failed");
        p.isActive = false;  // Prevent double payouts

        emit PayoutTriggered(_policyId, p.farmerWallet, p.coverageAmount, _disasterType);
    }

    receive() external payable {}
}
