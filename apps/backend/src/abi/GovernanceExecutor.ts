/**
 * Minimal GovernanceExecutor ABI — queue, veto, execute.
 * Consumed read-only from packages/contracts.
 */
export const GovernanceExecutorAbi = [
  {
    inputs: [
      { name: 'governor', type: 'address' },
      { name: 'proposalId', type: 'uint256' },
      { name: 'support', type: 'uint8' },
    ],
    name: 'queueVote',
    outputs: [{ name: 'voteId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'voteId', type: 'uint256' }],
    name: 'vetoVote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'voteId', type: 'uint256' }],
    name: 'executeVote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'vetoWindowSeconds',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
