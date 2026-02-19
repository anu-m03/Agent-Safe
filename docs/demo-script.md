# AgentSafe Demo Script

> End-to-end walkthrough for judges. **Total target: under 7 minutes.**

---

## Pre-Demo Setup

```bash
# Terminal 1: Backend
cd apps/backend && pnpm dev       # http://localhost:4000

# Terminal 2: Frontend
cd apps/web && pnpm dev           # http://localhost:3000
```

Verify both:

```bash
curl -s http://localhost:4000/status | jq
# Expect: { "alive": true, "uptime": ..., "agents": [...], "logsCount": N, "runsCount": N }

curl -s http://localhost:4000/health | jq '.status'
# Expect: "ok" or "degraded"
```

---

## Demo Flow (under 7 min)

| Step | Duration | Focus |
|------|----------|--------|
| 1. Dashboard | 30s | Status, agents, runs |
| 2. SwarmGuard Defense | 2 min | Tx evaluation, consensus, intent |
| 3. Governance | 1.5 min | Proposals, AI recommendation, veto |
| 4. Integrations Proof | 1.5 min | Base, QuickNode, Kite, Snapshot |
| 5. Policy | 30s | Deterministic guardrails |
| **Total** | **~6 min** | Buffer for Q&A |

---

### Step 1: Dashboard Overview (30s)

Open **http://localhost:3000/dashboard**

**Say:**  
"AgentSafe is an ERC-4337 smart wallet on Base with SwarmGuard — multi-agent AI defense. The dashboard shows swarm status, governance proposals, and integration health."

**Point out:**
- **Status** — `GET /status` returns `agents`, `logsCount`, `runsCount` (reproducible from logs).
- Proposals count and sponsor integration summary.

---

### Step 2: SwarmGuard Defense Demo (2 min)

Go to **http://localhost:3000/defense**

**Say:**  
"We'll evaluate a suspicious transaction: an unlimited ERC-20 approval to an unknown contract."

1. Use the form (defaults are pre-set):
   - Chain ID: `8453` (Base)
   - To: `0xdead000000000000000000000000000000000000`
   - Data: `0x095ea7b3` (approve selector)
   - Kind: APPROVAL
2. Click **"Evaluate Transaction"** (~1s).
3. **Show:** Agent report timeline (Sentinel, Scam, MEV, Liquidation), severity/riskScore/confidence, **Consensus Card** (ALLOW/BLOCK/REVIEW), **Intent Card** (ActionIntent).
4. Click **"Execute on Base"** — with backend configured, response includes `userOpHash`, `txHash`, `provenanceTxHashes` (real 0x… hashes when provenance is used). Otherwise simulated/MVP message.

**Say:**  
"Each agent signs its report. The consensus is recorded; on Base we submit approvals to ProvenanceRegistry before the UserOp, so execution returns real `userOpHash`, `txHash`, and `provenanceTxHashes`."

**Real tx hashes:** When execution and provenance are configured, API response shape is:

```json
{
  "ok": true,
  "userOpHash": "0x...",
  "txHash": "0x...",
  "gasUsed": "...",
  "gasCostWei": "...",
  "provenanceTxHashes": ["0x...", "0x..."],
  "kiteOnlyProvenance": true
}
```

---

### Step 3: Governance Demo (1.5 min)

Go to **http://localhost:3000/governance**

**Say:**  
"GovernanceSafe monitors DAO proposals and provides AI risk analysis with policy checks."

1. Point out loaded proposals (from backend).
2. Click **"Get AI Recommendation"** on a proposal.
3. Show VoteIntent: recommendation (FOR/AGAINST/ABSTAIN), confidence, reasons, policy checks (TREASURY_RISK, GOV_POWER_SHIFT, URGENCY_FLAG).
4. **Queue vote** → then **Human Veto** to show vetoed state.

**Say:**  
"Kite AI does summarisation; keyword policy engine does risk checks. There is a mandatory human veto window — no on-chain vote without final approval."

---

### Step 4: Sponsor Proof Panel (1.5 min)

Go to **http://localhost:3000/integrations**

**Say:**  
"Integration proof: each sponsor has verifiable evidence."

1. **Base** — Chain ID 8453, AgentSafeAccount, PolicyEngine, GovernanceModule, ProvenanceRegistry.
2. **QuickNode** — Health status, mode, block number when live.
3. **Kite AI** — Mode (live/stub), "Run Kite Summary Test".
4. **Nouns / Snapshot** — Proposals count and preview.
5. Expand **Raw Proof Data** — show `/health` and `/status` JSON (including `agents`, `logsCount`, `runsCount`).

---

### Step 5: Policy Engine (30s)

Go to **http://localhost:3000/policy**

**Say:**  
"Policies are deterministic guardrails: server-side consensus, PolicyEngine on-chain, and ERC-4337 UserOp validation."

Show consensus rules and policy simulator.

---

## Fallback: Backend Down

- Pages show error banners, no crashes.
- **Integrations** shows missing badges and clear messages.
- Use `curl` to show `/status` or `/health` when backend is back.

---

## Key Technical Points

- **ERC-4337**: Smart wallet on Base, bundler-compatible UserOps.
- **Multi-Agent Consensus**: Specialist agents + coordinator; threshold voting.
- **Provenance**: On-chain approvals (ProvenanceRegistry); real `userOpHash` / `txHash` / `provenanceTxHashes` in API response.
- **Policy Engine**: On-chain guardrails (allowlists, approval blocking).
- **GovernanceSafe**: Proposals → AI risk → VoteIntent → human veto → optional execution.
