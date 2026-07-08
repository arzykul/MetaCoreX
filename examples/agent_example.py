#!/usr/bin/env python3
"""
MetaCoreX (ARZY-G) -- standalone Python agent example.

This file is self-contained on purpose: copy it out of this repo into your
own project and it will work as-is (only `web3` and `requests` are required
-- see requirements.txt in this folder).

It never sends your private key anywhere. The API is only used to fetch
public data (the live contract address); every write (registerAgent,
submitProof) is signed locally and sent directly to the chain with your own
wallet.

Usage:
    pip install -r requirements.txt
    SEPOLIA_RPC_URL=... AGENT_PRIVATE_KEY=0x... API_BASE_URL=https://your-deployment.example.com python agent_example.py

Env vars:
    SEPOLIA_RPC_URL    Sepolia RPC endpoint (Alchemy, Infura, or any public node)
    AGENT_PRIVATE_KEY  Your agent wallet's private key (0x-prefixed)
    API_BASE_URL       Base URL of a running MetaCoreX API (e.g. your Fly.io deployment)
    AGENT_NAME         Optional, default "Example Agent"
    PROOF_TEXT         Optional, default "Summarized 10 articles about renewable energy"
"""

import os
import sys

import requests
from web3 import Web3

# Minimal ABI -- only the functions/events this example touches.
ABI = [
    {
        "type": "function",
        "name": "registerAgent",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "name", "type": "string"},
            {"name": "description", "type": "string"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "submitProof",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "proof", "type": "string"},
            {"name": "amount", "type": "uint256"},
            {"name": "score", "type": "uint256"},
        ],
        "outputs": [],
    },
    {
        # Field order here must exactly match the `Agent` struct in
        # ARZYG_ERC20_AI.sol.
        "type": "function",
        "name": "agents",
        "stateMutability": "view",
        "inputs": [{"name": "", "type": "address"}],
        "outputs": [
            {"name": "name", "type": "string"},
            {"name": "description", "type": "string"},
            {"name": "registeredAt", "type": "uint256"},
            {"name": "totalEarned", "type": "uint256"},
            {"name": "tasksCompleted", "type": "uint256"},
            {"name": "isActive", "type": "bool"},
        ],
    },
]


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required env var: {name}", file=sys.stderr)
        sys.exit(1)
    return value


def fetch_contract_address(api_base_url: str) -> str:
    resp = requests.get(f"{api_base_url}/api/contract/info", timeout=15)
    resp.raise_for_status()
    info = resp.json()
    address = info.get("address") or info.get("contractAddress")
    if not address:
        raise RuntimeError(
            "/api/contract/info responded without a contract address "
            f"(the API's own RPC connection may still be starting up): {info}"
        )
    return address


def main() -> None:
    rpc_url = require_env("SEPOLIA_RPC_URL")
    private_key = require_env("AGENT_PRIVATE_KEY")
    api_base_url = require_env("API_BASE_URL").rstrip("/")
    agent_name = os.environ.get("AGENT_NAME", "Example Agent")
    proof_text = os.environ.get(
        "PROOF_TEXT", "Summarized 10 articles about renewable energy"
    )

    print(f"Fetching live contract address from {api_base_url} ...")
    contract_address = fetch_contract_address(api_base_url)
    print(f"Contract: {contract_address}")

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = w3.eth.account.from_key(private_key)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(contract_address), abi=ABI
    )

    print(f"Agent wallet: {account.address}")

    name, _description, _registered_at, _total_earned, _tasks_completed, is_active = (
        contract.functions.agents(account.address).call()
    )

    def send(fn):
        tx = fn.build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address),
                "chainId": w3.eth.chain_id,
            }
        )
        signed = w3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return w3.eth.wait_for_transaction_receipt(tx_hash)

    if not is_active:
        print(f'Registering agent "{agent_name}" ...')
        receipt = send(
            contract.functions.registerAgent(
                agent_name, "Standalone Python example agent for MetaCoreX"
            )
        )
        print(f"Registered. txHash={receipt.transactionHash.hex()}")
    else:
        print(f'Agent already registered as "{name}".')

    # reward = amount * score / 10 on-chain, bounded by MAX_SUPPLY, the global
    # dailyMintLimit, and your per-agent agentDailyCap -- see docs/agent.md.
    amount = Web3.to_wei(10, "ether")  # base amount before the score multiplier
    score = 7  # self-reported, 0-10, sanity-checked on-chain

    print(f'Submitting proof: "{proof_text}" (score {score}/10) ...')
    receipt = send(contract.functions.submitProof(proof_text, amount, score))
    print(f"Proof submitted. txHash={receipt.transactionHash.hex()}")
    print(
        "Done. Check the Operator Console dashboard or "
        "GET /api/pou/agents/:address for your updated stats."
    )


if __name__ == "__main__":
    main()
