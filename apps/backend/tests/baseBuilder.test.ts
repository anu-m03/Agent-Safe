/**
 * D. Base + Builder Code Integration
 * - Transactions restricted to Base chainId (8453)
 * - Builder code attached to every transaction (callData path)
 * - Mainnet vs testnet config validation
 */

import { describe, it, expect } from 'vitest';
import { validateChainId } from '../src/config/deployment.js';
import { buildCallDataFromIntent } from '../src/services/execution/callDataBuilder.js';
import type { ActionIntent } from '@agent-safe/shared';

const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const mockToken = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const mockSpender = '0x0000000000000000000000000000000000000001';

describe('D. Base + Builder Code Integration', () => {
  describe('transactions restricted to Base chainId', () => {
    it('validateChainId accepts only Base mainnet (8453)', () => {
      expect(validateChainId(BASE_MAINNET_CHAIN_ID)).toBe(true);
      expect(validateChainId(8453)).toBe(true);
    });

    it('validateChainId rejects Base Sepolia and other chains', () => {
      expect(validateChainId(BASE_SEPOLIA_CHAIN_ID)).toBe(false);
      expect(validateChainId(1)).toBe(false);
      expect(validateChainId(137)).toBe(false);
    });
  });

  describe('builder code and intent path', () => {
    it('buildCallDataFromIntent returns INVALID_CHAIN_ID for non-Base chain', () => {
      const intent: ActionIntent = {
        action: 'REVOKE_APPROVAL',
        chainId: BASE_SEPOLIA_CHAIN_ID,
        meta: { token: mockToken, spender: mockSpender },
      };
      const result = buildCallDataFromIntent(intent);
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toBe('INVALID_CHAIN_ID');
    });

    it('buildCallDataFromIntent fails with TOKEN_NOT_ALLOWED or returns calldata with builder suffix', () => {
      const intent: ActionIntent = {
        action: 'REVOKE_APPROVAL',
        chainId: BASE_MAINNET_CHAIN_ID,
        meta: { token: mockToken, spender: mockSpender },
      };
      const result = buildCallDataFromIntent(intent);
      if (result.ok) {
        const defaultCode = process.env.BASE_BUILDER_CODE || 'agentsafe42';
        const hexSuffix = Buffer.from(defaultCode).toString('hex');
        expect(result.callData.toLowerCase().endsWith(hexSuffix.toLowerCase())).toBe(true);
      } else {
        expect(['TOKEN_NOT_ALLOWED', 'AGENT_SAFE_ACCOUNT_NOT_DEPLOYED'].includes(result.reason)).toBe(true);
      }
    });
  });

  describe('mainnet vs testnet config', () => {
    it('only chainId 8453 (Base mainnet) is valid for execution', () => {
      expect(validateChainId(8453)).toBe(true);
      expect(validateChainId(84531)).toBe(false);
      expect(validateChainId(84532)).toBe(false);
    });
  });
});
