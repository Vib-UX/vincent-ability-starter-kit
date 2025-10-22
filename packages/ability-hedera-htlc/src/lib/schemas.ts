import { z } from 'zod';

/**
 * Ability Parameters Schema
 * What the Vincent App sends to create an HTLC
 */
export const abilityParamsSchema = z.object({
  // Payment hash from Lightning invoice (SHA256)
  paymentHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .describe('Payment hash from Lightning invoice'),

  // Amount of wBTC to lock (in wei)
  amount: z.string().describe('Amount of wBTC to lock in wei'),

  // wBTC token contract address on Hedera
  tokenAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('wBTC token contract address'),

  // HTLC contract address on Hedera
  htlcContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('HTLC contract address'),

  // Timelock (Unix timestamp when refund becomes available)
  timelock: z.number().positive().int().describe('Unix timestamp for timelock'),

  // RPC URL for Hedera network
  rpcUrl: z.string().url().describe('Hedera RPC URL'),

  // Chain ID (296 for Hedera testnet, 295 for mainnet)
  chainId: z.number().int().describe('Chain ID (296 = Hedera testnet)'),
});

export type AbilityParams = z.infer<typeof abilityParamsSchema>;

/**
 * Precheck Response Schemas
 */
export const precheckSuccessSchema = z.object({
  hasAllowance: z.boolean().describe('Whether token allowance is sufficient'),
  hasBalance: z.boolean().describe('Whether user has sufficient token balance'),
  availableBalance: z.string().describe('User token balance in wei'),
  estimatedGas: z.string().describe('Estimated gas for transaction'),
});

export const precheckFailSchema = z.object({
  error: z.string().describe('Error message'),
  reason: z.string().describe('Error code'),
});

/**
 * Execute Response Schemas
 */
export const executeSuccessSchema = z.object({
  contractId: z.string().describe('HTLC contract ID (keccak256 hash)'),
  txHash: z.string().describe('Transaction hash'),
  paymentHash: z.string().describe('Payment hash used for HTLC'),
  amount: z.string().describe('Amount locked in wei'),
  timelock: z.number().describe('Unix timestamp for timelock'),
  blockNumber: z.number().optional().describe('Block number of confirmation'),
});

export const executeFailSchema = z.object({
  error: z.string().describe('Error message'),
  reason: z.string().describe('Error code'),
});

/**
 * Known Error Codes
 */
export const KNOWN_ERRORS = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_ALLOWANCE: 'INSUFFICIENT_ALLOWANCE',
  INVALID_PAYMENT_HASH: 'INVALID_PAYMENT_HASH',
  INVALID_TIMELOCK: 'INVALID_TIMELOCK',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
} as const;
