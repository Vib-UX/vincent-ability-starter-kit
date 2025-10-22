#!/bin/bash

# Deploy Test Token for Integration Testing
# Uses the same wallet as the contracts folder

set -e

echo "🪙 Deploying Test wBTC Token for Integration Tests"
echo "=================================================="
echo ""

# Get contract root directory
CONTRACTS_DIR="/Users/btc/HLV-Protocol/contracts"

# Check if contracts .env exists
if [ ! -f "$CONTRACTS_DIR/.env" ]; then
    echo "❌ Error: $CONTRACTS_DIR/.env not found"
    echo "Please create it first with HEDERA_PRIVATE_KEY"
    exit 1
fi

# Source the contracts .env
source "$CONTRACTS_DIR/.env"

# Check if private key is set
if [ -z "$HEDERA_PRIVATE_KEY" ]; then
    echo "❌ Error: HEDERA_PRIVATE_KEY not set in $CONTRACTS_DIR/.env"
    exit 1
fi

echo "✅ Found private key in contracts/.env"
echo ""

# Deploy test token
echo "🚀 Deploying ERC20Mock (wBTC test token)..."
echo ""

cd "$CONTRACTS_DIR"

# Deploy using forge
forge create \
    lib/openzeppelin-contracts/contracts/mocks/token/ERC20Mock.sol:ERC20Mock \
    --rpc-url https://testnet.hashio.io/api \
    --private-key $HEDERA_PRIVATE_KEY \
    --constructor-args "Wrapped Bitcoin" "wBTC" \
    --legacy \
    --broadcast > /tmp/deploy_output.txt 2>&1

DEPLOY_OUTPUT=$(cat /tmp/deploy_output.txt)
echo "$DEPLOY_OUTPUT"

# Extract deployed address
TOKEN_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Deployed to:" | awk '{print $3}')

if [ -z "$TOKEN_ADDRESS" ]; then
    echo "❌ Deployment failed!"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "✅ Test Token Deployed Successfully!"
echo ""
echo "📍 Token Address: $TOKEN_ADDRESS"
echo ""

# Update integration test .env
INTEGRATION_ENV="/Users/btc/HLV-Protocol/vincent-ability-starter-kit/packages/ability-hedera-htlc/.env.integration.test"

echo "📝 Updating integration test configuration..."

# Update WBTC_TOKEN_ADDRESS in .env.integration.test
if grep -q "WBTC_TOKEN_ADDRESS=" "$INTEGRATION_ENV"; then
    # Update existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|WBTC_TOKEN_ADDRESS=.*|WBTC_TOKEN_ADDRESS=$TOKEN_ADDRESS|" "$INTEGRATION_ENV"
    else
        sed -i "s|WBTC_TOKEN_ADDRESS=.*|WBTC_TOKEN_ADDRESS=$TOKEN_ADDRESS|" "$INTEGRATION_ENV"
    fi
else
    # Add new line
    echo "WBTC_TOKEN_ADDRESS=$TOKEN_ADDRESS" >> "$INTEGRATION_ENV"
fi

# Copy private key if not already set
if ! grep -q "HEDERA_TESTNET_PRIVATE_KEY=$HEDERA_PRIVATE_KEY" "$INTEGRATION_ENV"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|HEDERA_TESTNET_PRIVATE_KEY=.*|HEDERA_TESTNET_PRIVATE_KEY=$HEDERA_PRIVATE_KEY|" "$INTEGRATION_ENV"
    else
        sed -i "s|HEDERA_TESTNET_PRIVATE_KEY=.*|HEDERA_TESTNET_PRIVATE_KEY=$HEDERA_PRIVATE_KEY|" "$INTEGRATION_ENV"
    fi
fi

echo "✅ Configuration updated!"
echo ""

# Mint some test tokens
echo "🪙 Minting test tokens to your wallet..."

WALLET_ADDRESS=$(cast wallet address $HEDERA_PRIVATE_KEY)
MINT_AMOUNT="1000000000000000000" # 10 wBTC (18 decimals)

cast send $TOKEN_ADDRESS \
    "mint(address,uint256)" \
    $WALLET_ADDRESS \
    $MINT_AMOUNT \
    --rpc-url https://testnet.hashio.io/api \
    --private-key $HEDERA_PRIVATE_KEY \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Minted 10 wBTC to $WALLET_ADDRESS"
else
    echo "⚠️  Warning: Could not mint tokens automatically"
    echo "You may need to mint them manually"
fi

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✅ SETUP COMPLETE - READY FOR INTEGRATION TESTS!     ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Configuration:"
echo "   Token Address: $TOKEN_ADDRESS"
echo "   Wallet: $WALLET_ADDRESS"
echo "   HTLC Contract: 0x22daf30c7b4450Dd5C1b7b58CC5986F46ED36A4f"
echo ""
echo "🚀 Run Integration Tests:"
echo "   cd /Users/btc/HLV-Protocol/vincent-ability-starter-kit/packages/ability-hedera-htlc"
echo "   pnpm test:integration"
echo ""
echo "🔗 View on Hashscan:"
echo "   https://hashscan.io/testnet/token/$TOKEN_ADDRESS"
echo ""

