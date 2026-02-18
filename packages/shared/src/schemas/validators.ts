import { z } from 'zod';

// ─── Hex / Address Validators ────────────────────────────
// Reusable Zod refinements for EVM-compatible data.

/** Ethereum address: 0x + 40 hex chars */
export const zAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address (expected 0x + 40 hex chars)');

/** 32-byte hex: 0x + 64 hex chars (tx hashes, userOp hashes) */
export const zBytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid bytes32 (expected 0x + 64 hex chars)');

/** Arbitrary hex data: 0x + even-length hex (calldata, etc.) */
export const zHexData = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})*$/, 'Invalid hex data (expected 0x + even hex length)');

/** ISO-8601 datetime string */
export const zISOTimestamp = z.string().datetime({ offset: true }).or(z.string().datetime());
