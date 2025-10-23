/**
 * Lightning Payment Ability - Unit Tests
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { Invoice } from '@getalby/lightning-tools';
import { vincentAbility, verifyPreimage } from './vincent-ability';
import type { AbilityParams } from './schemas';

describe('Lightning Payment Ability', () => {
  describe('Schema Validation', () => {
    it('should validate correct payment request', () => {
      const params: AbilityParams = {
        paymentRequest: 'lnbc1500n1pj5y2z8pp5fqqnvh0lx7tqcnvs8j8e3xvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsdqqcqzpgxqyz5vq',
        maxFeesat: 10,
        timeoutSeconds: 60,
        expectedAmountSat: 150,
      };

      const result = vincentAbility.abilityParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should reject invalid payment request format', () => {
      const params = {
        paymentRequest: 'invalid_invoice',
        maxFeesat: 10,
      };

      const result = vincentAbility.abilityParamsSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should require payment request', () => {
      const params = {
        maxFeesat: 10,
      };

      const result = vincentAbility.abilityParamsSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should accept optional NWC URI', () => {
      const params: AbilityParams = {
        paymentRequest: 'lnbc1500n1pj5y2z8pp5fqqnvh0lx7tqcnvs8j8e3xvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsdqqcqzpgxqyz5vq',
        nwcUri: 'nostr+walletconnect://pubkey?relay=wss://relay.com&secret=secret',
      };

      const result = vincentAbility.abilityParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should set default timeout to 60 seconds', () => {
      const params = {
        paymentRequest: 'lnbc1500n1pj5y2z8pp5fqqnvh0lx7tqcnvs8j8e3xvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsdqqcqzpgxqyz5vq',
      };

      const result = vincentAbility.abilityParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeoutSeconds).toBe(60);
      }
    });
  });

  describe('Invoice Decoding', () => {
    it('should decode valid BOLT11 invoice', () => {
      // This is a test invoice (likely expired)
      const invoice = new Invoice({
        pr: 'lnbc1500n1pj5y2z8pp5fqqnvh0lx7tqcnvs8j8e3xvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsdqqcqzpgxqyz5vq',
      });

      expect(invoice.paymentHash).toBeDefined();
      expect(invoice.paymentHash.length).toBe(64);
    });

    it('should handle invoice without amount', () => {
      const invoice = new Invoice({
        pr: 'lnbc1pj5y2z8pp5fqqnvh0lx7tqcnvs8j8e3xvqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsdqqcqzpgxqyz5vq',
      });

      // Amount-less invoices should have satoshi = 0 or undefined
      expect(invoice.satoshi).toBeFalsy();
    });
  });

  describe('Preimage Verification', () => {
    it('should verify valid preimage format', () => {
      const preimage = 'a'.repeat(64);
      const hash = 'b'.repeat(64);

      const result = verifyPreimage(preimage, hash);
      expect(result).toBe(true);
    });

    it('should reject invalid preimage length', () => {
      const preimage = 'a'.repeat(32); // Too short
      const hash = 'b'.repeat(64);

      const result = verifyPreimage(preimage, hash);
      expect(result).toBe(false);
    });

    it('should reject invalid hash length', () => {
      const preimage = 'a'.repeat(64);
      const hash = 'b'.repeat(32); // Too short

      const result = verifyPreimage(preimage, hash);
      expect(result).toBe(false);
    });

    it('should reject non-hex characters', () => {
      const preimage = 'g'.repeat(64); // 'g' is not a hex character
      const hash = 'b'.repeat(64);

      const result = verifyPreimage(preimage, hash);
      expect(result).toBe(false);
    });
  });

  describe('Success Schema', () => {
    it('should validate successful payment result', () => {
      const successResult = {
        preimage: 'a'.repeat(64),
        paymentHash: 'b'.repeat(64),
        amountSat: 150,
        feeSat: 1,
        totalSat: 151,
        timestamp: Date.now(),
        status: 'SUCCEEDED' as const,
      };

      const result = vincentAbility.executeSuccessSchema.safeParse(successResult);
      expect(result.success).toBe(true);
    });

    it('should require valid preimage format', () => {
      const successResult = {
        preimage: 'invalid', // Too short
        paymentHash: 'b'.repeat(64),
        amountSat: 150,
        feeSat: 1,
        totalSat: 151,
        timestamp: Date.now(),
        status: 'SUCCEEDED',
      };

      const result = vincentAbility.executeSuccessSchema.safeParse(successResult);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Schema', () => {
    it('should validate error result', () => {
      const errorResult = {
        reason: 'PAYMENT_FAILED',
        error: 'Payment failed: no route found',
        paymentHash: 'a'.repeat(64),
        attemptedRoutes: 3,
      };

      const result = vincentAbility.executeFailSchema.safeParse(errorResult);
      expect(result.success).toBe(true);
    });

    it('should allow error without optional fields', () => {
      const errorResult = {
        error: 'Payment failed',
      };

      const result = vincentAbility.executeFailSchema.safeParse(errorResult);
      expect(result.success).toBe(true);
    });
  });

  describe('Precheck Schema', () => {
    it('should validate precheck success result', () => {
      const precheckResult = {
        invoiceValid: true,
        paymentHash: 'a'.repeat(64),
        amountSat: 150,
        destination: 'b'.repeat(66),
        description: 'Test payment',
        expiresAt: Date.now() + 3600000,
        availableLiquidity: 1000000,
        estimatedFee: 2,
      };

      const result = vincentAbility.precheckSuccessSchema.safeParse(precheckResult);
      expect(result.success).toBe(true);
    });

    it('should validate precheck failure result', () => {
      const precheckResult = {
        reason: 'INVOICE_EXPIRED',
        error: 'Invoice has expired',
      };

      const result = vincentAbility.precheckFailSchema.safeParse(precheckResult);
      expect(result.success).toBe(true);
    });
  });
});

describe('Ability Metadata', () => {
  it('should have correct package name', () => {
    expect(vincentAbility.packageName).toBe('@hlv/ability-lightning-payment');
  });

  it('should have description', () => {
    expect(vincentAbility.abilityDescription).toContain('Lightning');
    expect(vincentAbility.abilityDescription).toContain('NWC');
  });
});

