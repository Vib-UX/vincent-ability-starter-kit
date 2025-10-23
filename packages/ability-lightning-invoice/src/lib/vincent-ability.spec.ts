import { describe, it, expect, beforeEach } from '@jest/globals';
import { vincentAbility } from './vincent-ability';

describe('Lightning Invoice Ability', () => {
  const validContext = {
    succeed: (result: any) => ({ success: true, result }),
    fail: (result: any) => ({ success: false, result }),
    delegation: {
      delegatorPkpInfo: {
        ethAddress: '0xAbCdEf1234567890123456789012345678901234',
        publicKey:
          '0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
    },
  };

  describe('Precheck', () => {
    it('should succeed with valid parameters', async () => {
      const validParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
        description: 'Test invoice',
      };

      const result = await vincentAbility.precheck(
        { abilityParams: validParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.amountSat).toBe(1000);
        expect(result.result.canReceive).toBe(true);
        expect(result.result.estimatedFee).toBe(0);
      }
    });

    it('should fail with negative amount', async () => {
      const invalidParams = {
        amountSat: -100,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('greater than 0');
        expect(result.result.reason).toBe('INVALID_AMOUNT');
      }
    });

    it('should fail with zero amount', async () => {
      const invalidParams = {
        amountSat: 0,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('greater than 0');
      }
    });

    it('should fail with invalid NWC URI format', async () => {
      const invalidParams = {
        amountSat: 1000,
        nwcUri: 'https://invalid-uri.com',
        expirySec: 3600,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Invalid NWC URI format');
        expect(result.result.reason).toBe('NWC_CONNECTION_FAILED');
      }
    });

    it('should fail with expiry less than 60 seconds', async () => {
      const invalidParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 30,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('at least 60 seconds');
      }
    });

    it('should accept large amounts', async () => {
      const validParams = {
        amountSat: 21000000, // 0.21 BTC
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: validParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Execute', () => {
    it('should create invoice with valid parameters', async () => {
      const validParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
        description: 'Test invoice',
      };

      const result = await vincentAbility.execute(
        { abilityParams: validParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.paymentHash).toMatch(/^0x[a-f0-9]{64}$/);
        expect(result.result.paymentRequest).toMatch(/^lnbc/);
        expect(result.result.amountSat).toBe(1000);
        expect(result.result.description).toBeDefined();
        expect(result.result.expiresAt).toBeGreaterThan(Date.now() / 1000);
      }
    });

    it('should return correct payment hash format', async () => {
      const validParams = {
        amountSat: 5000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 1800,
      };

      const result = await vincentAbility.execute(
        { abilityParams: validParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Payment hash should be 32 bytes (64 hex characters) with 0x prefix
        expect(result.result.paymentHash).toMatch(/^0x[a-f0-9]{64}$/);
        expect(result.result.paymentHash.length).toBe(66); // 0x + 64 hex chars
      }
    });

    it('should use default description if not provided', async () => {
      const validParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const result = await vincentAbility.execute(
        { abilityParams: validParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.description).toContain('HLV Protocol rebalance');
        expect(result.result.description).toContain('1000 sats');
      }
    });

    it('should calculate correct expiration time', async () => {
      const validParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 1800, // 30 minutes
      };

      const beforeTime = Math.floor(Date.now() / 1000);
      const result = await vincentAbility.execute(
        { abilityParams: validParams },
        validContext as any,
      );
      const afterTime = Math.floor(Date.now() / 1000);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.expiresAt).toBeGreaterThanOrEqual(beforeTime + 1800);
        expect(result.result.expiresAt).toBeLessThanOrEqual(afterTime + 1800);
      }
    });

    it('should fail with invalid NWC URI protocol', async () => {
      const invalidParams = {
        amountSat: 1000,
        nwcUri: 'https://invalid-protocol.com',
        expirySec: 3600,
      };

      const result = await vincentAbility.execute(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Invalid NWC URI protocol');
      }
    });

    it('should fail with missing NWC URI parameters', async () => {
      const invalidParams = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey', // Missing relay and secret
        expirySec: 3600,
      };

      const result = await vincentAbility.execute(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('missing required parameters');
      }
    });

    it('should generate unique payment hashes for different requests', async () => {
      const params1 = {
        amountSat: 1000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const params2 = {
        amountSat: 2000,
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
      };

      const result1 = await vincentAbility.execute({ abilityParams: params1 }, validContext as any);

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await vincentAbility.execute({ abilityParams: params2 }, validContext as any);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        expect(result1.result.paymentHash).not.toBe(result2.result.paymentHash);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle precheck errors gracefully', async () => {
      const invalidParams = {
        amountSat: -1000,
        nwcUri: 'invalid-uri',
        expirySec: 10,
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toBeDefined();
        expect(result.result.reason).toBeDefined();
      }
    });

    it('should handle execute errors gracefully', async () => {
      const invalidParams = {
        amountSat: 1000,
        nwcUri: 'invalid-uri-format',
        expirySec: 3600,
      };

      const result = await vincentAbility.execute(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toBeDefined();
        expect(result.result.reason).toBe('INVOICE_CREATION_FAILED');
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical rebalancing amount (20% of 0.01 BTC)', async () => {
      const rebalanceParams = {
        amountSat: 200000, // 20% of 0.01 BTC in sats
        nwcUri: 'nostr+walletconnect://test-pubkey?relay=wss://relay.test.com&secret=test-secret',
        expirySec: 3600,
        description: 'HLV Protocol: Rebalance 20% of wBTC',
      };

      const precheckResult = await vincentAbility.precheck(
        { abilityParams: rebalanceParams },
        validContext as any,
      );

      expect(precheckResult.success).toBe(true);

      const executeResult = await vincentAbility.execute(
        { abilityParams: rebalanceParams },
        validContext as any,
      );

      expect(executeResult.success).toBe(true);
      if (executeResult.success) {
        expect(executeResult.result.amountSat).toBe(200000);
        expect(executeResult.result.paymentHash).toBeDefined();
      }
    });
  });
});
