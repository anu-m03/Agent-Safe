/**
 * ProvenanceRegistry ABI for recordApproval and approvalsCount.
 * Matches packages/contracts/src/provenance/ProvenanceRegistry.sol
 */
export const ProvenanceRegistryAbi = [
  {
    inputs: [{ name: 'userOpHash', type: 'bytes32' }],
    name: 'approvalsCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'userOpHash', type: 'bytes32' },
      { name: 'agentTBA', type: 'address' },
      { name: 'decisionType', type: 'uint8' },
      { name: 'riskScore', type: 'uint256' },
      { name: 'detailsHash', type: 'bytes32' },
    ],
    name: 'recordApproval',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
