const { config } = require('@dotenvx/dotenvx');
const path = require('path');
const fs = require('fs');

// Load integration test environment variables
const envPath = path.join(__dirname, '.env.integration.test');

if (!process.env['NX_LOAD_DOT_ENV_FILES']) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
  } else {
    console.warn(`⚠️  Warning: ${envPath} not found`);
  }
}

// Global test timeout for integration tests (blockchain operations are slow)
jest.setTimeout(180000); // 3 minutes

console.log('\n🧪 Integration Test Configuration');
console.log('================================');
console.log(`RPC: ${process.env.HEDERA_TESTNET_RPC || '⚠️  Not set - using default'}`);
console.log(`Chain ID: ${process.env.HEDERA_CHAIN_ID || '⚠️  Not set - using default'}`);
console.log(`HTLC Contract: ${process.env.HTLC_CONTRACT_ADDRESS || '⚠️  Not set'}`);
console.log(`wBTC Token: ${process.env.WBTC_TOKEN_ADDRESS || '⚠️  Not set'}`);
console.log(
  `Wallet: ${process.env.HEDERA_TESTNET_PRIVATE_KEY ? '✓ Set (' + process.env.HEDERA_TESTNET_PRIVATE_KEY.substring(0, 6) + '...)' : '✗ Not set'}`,
);
console.log('================================\n');
