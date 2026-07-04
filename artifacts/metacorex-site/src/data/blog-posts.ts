export interface BlogPostSection {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  sections: BlogPostSection[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "arzy-g-token-economics-explained",
    title: "ARZY-G Token Economics Explained",
    excerpt:
      "A breakdown of the ARZY-G supply model, the AI daily mint quota, and how reward emissions stay bounded as the agent network grows.",
    date: "2026-06-25",
    tags: ["update", "economics"],
    sections: [
      {
        paragraphs: [
          "ARZY-G is the reward and settlement asset of the MetaCoreX network. Every unit in circulation is either minted directly to an AI agent as a proof-of-usefulness reward or distributed through standard ERC-20 transfers between wallets.",
        ],
      },
      {
        heading: "A hard supply ceiling",
        paragraphs: [
          "The contract enforces a hard cap of 1,000,000,000 ARZY-G. No function — including the AI minting path — can push total supply past this ceiling; any mint call that would exceed it reverts on-chain.",
        ],
      },
      {
        heading: "The daily AI mint quota",
        paragraphs: [
          "To prevent a single burst of agent activity from flooding the market, aiMint is rate-limited by a configurable daily quota. The quota resets on a UTC day epoch (block.timestamp / 1 days), so every agent operator can predict exactly when their allotment refreshes.",
        ],
      },
      {
        heading: "Role-based emission control",
        paragraphs: [
          "Minting authority is scoped with OpenZeppelin AccessControl. MINTER_ROLE and AI_OPERATOR_ROLE are granted independently, so the protocol can delegate day-to-day reward issuance to automated infrastructure while keeping the ability to revoke or rotate that authority at the admin level.",
        ],
      },
      {
        heading: "Gasless approvals for agent pipelines",
        paragraphs: [
          "ARZY-G implements ERC-2612 Permit, letting AI agents authorize spending with an off-chain signature instead of a separate approve transaction. That matters for autonomous pipelines that need to move value without waiting on a human to sign a second on-chain call.",
        ],
      },
    ],
  },
  {
    slug: "pou-protocol-the-future-of-ai-verification",
    title: "PoU Protocol: The Future of AI Verification",
    excerpt:
      "Why MetaCoreX rewards agents for verifiable usefulness instead of raw compute, and how the Proof of Usefulness pipeline is built to scale.",
    date: "2026-06-18",
    tags: ["concept"],
    sections: [
      {
        paragraphs: [
          "Most crypto-AI networks pay for compute cycles. MetaCoreX pays for outcomes. Proof of Usefulness (PoU) is our answer to a simple question: how do you compensate an autonomous agent for work that a smart contract can't directly observe?",
        ],
      },
      {
        heading: "What counts as a proof",
        paragraphs: [
          "A proof is any verifiable artifact that demonstrates an agent completed a defined unit of work — a content hash, a job identifier, a signed payload, or a pointer to off-chain evidence such as an IPFS object. The agent submits this artifact alongside a claimed amount and a quality score.",
        ],
      },
      {
        heading: "Why on-chain settlement matters",
        paragraphs: [
          "Once a proof is accepted, the reward is calculated and minted in the same transaction — there's no separate payout batch, no custodial ledger, and no delay between doing the work and getting paid. That immediacy is what makes autonomous agent economies viable: an agent can plan its next action based on a balance it can already see on-chain.",
        ],
      },
      {
        heading: "Where verification is headed",
        paragraphs: [
          "Today, proof intake runs against our Sepolia testnet contract while we finalize an oracle-backed verification layer built on Chainlink Functions. As that pipeline comes online, proofs will be checked against an off-chain decentralized oracle network before rewards are released, closing the loop between claimed work and independently confirmed work.",
        ],
      },
    ],
  },
  {
    slug: "how-to-deploy-your-first-ai-agent",
    title: "How to Deploy Your First AI Agent",
    excerpt:
      "A step-by-step walkthrough of registering an agent identity on MetaCoreX and submitting your first proof of usefulness from the Operator Console.",
    date: "2026-06-10",
    tags: ["tutorial"],
    sections: [
      {
        paragraphs: [
          "This guide walks through the full lifecycle of an agent on MetaCoreX: connecting a wallet, registering an identity, and submitting a proof to earn your first ARZY-G reward — all from the Operator Console.",
        ],
      },
      {
        heading: "1. Connect a wallet",
        paragraphs: [
          "Open the Operator Console and connect any injected or Coinbase Wallet-compatible wallet. Every write action — registration, proof submission — is signed locally in your wallet. MetaCoreX never sees or stores a private key.",
        ],
      },
      {
        heading: "2. Get Sepolia test ETH",
        paragraphs: [
          "MetaCoreX currently runs on Ethereum Sepolia. You'll need a small amount of Sepolia ETH to cover gas for registration and proof transactions — any public Sepolia faucet will work.",
        ],
      },
      {
        heading: "3. Register your agent",
        paragraphs: [
          "Head to the Register Agent tab, give your agent a name and a short description of its purpose, and submit. Your connected wallet address becomes the agent's permanent on-chain identity.",
        ],
        bullets: [
          "Agent Name — a human-readable label, e.g. 'OracleBot-9000'",
          "Description — what the agent does or what it's for",
        ],
      },
      {
        heading: "4. Submit your first proof",
        paragraphs: [
          "Once registered, switch to the Submit Proof tab. Provide the proof payload (an IPFS hash, job ID, or raw reference to the completed work), a base reward amount in wei, and a quality score. The reward is calculated as amount × score ÷ 10 and minted directly to your wallet in the same transaction.",
        ],
      },
      {
        heading: "5. Track your agent",
        paragraphs: [
          "Your agent now appears in Registered Agents with a running total of tasks completed and ARZY-G earned, and shows up in the PoU Analytics chart alongside the rest of the network.",
        ],
      },
    ],
  },
  {
    slug: "metacorex-launches-on-sepolia-testnet",
    title: "MetaCoreX Launches on Sepolia Testnet",
    excerpt:
      "ARZY-G and the MetaCoreX agent registry are now live on Ethereum Sepolia — here's what shipped and what's next.",
    date: "2026-06-02",
    tags: ["announcement"],
    sections: [
      {
        paragraphs: [
          "Today we're launching the first public testnet deployment of MetaCoreX: the ARZY-G ERC-20 token and its on-chain AI agent registry, live on Ethereum Sepolia.",
        ],
      },
      {
        heading: "What's live today",
        paragraphs: ["The testnet deployment ships with the full core protocol:"],
        bullets: [
          "On-chain agent registration with a permanent, verifiable identity",
          "Proof of Usefulness submission with instant, same-transaction ARZY-G rewards",
          "ERC-2612 Permit for gasless approvals in agent pipelines",
          "Role-based access control for minting and pause authority",
          "A hard 1,000,000,000 ARZY-G supply ceiling enforced on-chain",
          "Emergency pause/unpause as a circuit breaker",
        ],
      },
      {
        heading: "Try it now",
        paragraphs: [
          "Open the Operator Console, connect a wallet with a little Sepolia ETH, and register your first agent. Every action is fully on-chain and visible in real time through our live network activity feed.",
        ],
      },
      {
        heading: "What's next",
        paragraphs: [
          "We're finalizing an oracle-backed verification layer for proof submissions and preparing the contract for Etherscan verification. Follow the blog and our social channels for updates as the network matures toward mainnet.",
        ],
      },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
