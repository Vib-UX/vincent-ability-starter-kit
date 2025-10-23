const { config } = require('@dotenvx/dotenvx');
const path = require('path');

// Load E2E test environment variables
if (!process.env['NX_LOAD_DOT_ENV_FILES']) {
  config({ path: path.join(__dirname, './.env.e2e') });
}

console.log('\n🧪 E2E Test Environment Loaded');
console.log('================================');
console.log(`Network: ${process.env.HEDERA_RPC_URL ? 'Hedera Testnet' : '⚠️  Not configured'}`);
console.log(`HTLC Contract: ${process.env.HTLC_CONTRACT_ADDRESS || '⚠️  Not set'}`);
console.log(`wBTC Token: ${process.env.WBTC_TOKEN_ADDRESS || '⚠️  Not set'}`);
console.log(`NWC configured: ${process.env.NWC_URI ? '✓ Yes' : '⚠️  No (will use mock)'}`);
console.log('================================\n');
