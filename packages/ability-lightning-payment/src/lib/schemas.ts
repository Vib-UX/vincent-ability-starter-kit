import { z } from 'zod';

export const KNOWN_ERRORS = {
  INVALID_INVOICE: 'INVALID_INVOICE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INVOICE_EXPIRED: 'INVOICE_EXPIRED',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
  NO_ROUTE_FOUND: 'NO_ROUTE_FOUND',
} as const;

/**
 * Ability parameters schema - defines the input parameters for Lightning payment
 */
export const abilityParamsSchema = z.object({
  // BOLT11 Lightning invoice to pay
  paymentRequest: z
    .string()
    .regex(/^ln(bc|tb|bcrt)[0-9a-z]+$/i, 'Invalid Lightning invoice format')
    .describe('BOLT11 Lightning Network payment request'),
  
  // Optional: Maximum fee willing to pay (in satoshis)
  maxFeesat: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum routing fee in satoshis'),
  
  // Optional: Payment timeout in seconds
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .default(60)
    .describe('Payment timeout in seconds'),
  
  // Optional: NWC (Nostr Wallet Connect) URI
  // Format: nostr+walletconnect://...
  nwcUri: z
    .string()
    .optional()
    .describe('Nostr Wallet Connect URI (nostr+walletconnect://...)'),
  
  // Optional: Expected payment amount for validation
  expectedAmountSat: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Expected payment amount in satoshis for validation'),
});

/**
 * Precheck success result schema
 */
export const precheckSuccessSchema = z.object({
  invoiceValid: z.boolean(),
  paymentHash: z.string(),
  amountSat: z.number(),
  destination: z.string(),
  description: z.string().optional(),
  expiresAt: z.number(),
  availableLiquidity: z.number().optional(),
  estimatedFee: z.number().optional(),
});

/**
 * Precheck failure result schema
 */
export const precheckFailSchema = z.object({
  reason: z.union([
    z.literal(KNOWN_ERRORS.INVALID_INVOICE),
    z.literal(KNOWN_ERRORS.INVOICE_EXPIRED),
    z.literal(KNOWN_ERRORS.AMOUNT_MISMATCH),
    z.literal(KNOWN_ERRORS.INSUFFICIENT_LIQUIDITY),
    z.literal(KNOWN_ERRORS.NO_ROUTE_FOUND),
  ]),
  error: z.string(),
});

/**
 * Execute success result schema
 * Contains the preimage which is crucial for HTLC verification on Hedera
 */
export const executeSuccessSchema = z.object({
  // The preimage (payment secret) - required for HTLC unlock
  preimage: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid preimage format'),
  
  // Payment hash (SHA256 of preimage)
  paymentHash: z.string().regex(/^[0-9a-f]{64}$/i, 'Invalid payment hash format'),
  
  // Amount paid in satoshis
  amountSat: z.number().int().positive(),
  
  // Actual fee paid in satoshis
  feeSat: z.number().int().nonnegative(),
  
  // Total amount (amount + fee)
  totalSat: z.number().int().positive(),
  
  // Payment timestamp
  timestamp: z.number(),
  
  // Lightning payment status
  status: z.literal('SUCCEEDED'),
  
  // Optional: Route taken (for debugging/analytics)
  route: z
    .array(
      z.object({
        pubkey: z.string(),
        channel: z.string().optional(),
        feeMsat: z.number().optional(),
      }),
    )
    .optional(),
});

/**
 * Execute failure result schema
 */
export const executeFailSchema = z.object({
  reason: z
    .union([
      z.literal(KNOWN_ERRORS.PAYMENT_FAILED),
      z.literal(KNOWN_ERRORS.NO_ROUTE_FOUND),
      z.literal(KNOWN_ERRORS.INSUFFICIENT_LIQUIDITY),
    ])
    .optional(),
  error: z.string(),
  paymentHash: z.string().optional(),
  attemptedRoutes: z.number().optional(),
});

// Type exports
export type AbilityParams = z.infer<typeof abilityParamsSchema>;
export type PrecheckSuccess = z.infer<typeof precheckSuccessSchema>;
export type PrecheckFail = z.infer<typeof precheckFailSchema>;
export type ExecuteSuccess = z.infer<typeof executeSuccessSchema>;
export type ExecuteFail = z.infer<typeof executeFailSchema>;
