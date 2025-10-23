import {
  createVincentAbility,
  supportedPoliciesForAbility,
} from '@lit-protocol/vincent-ability-sdk';

// @ts-ignore - LightningAddress is available at runtime in Lit Actions
import { LightningAddress } from '@getalby/lightning-tools';
import { nwc } from '@getalby/sdk';

import {
  abilityParamsSchema,
  precheckSuccessSchema,
  precheckFailSchema,
  executeSuccessSchema,
  executeFailSchema,
  KNOWN_ERRORS,
} from './schemas.js';

const { NWC_CONNECTION_FAILED, INVALID_AMOUNT, INVOICE_CREATION_FAILED } = KNOWN_ERRORS;

/**
 * Lightning Invoice Creation Ability
 *
 * Creates Lightning Network invoices via NWC (Nostr Wallet Connect)
 * Used by HLV Protocol to generate invoices for the rebalancing flow:
 *
 * Flow:
 * 1. User clicks "Rebalance" with 20% of their wBTC
 * 2. This ability creates LN invoice for equivalent amount
 * 3. Returns payment hash to use for HTLC creation
 * 4. Agent monitors for payment and captures preimage
 */
export const vincentAbility = createVincentAbility({
  packageName: '@hlv/ability-lightning-invoice' as const,
  abilityParamsSchema: abilityParamsSchema,
  abilityDescription:
    'Create Lightning Network invoices via NWC (Nostr Wallet Connect). Returns payment hash for HTLC creation in HLV Protocol rebalancing flow.',
  supportedPolicies: supportedPoliciesForAbility([]),

  precheckSuccessSchema,
  precheckFailSchema,

  executeSuccessSchema,
  executeFailSchema,

  /**
   * Precheck phase - validates parameters and checks if invoice creation is possible
   */
  precheck: async ({ abilityParams }, { fail, succeed }) => {
    try {
      const { amountSat, nwcUri, expirySec } = abilityParams;

      console.log('[Lightning Invoice Ability] Starting precheck');
      console.log('[Lightning Invoice Ability] Amount:', amountSat, 'sats');

      // Validate amount (must be positive)
      if (amountSat <= 0) {
        return fail({
          error: 'Amount must be greater than 0',
          reason: INVALID_AMOUNT,
        });
      }

      // Validate NWC URI format
      if (!nwcUri.startsWith('nostr+walletconnect://')) {
        return fail({
          error: 'Invalid NWC URI format. Must start with nostr+walletconnect://',
          reason: NWC_CONNECTION_FAILED,
        });
      }

      // Validate expiry
      if (expirySec < 60) {
        return fail({
          error: 'Expiry must be at least 60 seconds',
          reason: INVALID_AMOUNT,
        });
      }

      // TODO: Check if NWC connection supports make_invoice
      // This would require actual NWC connection which we'll do in execute
      console.log('[Lightning Invoice Ability] Precheck passed');

      return succeed({
        amountSat,
        canReceive: true,
        estimatedFee: 0, // Invoice creation has no fees
      });
    } catch (error) {
      console.error('[Lightning Invoice Ability] Precheck error:', error);
      return fail({
        error: error instanceof Error ? error.message : 'Unknown precheck error',
        reason: NWC_CONNECTION_FAILED,
      });
    }
  },

  /**
   * Execute phase - creates the Lightning invoice via NWC or Lightning Address
   */
  execute: async ({ abilityParams }, { succeed, fail, delegation }) => {
    try {
      const { amountSat, description, expirySec, nwcUri } = abilityParams;
      const { ethAddress: userAddress } = delegation.delegatorPkpInfo;

      console.log('[Lightning Invoice Ability] Creating invoice...');
      console.log('[Lightning Invoice Ability] User:', userAddress);
      console.log('[Lightning Invoice Ability] Amount:', amountSat, 'sats');
      console.log('[Lightning Invoice Ability] Description:', description);

      // Parse NWC URI
      // Format: nostr+walletconnect://pubkey?relay=wss://relay.url&secret=xxx
      const nwcUrl = new URL(nwcUri);
      if (nwcUrl.protocol !== 'nostr+walletconnect:') {
        throw new Error('Invalid NWC URI protocol');
      }

      const walletPubkey = nwcUrl.hostname || nwcUrl.pathname.replace('//', '');
      const relayUrl = nwcUrl.searchParams.get('relay');
      const secret = nwcUrl.searchParams.get('secret');

      if (!walletPubkey || !relayUrl || !secret) {
        throw new Error('NWC URI missing required parameters');
      }

      console.log('[Lightning Invoice Ability] NWC Wallet pubkey:', walletPubkey);
      console.log('[Lightning Invoice Ability] Nostr relay:', relayUrl);

      // Connect to NWC to get wallet info
      const nwcClient = new nwc.NWCClient({ nostrWalletConnectUrl: nwcUri });
      const info = await nwcClient.getInfo();

      console.log('[Lightning Invoice Ability] NWC connected:', {
        alias: info.alias,
        pubkey: info.pubkey?.substring(0, 16) + '...',
      });

      // Try to get Lightning Address from NWC metadata
      // Method 1: Check if lud16 is in the NWC URI params
      let lightningAddress = nwcUrl.searchParams.get('lud16') || info.alias;

      // Check if we have a valid Lightning Address format (user@domain)
      if (lightningAddress && lightningAddress.includes('@')) {
        console.log('[Lightning Invoice Ability] Using Lightning Address:', lightningAddress);

        // Use Lightning Address API to create invoice
        const ln = new LightningAddress(lightningAddress);
        await ln.fetch();

        const invoice = await ln.requestInvoice({
          satoshi: amountSat,
          comment: description || `HLV Protocol rebalance: ${amountSat} sats`,
        });

        console.log('[Lightning Invoice Ability] Real invoice created successfully');
        console.log('[Lightning Invoice Ability] Payment hash:', invoice.paymentHash);
        console.log('[Lightning Invoice Ability] Payment request:', invoice.paymentRequest);

        const expiresAt = Math.floor(Date.now() / 1000) + expirySec;

        return succeed({
          paymentRequest: invoice.paymentRequest,
          paymentHash: invoice.paymentHash,
          amountSat,
          description: description || `HLV Protocol rebalance: ${amountSat} sats`,
          expiresAt,
        });
      }

      // If no Lightning Address, try to create invoice directly via NWC makeInvoice
      console.log('[Lightning Invoice Ability] No Lightning Address found, trying NWC makeInvoice');

      try {
        const makeInvoiceResponse = await nwcClient.makeInvoice({
          amount: amountSat * 1000, // Convert sats to msats
          description: description || `HLV Protocol rebalance: ${amountSat} sats`,
        });

        console.log('[Lightning Invoice Ability] Invoice created via NWC makeInvoice');
        console.log('[Lightning Invoice Ability] Payment hash:', makeInvoiceResponse.payment_hash);
        console.log('[Lightning Invoice Ability] Payment request:', makeInvoiceResponse.invoice);

        const expiresAt = Math.floor(Date.now() / 1000) + expirySec;

        return succeed({
          paymentRequest: makeInvoiceResponse.invoice,
          paymentHash: '0x' + makeInvoiceResponse.payment_hash,
          amountSat,
          description: description || `HLV Protocol rebalance: ${amountSat} sats`,
          expiresAt,
        });
      } catch (makeInvoiceError) {
        console.error('[Lightning Invoice Ability] makeInvoice failed:', makeInvoiceError);
        throw new Error(
          `Failed to create invoice via NWC: ${makeInvoiceError instanceof Error ? makeInvoiceError.message : 'Unknown error'}`,
        );
      }
    } catch (error) {
      console.error('[Lightning Invoice Ability] Execute error:', error);
      return fail({
        error: error instanceof Error ? error.message : 'Unknown execution error',
        reason: INVOICE_CREATION_FAILED,
      });
    }
  },
});

export default vincentAbility;
