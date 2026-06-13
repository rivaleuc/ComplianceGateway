# ComplianceGateway

Decentralized real-time compliance screening. Transactions are held in escrow on the EVM while GenLayer AI validators screen addresses against sanctions lists. Compliant transfers release; non-compliant ones return.

## Why this exists

Every on-chain compliance solution today either trusts a single oracle or requires manual review. ComplianceGateway removes both bottlenecks: screening is performed by a decentralized jury of AI validators on GenLayer, each independently fetching sanctions data and judging whether an address matches. The verdict is consensus, not a single point of failure.

## Why GenLayer

Compliance screening is not a pure function. An address might partially match a sanctioned entity, or a name might be transliterated differently across lists. This requires interpretation, not just string comparison. GenLayer validators run diverse models and reach consensus on whether a match exists — exactly the judgment shape this problem needs.

The EVM handles what it's good at: holding money and enforcing rules. GenLayer handles what it's good at: making judgment calls with consensus.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│   ComplianceVault   │         │   ComplianceGateway.py   │
│   (Base / EVM)      │◄────────│   (GenLayer)             │
│                     │  reads  │                          │
│  • deposit()        │ verdict │  • screen(subject, ctx)  │
│  • release()        │         │  • appeal(key)           │
│  • reject()         │         │  • read_verdict(key)     │
└─────────────────────┘         └──────────────────────────┘
         ▲                                   ▲
         │                                   │
    User deposits                    AI validators fetch
    tokens + screening key           OFAC data & judge
```

- `genlayer/` — the intelligent contract: fetches OFAC SDN list, prompts AI validators, consensus on compliance verdict.
- `contracts/` — EVM side: `CGTToken` (ERC-20) and `ComplianceVault` (escrow with release/reject). Foundry project.
- `packages/sdk/` — TypeScript: ABIs, types, key derivation.
- `web/` — Next.js + wagmi + RainbowKit interface.

## Flow

1. **Screen**: call `ComplianceGateway.screen(address, "transfer")` on GenLayer → returns key
2. **Deposit**: call `ComplianceVault.deposit(recipient, amount, key)` on Base → tokens locked
3. **Resolver reads** `read_verdict(key)` from GenLayer contract
4. **If compliant**: resolver calls `vault.release(id)` → funds go to recipient
5. **If non-compliant**: resolver calls `vault.reject(id)` → funds return to sender

## Quick start

```bash
# Install deps
pnpm install

# Run EVM tests
cd contracts && forge test -vv

# Run frontend
pnpm dev
```

## Status

Working prototype. The GenLayer contract screens against OFAC SDN. The EVM vault gates transfers based on verdicts. No mainnet deployment.
