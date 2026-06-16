# ComplianceGateway

**OFAC sanctions screening with funds held in escrow until an AI verdict clears them.**

ComplianceGateway screens a subject (a name or blockchain address) against live OFAC sanctions data and produces a compliance verdict by validator consensus. An EVM vault locks the transfer and releases it only when the GenLayer verdict says "compliant" — so the money never moves on an unscreened or sanctioned counterparty.

- **Contract (Bradbury, chain 4221):** `0xD682eD7cC2ce61FB14741aF3939b80707C91E478`
- **Explorer:** https://explorer-bradbury.genlayer.com/contract/0xD682eD7cC2ce61FB14741aF3939b80707C91E478
- **Live app:** https://compliancegateway.pages.dev

## What it does

A requester calls `screen(subject, context)`. The contract runs a screening round and stores a record under an integer key (returned as a string): `{requester, subject, context, is_compliant, risk_level, reasoning, source, appealed}`. It increments `record_count` / `total_screens` and bumps `blocked_count` when the subject is flagged. If a verdict is disputed, `appeal(key)` re-runs the screening on the same subject/context and overwrites the verdict (setting `appealed = true`). The owner can wire the settlement vault address with `set_vault` (owner-only).

Each round runs in `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`. The leader first crawls live evidence — `gl.nondet.web.get("https://www.treasury.gov/ofac/downloads/sdnlist.txt")` — and the raw body is HTML-escaped and clamped to 6000 chars inside an `<evidence>…</evidence>` block that the prompt explicitly marks as untrusted, not instructions. It then calls `gl.nondet.exec_prompt(..., response_format="json")` to decide whether the subject matches or resembles a sanctioned entity (allowing aliases, transliterations, fuzzy name matches, exact address matches). The `validator_fn` re-parses the leader's calldata and accepts only if `is_compliant` is a bool, `risk_level` is low/medium/high, and `reasoning` is a string — so validators that fetched slightly different snapshots of the SDN list still converge on the same verdict shape.

State lives in a `TreeMap[str, str]` (`records_json`). The frontend reads verdicts with `read_verdict(key)` and aggregate `stats()` (total screens, blocked, vault). On the EVM side, `ComplianceVault.sol` holds escrowed ERC-20 funds tied to a `screeningKey`; a resolver reads the GenLayer verdict and calls `release` (to recipient) or `reject` (back to sender). The vault never interprets compliance — GenLayer decides, the vault enforces.

## Why GenLayer

Sanctions screening is fuzzy, time-evolving, and unstructured. The SDN list changes, names appear in aliases and transliterations, and "does this subject resemble a sanctioned entity?" is a judgment call no deterministic predicate can make reliably. A normal VM can't fetch the live list, can't tolerate two validators seeing slightly different snapshots, and can't reason about partial matches. GenLayer lets each validator crawl the source, interpret it, and reach agreement on the semantic verdict via `validator_fn`, with `appeal` giving a path to re-screen against fresher data. Use GenLayer when the answer depends on interpreting external, changing, unstructured data; use a plain backend when you have a static, authoritative allowlist you can check with an exact lookup.

## Architecture

| Layer | Responsibility |
|---|---|
| Intelligent contract (`genlayer/compliance_gateway.py`) | Crawls the OFAC SDN list, runs LLM screening rounds, stores verdicts in a `TreeMap`, supports `appeal` |
| Frontend (`web/`) | Reads live verdicts/stats with no wallet; submits `screen` / `appeal` / `set_vault` writes via MetaMask |
| EVM / off-chain (`contracts/src/ComplianceVault.sol`, `CGTToken.sol`) | Escrow vault keyed by `screeningKey`; a resolver reads the verdict and calls `release` / `reject`. The vault enforces, GenLayer decides |

## Tech

- **Contract:** GenVM Python runner, pinned (`py-genlayer:1jb45aa8…jpz09h6`). Counters as `u256`, records stored as a `TreeMap[str, str]` of JSON. Live evidence via `gl.nondet.web.get`, judgment via `gl.nondet.exec_prompt`, consensus via `gl.vm.run_nondet_unsafe` + structural `validator_fn`.
- **Frontend:** Vite + React 19 + TypeScript, genlayer-js for reads (CORS-open RPC) and writes (MetaMask wallet on chain 4221, no snap — the client is created with the address as a string so writes route to `eth_sendTransaction`). UI uses Tailwind CSS v4, framer-motion animations, and sonner toasts.

## Project structure

```
ComplianceGateway/
├── genlayer/
│   └── compliance_gateway.py   # intelligent contract (gl.Contract)
├── contracts/
│   ├── src/
│   │   ├── ComplianceVault.sol # escrow gated by GenLayer verdict
│   │   └── CGTToken.sol        # ERC-20 used by the vault
│   ├── test/ComplianceVault.t.sol
│   └── foundry.toml
├── packages/sdk/               # shared TS SDK
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── genlayer.ts         # client, connectWallet, read/write helpers
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Develop

```
cd web
npm install
npm run dev
npm run build
```

The frontend reads contract state with no wallet. Writes require MetaMask on GenLayer Bradbury (chain 4221) with some GEN — the app auto-switches the network.

## Deploy the frontend (Cloudflare Pages)

- **Root directory:** web
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment:** `NODE_VERSION=20`

## Why GenLayer (engineering notes)

- **No floats.** Risk is a categorical `risk_level` enum and counters are `u256`; no fractional scores are serialized into storage or calldata.
- **Validate structure, not exact text.** Two validators may fetch slightly different SDN snapshots, so `validator_fn` checks types/enums (`is_compliant` bool, `risk_level` enum, `reasoning` string) instead of demanding identical answers.
- **Evidence is untrusted, greybox against injection.** The fetched SDN body is HTML-escaped, length-clamped, and fenced in `<evidence>` tags the prompt labels as data — the binding rules sit outside it so a poisoned page can't redirect the verdict.
- **ACCEPTED ≠ settled.** A finalized screen stores a verdict; it does not move money. `ComplianceVault` must separately `release` or `reject` against the `screeningKey`.
- **Optimistic finality paces writes.** The frontend waits for `FINALIZED` receipts; verdicts settle on the appeal-window cadence, and `appeal` exists precisely to re-judge contested results.

## License

MIT
