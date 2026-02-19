/**
 * Minimal ABI for AgentSafeAccount — execute only.
 * Used to encode callData for UserOperation.
 * Source: packages/contracts (consumed read-only).
 */
export const AgentSafeAccountAbi = [
  {
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'datas', type: 'bytes[]' },
    ],
    name: 'executeBatch',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;
