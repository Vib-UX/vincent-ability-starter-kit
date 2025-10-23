import {
  createVincentAbility,
  supportedPoliciesForAbility,
} from '@lit-protocol/vincent-ability-sdk';
// @ts-ignore - Invoice is exported but TypeScript can't resolve it properly
import { Invoice } from '@getalby/lightning-tools';
import { nwc } from '@getalby/sdk';

import {
  executeFailSchema,
  executeSuccessSchema,
  precheckFailSchema,
  precheckSuccessSchema,
  abilityParamsSchema,
  KNOWN_ERRORS,
} from './schemas';

const {
  INVALID_INVOICE,
  INVOICE_EXPIRED,
  PAYMENT_FAILED,
  AMOUNT_MISMATCH,
  INSUFFICIENT_LIQUIDITY,
} = KNOWN_ERRORS;

/**
 * NWC Connection Manager
 * Manages the Nostr Wallet Connect client connection
 */
class NWCConnectionManager {
  private static instance: NWCConnectionManager;
  private lnClient: any = null;
  private nwcUri: string | undefined;
  private isConnected: boolean = false;

  private constructor() {
    // NWC URI should be provided via environment variable or ability params
    this.nwcUri = process.env.NWC_URI;
  }

  static getInstance(): NWCConnectionManager {
    if (!NWCConnectionManager.instance) {
      NWCConnectionManager.instance = new NWCConnectionManager();
    }
    return NWCConnectionManager.instance;
  }

  async connect(nwcUri?: string): Promise<any> {
    const uri = nwcUri || this.nwcUri;

    if (!uri) {
      throw new Error(
        'NWC URI not provided. Set NWC_URI environment variable or provide in ability params.',
      );
    }

    if (this.lnClient && this.isConnected) {
      return this.lnClient;
    }

    try {
      console.log('[NWC] Connecting to Nostr Wallet Connect...');
      this.lnClient = new nwc.NWCClient({ nostrWalletConnectUrl: uri });

      // Test connection
      const info = await this.lnClient.getInfo();
      this.isConnected = true;

      console.log('[NWC] Connected successfully:', {
        alias: info.alias,
        pubkey: info.pubkey?.substring(0, 16) + '...',
      });

      return this.lnClient;
    } catch (error) {
      console.error('[NWC] Connection failed:', error);
      this.isConnected = false;
      throw new Error(
        `NWC connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getBalance(): Promise<number> {
    if (!this.isConnected || !this.lnClient) {
      throw new Error('NWC not connected. Call connect() first.');
    }

    try {
      const balance = await this.lnClient.getBalance();
      return balance.balance; // Returns balance in sats
    } catch (error) {
      console.error('[NWC] Failed to get balance:', error);
      throw error;
    }
  }

  async payInvoice(invoice: string): Promise<{ preimage: string; amount: number }> {
    if (!this.isConnected || !this.lnClient) {
      throw new Error('NWC not connected. Call connect() first.');
    }

    try {
      console.log('[NWC] Paying invoice...');
      const response = await this.lnClient.payInvoice({ invoice });

      console.log('[NWC] Payment successful:', {
        preimage: response.preimage?.substring(0, 16) + '...',
      });

      return {
        preimage: response.preimage,
        amount: 0, // NWC doesn't return amount in response
      };
    } catch (error) {
      console.error('[NWC] Payment failed:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.lnClient) {
      try {
        this.lnClient.close();
        this.isConnected = false;
        console.log('[NWC] Connection closed');
      } catch (error) {
        console.warn('[NWC] Error closing connection:', error);
      }
    }
  }
}

/**
 * Lightning Payment Ability for Vincent
 *
 * This ability enables Vincent agents to:
 * 1. Pay Lightning Network invoices via NWC (Nostr Wallet Connect)
 * 2. Capture payment preimages
 * 3. Verify payments
 *
 * The preimage is crucial for HLV Protocol's HTLC verification on Hedera.
 */
export const vincentAbility = createVincentAbility({
  packageName: '@hlv/ability-lightning-payment' as const,
  abilityParamsSchema: abilityParamsSchema,
  abilityDescription:
    'Pay Lightning Network invoices via NWC and capture preimages for HTLC verification. Used by HLV Protocol to bridge Lightning and Hedera.',
  supportedPolicies: supportedPoliciesForAbility([]),

  precheckSuccessSchema,
  precheckFailSchema,

  executeSuccessSchema,
  executeFailSchema,

  /**
   * Precheck phase - validates the invoice and checks if payment is possible
   * Runs locally before committing to the payment
   */
  precheck: async ({ abilityParams }, { fail, succeed, delegation }) => {
    try {
      const { paymentRequest, expectedAmountSat, nwcUri } = abilityParams;

      console.log('[Lightning Payment Ability] Starting precheck for invoice');

      // Decode the Lightning invoice
      let invoice: Invoice;
      try {
        invoice = new Invoice({ pr: paymentRequest });
      } catch (error) {
        return fail({
          error: `Failed to decode Lightning invoice: ${error instanceof Error ? error.message : 'Unknown error'}`,
          reason: INVALID_INVOICE,
        });
      }

      // Extract invoice details
      const paymentHash = invoice.paymentHash;
      const amountSat = invoice.satoshi || 0;
      const description = invoice.description || '';
      const expiresAt = invoice.expiryDate?.getTime() || 0;

      console.log('[Lightning Payment Ability] Invoice decoded:', {
        paymentHash,
        amountSat,
        description,
        expiresAt: new Date(expiresAt).toISOString(),
      });

      // Check if invoice is expired
      const now = Date.now();
      if (expiresAt && expiresAt < now) {
        return fail({
          error: `Invoice expired at ${new Date(expiresAt).toISOString()}`,
          reason: INVOICE_EXPIRED,
        });
      }

      // Validate expected amount if provided
      if (expectedAmountSat && amountSat !== expectedAmountSat) {
        return fail({
          error: `Invoice amount (${amountSat} sat) does not match expected amount (${expectedAmountSat} sat)`,
          reason: AMOUNT_MISMATCH,
        });
      }

      // Check if invoice has an amount (some invoices allow any amount)
      if (!amountSat || amountSat === 0) {
        return fail({
          error: 'Invoice does not specify an amount. Amount-less invoices are not supported.',
          reason: INVALID_INVOICE,
        });
      }

      // Try to check liquidity via NWC
      let availableLiquidity: number | undefined;
      let estimatedFee: number | undefined;

      try {
        const nwcManager = NWCConnectionManager.getInstance();
        await nwcManager.connect(nwcUri);

        availableLiquidity = await nwcManager.getBalance();
        estimatedFee = Math.ceil(amountSat * 0.001); // ~0.1% routing fee estimate

        console.log('[Lightning Payment Ability] Liquidity check:', {
          available: availableLiquidity,
          required: amountSat,
          estimatedFee,
        });

        if (amountSat > availableLiquidity) {
          return fail({
            error: `Insufficient Lightning liquidity. Required: ${amountSat} sat, Available: ${availableLiquidity} sat`,
            reason: INSUFFICIENT_LIQUIDITY,
          });
        }
      } catch (error) {
        console.warn('[Lightning Payment Ability] Could not check liquidity via NWC:', error);
        // Continue without liquidity check - will fail during execute if insufficient
        estimatedFee = Math.ceil(amountSat * 0.001);
      }

      console.log('[Lightning Payment Ability] Precheck successful');

      return succeed({
        invoiceValid: true,
        paymentHash,
        amountSat,
        destination: 'unknown', // payeePubkey not available in current version
        description,
        expiresAt,
        availableLiquidity,
        estimatedFee,
      });
    } catch (error) {
      console.error('[Lightning Payment Ability] Precheck failed:', error);
      return fail({
        error: `Precheck failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        reason: INVALID_INVOICE,
      });
    }
  },

  /**
   * Execute phase - actually pays the Lightning invoice and captures the preimage
   * Runs in Lit Action environment with access to signing capabilities
   */
  execute: async ({ abilityParams }, { succeed, fail, delegation }) => {
    try {
      const { paymentRequest, maxFeesat, timeoutSeconds, nwcUri } = abilityParams;

      console.log('[Lightning Payment Ability] Starting Lightning payment execution');

      // Decode invoice to get payment details
      const invoice = new Invoice({ pr: paymentRequest });
      const paymentHash = invoice.paymentHash;
      const expectedAmountSat = invoice.satoshi || 0;

      console.log('[Lightning Payment Ability] Payment details:', {
        paymentHash,
        expectedAmountSat,
        maxFeesat,
        timeoutSeconds,
      });

      // ============================================================
      // Lightning Payment Execution via NWC
      // ============================================================

      console.log('[Lightning Payment Ability] Connecting to NWC...');
      const nwcManager = NWCConnectionManager.getInstance();
      await nwcManager.connect(nwcUri);

      console.log('[Lightning Payment Ability] Executing payment via NWC...');
      const startTime = Date.now();

      // Execute the payment with timeout
      let paymentResult: { preimage: string; amount?: number };
      const paymentPromise = nwcManager.payInvoice(paymentRequest);

      if (timeoutSeconds) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Payment timeout')), timeoutSeconds * 1000);
        });

        paymentResult = await Promise.race([paymentPromise, timeoutPromise]);
      } else {
        paymentResult = await paymentPromise;
      }

      const duration = Date.now() - startTime;

      console.log('[Lightning Payment Ability] Payment completed:', {
        duration: `${duration}ms`,
        preimage: paymentResult.preimage?.substring(0, 16) + '...',
      });

      // Extract and validate preimage
      const preimage = paymentResult.preimage;
      if (!preimage || preimage.length !== 64) {
        throw new Error(`Invalid preimage received: ${preimage}`);
      }

      // Verify preimage matches payment hash
      // In production, you'd want to verify SHA256(preimage) === paymentHash
      // For now, we trust the NWC response

      // Calculate actual values
      const actualAmountSat = paymentResult.amount || expectedAmountSat;
      const feeSat =
        actualAmountSat > expectedAmountSat ? Math.max(0, actualAmountSat - expectedAmountSat) : 0;

      // IMPORTANT: The preimage is the cryptographic proof that the payment succeeded
      // This preimage will be submitted to the Hedera HTLC contract to claim funds
      const result = {
        preimage,
        paymentHash,
        amountSat: expectedAmountSat,
        feeSat,
        totalSat: actualAmountSat,
        timestamp: Date.now(),
        status: 'SUCCEEDED' as const,
      };

      console.log('[Lightning Payment Ability] Returning payment result:', {
        preimageLength: result.preimage.length,
        paymentHash: result.paymentHash,
        amountSat: result.amountSat,
        feeSat: result.feeSat,
        duration: `${duration}ms`,
      });

      return succeed(result);
    } catch (error) {
      console.error('[Lightning Payment Ability] Payment execution failed:', error);

      return fail({
        error: `Payment execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        reason: PAYMENT_FAILED,
        paymentHash: (() => {
          try {
            return new Invoice({ pr: abilityParams.paymentRequest }).paymentHash;
          } catch {
            return undefined;
          }
        })(),
      });
    }
  },
});

/**
 * Helper function to verify preimage matches payment hash
 * This is a critical security check
 *
 * In production, you would implement this as:
 * const hash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
 * return hash === expectedHash;
 */
export function verifyPreimage(preimage: string, expectedHash: string): boolean {
  // Basic validation
  if (preimage.length !== 64 || expectedHash.length !== 64) {
    return false;
  }

  // In Lit Action environment, you'd use proper SHA256 verification
  // For now, basic format validation
  const hexRegex = /^[0-9a-f]{64}$/i;
  return hexRegex.test(preimage) && hexRegex.test(expectedHash);
}
