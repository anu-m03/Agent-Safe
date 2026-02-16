-- AgentSafe Minimal Database Schema
-- Used for audit logging and swarm decision storage.

CREATE TABLE IF NOT EXISTS audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type          VARCHAR(20) NOT NULL CHECK (type IN ('TX', 'GOVERNANCE')),
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
    agent_outputs JSONB NOT NULL DEFAULT '[]',
    consensus_score INTEGER NOT NULL DEFAULT 0,
    final_decision VARCHAR(30) NOT NULL,
    tx_hash       VARCHAR(66),
    proposal_id   VARCHAR(200),
    summary       TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_configs (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address             VARCHAR(42) NOT NULL,
    max_spend_per_tx           NUMERIC NOT NULL DEFAULT 1000000000000000000,
    max_spend_per_day          NUMERIC NOT NULL DEFAULT 5000000000000000000,
    block_unlimited_approvals  BOOLEAN NOT NULL DEFAULT true,
    contract_allowlist         JSONB NOT NULL DEFAULT '[]',
    contract_denylist          JSONB NOT NULL DEFAULT '[]',
    token_allowlist            JSONB NOT NULL DEFAULT '[]',
    token_denylist             JSONB NOT NULL DEFAULT '[]',
    defense_pool_cap           NUMERIC NOT NULL DEFAULT 500000000000000000,
    governance_auto_vote       BOOLEAN NOT NULL DEFAULT false,
    veto_window_seconds        INTEGER NOT NULL DEFAULT 3600,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queued_votes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id   VARCHAR(200) NOT NULL,
    direction     VARCHAR(10) NOT NULL CHECK (direction IN ('FOR', 'AGAINST', 'ABSTAIN')),
    analysis      JSONB NOT NULL DEFAULT '{}',
    queued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    execute_after TIMESTAMPTZ NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'executed', 'vetoed', 'expired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_queued_votes_status ON queued_votes(status);
