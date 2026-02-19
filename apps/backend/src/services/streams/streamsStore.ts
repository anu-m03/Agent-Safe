/**
 * QuickNode Streams: store last N events and liquidation alerts.
 * Deterministic rule only; no dynamic protocol discovery or new risk domains.
 */

const MAX_EVENTS = Number(process.env.STREAMS_MAX_EVENTS ?? '100');
const MAX_ALERTS = Number(process.env.STREAMS_MAX_ALERTS ?? '50');

export interface StreamEvent {
  id: string;
  timestamp: number;
  healthFactor: number;
  protocol: string;
  debtPosition: string;
  chainId?: number;
  raw?: Record<string, unknown>;
}

export interface LiquidationAlert {
  id: string;
  timestamp: number;
  eventId: string;
  healthFactor: number;
  protocol: string;
  debtPosition: string;
  intent: 'LIQUIDATION_REPAY' | 'LIQUIDATION_ADD_COLLATERAL';
  shortfallAmount?: string;
  perTxCapRespected: boolean;
  dailyAdvisoryCapNote?: string;
}

const events: StreamEvent[] = [];
const alerts: LiquidationAlert[] = [];

let _totalReceived = 0;

function addEvent(ev: StreamEvent): void {
  events.unshift(ev);
  if (events.length > MAX_EVENTS) events.pop();
}

function addAlert(alert: LiquidationAlert): void {
  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) alerts.pop();
}

export function appendStreamEvent(ev: Omit<StreamEvent, 'id'>): StreamEvent {
  const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const event: StreamEvent = { ...ev, id };
  addEvent(event);
  _totalReceived++;
  return event;
}

export function appendAlert(alert: Omit<LiquidationAlert, 'id'>): LiquidationAlert {
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const a: LiquidationAlert = { ...alert, id };
  addAlert(a);
  return a;
}

export function getLastEvents(limit = 20): StreamEvent[] {
  return events.slice(0, limit);
}

export function getAlerts(limit = 20): LiquidationAlert[] {
  return alerts.slice(0, limit);
}

export function getStreamsStatus(): {
  totalReceived: number;
  eventsCount: number;
  alertsCount: number;
  maxEvents: number;
  maxAlerts: number;
} {
  return {
    totalReceived: _totalReceived,
    eventsCount: events.length,
    alertsCount: alerts.length,
    maxEvents: MAX_EVENTS,
    maxAlerts: MAX_ALERTS,
  };
}
