import { z } from 'zod';

// ─── Policy Zod Schema ──────────────────────────────────

export const PolicyConfigSchema = z.object({
  maxSpendPerTx: z.string(),
  maxSpendPerDay: z.string(),
  blockUnlimitedApprovals: z.boolean(),
  contractAllowlist: z.array(z.string()),
  contractDenylist: z.array(z.string()),
  tokenAllowlist: z.array(z.string()),
  tokenDenylist: z.array(z.string()),
  defensePoolCap: z.string(),
  governanceAutoVoteEnabled: z.boolean(),
  vetoWindowSeconds: z.number().int().positive(),
});
