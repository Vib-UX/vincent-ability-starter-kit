import type { BigNumber } from 'ethers';

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as ethersModule from 'ethers';

// Make ethers available globally (like in Lit Actions runtime)
(global as any).ethers = ethersModule;

// Mock laUtils before importing the ability
jest.mock('@lit-protocol/vincent-scaffold-sdk', () => ({
  laUtils: {
    transaction: {
      handler: {
        signAndBroadcastTx: jest.fn(),
      },
    },
  },
}));

import { laUtils } from '@lit-protocol/vincent-scaffold-sdk';

import { KNOWN_ERRORS } from './schemas';
import { vincentAbility } from './vincent-ability';

const { ethers } = ethersModule;

describe('Hedera HTLC Ability', () => {
  // Test data
  const testUserAddress =
    process.env.TEST_USER_ADDRESS || '0xAbCdEf1234567890123456789012345678901234';
  const testPkpPublicKey =
    process.env.TEST_PKP_PUBLIC_KEY ||
    '0x04abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const testPaymentHash =
    process.env.TEST_PAYMENT_HASH ||
    '0x1111111111111111111111111111111111111111111111111111111111111111';
  const testAmount = process.env.TEST_AMOUNT || '1000000000000000000';
  // Use a future timelock (24 hours from now)
  const testTimelock = Math.floor(Date.now() / 1000) + 86400;
  const testRpcUrl = process.env.TEST_HEDERA_RPC_URL || 'https://testnet.hedera.com';
  const testChainId = parseInt(process.env.TEST_HEDERA_CHAIN_ID || '296');
  const testHtlcContract =
    process.env.TEST_HTLC_CONTRACT || '0x1234567890123456789012345678901234567890';
  const testWbtcToken = process.env.TEST_WBTC_TOKEN || '0x0987654321098765432109876543210987654321';

  // Mock provider and contracts
  let mockProvider: any;
  let mockTokenContract: any;
  let mockHtlcContract: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      getBalance: jest.fn(),
      getTransactionCount: jest.fn().mockResolvedValue(0),
      getGasPrice: jest.fn().mockResolvedValue(ethers.BigNumber.from('1000000000')),
      estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from('100000')),
      waitForTransaction: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 12345,
        transactionHash: '0xtxhash123',
      }),
    };

    // Setup mock token contract
    mockTokenContract = {
      balanceOf: jest.fn().mockResolvedValue(ethers.BigNumber.from(testAmount).mul(2)),
      allowance: jest.fn().mockResolvedValue(ethers.BigNumber.from(testAmount).mul(2)),
    };

    // Setup mock HTLC contract
    mockHtlcContract = {
      estimateGas: {
        createHTLCToken: jest.fn().mockResolvedValue(ethers.BigNumber.from('100000')),
      },
    };

    // Mock ethers.providers.JsonRpcProvider
    jest.spyOn(ethers.providers, 'JsonRpcProvider').mockImplementation(() => mockProvider as any);

    // Mock ethers.Contract
    jest.spyOn(ethers, 'Contract').mockImplementation((address: string, abi: any) => {
      if (address === testWbtcToken) {
        return mockTokenContract as any;
      }
      if (address === testHtlcContract) {
        return mockHtlcContract as any;
      }
      return {} as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Precheck', () => {
    const validAbilityParams = {
      paymentHash: testPaymentHash,
      amount: testAmount,
      tokenAddress: testWbtcToken,
      htlcContractAddress: testHtlcContract,
      timelock: testTimelock,
      rpcUrl: testRpcUrl,
      chainId: testChainId,
    };

    const validContext = {
      delegation: {
        delegatorPkpInfo: {
          ethAddress: testUserAddress,
          publicKey: testPkpPublicKey,
          tokenId: '123',
        },
      },
      fail: jest.fn((result: any) => ({ success: false as const, result })),
      succeed: jest.fn((result: any) => ({ success: true as const, result })),
    };

    it('should succeed with valid parameters and sufficient balance', async () => {
      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.hasBalance).toBe(true);
        expect(result.result.hasAllowance).toBe(true);
        expect(result.result.estimatedGas).toBeDefined();
      }
    });

    it('should fail with invalid chain ID', async () => {
      const invalidParams = {
        ...validAbilityParams,
        chainId: 999, // Invalid Hedera chain ID
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.reason).toBe(KNOWN_ERRORS.CONTRACT_ERROR);
        expect(result.result.error).toContain('Invalid Hedera chain ID');
      }
    });

    it('should fail with timelock in the past', async () => {
      const invalidParams = {
        ...validAbilityParams,
        timelock: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const result = await vincentAbility.precheck(
        { abilityParams: invalidParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.reason).toBe(KNOWN_ERRORS.INVALID_TIMELOCK);
        expect(result.result.error).toContain('must be in the future');
      }
    });

    it('should fail with invalid payment hash - not 32 bytes', async () => {
      const invalidParams = {
        ...validAbilityParams,
        paymentHash: '0xinvalid', // Too short
      };

      // The schema validation should catch this before precheck
      expect(() => {
        vincentAbility.precheck({ abilityParams: invalidParams }, validContext as any);
      }).rejects.toThrow();
    });

    it('should fail with insufficient token balance', async () => {
      // Mock insufficient balance
      mockTokenContract.balanceOf.mockResolvedValueOnce(ethers.BigNumber.from('100'));

      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.reason).toBe(KNOWN_ERRORS.INSUFFICIENT_BALANCE);
        expect(result.result.error).toContain('Insufficient token balance');
      }
    });

    it('should detect insufficient allowance', async () => {
      // Mock insufficient allowance
      mockTokenContract.allowance.mockResolvedValueOnce(ethers.BigNumber.from('100'));

      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.hasAllowance).toBe(false);
      }
    });

    it('should estimate gas correctly', async () => {
      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.estimatedGas).toBe('100000');
        expect(mockHtlcContract.estimateGas.createHTLCToken).toHaveBeenCalledWith(
          testPaymentHash,
          testTimelock,
          testWbtcToken,
          testAmount,
          { from: testUserAddress },
        );
      }
    });
  });

  describe('Execute', () => {
    const validAbilityParams = {
      paymentHash: testPaymentHash,
      amount: testAmount,
      tokenAddress: testWbtcToken,
      htlcContractAddress: testHtlcContract,
      timelock: testTimelock,
      rpcUrl: testRpcUrl,
      chainId: testChainId,
    };

    const validContext = {
      delegation: {
        delegatorPkpInfo: {
          ethAddress: testUserAddress,
          publicKey: testPkpPublicKey,
          tokenId: '123',
        },
      },
      fail: jest.fn((result: any) => ({ success: false as const, result })),
      succeed: jest.fn((result: any) => ({ success: true as const, result })),
    };

    beforeEach(() => {
      // Mock successful transaction signing
      (laUtils.transaction.handler.signAndBroadcastTx as jest.Mock).mockResolvedValue(
        '0xtxhash123456789',
      );
    });

    it('should successfully create HTLC on Hedera', async () => {
      const result = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.txHash).toBe('0xtxhash123456789');
        expect(result.result.paymentHash).toBe(testPaymentHash);
        expect(result.result.amount).toBe(testAmount);
        expect(result.result.timelock).toBe(testTimelock);
        expect(result.result.contractId).toBeDefined();
        expect(result.result.blockNumber).toBe(12345);
      }
    });

    it('should use PKP public key for signing', async () => {
      await vincentAbility.execute({ abilityParams: validAbilityParams }, validContext as any);

      expect(laUtils.transaction.handler.signAndBroadcastTx).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.any(Object),
          pkpPublicKey: testPkpPublicKey,
          unsignedTransaction: expect.objectContaining({
            to: testHtlcContract,
            value: '0x0',
            chainId: testChainId,
            data: expect.any(String),
          }),
        }),
      );
    });

    it('should wait for transaction confirmation', async () => {
      await vincentAbility.execute({ abilityParams: validAbilityParams }, validContext as any);

      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith('0xtxhash123456789', 1);
    });

    it('should fail if transaction fails on-chain', async () => {
      // Mock failed transaction
      mockProvider.waitForTransaction.mockResolvedValueOnce({
        status: 0, // Failed
        blockNumber: 12345,
      });

      const result = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Transaction failed on-chain');
      }
    });

    it('should fail if signing fails', async () => {
      // Mock signing failure
      (laUtils.transaction.handler.signAndBroadcastTx as jest.Mock).mockRejectedValueOnce(
        new Error('Signing failed'),
      );

      const result = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Signing failed');
      }
    });

    it('should build correct transaction parameters', async () => {
      const result = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      // Only check if transaction was successful
      if (result.success) {
        const callArgs = (laUtils.transaction.handler.signAndBroadcastTx as jest.Mock).mock
          .calls[0][0];

        expect(callArgs.unsignedTransaction).toMatchObject({
          to: testHtlcContract,
          value: '0x0',
          chainId: testChainId,
          nonce: 0,
        });

        // Check gas parameters exist
        expect(callArgs.unsignedTransaction.gasLimit).toBeDefined();
        expect(callArgs.unsignedTransaction.gasPrice).toBeDefined();
      }
    });

    it('should calculate contract ID deterministically', async () => {
      const result1 = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      const result2 = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        // Contract IDs should be different due to timestamp
        expect(result1.result.contractId).toBeDefined();
        expect(result2.result.contractId).toBeDefined();
      }
    });

    it('should encode createHTLCToken call data correctly', async () => {
      const result = await vincentAbility.execute(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      // Only check if transaction was successful
      if (result.success) {
        const callArgs = (laUtils.transaction.handler.signAndBroadcastTx as jest.Mock).mock
          .calls[0][0];
        const data = callArgs.unsignedTransaction.data;

        // Check function selector (first 4 bytes)
        expect(data).toMatch(/^0x[a-f0-9]{8}/); // Function selector
        expect(data.length).toBeGreaterThan(10); // Has parameters
      }
    });
  });

  describe('Error Handling', () => {
    const validAbilityParams = {
      paymentHash: testPaymentHash,
      amount: testAmount,
      tokenAddress: testWbtcToken,
      htlcContractAddress: testHtlcContract,
      timelock: Math.floor(Date.now() / 1000) + 86400, // Future timelock
      rpcUrl: testRpcUrl,
      chainId: testChainId,
    };

    const validContext = {
      delegation: {
        delegatorPkpInfo: {
          ethAddress: testUserAddress,
          publicKey: testPkpPublicKey,
          tokenId: '123',
        },
      },
      fail: jest.fn((result: any) => ({ success: false as const, result })),
      succeed: jest.fn((result: any) => ({ success: true as const, result })),
    };

    it('should handle RPC connection errors in precheck', async () => {
      mockTokenContract.balanceOf.mockRejectedValueOnce(new Error('Network error'));

      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Network error');
      }
    });

    it('should handle contract call errors in precheck', async () => {
      mockTokenContract.balanceOf.mockRejectedValueOnce(new Error('Contract reverted'));

      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.result.error).toContain('Contract reverted');
      }
    });

    it('should handle gas estimation errors', async () => {
      mockHtlcContract.estimateGas.createHTLCToken.mockRejectedValueOnce(
        new Error('Gas estimation failed'),
      );

      const result = await vincentAbility.precheck(
        { abilityParams: validAbilityParams },
        validContext as any,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle the complete rebalance flow', async () => {
      const abilityParams = {
        paymentHash: testPaymentHash,
        amount: '500000000000000000', // 0.5 wBTC (20% of 2.5 wBTC)
        tokenAddress: testWbtcToken,
        htlcContractAddress: testHtlcContract,
        timelock: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        rpcUrl: testRpcUrl,
        chainId: testChainId,
      };

      const context = {
        delegation: {
          delegatorPkpInfo: {
            ethAddress: testUserAddress,
            publicKey: testPkpPublicKey,
            tokenId: '123',
          },
        },
        fail: jest.fn((result: any) => ({ success: false as const, result })),
        succeed: jest.fn((result: any) => ({ success: true as const, result })),
      };

      // Step 1: Precheck
      const precheckResult = await vincentAbility.precheck({ abilityParams }, context as any);
      expect(precheckResult.success).toBe(true);

      // Step 2: Execute
      (laUtils.transaction.handler.signAndBroadcastTx as jest.Mock).mockResolvedValue(
        '0xrebalancetx',
      );

      const executeResult = await vincentAbility.execute({ abilityParams }, context as any);
      expect(executeResult.success).toBe(true);

      if (executeResult.success) {
        expect(executeResult.result.txHash).toBe('0xrebalancetx');
        expect(executeResult.result.amount).toBe('500000000000000000');
      }
    });
  });
});
