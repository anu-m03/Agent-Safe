/**
 * Request-scoped payment context for x402.
 * HTTP layer sets verified payment here before calling paid actions; requireX402Payment reads it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface PaymentContextValue {
  paymentTxHash: string;
  amountWei: string;
}

const paymentStorage = new AsyncLocalStorage<PaymentContextValue>();

/**
 * Run fn with the given payment context. Used by routes that verified payment before calling paid actions.
 */
export function runWithPaymentContext<T>(
  context: PaymentContextValue,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(paymentStorage.run(context, fn));
}

/**
 * Get the current request's verified payment, if any.
 */
export function getPaymentContext(): PaymentContextValue | null {
  return paymentStorage.getStore() ?? null;
}
