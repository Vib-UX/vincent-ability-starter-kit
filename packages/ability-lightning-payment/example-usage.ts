/**
 * Lightning Payment Ability - Usage Examples
 * 
 * This file demonstrates how to use the Lightning Payment Ability
 * with NWC (Nostr Wallet Connect) for the HLV Protocol.
 */

import { vincentAbility as lightningAbility } from './src/lib/vincent-ability';
import type { AbilityParams } from './src/lib/schemas';

// ============================================================
// Example 1: Basic Invoice Payment
// ============================================================

async function example1_basicPayment() {
  console.log('Example 1: Basic Invoice Payment\n');

  const invoice = 'lnbc1500n1...'; // Your Lightning invoice
  
  const result = await lightningAbility.execute(
    { 
      abilityParams: {
        paymentRequest: invoice,
        maxFeesat: 10,
        timeoutSeconds: 60,
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any, // Provided by Vincent runtime
    }
  );

  if (result.status === 'success') {
    console.log('✅ Payment successful!');
    console.log('Preimage:', result.data.preimage);
    console.log('Amount:', result.data.amountSat, 'sats');
    console.log('Fee:', result.data.feeSat, 'sats');
  } else {
    console.error('❌ Payment failed:', result.data.error);
  }
}

// ============================================================
// Example 2: Payment with Validation
// ============================================================

async function example2_paymentWithValidation() {
  console.log('\nExample 2: Payment with Validation\n');

  const invoice = 'lnbc1500n1...';
  const expectedAmount = 150; // Expected amount in sats
  
  // Step 1: Precheck (validate invoice)
  const precheckResult = await lightningAbility.precheck(
    {
      abilityParams: {
        paymentRequest: invoice,
        expectedAmountSat: expectedAmount,
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any,
    }
  );

  if (precheckResult.status === 'fail') {
    console.error('❌ Invoice validation failed:', precheckResult.data.error);
    return;
  }

  console.log('✅ Invoice validated:');
  console.log('  Amount:', precheckResult.data.amountSat, 'sats');
  console.log('  Payment Hash:', precheckResult.data.paymentHash);
  console.log('  Expires:', new Date(precheckResult.data.expiresAt).toISOString());
  console.log('  Available Liquidity:', precheckResult.data.availableLiquidity, 'sats');

  // Step 2: Execute payment
  const paymentResult = await lightningAbility.execute(
    {
      abilityParams: {
        paymentRequest: invoice,
        expectedAmountSat: expectedAmount,
        maxFeesat: 10,
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any,
    }
  );

  if (paymentResult.status === 'success') {
    console.log('\n✅ Payment executed successfully!');
    console.log('Preimage:', paymentResult.data.preimage);
  }
}

// ============================================================
// Example 3: HLV Protocol HTLC Integration
// ============================================================

interface HTLCLock {
  id: string;
  amount: number;
  lightningInvoice: string;
  paymentHash: string;
  timelock: number;
  userAddress: string;
}

async function example3_htlcIntegration(lock: HTLCLock) {
  console.log('\nExample 3: HLV Protocol HTLC Integration\n');
  console.log('Processing HTLC lock:', lock.id);

  // Step 1: Validate invoice matches HTLC
  const precheckResult = await lightningAbility.precheck(
    {
      abilityParams: {
        paymentRequest: lock.lightningInvoice,
        expectedAmountSat: lock.amount,
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any,
    }
  );

  if (precheckResult.status === 'fail') {
    console.error('❌ HTLC validation failed:', precheckResult.data.error);
    return;
  }

  // Verify payment hash matches
  if (precheckResult.data.paymentHash !== lock.paymentHash) {
    console.error('❌ Payment hash mismatch!');
    return;
  }

  console.log('✅ HTLC validation passed');
  console.log('  HTLC Amount:', lock.amount, 'sats');
  console.log('  Invoice Amount:', precheckResult.data.amountSat, 'sats');
  console.log('  Payment Hash:', lock.paymentHash);

  // Step 2: Pay the Lightning invoice
  const paymentResult = await lightningAbility.execute(
    {
      abilityParams: {
        paymentRequest: lock.lightningInvoice,
        expectedAmountSat: lock.amount,
        maxFeesat: calculateMaxFee(lock.amount),
        timeoutSeconds: 60,
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any,
    }
  );

  if (paymentResult.status === 'fail') {
    console.error('❌ Lightning payment failed:', paymentResult.data.error);
    return;
  }

  console.log('\n✅ Lightning payment successful!');
  console.log('Preimage:', paymentResult.data.preimage);

  // Step 3: Submit preimage to Hedera HTLC to claim wBTC
  await submitToHederaHTLC({
    lockId: lock.id,
    preimage: paymentResult.data.preimage,
    paymentHash: lock.paymentHash,
  });

  console.log('✅ HTLC claimed! Swap complete.');
}

// ============================================================
// Example 4: Custom NWC Connection
// ============================================================

async function example4_customNWCConnection() {
  console.log('\nExample 4: Custom NWC Connection\n');

  // Use a specific NWC connection instead of environment variable
  const customNwcUri = 'nostr+walletconnect://pubkey?relay=wss://relay.com&secret=xxx';
  
  const result = await lightningAbility.execute(
    {
      abilityParams: {
        paymentRequest: 'lnbc1500n1...',
        maxFeesat: 10,
        nwcUri: customNwcUri, // Custom NWC connection
      }
    },
    {
      succeed: (data) => ({ status: 'success' as const, data }),
      fail: (error) => ({ status: 'fail' as const, data: error }),
      delegation: {} as any,
    }
  );

  if (result.status === 'success') {
    console.log('✅ Payment with custom NWC successful!');
  }
}

// ============================================================
// Example 5: Error Handling
// ============================================================

async function example5_errorHandling() {
  console.log('\nExample 5: Error Handling\n');

  const invoice = 'lnbc1500n1...';
  
  try {
    const result = await lightningAbility.execute(
      {
        abilityParams: {
          paymentRequest: invoice,
          maxFeesat: 10,
          timeoutSeconds: 30,
        }
      },
      {
        succeed: (data) => ({ status: 'success' as const, data }),
        fail: (error) => ({ status: 'fail' as const, data: error }),
        delegation: {} as any,
      }
    );

    if (result.status === 'fail') {
      // Handle different error types
      switch (result.data.reason) {
        case 'PAYMENT_FAILED':
          console.error('Payment failed - possibly no route or insufficient liquidity');
          // Retry logic here
          break;
        
        case 'NO_ROUTE_FOUND':
          console.error('No route to destination');
          // Try different routing parameters or notify user
          break;
        
        case 'INSUFFICIENT_LIQUIDITY':
          console.error('Not enough funds in wallet');
          // Alert to fund wallet
          break;
        
        default:
          console.error('Unknown error:', result.data.error);
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// ============================================================
// Helper Functions
// ============================================================

function calculateMaxFee(amountSat: number): number {
  // Calculate maximum fee based on amount
  // Base fee + 1% of amount, capped at 1000 sats
  const baseFee = 10;
  const percentageFee = Math.ceil(amountSat * 0.01);
  return Math.min(baseFee + percentageFee, 1000);
}

async function submitToHederaHTLC(params: {
  lockId: string;
  preimage: string;
  paymentHash: string;
}): Promise<void> {
  // Mock function - in production, this would interact with Hedera smart contract
  console.log('\n📝 Submitting to Hedera HTLC:');
  console.log('  Lock ID:', params.lockId);
  console.log('  Preimage:', params.preimage.substring(0, 16) + '...');
  console.log('  Payment Hash:', params.paymentHash.substring(0, 16) + '...');
  
  // Example Hedera smart contract call:
  // await hederaContract.claimFunds({
  //   lockId: params.lockId,
  //   preimage: params.preimage,
  //   signature: await signWithAgentWallet(params.preimage),
  // });
}

// ============================================================
// Run Examples
// ============================================================

async function main() {
  console.log('=' .repeat(60));
  console.log('Lightning Payment Ability - Usage Examples');
  console.log('=' .repeat(60));

  // Uncomment to run examples:
  // await example1_basicPayment();
  // await example2_paymentWithValidation();
  
  // Example HTLC lock
  const mockHTLCLock: HTLCLock = {
    id: 'htlc_123',
    amount: 150,
    lightningInvoice: 'lnbc1500n1...',
    paymentHash: 'a'.repeat(64),
    timelock: Date.now() + 3600000,
    userAddress: '0x123...',
  };
  // await example3_htlcIntegration(mockHTLCLock);
  
  // await example4_customNWCConnection();
  // await example5_errorHandling();

  console.log('\n' + '='.repeat(60));
  console.log('Examples complete!');
  console.log('='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_basicPayment,
  example2_paymentWithValidation,
  example3_htlcIntegration,
  example4_customNWCConnection,
  example5_errorHandling,
};

