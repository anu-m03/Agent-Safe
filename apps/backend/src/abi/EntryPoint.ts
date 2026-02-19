/**
 * Minimal EntryPoint ABI for getNonce and getUserOpHash.
 * ERC-4337 EntryPoint v0.6.
 */
export const EntryPointAbi = [
  {
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    name: 'getNonce',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
        name: 'userOp',
        type: 'tuple',
      },
    ],
    name: 'getUserOpHash',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
