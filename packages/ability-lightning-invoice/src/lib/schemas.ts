import { z } from 'zod';

/**
 * Ability Parameters Schema
 * What the Vincent App sends to create an invoice
 */
export const abilityParamsSchema = z.object({
  // Amount in satoshis
  amountSat: z.number().positive().int().describe('Invoice amount in satoshis'),

  // Description for the invoice
  description: z.string().optional().describe('Invoice description/memo'),

  // Expiry in seconds (default 24 hours)
  expirySec: z.number().positive().int().default(86400).describe('Invoice expiry in seconds'),

  // NWC connection URI
  nwcUri: z.string().describe('Nostr Wallet Connect URI'),
});

export type AbilityParams = z.infer<typeof abilityParamsSchema>;

/**
 * Precheck Response Schemas
 */
export const precheckSuccessSchema = z.object({
  amountSat: z.number().describe('Invoice amount in satoshis'),
  estimatedFee: z.number().optional().describe('Estimated routing fee'),
  canReceive: z.boolean().describe('Whether wallet can receive this amount'),
});

export const precheckFailSchema = z.object({
  error: z.string().describe('Error message'),
  reason: z.string().describe('Error code'),
});

/**
 * Execute Response Schemas
 */
export const executeSuccessSchema = z.object({
  paymentRequest: z.string().describe('BOLT11 invoice string'),
  paymentHash: z.string().describe('Payment hash (SHA256)'),
  amountSat: z.number().describe('Invoice amount in satoshis'),
  description: z.string().optional().describe('Invoice description'),
  expiresAt: z.number().describe('Unix timestamp when invoice expires'),
});

export const executeFailSchema = z.object({
  error: z.string().describe('Error message'),
  reason: z.string().describe('Error code'),
});

/**
 * Known Error Codes
 */
export const KNOWN_ERRORS = {
  NWC_CONNECTION_FAILED: 'NWC_CONNECTION_FAILED',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVOICE_CREATION_FAILED: 'INVOICE_CREATION_FAILED',
  NWC_NOT_SUPPORTED: 'NWC_NOT_SUPPORTED',
  LIQUIDITY_INSUFFICIENT: 'LIQUIDITY_INSUFFICIENT',
} as const;
