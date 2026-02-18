# AgentSafe Demo Script

> Step-by-step walkthrough for ETHDenver judges (5–7 minutes).

---

## Pre-Demo Setup

```bash
# Terminal 1: Backend
cd apps/backend && pnpm dev       # http://localhost:4000

# Terminal 2: Frontend
cd apps/web && pnpm dev           # http://localhost:3000
```

Verify both are running:
```bash
curl http://localhost:4000/health | jq
```

---

## Demo Flow (5–7 minutes)

### Step 1: Dashboard Overview (30s)

Open **http://localhost:3000/dashboard**

**What to say:**
> "This is AgentSafe — an ERC-4337 smart wallet on Base protected by SwarmGuard,
> a multi-agent AI defense system. The dashboard shows real-time swarm status,
> governance proposals, and integration health."

Point out:
- Swarm status (alive/agents online)
- Proposals count
- Sponsor integration summary

---

### Step 2: SwarmGuard Defense Demo (2 min) ⭐

Navigate to **http://localhost:3000/defense**

**What to say:**
> "Let's see SwarmGuard in action. I'll submit a suspicious transaction —
> an unlimited ERC-20 approval to an unknown contract."

1. Fill in the form (defaults are pre-set for a suspicious approval):
   - Chain ID: `8453` (Base)
   - To: `0xdead000000000000000000000000000000000000`
   - Data: `0x095ea7b3` (approve selector)
   - Kind: APPROVAL
2. Click **"Evaluate Transaction"**
3. Wait for results (~1s)

**What to show:**
- Agent report timeline: Each agent (Sentinel, Scam Detector, MEV Watcher, Liquidation)
  produces an independent risk assessment
- Point out severity, riskScore, confidence, and reasons for each agent
- Click "Evidence" to expand raw evidence JSON
- Show the **Consensus Card**: ALLOW/BLOCK/REVIEW_REQUIRED with final severity
- Show the **Intent Card**: The system produces an ActionIntent (EXECUTE_TX or BLOCK_TX)
- Click **"Execute on Base"** → Shows "Simulated (MVP)" confirmation

**What to say about provenance:**
> "Each agent signs its risk report independently. The consensus decision
> is recorded as a provenance receipt — this maps directly to our
> ProvenanceRegistry on Base. In production, the agent approval hash
> is stored on-chain before any UserOp executes."

---

### Step 3: Governance Demo (1.5 min) ⭐

Navigate to **http://localhost:3000/governance**

**What to say:**
> "GovernanceSafe monitors DAO proposals and provides AI-powered
> risk analysis with policy checks."

1. Point out the loaded proposals (fetched from backend)
2. Click **"Get AI Recommendation"** on any proposal
3. Show the VoteIntent result:
   - Recommendation (FOR/AGAINST/ABSTAIN)
   - Confidence percentage
   - Reasons
   - Policy checks (TREASURY_RISK, GOV_POWER_SHIFT, URGENCY_FLAG)
4. Toggle **"Auto-vote enabled"** → Show the warning
5. Click **"Human Veto"** → Shows VETOED state

**What to say:**
> "The system uses Kite AI for summarisation and a keyword policy engine
> for risk checks. Auto-voting has a mandatory human veto window —
> no on-chain vote executes without final human approval."

---

### Step 4: Sponsor Proof Panel (1.5 min) ⭐⭐⭐

Navigate to **http://localhost:3000/integrations**

**What to say:**
> "Here's our integration proof panel. Each sponsor technology has
> verifiable evidence."

Walk through each section:

1. **Base** — Show chain ID 8453, deployed contract addresses
   (AgentSafeAccount, PolicyEngine, GovernanceModule, ProvenanceRegistry)
2. **QuickNode** — Show health check status, mode (live/disabled), blockNumber if available
3. **Kite AI** — Show mode (live/stub), click "Run Kite Summary Test" to verify pipeline
4. **Nouns / Proposals** — Show proposals loaded count + preview
5. **0g** — Mention as stretch goal
6. Expand "Raw Proof Data" to show raw `/health` and `/status` JSON

---

### Step 5: Policy Engine (30s)

Navigate to **http://localhost:3000/policy**

**What to say:**
> "Policies are deterministic guardrails that AI agents cannot override.
> They're enforced at three layers: server-side consensus, PolicyEngine.sol
> on-chain, and ERC-4337 UserOp validation."

Show:
- Consensus rules (approvals required, critical block)
- Policy simulator with mock agent reports

---

## Fallback: Backend Down

If the backend is unreachable during the demo:

1. All pages show friendly error banners (not crashes)
2. Navigate to `/integrations` — shows ❌ Missing badges with clear explanations
3. Point out the architecture: "The UI gracefully degrades — all API calls
   have timeout handling and error states"
4. Use `curl` to show static responses if backend recovers

---

## Key Technical Talking Points

- **ERC-4337 Account Abstraction**: Smart wallet on Base with bundler-compatible UserOps
- **Multi-Agent Consensus**: 4 specialist agents + coordinator, deterministic voting threshold
- **Provenance Registry**: On-chain record of every swarm decision (agent hashes + final verdict)
- **Policy Engine**: Immutable on-chain guardrails (spending limits, approval blocking, allowlists)
- **GovernanceSafe**: Proposal parsing → AI risk analysis → VoteIntent → human veto → execution
