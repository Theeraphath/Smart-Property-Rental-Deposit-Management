// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RentalDepositManager
/// @notice Demo rental management contract for the EstateFlow vanilla frontend.
/// @dev Deploy with Remix to Sepolia (testnet). Use test ETH only.
contract RentalDepositManager {
    address public immutable owner;
    address public immutable arbiter;

    enum AgreementStatus { Pending, Active, Completed, Disputed }

    struct Property {
        uint256 id;
        string name;
        string location;
        address payable propertyOwner;
        uint256 monthlyRent;
        uint256 securityDeposit;
        bool available;
    }

    struct Agreement {
        uint256 id;
        uint256 propertyId;
        address payable propertyOwner;
        address payable tenant;
        uint64 startDate;
        uint64 endDate;
        uint256 monthlyRent;
        uint256 securityDeposit;
        AgreementStatus status;
        bool depositPaid;
    }

    uint256 public propertyCount;
    uint256 public agreementCount;
    mapping(uint256 => Property) private properties;
    mapping(uint256 => Agreement) private agreements;
    mapping(uint256 => string) public disputeReasons;
    mapping(uint256 => uint256) public rentPaymentCount;

    event PropertyRegistered(uint256 indexed propertyId, address indexed owner);
    event AgreementCreated(uint256 indexed agreementId, uint256 indexed propertyId, address indexed tenant);
    event AgreementConfirmed(uint256 indexed agreementId);
    event DepositPaid(uint256 indexed agreementId, uint256 amount);
    event RentPaid(uint256 indexed agreementId, uint256 amount);
    event DepositRefunded(uint256 indexed agreementId, address tenant, uint256 amount);
    event DisputeRaised(uint256 indexed agreementId, address indexed raisedBy, string reason);
    event DisputeResolved(uint256 indexed agreementId, bool refundTenant);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        arbiter = msg.sender;
    }

    function registerProperty(
        string calldata name,
        string calldata location,
        uint256 monthlyRent,
        uint256 securityDeposit
    ) external {
        require(bytes(name).length > 0, "Property name required");
        require(bytes(location).length > 0, "Location required");
        require(monthlyRent > 0, "Rent must be greater than zero");
        require(securityDeposit > 0, "Deposit must be greater than zero");

        uint256 id = propertyCount++;
        properties[id] = Property({
            id: id,
            name: name,
            location: location,
            propertyOwner: payable(msg.sender),
            monthlyRent: monthlyRent,
            securityDeposit: securityDeposit,
            available: true
        });
        emit PropertyRegistered(id, msg.sender);
    }

    function getProperty(uint256 id) external view returns (
        uint256, string memory, string memory, address, uint256, uint256, bool
    ) {
        require(id < propertyCount, "Property does not exist");
        Property storage p = properties[id];
        return (p.id, p.name, p.location, p.propertyOwner, p.monthlyRent, p.securityDeposit, p.available);
    }

    function createAgreement(
        uint256 propertyId,
        address tenant,
        uint64 startDate,
        uint64 endDate
    ) external {
        require(propertyId < propertyCount, "Property does not exist");
        Property storage p = properties[propertyId];
        require(p.propertyOwner == msg.sender, "Only property owner");
        require(p.available, "Property not available");
        require(tenant != address(0) && tenant != msg.sender, "Invalid tenant");
        require(endDate > startDate && startDate >= block.timestamp, "Invalid rental dates");

        p.available = false;
        uint256 id = agreementCount++;
        agreements[id] = Agreement({
            id: id,
            propertyId: propertyId,
            propertyOwner: p.propertyOwner,
            tenant: payable(tenant),
            startDate: startDate,
            endDate: endDate,
            monthlyRent: p.monthlyRent,
            securityDeposit: p.securityDeposit,
            status: AgreementStatus.Pending,
            depositPaid: false
        });
        emit AgreementCreated(id, propertyId, tenant);
    }

    function getAgreement(uint256 id) external view returns (
        uint256, uint256, address, address, uint64, uint64, uint256, uint256, uint8, bool
    ) {
        require(id < agreementCount, "Agreement does not exist");
        Agreement storage a = agreements[id];
        return (
            a.id, a.propertyId, a.propertyOwner, a.tenant, a.startDate, a.endDate,
            a.monthlyRent, a.securityDeposit, uint8(a.status), a.depositPaid
        );
    }

    function confirmAgreement(uint256 id) external {
        Agreement storage a = _agreement(id);
        require(msg.sender == a.tenant, "Only tenant can confirm");
        require(a.status == AgreementStatus.Pending, "Agreement not pending");
        a.status = AgreementStatus.Active;
        emit AgreementConfirmed(id);
    }

    function depositSecurity(uint256 id) external payable {
        Agreement storage a = _agreement(id);
        require(msg.sender == a.tenant, "Only tenant can deposit");
        require(a.status == AgreementStatus.Active, "Agreement not active");
        require(!a.depositPaid, "Deposit already paid");
        require(msg.value == a.securityDeposit, "Incorrect deposit amount");
        a.depositPaid = true;
        emit DepositPaid(id, msg.value);
    }

    function recordRentalPayment(uint256 id) external payable {
        Agreement storage a = _agreement(id);
        require(msg.sender == a.tenant, "Only tenant can pay rent");
        require(a.status == AgreementStatus.Active, "Agreement not active");
        require(a.depositPaid, "Pay security deposit first");
        require(msg.value == a.monthlyRent, "Incorrect rent amount");
        rentPaymentCount[id]++;
        (bool sent, ) = a.propertyOwner.call{value: msg.value}("");
        require(sent, "Rent transfer failed");
        emit RentPaid(id, msg.value);
    }

    function refundDeposit(uint256 id) external {
        Agreement storage a = _agreement(id);
        require(msg.sender == a.propertyOwner, "Only property owner");
        require(a.status == AgreementStatus.Active, "Agreement not active");
        require(a.depositPaid, "No deposit to refund");
        a.status = AgreementStatus.Completed;
        a.depositPaid = false;
        properties[a.propertyId].available = true;
        uint256 amount = a.securityDeposit;
        (bool sent, ) = a.tenant.call{value: amount}("");
        require(sent, "Refund transfer failed");
        emit DepositRefunded(id, a.tenant, amount);
    }

    function raiseDispute(uint256 id, string calldata reason) external {
        Agreement storage a = _agreement(id);
        require(msg.sender == a.propertyOwner || msg.sender == a.tenant, "Not a party");
        require(a.status == AgreementStatus.Active, "Agreement not active");
        require(a.depositPaid, "No deposit to dispute");
        require(bytes(reason).length > 0, "Reason required");
        a.status = AgreementStatus.Disputed;
        disputeReasons[id] = reason;
        emit DisputeRaised(id, msg.sender, reason);
    }

    /// @param refundTenant true sends the deposit to tenant; false sends it to property owner.
    function resolveDispute(uint256 id, bool refundTenant) external onlyOwner {
        Agreement storage a = _agreement(id);
        require(a.status == AgreementStatus.Disputed, "Agreement not disputed");
        require(a.depositPaid, "Deposit not held");
        a.status = AgreementStatus.Completed;
        a.depositPaid = false;
        properties[a.propertyId].available = true;
        uint256 amount = a.securityDeposit;
        address payable recipient = refundTenant ? a.tenant : a.propertyOwner;
        (bool sent, ) = recipient.call{value: amount}("");
        require(sent, "Payout failed");
        emit DisputeResolved(id, refundTenant);
        emit DepositRefunded(id, recipient, amount);
    }

    function _agreement(uint256 id) internal view returns (Agreement storage) {
        require(id < agreementCount, "Agreement does not exist");
        return agreements[id];
    }
}
