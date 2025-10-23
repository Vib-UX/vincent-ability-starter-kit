#!/usr/bin/env tsx
/**
 * NWC Connection Test Script
 *
 * This script tests your NWC connection to ensure it's working properly.
 *
 * Usage:
 *   1. Set NWC_URI environment variable
 *   2. Run: pnpm tsx test-nwc-connection.ts
 */

import { nwc } from '@getalby/sdk';
import { config } from '@dotenvx/dotenvx';
import path from 'path';

// Load environment variables
config({ path: path.join(__dirname, '.env') });

async function testNWCConnection() {
  console.log('🔌 NWC Connection Test');
  console.log('='.repeat(60));

  const nwcUri = process.env.NWC_URI;

  if (!nwcUri) {
    console.error('❌ NWC_URI environment variable not set!');
    console.log('\nPlease set NWC_URI in your .env file:');
    console.log('  NWC_URI="nostr+walletconnect://..."');
    process.exit(1);
  }

  console.log('✓ NWC_URI found');
  console.log(`  ${nwcUri.substring(0, 50)}...`);
  console.log();

  let ln: any;

  try {
    // Test 1: Connect to NWC
    console.log('Test 1: Connecting to NWC...');
    ln = new nwc.NWCClient({ nostrWalletConnectUrl: nwcUri });
    console.log('✅ NWC client created');
    console.log();

    // Test 2: Get wallet info
    console.log('Test 2: Getting wallet info...');
    const info = await ln.getInfo();
    console.log('✅ Wallet info retrieved:');
    console.log(`  Alias: ${info.alias}`);
    console.log(`  Pubkey: ${info.pubkey?.substring(0, 16)}...`);
    console.log();

    // Test 3: Get balance
    console.log('Test 3: Getting wallet balance...');
    const balance = await ln.getBalance();
    console.log('✅ Balance retrieved:');
    console.log(`  Balance: ${balance.balance.toLocaleString()} sats`);
    console.log();

    // Test 4: Create test invoice (optional)
    console.log('Test 4: Creating test invoice...');
    try {
      const invoice = await ln.makeInvoice({
        amount: 1000, // 1 sat in millisats
        description: 'HLV Protocol test invoice',
      });
      console.log('✅ Test invoice created:');
      console.log(`  Invoice: ${invoice.invoice.substring(0, 40)}...`);
      console.log(`  Amount: 1 sat`);
    } catch (error) {
      console.log('⚠️  Invoice creation not supported by this wallet');
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
    console.log();

    // Test 5: List recent transactions (optional)
    console.log('Test 5: Listing recent transactions...');
    try {
      const result = await ln.listTransactions({ limit: 5 });

      if (result.transactions && result.transactions.length > 0) {
        console.log(`✅ Found ${result.transactions.length} recent transaction(s):`);
        result.transactions.slice(0, 3).forEach((tx, i) => {
          console.log(`  ${i + 1}. ${tx.type || 'unknown'} - ${tx.amount} sats`);
        });
      } else {
        console.log('✅ No recent transactions (or not supported)');
      }
    } catch (error) {
      console.log('⚠️  Transaction list not supported by this wallet');
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log();
    console.log('Your NWC connection is working correctly.');
    console.log('You can now use it with the Lightning Payment Ability.');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Connection test failed!');
    console.error();

    if (error instanceof Error) {
      console.error('Error:', error.message);

      if (error.message.includes('relay')) {
        console.error('\nPossible issues:');
        console.error('  - Relay server is down or unreachable');
        console.error('  - Firewall blocking WebSocket connections');
        console.error('  - Invalid relay URL in NWC URI');
      } else if (error.message.includes('secret') || error.message.includes('auth')) {
        console.error('\nPossible issues:');
        console.error('  - Invalid or expired secret in NWC URI');
        console.error('  - Connection was revoked in wallet');
        console.error('  - Wrong NWC URI format');
      } else {
        console.error('\nDebug info:');
        console.error(error.stack);
      }
    }

    console.error();
    console.error('Troubleshooting:');
    console.error('  1. Verify your NWC URI is correct');
    console.error('  2. Check that the connection is active in your wallet');
    console.error('  3. Try creating a new NWC connection');
    console.error('  4. Ensure relay server is accessible');

    process.exit(1);
  } finally {
    // Cleanup
    if (ln) {
      try {
        ln.close();
        console.log('Connection closed');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// Run the test
testNWCConnection().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
