/**
 * AgentRegistry ABI for isValidAgent (validation used by ProvenanceRegistry).
 * Matches packages/contracts/src/agents/AgentRegistry.sol
 */
export const AgentRegistryAbi = [
  {
    inputs: [{ name: 'agentTBA', type: 'address' }],
    name: 'isValidAgent',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
