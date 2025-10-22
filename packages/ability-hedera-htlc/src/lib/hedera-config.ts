/**
 * Hedera Network Configuration
 *
 * Hedera uses EVM-compatible smart contracts through Hedera Smart Contract Service (HSCS)
 */

export const HEDERA_NETWORKS = {
  MAINNET: {
    chainId: 295,
    name: 'Hedera Mainnet',
    rpcUrl: 'https://mainnet.hedera.com',
    explorer: 'https://hashscan.io/mainnet',
  },
  TESTNET: {
    chainId: 296,
    name: 'Hedera Testnet',
    rpcUrl: 'https://testnet.hedera.com',
    explorer: 'https://hashscan.io/testnet',
  },
  PREVIEWNET: {
    chainId: 297,
    name: 'Hedera Previewnet',
    rpcUrl: 'https://previewnet.hedera.com',
    explorer: 'https://hashscan.io/previewnet',
  },
} as const;

/**
 * Get network config by chain ID
 */
export function getHederaNetwork(chainId: number) {
  switch (chainId) {
    case 295:
      return HEDERA_NETWORKS.MAINNET;
    case 296:
      return HEDERA_NETWORKS.TESTNET;
    case 297:
      return HEDERA_NETWORKS.PREVIEWNET;
    default:
      throw new Error(`Unsupported Hedera chain ID: ${chainId}`);
  }
}

/**
 * HTLC Contract ABI (partial - only functions we need)
 */
export const HTLC_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: '_hashlock', type: 'bytes32' },
      { internalType: 'uint256', name: '_timelock', type: 'uint256' },
      { internalType: 'address', name: '_tokenAddress', type: 'address' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
    ],
    name: 'createHTLCToken',
    outputs: [{ internalType: 'bytes32', name: 'contractId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: '_hashlock', type: 'bytes32' },
      { internalType: 'uint256', name: '_timelock', type: 'uint256' },
    ],
    name: 'createHTLCNative',
    outputs: [{ internalType: 'bytes32', name: 'contractId', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: '_contractId', type: 'bytes32' },
      { internalType: 'bytes32', name: '_preimage', type: 'bytes32' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: '_contractId', type: 'bytes32' }],
    name: 'refund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'contracts',
    outputs: [
      { internalType: 'address', name: 'sender', type: 'address' },
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'bytes32', name: 'hashlock', type: 'bytes32' },
      { internalType: 'uint256', name: 'timelock', type: 'uint256' },
      { internalType: 'bool', name: 'withdrawn', type: 'bool' },
      { internalType: 'bool', name: 'refunded', type: 'bool' },
      { internalType: 'bytes32', name: 'preimage', type: 'bytes32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * ERC20 ABI (partial - for approve and allowance)
 */
export const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
