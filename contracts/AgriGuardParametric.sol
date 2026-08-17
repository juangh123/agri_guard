// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AgriGuardParametric {
    address public oracleAdmin;

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

    constructor() {
        oracleAdmin = msg.sender;  // AgriGuard backend = trusted EO Oracle
    }

    function createPolicy(
        address _farmerWallet,
        uint256 _coverageAmount,
        string memory _geoHash
    ) public {
        policyCount++;
        policies[policyCount] = Policy(_farmerWallet, _coverageAmount, _geoHash, true);
        emit PolicyCreated(policyCount, _farmerWallet, _coverageAmount, _geoHash);
    }

    function triggerPayout(uint256 _policyId, string memory _disasterType) public {
        require(msg.sender == oracleAdmin, "Only EO Oracle can trigger payouts");
        Policy storage p = policies[_policyId];
        require(p.isActive, "Policy is not active");

        p.isActive = false;  // Prevent double payouts

        payable(p.farmerWallet).transfer(p.coverageAmount);

        emit PayoutTriggered(_policyId, p.farmerWallet, p.coverageAmount, _disasterType);
    }

    receive() external payable {}
}
