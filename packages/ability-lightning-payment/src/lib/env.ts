import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Environment configuration for Lightning Payment Ability
 * 
 * Required variables:
 * - NWC_URI: Nostr Wallet Connect connection string
 * - PINATA_JWT: Pinata API token for IPFS deployment
 * 
 * Optional variables:
 * - TEST_INVOICE: Lightning invoice for testing
 * - TEST_AMOUNT_SAT: Test payment amount in satoshis
 */

export const getEnv = () => {
  try {
    return createEnv({
      emptyStringAsUndefined: true,
      runtimeEnv: process.env,
      server: {
        // NWC Connection
        NWC_URI: z
          .string()
          .min(1, 'NWC_URI is required for Lightning payments')
          .describe('Nostr Wallet Connect URI (nostr+walletconnect://...)'),

        // Pinata for IPFS deployment
        PINATA_JWT: z
          .string()
          .optional()
          .describe('Pinata JWT token for deploying to IPFS'),

        // Test configuration
        TEST_INVOICE: z
          .string()
          .optional()
          .describe('Test Lightning invoice (BOLT11) for testing'),

        TEST_AMOUNT_SAT: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined))
          .describe('Test payment amount in satoshis'),

        TEST_PAYMENT_HASH: z
          .string()
          .optional()
          .describe('Expected payment hash for test invoice'),

        // Node environment
        NODE_ENV: z
          .enum(['development', 'test', 'production'])
          .optional()
          .default('development'),

        // Logging
        LOG_LEVEL: z
          .enum(['debug', 'info', 'warn', 'error'])
          .optional()
          .default('info'),
      },
    });
  } catch (e) {
    console.error(
      'Failed to load required environment variables!',
      '\nMake sure you have set:',
      '\n  - NWC_URI: Your Nostr Wallet Connect connection string',
      '\n  - PINATA_JWT: Your Pinata API token (for deployment)',
    );
    throw e;
  }
};

// Export singleton instance
export const env = getEnv();

