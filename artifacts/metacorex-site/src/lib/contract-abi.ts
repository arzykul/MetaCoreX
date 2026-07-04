// Minimal ABI fragment for the agent-registry write functions on
// ARZYG_ERC20_AI (see contracts/contracts/ARZYG_ERC20_AI.sol). Kept as a
// hand-picked subset (not the full compiled ABI) because this artifact
// can't import from `contracts/*` across the workspace boundary, and the
// dashboard only ever calls these two functions directly from the
// connected wallet.
export const ARZYG_AGENT_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "description", type: "string" },
    ],
    name: "registerAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "proof", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "score", type: "uint256" },
    ],
    name: "submitProof",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "agent", type: "address" },
      { indexed: false, internalType: "string", name: "proof", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "score", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "reward", type: "uint256" },
    ],
    name: "ProofAccepted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "agent", type: "address" },
      { indexed: false, internalType: "string", name: "proof", type: "string" },
      { indexed: false, internalType: "string", name: "reason", type: "string" },
    ],
    name: "ProofRejected",
    type: "event",
  },
] as const;
