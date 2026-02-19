/**
 * QuickNode Streams: webhook ingestion + deterministic liquidation alerts.
 * GET /api/streams/status, GET /api/streams/alerts, POST /api/streams/webhook.
 */

import { Router } from 'express';
import { appendStreamEvent, getLastEvents, getAlerts, getStreamsStatus } from '../services/streams/streamsStore.js';
import { evaluateStreamEvent } from '../services/streams/liquidationRule.js';
import { StreamWebhookSchema } from '../services/streams/schema.js';

export const streamsRouter = Router();

/** POST /api/streams/webhook — ingest event; store; if healthFactor < threshold, produce alert */
streamsRouter.post('/webhook', (req, res) => {
  const parsed = StreamWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid payload',
      details: parsed.error.flatten().message,
    });
  }
  const payload = parsed.data;
  const event = appendStreamEvent({
    timestamp: Date.now(),
    healthFactor: payload.healthFactor,
    protocol: payload.protocol,
    debtPosition: payload.debtPosition,
    chainId: payload.chainId,
    raw: payload.raw ?? { shortfallAmount: payload.shortfallAmount },
  });
  const alert = evaluateStreamEvent(event);
  return res.status(202).json({
    ok: true,
    eventId: event.id,
    alert: alert
      ? {
          id: alert.id,
          intent: alert.intent,
          healthFactor: alert.healthFactor,
          perTxCapRespected: alert.perTxCapRespected,
        }
      : null,
  });
});

/** GET /api/streams/status — pipeline status, counts */
streamsRouter.get('/status', (_req, res) => {
  res.json(getStreamsStatus());
});

/** GET /api/streams/alerts — last N liquidation alerts */
streamsRouter.get('/alerts', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json({ alerts: getAlerts(limit) });
});

/** GET /api/streams/events — last N raw events (optional, for debugging) */
streamsRouter.get('/events', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json({ events: getLastEvents(limit) });
});
