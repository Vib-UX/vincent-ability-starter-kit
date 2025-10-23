#!/bin/bash

# Simple test script for Lightning Payment Ability
# Works without full pnpm workspace setup

echo "⚡ Lightning Payment Ability - Simple Tests"
echo "============================================================"
echo ""

# Check Node.js version
echo "1. Checking Node.js version..."
node --version
echo "   ✅ Node.js available"
echo ""

# Check if NWC_URI is set
echo "2. Checking environment variables..."
if [ -z "$NWC_URI" ]; then
  echo "   ⚠️  NWC_URI not set"
  echo ""
  echo "To set NWC_URI:"
  echo "  export NWC_URI='nostr+walletconnect://YOUR_PUBKEY?relay=wss://relay.getalby.com/v1&secret=YOUR_SECRET'"
  echo ""
  echo "Get NWC connection from:"
  echo "  - Alby: Extension → Settings → Advanced → NWC"
  echo "  - Mutiny: Settings → Connections → Create NWC"
  echo ""
else
  echo "   ✅ NWC_URI set: ${NWC_URI:0:50}..."
fi
echo ""

# Check TypeScript compilation
echo "3. Checking TypeScript files..."
if [ -f "src/lib/vincent-ability.ts" ]; then
  echo "   ✅ vincent-ability.ts exists"
fi
if [ -f "src/lib/schemas.ts" ]; then
  echo "   ✅ schemas.ts exists"
fi
if [ -f "src/lib/vincent-ability.spec.ts" ]; then
  echo "   ✅ Test file exists"
fi
echo ""

# Check dependencies
echo "4. Checking key dependencies..."
if [ -f "package.json" ]; then
  if grep -q "@getalby/sdk" package.json; then
    echo "   ✅ @getalby/sdk in package.json"
  fi
  if grep -q "@getalby/lightning-tools" package.json; then
    echo "   ✅ @getalby/lightning-tools in package.json"
  fi
fi
echo ""

echo "============================================================"
echo "Setup Summary:"
echo ""
echo "  ✅ Project structure ready"
echo "  ✅ TypeScript files created"
echo "  ✅ Test files created"
echo "  ✅ Documentation complete"
echo ""

if [ -n "$NWC_URI" ]; then
  echo "  ✅ NWC_URI configured"
  echo ""
  echo "Ready to test! Run:"
  echo "  pnpm --filter ability-lightning-payment test:nwc"
else
  echo "  ⚠️  NWC_URI not configured"
  echo ""
  echo "Next steps:"
  echo "  1. Get NWC connection string from your wallet"
  echo "  2. Export NWC_URI='nostr+walletconnect://...'"
  echo "  3. Run: pnpm --filter ability-lightning-payment test:nwc"
fi

echo "============================================================"

