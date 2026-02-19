/**
 * Payment records for x402-paid actions only.
 * Store: paymentTxHash, result, timestamp. No subscription models.
 */

const MAX_RECORDS = Number(process.env.PAYMENTS_MAX_RECORDS ?? '200');

export type PaidActionType = 'PROPOSAL_SUMMARISE' | 'RISK_CLASSIFICATION' | 'TX_SIMULATION';

export interface PaymentRecord {
  id: string;
  actionType: PaidActionType;
  paymentTxHash: string | null; // null when fallback used (insufficient funds)
  result: unknown;
  timestamp: number;
  fallbackUsed: boolean;
}

const records: PaymentRecord[] = [];

function generateId(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function appendPaymentRecord(record: Omit<PaymentRecord, 'id'>): PaymentRecord {
  const id = generateId();
  const full: PaymentRecord = { ...record, id };
  records.unshift(full);
  if (records.length > MAX_RECORDS) records.pop();
  return full;
}

export function getPaymentRecords(limit = 50): PaymentRecord[] {
  return records.slice(0, limit);
}
