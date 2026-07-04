// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IFunctionsRouter {
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32);
}

contract ARZYG_ERC20_AI is ERC20, AccessControl {
    bytes32 public constant RESERVE_ROLE = keccak256("RESERVE_ROLE");
    bytes32 public constant DEV_ADMIN_ROLE = keccak256("DEV_ADMIN_ROLE");
    
    address public reserve;
    address public ownerAddress;
    address public functionsRouter;
    
    bytes32 public donID;
    uint64 public subscriptionId;
    
    uint256 public protocolFeePercent = 1; 

    struct ProofRequest {
        address to;
        uint256 amount;
        string proof;
    }

    struct Agent {
        string name;
        string description;
        uint256 registeredAt;
        uint256 totalEarned;
        uint256 tasksCompleted;
        bool isActive;
    }

    mapping(bytes32 => ProofRequest) public pendingRequests;
    mapping(address => Agent) public agents;
    uint256 public agentCount;

    event MintRequested(bytes32 indexed requestId, address indexed to, uint256 amount, string proof);
    event AIMinted(address indexed to, uint256 amount, string proof);
    event TokenBirthed(address indexed agent, uint256 totalAmount, uint256 rewardAmount, uint256 feeAmount);
    event OracleProofRejected(bytes32 indexed requestId, string reason);
    event ReserveChanged(address indexed oldReserve, address indexed newReserve);
    event AgentRegistered(address indexed agent, string name, string description, uint256 registeredAt);
    event ProofAccepted(address indexed agent, string proof, uint256 amount, uint256 score, uint256 reward);
    event ProofRejected(address indexed agent, string proof, string reason);

    constructor(
        uint256 initialSupply,
        address _reserve,
        address _router,
        bytes32 _donID,
        uint64 _subscriptionId
    )
        ERC20("ARZY-G", "ARZYG")
    {
        require(_reserve != address(0), "Invalid reserve");
        require(_router != address(0), "Invalid router");

        ownerAddress = msg.sender;
        functionsRouter = _router;
        donID = _donID;
        subscriptionId = _subscriptionId;
        reserve = _reserve;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEV_ADMIN_ROLE, msg.sender);
        _grantRole(RESERVE_ROLE, _reserve);

        _mint(_reserve, initialSupply);
    }

    modifier onlyOwner() {
        require(hasRole(DEV_ADMIN_ROLE, msg.sender), "Not owner");
        _;
    }

    function changeReserve(address newReserve) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newReserve != address(0), "Invalid reserve");
        address old = reserve;
        reserve = newReserve;

        _revokeRole(RESERVE_ROLE, old);
        _grantRole(RESERVE_ROLE, newReserve);

        emit ReserveChanged(old, newReserve);
    }

    function requestUsefulness(
        address user,
        string memory prompt,
        uint256 amountExpected
    ) public onlyOwner returns (bytes32 requestId) {
        string memory sourceCode = string(abi.encodePacked(
            "const res = await Functions.makeHttpRequest({ url: `https://api.arzy.ai/eval?addr=", 
            toAsciiString(user), 
            "&q=", 
            prompt, 
            "` }); if (res.error) throw Error('API Error'); return Functions.encodeUint256(res.data.score);"
        ));

        bytes memory requestData = abi.encodePacked(sourceCode); 
        
        requestId = IFunctionsRouter(functionsRouter).sendRequest(
            subscriptionId,
            requestData,
            0,
            300000,
            donID
        );

        pendingRequests[requestId] = ProofRequest(user, amountExpected, prompt);
        emit MintRequested(requestId, user, amountExpected, prompt);
    }

    function handleOracleFulfillment(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) external {
        require(msg.sender == functionsRouter, "Only router can fulfill");
        
        ProofRequest memory req = pendingRequests[requestId];
        delete pendingRequests[requestId];

        if (bytes(err).length > 0) {
            emit OracleProofRejected(requestId, string(err));
            return;
        }

        uint256 score = abi.decode(response, (uint256));
        
        if (score >= 1) {
            birthToken(req.to, req.amount, req.proof);
        } else {
            emit OracleProofRejected(requestId, "Rejected by AI: Score too low");
        }
    }

    function birthToken(address _agent, uint256 _amount, string memory _proof) internal {
        uint256 feeAmount = (_amount * protocolFeePercent) / 100;
        uint256 agentReward = _amount - feeAmount;

        _mint(_agent, agentReward);
        _mint(ownerAddress, feeAmount);

        emit TokenBirthed(_agent, _amount, agentReward, feeAmount);
        emit AIMinted(_agent, agentReward, _proof);
    }

    function registerAgent(string memory name, string memory description) external {
        require(bytes(name).length > 0, "Name required");
        require(!agents[msg.sender].isActive, "Agent already registered");

        agents[msg.sender] = Agent({
            name: name,
            description: description,
            registeredAt: block.timestamp,
            totalEarned: 0,
            tasksCompleted: 0,
            isActive: true
        });

        agentCount += 1;

        emit AgentRegistered(msg.sender, name, description, block.timestamp);
    }

    function submitProof(string memory proof, uint256 amount, uint256 score) external {
        Agent storage agent = agents[msg.sender];
        require(agent.isActive, "Agent not registered");
        require(amount > 0, "Amount must be positive");

        if (score == 0) {
            emit ProofRejected(msg.sender, proof, "Score too low");
            return;
        }

        uint256 reward = (amount * score) / 10;
        require(reward > 0, "Reward too small");

        agent.totalEarned += reward;
        agent.tasksCompleted += 1;

        _mint(msg.sender, reward);

        emit ProofAccepted(msg.sender, proof, amount, score, reward);
    }

    function getAgentInfo(address agentAddress)
        external
        view
        returns (
            string memory name,
            string memory description,
            uint256 registeredAt,
            uint256 totalEarned,
            uint256 tasksCompleted,
            bool isActive
        )
    {
        Agent memory agent = agents[agentAddress];
        return (
            agent.name,
            agent.description,
            agent.registeredAt,
            agent.totalEarned,
            agent.tasksCompleted,
            agent.isActive
        );
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}
