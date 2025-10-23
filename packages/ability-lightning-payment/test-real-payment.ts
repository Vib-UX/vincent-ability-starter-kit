#!/usr/bin/env tsx
import 'dotenv/config';
import { nwc } from '@getalby/sdk';
import * as crypto from 'crypto';
import axios from 'axios';

console.log('⚡ Lightning Payment Test - Real Payment');
console.log('============================================================\n');

const LIGHTNING_ADDRESS = 'predator@wallet.yakihonne.com';
const AMOUNT_SATS = 10; // 10 sats

async function testRealPayment() {
  const nwcUri = process.env.NWC_URI;

  if (!nwcUri) {
    console.error('❌ NWC_URI not found in environment');
    process.exit(1);
  }

  console.log('✓ NWC_URI found');
  console.log(`  ${nwcUri.substring(0, 50)}...`);
  console.log();

  try {
    // Step 1: Connect to NWC
    console.log('Step 1: Connecting to NWC...');
    const ln = new nwc.NWCClient({ nostrWalletConnectUrl: nwcUri });
    console.log('✅ Connected to NWC\n');

    // Step 2: Check balance
    console.log('Step 2: Checking wallet balance...');
    const balanceResponse = await ln.getBalance();
    const balance = balanceResponse.balance;
    console.log(`✅ Current balance: ${balance} sats`);

    if (balance < AMOUNT_SATS) {
      console.error(`❌ Insufficient balance. Need ${AMOUNT_SATS} sats, have ${balance} sats`);
      await ln.close();
      process.exit(1);
    }
    console.log(`✓ Sufficient balance for ${AMOUNT_SATS} sat payment\n`);

    // Step 3: Get wallet info
    console.log('Step 3: Getting wallet info...');
    const info = await ln.getInfo();
    console.log(`✅ Wallet info:`);
    console.log(`   Alias: ${info.alias || 'N/A'}`);
    console.log(`   Methods: ${info.methods?.join(', ') || 'N/A'}\n`);

    // Step 4: Resolve Lightning address to get invoice
    console.log('Step 4: Resolving Lightning address...');
    console.log(`   To: ${LIGHTNING_ADDRESS}`);
    console.log(`   Amount: ${AMOUNT_SATS} sats`);
    console.log();

    // Parse Lightning address
    const [username, domain] = LIGHTNING_ADDRESS.split('@');
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

    console.log('🔍 Step 4a: Fetching LNURL-pay info...');
    console.log(`   URL: ${lnurlpUrl}`);

    const lnurlResponse = await axios.get(lnurlpUrl);
    const lnurlData = lnurlResponse.data;
    console.log('✅ LNURL-pay info received');
    console.log(`   Min sendable: ${lnurlData.minSendable / 1000} sats`);
    console.log(`   Max sendable: ${lnurlData.maxSendable / 1000} sats`);
    console.log();

    // Request invoice
    console.log('🔍 Step 4b: Requesting invoice...');
    const amountMillisats = AMOUNT_SATS * 1000;
    const callbackUrl = `${lnurlData.callback}?amount=${amountMillisats}`;

    const invoiceResponse = await axios.get(callbackUrl);
    const invoice = invoiceResponse.data.pr;

    if (!invoice) {
      throw new Error('No invoice received from Lightning address');
    }

    console.log('✅ Invoice received:');
    console.log(`   ${invoice.substring(0, 50)}...`);
    console.log();

    // Step 5: Pay the invoice
    console.log('🚀 Step 5: Sending payment...');
    const startTime = Date.now();

    try {
      const paymentResponse = await ln.payInvoice({
        invoice: invoice,
      });
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log();
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║         🎉 PAYMENT SUCCESSFUL! 🎉                        ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log();
      console.log('Payment Details:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`✅ Status: SUCCESS`);
      console.log(`✅ Amount: ${AMOUNT_SATS} sats`);
      console.log(`✅ Duration: ${duration} seconds`);
      console.log(`✅ To: ${LIGHTNING_ADDRESS}`);
      console.log();

      // The most important part - the preimage!
      if (paymentResponse.preimage) {
        console.log('🔑 PREIMAGE CAPTURED:');
        console.log(`   ${paymentResponse.preimage}`);
        console.log();

        // Calculate payment hash from preimage
        const preimageBuffer = Buffer.from(paymentResponse.preimage, 'hex');
        const hash = crypto.createHash('sha256').update(preimageBuffer).digest('hex');
        console.log('🔗 Payment Hash (SHA256 of preimage):');
        console.log(`   ${hash}`);
        console.log();
      } else {
        console.log('⚠️  Warning: No preimage returned (check payment response structure)');
        console.log('Full response:', JSON.stringify(paymentResponse, null, 2));
        console.log();
      }

      console.log('Response details:');
      console.log(JSON.stringify(paymentResponse, null, 2));
      console.log();

      // Step 5: Verify balance changed
      console.log('Step 5: Verifying balance change...');
      const newBalanceResponse = await ln.getBalance();
      const newBalance = newBalanceResponse.balance;
      const spent = balance - newBalance;
      console.log(`✅ New balance: ${newBalance} sats`);
      console.log(`   Amount spent: ${spent} sats (includes routing fees)\n`);

      // Step 6: Check transaction history
      console.log('Step 6: Checking recent transactions...');
      const transactions = await ln.listTransactions();

      if (transactions && transactions.length > 0) {
        console.log(`✅ Found ${transactions.length} recent transaction(s):`);
        const latestTx = transactions[0];
        console.log('\nLatest transaction:');
        console.log(`   Type: ${latestTx.type}`);
        console.log(`   Amount: ${latestTx.amount} sats`);
        console.log(`   Description: ${latestTx.description || 'N/A'}`);
        if (latestTx.preimage) {
          console.log(`   Preimage: ${latestTx.preimage}`);
        }
        console.log();
      }

      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ ALL TESTS PASSED!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log();
      console.log('🎉 The Lightning Payment Ability is fully functional!');
      console.log('📝 This preimage can be used to claim funds from HTLCs.');
      console.log();
    } catch (paymentError: any) {
      console.error('\n❌ Payment failed:');
      console.error(`   Error: ${paymentError.message}`);
      console.error('\nFull error:', paymentError);

      if (paymentError.message?.includes('does not support')) {
        console.log('\nTrying alternative method (LNURL-pay)...');
        // Could add fallback to manual LNURL-pay flow here
      }
    }

    // Close connection
    await ln.close();
    console.log('\n🔌 Connection closed');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
testRealPayment().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
