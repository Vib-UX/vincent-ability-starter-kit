import {
  createVincentAbility,
  supportedPoliciesForAbility,
} from '@lit-protocol/vincent-ability-sdk';
import { laUtils } from '@lit-protocol/vincent-scaffold-sdk';

import type { EthersType } from '../Lit.js';

import { HTLC_ABI, ERC20_ABI, getHederaNetwork } from './hedera-config.js';
import {
  abilityParamsSchema,
  precheckSuccessSchema,
  precheckFailSchema,
  executeSuccessSchema,
  executeFailSchema,
  KNOWN_ERRORS,
} from './schemas.js';

declare const ethers: EthersType;

const {
  INSUFFICIENT_BALANCE,
  INVALID_PAYMENT_HASH,
  INVALID_TIMELOCK,
  TRANSACTION_FAILED,
  CONTRACT_ERROR,
} = KNOWN_ERRORS;

/**
 * Hedera HTLC Creation Ability
 *
 * Creates Hash Time-Locked Contracts on Hedera for HLV Protocol
 * Used in the rebalancing flow after Lightning invoice creation:
 *
 * Flow:
 * 1. Lightning invoice created with payment hash
 * 2. This ability locks wBTC in HTLC with that payment hash
 * 3. Agent pays Lightning invoice, gets preimage
 * 4. Agent claims wBTC using preimage
 *
 * Uses EVM Transaction Signer pattern for Hedera's EVM-compatible contracts
 */
export const vincentAbility = createVincentAbility({
  packageName: '@hlv/ability-hedera-htlc' as const,
  abilityParamsSchema: abilityParamsSchema,
  abilityDescription:
    'Create Hash Time-Locked Contracts (HTLCs) on Hedera for wBTC. Used by HLV Protocol to lock tokens pending Lightning payment proof.',
  supportedPolicies: supportedPoliciesForAbility([]),

  precheckSuccessSchema,
  precheckFailSchema,

  executeSuccessSchema,
  executeFailSchema,

  /**
   * Precheck phase - validates transaction can be executed
   */
  precheck: async ({ abilityParams }, { fail, succeed, delegation }) => {
    try {
      const { paymentHash, amount, tokenAddress, htlcContractAddress, timelock, rpcUrl, chainId } =
        abilityParams;

      const { ethAddress: userAddress } = delegation.delegatorPkpInfo;

      console.log('[Hedera HTLC Ability] Starting precheck');
      console.log('[Hedera HTLC Ability] User:', userAddress);
      console.log('[Hedera HTLC Ability] Amount:', amount);
      console.log('[Hedera HTLC Ability] Payment hash:', paymentHash);

      // Validate Hedera chain ID
      try {
        getHederaNetwork(chainId);
      } catch (error) {
        return fail({
          error: `Invalid Hedera chain ID: ${chainId}`,
          reason: CONTRACT_ERROR,
        });
      }

      // Validate payment hash format (must be bytes32)
      if (!paymentHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        return fail({
          error: 'Payment hash must be a 32-byte hex string (0x...)',
          reason: INVALID_PAYMENT_HASH,
        });
      }

      // Validate timelock is in the future
      const now = Math.floor(Date.now() / 1000);
      if (timelock <= now) {
        return fail({
          error: `Timelock (${timelock}) must be in the future (current: ${now})`,
          reason: INVALID_TIMELOCK,
        });
      }

      // Create provider
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      // Check token balance
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(userAddress);

      if (balance.lt(ethers.BigNumber.from(amount))) {
        return fail({
          error: `Insufficient token balance. Have: ${balance.toString()}, Need: ${amount}`,
          reason: INSUFFICIENT_BALANCE,
        });
      }

      // Check token allowance
      const allowance = await tokenContract.allowance(userAddress, htlcContractAddress);
      const hasAllowance = allowance.gte(ethers.BigNumber.from(amount));

      // Estimate gas for createHTLCToken
      const htlcContract = new ethers.Contract(htlcContractAddress, HTLC_ABI, provider);
      const estimatedGas = await htlcContract.estimateGas.createHTLCToken(
        paymentHash,
        timelock,
        tokenAddress,
        amount,
        { from: userAddress },
      );

      console.log('[Hedera HTLC Ability] Precheck passed');
      console.log('[Hedera HTLC Ability] Has allowance:', hasAllowance);
      console.log('[Hedera HTLC Ability] Estimated gas:', estimatedGas.toString());

      return succeed({
        hasAllowance,
        hasBalance: true,
        availableBalance: balance.toString(),
        estimatedGas: estimatedGas.toString(),
      });
    } catch (error) {
      console.error('[Hedera HTLC Ability] Precheck error:', error);
      return fail({
        error: error instanceof Error ? error.message : 'Unknown precheck error',
        reason: CONTRACT_ERROR,
      });
    }
  },

  /**
   * Execute phase - creates the HTLC transaction on Hedera
   * Signs and submits the transaction using the user's PKP
   */
  execute: async ({ abilityParams }, { succeed, fail, delegation }) => {
    try {
      const { paymentHash, amount, tokenAddress, htlcContractAddress, timelock, rpcUrl, chainId } =
        abilityParams;

      const { ethAddress: userAddress, publicKey: pkpPublicKey } = delegation.delegatorPkpInfo;

      console.log('[Hedera HTLC Ability] Creating HTLC...');
      console.log('[Hedera HTLC Ability] User address:', userAddress);
      console.log('[Hedera HTLC Ability] Payment hash:', paymentHash);
      console.log('[Hedera HTLC Ability] Amount:', amount);
      console.log('[Hedera HTLC Ability] PKP Public Key:', pkpPublicKey);

      // Create provider
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      // Create contract interface for encoding
      const htlcInterface = new ethers.utils.Interface(HTLC_ABI);

      // Encode the createHTLCToken function call
      const data = htlcInterface.encodeFunctionData('createHTLCToken', [
        paymentHash,
        timelock,
        tokenAddress,
        amount,
      ]);

      console.log('[Hedera HTLC Ability] Encoded transaction data');
      console.log('[Hedera HTLC Ability] To:', htlcContractAddress);
      console.log('[Hedera HTLC Ability] Data length:', data.length);

      // Get transaction parameters
      const nonce = await provider.getTransactionCount(userAddress);
      const gasPrice = await provider.getGasPrice();

      // Estimate gas
      const estimatedGas = await provider.estimateGas({
        from: userAddress,
        to: htlcContractAddress,
        data,
      });

      // Add 20% buffer to gas limit
      const gasLimit = estimatedGas.mul(120).div(100);

      console.log('[Hedera HTLC Ability] Transaction parameters:', {
        nonce,
        gasPrice: gasPrice.toString(),
        gasLimit: gasLimit.toString(),
      });

      console.log('[Hedera HTLC Ability] Signing transaction with PKP...');

      // Sign and broadcast the transaction using PKP via Lit Actions
      // Use contractCall from laUtils
      const txHash = await laUtils.transaction.handler.contractCall({
        provider,
        pkpPublicKey,
        callerAddress: userAddress,
        abi: HTLC_ABI,
        contractAddress: htlcContractAddress,
        functionName: 'createHTLCToken',
        args: [paymentHash, timelock, tokenAddress, amount],
        chainId,
      });

      console.log('[Hedera HTLC Ability] Transaction signed and broadcast');
      console.log('[Hedera HTLC Ability] Transaction hash:', txHash);

      // Calculate contract ID (same logic as HTLC contract)
      // Note: This is deterministic based on contract logic
      const contractId = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ['address', 'address', 'uint256', 'bytes32', 'uint256', 'uint256'],
          [userAddress, tokenAddress, amount, paymentHash, timelock, Math.floor(Date.now() / 1000)],
        ),
      );

      console.log('[Hedera HTLC Ability] HTLC created successfully');
      console.log('[Hedera HTLC Ability] Contract ID:', contractId);

      // Wait for transaction confirmation
      console.log('[Hedera HTLC Ability] Waiting for confirmation...');
      const receipt = await provider.waitForTransaction(txHash, 1);

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed on-chain');
      }

      console.log('[Hedera HTLC Ability] Transaction confirmed in block:', receipt.blockNumber);

      return succeed({
        contractId,
        txHash,
        paymentHash,
        amount,
        timelock,
        blockNumber: receipt.blockNumber,
      });
    } catch (error) {
      console.error('[Hedera HTLC Ability] Execute error:', error);
      return fail({
        error: error instanceof Error ? error.message : 'Unknown execution error',
        reason: TRANSACTION_FAILED,
      });
    }
  },
});

export default vincentAbility;
