/**
 * Integration Tests for Hedera HTLC Ability
 *
 * These tests execute REAL transactions on Hedera testnet!
 *
 * Requirements:
 * 1. HEDERA_TESTNET_PRIVATE_KEY - Private key with testnet HBAR
 * 2. Deployed HTLC contract on testnet
 * 3. Test wBTC token contract on testnet
 * 4. Sufficient HBAR balance for gas
 *
 * Run with: pnpm test:integration
 */

import * as crypto from 'crypto';

import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import { ethers } from 'ethers';

// Set long timeout for real blockchain operations
jest.setTimeout(120_000); // 2 minutes

describe('Hedera HTLC Ability - Integration Tests (REAL EXECUTION)', () => {
  // Configuration from environment
  const HEDERA_TESTNET_RPC = process.env.HEDERA_TESTNET_RPC || 'https://testnet.hashio.io/api';
  const HEDERA_CHAIN_ID = 296;
  const PRIVATE_KEY = process.env.HEDERA_TESTNET_PRIVATE_KEY;
  const HTLC_CONTRACT = process.env.HTLC_CONTRACT_ADDRESS;
  const WBTC_TOKEN = process.env.WBTC_TOKEN_ADDRESS;

  let provider: ethers.providers.JsonRpcProvider;
  let wallet: ethers.Wallet;
  let htlcContract: ethers.Contract;
  let wbtcContract: ethers.Contract;

  // HTLC Contract ABI (minimal needed for testing)
  // Note: V2 contract has NO receiver field
  const HTLC_ABI = [
    'function createHTLCToken(bytes32 _hashlock, uint256 _timelock, address _tokenAddress, uint256 _amount) external returns (bytes32)',
    'function claim(bytes32 _contractId, bytes32 _preimage) external',
    'function refund(bytes32 _contractId) external',
    'function getContract(bytes32 _contractId) external view returns (address sender, address tokenAddress, uint256 amount, bytes32 paymentHash, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
    'event HTLCCreated(bytes32 indexed contractId, address indexed sender, address indexed tokenContract, uint256 amount, bytes32 paymentHash, uint256 timelock)',
  ];

  // ERC20 Token ABI (minimal)
  const ERC20_ABI = [
    'function balanceOf(address) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
  ];

  beforeAll(async () => {
    // Validate environment
    if (!PRIVATE_KEY) {
      throw new Error(
        '❌ HEDERA_TESTNET_PRIVATE_KEY not set. Please set it in .env.integration.test',
      );
    }

    if (!HTLC_CONTRACT) {
      throw new Error('❌ HTLC_CONTRACT_ADDRESS not set. Please deploy HTLC contract first.');
    }

    if (!WBTC_TOKEN) {
      throw new Error('❌ WBTC_TOKEN_ADDRESS not set. Please set test token address.');
    }

    // Setup provider and wallet
    provider = new ethers.providers.JsonRpcProvider(HEDERA_TESTNET_RPC);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log('\n🔗 Connected to Hedera Testnet');
    console.log(`📍 Wallet Address: ${wallet.address}`);
    console.log(`📍 HTLC Contract: ${HTLC_CONTRACT}`);
    console.log(`📍 wBTC Token: ${WBTC_TOKEN}`);

    // Setup contracts
    htlcContract = new ethers.Contract(HTLC_CONTRACT, HTLC_ABI, wallet);
    wbtcContract = new ethers.Contract(WBTC_TOKEN, ERC20_ABI, wallet);

    // Check balances
    const hbarBalance = await wallet.getBalance();
    const wbtcBalance = await wbtcContract.balanceOf(wallet.address);

    console.log(`\n💰 Account Balances:`);
    console.log(`   HBAR: ${ethers.utils.formatEther(hbarBalance)} HBAR`);
    console.log(`   wBTC: ${ethers.utils.formatUnits(wbtcBalance, 8)} wBTC`);

    if (hbarBalance.lt(ethers.utils.parseEther('0.1'))) {
      throw new Error('❌ Insufficient HBAR balance. Need at least 0.1 HBAR for gas.');
    }

    if (wbtcBalance.isZero()) {
      console.warn('\n⚠️  Warning: Zero wBTC balance. Some tests may be skipped.');
    }
  });

  describe('Real Hedera Testnet Execution', () => {
    it('should connect to Hedera testnet and read contract', async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(HEDERA_CHAIN_ID);

      const balance = await wallet.getBalance();
      expect(balance.gt(0)).toBe(true);

      console.log(`\n✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
      console.log(`✅ Wallet balance: ${ethers.utils.formatEther(balance)} HBAR`);
    });

    it('should check wBTC token allowance', async () => {
      const currentAllowance = await wbtcContract.allowance(wallet.address, HTLC_CONTRACT);

      console.log(
        `\n📊 Current wBTC allowance for HTLC: ${ethers.utils.formatUnits(currentAllowance, 8)} wBTC`,
      );

      expect(currentAllowance.gte(0)).toBe(true);
    });

    it('should approve HTLC contract to spend wBTC (if needed)', async () => {
      const testAmount = ethers.utils.parseUnits('0.001', 8); // 0.001 wBTC
      const currentAllowance = await wbtcContract.allowance(wallet.address, HTLC_CONTRACT);

      if (currentAllowance.lt(testAmount)) {
        console.log('\n📝 Approving HTLC contract to spend wBTC...');

        const approveTx = await wbtcContract.approve(
          HTLC_CONTRACT,
          ethers.utils.parseUnits('1', 8), // Approve 1 wBTC
        );

        console.log(`   Transaction hash: ${approveTx.hash}`);
        console.log(`   Waiting for confirmation...`);

        const receipt = await approveTx.wait();
        expect(receipt.status).toBe(1);

        console.log(`✅ Approval confirmed in block ${receipt.blockNumber}`);

        // Verify new allowance
        const newAllowance = await wbtcContract.allowance(wallet.address, HTLC_CONTRACT);
        expect(newAllowance.gte(testAmount)).toBe(true);

        console.log(`✅ New allowance: ${ethers.utils.formatUnits(newAllowance, 8)} wBTC`);
      } else {
        console.log(`\n✅ Already approved: ${ethers.utils.formatUnits(currentAllowance, 8)} wBTC`);
      }
    });

    it('should create a real HTLC on Hedera testnet', async () => {
      const balance = await wbtcContract.balanceOf(wallet.address);
      if (balance.isZero()) {
        console.log('\n⚠️  Skipping: No wBTC balance');
        return;
      }

      // Generate a real payment hash (like Lightning would)
      const preimage = crypto.randomBytes(32);
      const paymentHash = '0x' + crypto.createHash('sha256').update(preimage).digest('hex');
      const preimageHex = '0x' + preimage.toString('hex');

      const amount = ethers.utils.parseUnits('0.0001', 8); // 0.0001 wBTC (~$10)
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      console.log('\n🚀 Creating HTLC on Hedera Testnet...');
      console.log(`   Payment Hash: ${paymentHash}`);
      console.log(`   Amount: ${ethers.utils.formatUnits(amount, 8)} wBTC`);
      console.log(`   Timelock: ${new Date(timelock * 1000).toISOString()}`);
      console.log(`   Token: ${WBTC_TOKEN}`);

      // Execute createHTLCToken transaction
      const tx = await htlcContract.createHTLCToken(paymentHash, timelock, WBTC_TOKEN, amount, {
        gasLimit: 500000, // Manual gas limit for Hedera
      });

      console.log(`\n📤 Transaction submitted: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      const receipt = await tx.wait(1);

      expect(receipt.status).toBe(1);
      console.log(`\n✅ HTLC Created Successfully!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);

      // Get contractId from HTLCCreated event
      // Event signature: HTLCCreated(bytes32 indexed contractId, address indexed sender, address indexed tokenContract, uint256 amount, bytes32 paymentHash, uint256 timelock)
      const eventTopic = ethers.utils.id(
        'HTLCCreated(bytes32,address,address,uint256,bytes32,uint256)',
      );
      const htlcLog = receipt.logs.find((log: any) => log.topics[0] === eventTopic);

      if (!htlcLog) {
        throw new Error('HTLCCreated event not found in receipt logs');
      }

      // First indexed parameter (contractId) is in topics[1]
      const contractId = htlcLog.topics[1];

      console.log(`   Contract ID: ${contractId}`);

      // Verify contract was created by reading its state
      const contractData = await htlcContract.getContract(contractId);

      expect(contractData.sender).toBe(wallet.address);
      expect(contractData.amount.toString()).toBe(amount.toString());
      expect(contractData.paymentHash).toBe(paymentHash);
      expect(contractData.timelock.toNumber()).toBe(timelock);
      expect(contractData.withdrawn).toBe(false);
      expect(contractData.refunded).toBe(false);

      console.log(`\n✅ HTLC State Verified:`);
      console.log(`   Sender: ${contractData.sender}`);
      console.log(`   Amount: ${ethers.utils.formatUnits(contractData.amount, 18)} wBTC`);
      console.log(`   Withdrawn: ${contractData.withdrawn}`);
      console.log(`   Refunded: ${contractData.refunded}`);

      // Try to claim the HTLC with the preimage
      console.log(`\n🔓 Claiming HTLC with preimage...`);
      const claimTx = await htlcContract.claim(contractId, preimageHex, {
        gasLimit: 300000,
      });

      console.log(`   Claim transaction: ${claimTx.hash}`);
      const claimReceipt = await claimTx.wait(1);

      expect(claimReceipt.status).toBe(1);
      console.log(`✅ HTLC Claimed Successfully!`);
      console.log(`   Block: ${claimReceipt.blockNumber}`);

      // Verify contract is now withdrawn
      const finalContractData = await htlcContract.getContract(contractId);
      expect(finalContractData.withdrawn).toBe(true);

      console.log(`\n✅ Full HTLC Lifecycle Completed:`);
      console.log(`   1. ✓ Created HTLC with payment hash`);
      console.log(`   2. ✓ Verified contract state`);
      console.log(`   3. ✓ Claimed with preimage`);
      console.log(`   4. ✓ Confirmed withdrawal`);
    });

    it('should handle HTLC with expired timelock (refund)', async () => {
      const balance = await wbtcContract.balanceOf(wallet.address);
      if (balance.isZero()) {
        console.log('\n⚠️  Skipping: No wBTC balance');
        return;
      }

      // Generate payment hash
      const preimage = crypto.randomBytes(32);
      const paymentHash = '0x' + crypto.createHash('sha256').update(preimage).digest('hex');

      const amount = ethers.utils.parseUnits('0.0001', 8);
      const timelock = Math.floor(Date.now() / 1000) + 60; // Only 1 minute (for testing refund)

      console.log('\n🚀 Creating HTLC with short timelock (for refund test)...');
      console.log(`   Timelock: ${new Date(timelock * 1000).toISOString()} (1 minute)`);

      const tx = await htlcContract.createHTLCToken(paymentHash, timelock, WBTC_TOKEN, amount, {
        gasLimit: 500000,
      });

      const receipt = await tx.wait(1);
      expect(receipt.status).toBe(1);

      // Get contractId from HTLCCreated event
      const eventTopic2 = ethers.utils.id(
        'HTLCCreated(bytes32,address,address,uint256,bytes32,uint256)',
      );
      const htlcLog2 = receipt.logs.find((log: any) => log.topics[0] === eventTopic2);

      if (!htlcLog2) {
        throw new Error('HTLCCreated event not found in transaction receipt');
      }

      // First indexed parameter (contractId) is in topics[1]
      const contractId = htlcLog2.topics[1];

      console.log(`✅ HTLC created: ${contractId}`);
      console.log(`\n⏳ Waiting for timelock to expire (60 seconds)...`);

      // Wait for timelock to expire
      await new Promise((resolve) => setTimeout(resolve, 65000)); // Wait 65 seconds

      console.log(`\n💸 Attempting refund after timelock expiry...`);

      const refundTx = await htlcContract.refund(contractId, {
        gasLimit: 300000,
      });

      const refundReceipt = await refundTx.wait(1);
      expect(refundReceipt.status).toBe(1);

      console.log(`✅ Refund successful!`);
      console.log(`   Transaction: ${refundTx.hash}`);

      // Verify contract is refunded
      const finalData = await htlcContract.getContract(contractId);
      expect(finalData.refunded).toBe(true);

      console.log(`\n✅ Refund Lifecycle Completed:`);
      console.log(`   1. ✓ Created HTLC with short timelock`);
      console.log(`   2. ✓ Waited for expiry`);
      console.log(`   3. ✓ Successfully refunded`);
    });
  });

  describe('Gas Estimation Tests', () => {
    it('should accurately estimate gas for HTLC creation', async () => {
      const balance = await wbtcContract.balanceOf(wallet.address);
      if (balance.isZero()) {
        console.log('\n⚠️  Skipping: No wBTC balance');
        return;
      }

      const preimage = crypto.randomBytes(32);
      const paymentHash = '0x' + crypto.createHash('sha256').update(preimage).digest('hex');
      const amount = ethers.utils.parseUnits('0.0001', 8);
      const timelock = Math.floor(Date.now() / 1000) + 3600;

      console.log('\n📊 Estimating gas for HTLC creation...');

      const estimatedGas = await htlcContract.estimateGas.createHTLCToken(
        paymentHash,
        timelock,
        WBTC_TOKEN,
        amount,
      );

      console.log(`   Estimated gas: ${estimatedGas.toString()}`);

      expect(estimatedGas.gt(0)).toBe(true);
      expect(estimatedGas.lt(1000000)).toBe(true); // Should be reasonable

      const gasPrice = await provider.getGasPrice();
      const estimatedCost = estimatedGas.mul(gasPrice);

      console.log(`   Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
      console.log(`   Estimated cost: ${ethers.utils.formatEther(estimatedCost)} HBAR`);
    });
  });
});
