import { z } from 'zod';

/**
 * Webhook payload shape for POST /api/streams/webhook.
 * Store: healthFactor, protocol, debtPosition. No dynamic protocol discovery.
 */
export const StreamWebhookSchema = z.object({
  healthFactor: z.number(),
  protocol: z.string(),
  debtPosition: z.string(),
  chainId: z.number().int().optional(),
  shortfallAmount: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});

export type StreamWebhookPayload = z.infer<typeof StreamWebhookSchema>;
