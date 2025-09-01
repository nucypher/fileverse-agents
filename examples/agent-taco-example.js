/**
 * Example: Agent with TACo Encryption
 *
 * This demonstrates how to configure and use the Fileverse Agent
 * with TACo encryption for creating encrypted files with programmable
 * access conditions.
 */

import { Agent } from '../index.js';
import { PinataStorageProvider } from '../storage/pinata.js';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { conditions, ThresholdMessageKit } from '@nucypher/taco';
import { ViemEIP4361AuthProvider } from '@nucypher/taco-auth';
import 'dotenv/config';

async function agentWithTacoExample() {
  console.log('🚀 Starting Agent with TACo Encryption Example');

  // 1. Setup viem account
  const viemAccount = privateKeyToAccount(process.env.PRIVATE_KEY);

  // 2. Setup separate viem client for TACo operations (Polygon Amoy for testnet)
  console.debug('🔐 Setting up TACo viem client...');

  const tacoViemClient = createPublicClient({
    chain: polygonAmoy, // TACo operates on Polygon Amoy for testnet
    transport: http(),
  });

  // 3. Initialize storage provider
  console.debug('💾 Setting up storage provider...');
  const storageProvider = new PinataStorageProvider({
    pinataJWT: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY,
  });

  // 4. Configure Agent with TACo support
  console.debug('🤖 Initializing Agent with TACo configuration...');

  const agent = new Agent({
    chain: 'sepolia',
    viemAccount,
    pimlicoAPIKey: process.env.PIMLICO_API_KEY,
    storageProvider,
    tacoConfig: {
      domain: 'tapir', // Use tapir for testnet
      ritualId: 6, // Current ritual ID for tapir domain
      viemClient: tacoViemClient, // Polygon Amoy client for TACo operations
    },
  });

  // 5. Setup storage namespace
  await agent.setupStorage('taco-example');
  console.debug('✅ Agent initialized with TACo support');

  // 6. Create different types of access conditions
  console.debug('🔐 Creating access conditions...');

  // NFT Ownership Condition (user must own specific NFT)
  const nftCondition = new conditions.base.contract.ContractCondition({
    chain: 11155111, // Sepolia
    contractAddress: '0x1e988ba4692e52Bc50b375bcC8585b95c48AaD77', // Example NFT contract on Sepolia
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: {
      comparator: '>=',
      value: 1, // Must own at least 1 NFT
    },
    standardContractType: 'ERC721',
  });

  // Token Balance Condition (user must have minimum ETH balance)
  const balanceCondition = new conditions.base.rpc.RpcCondition({
    chain: 11155111, // Sepolia
    method: 'eth_getBalance',
    parameters: [':userAddress', 'latest'],
    returnValueTest: {
      comparator: '>=',
      value: '1000000000000000000', // 1 ETH minimum
    },
  });

  // Time-based Condition (accessible after specific time)
  const timeCondition = new conditions.base.time.TimeCondition({
    chain: 11155111, // Sepolia
    method: 'blocktime',
    returnValueTest: {
      comparator: '<=',
      value: Math.floor(Date.now() / 1000) + 3600, // Accessible after 1 hour from now
    },
  });

  // Compound Condition (combine multiple conditions with OR logic)
  const compoundCondition = new conditions.compound.CompoundCondition({
    operator: 'or', // User needs NFT OR sufficient balance
    operands: [nftCondition, balanceCondition],
  });

  console.debug('✅ Access conditions created');

  // 7. Create encrypted files with different access conditions
  console.log('📝 Creating encrypted files with various access conditions...');

  // File 1: Balance-gated content (most reliable for testing)
  const balanceGatedFile = await agent.create('This content requires minimum ETH balance', {
    accessCondition: balanceCondition,
  });
  console.log('💰 Balance-gated file created:', balanceGatedFile.fileId);

  // File 2: NFT-gated content
  const nftGatedFile = await agent.create('This content is only accessible to NFT holders', {
    accessCondition: nftCondition,
  });
  console.log('🖼️ NFT-gated file created:', nftGatedFile.fileId);

  // File 3: Time-locked content
  const timeLockedFile = await agent.create('This content will be accessible after the time condition', {
    accessCondition: timeCondition,
  });
  console.log('⏰ Time-locked file created:', timeLockedFile.fileId);

  // File 4: Compound condition content
  const compoundFile = await agent.create('This content is accessible with NFT OR sufficient balance', {
    accessCondition: compoundCondition,
  });
  console.log('🔗 Compound condition file created:', compoundFile.fileId);

  // 8. Demonstrate decryption (for users who meet the conditions)
  console.log('🔓 Attempting to decrypt balance-gated file...');

  try {
    // Create proper condition context for decryption
    const fileInfo = await agent.getFile(balanceGatedFile.fileId);
    const messageKit = ThresholdMessageKit.fromBytes(
      await agent.storageProvider.downloadBytes(fileInfo.contentIpfsHash)
    );

    const conditionContext = conditions.context.ConditionContext.fromMessageKit(messageKit);
    const authProvider = await ViemEIP4361AuthProvider.create(agent.publicClient, agent.viemAccount);
    conditionContext.addAuthProvider(':userAddress', authProvider);

    const decryptedContent = await agent.getFileContent(balanceGatedFile.fileId, conditionContext);
    console.log('✅ Successfully decrypted balance-gated content:', decryptedContent.content.slice(0, 50) + '...');
  } catch (error) {
    console.log('❌ Could not decrypt balance-gated content (user may not meet balance requirement):', error.message);
  }

  // 8. Display summary
  console.log('\n📊 Summary of created encrypted files:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 Balance-gated file:     ', balanceGatedFile.fileId);
  console.log('🖼️  NFT-gated file:        ', nftGatedFile.fileId);
  console.log('⏰ Time-locked file:       ', timeLockedFile.fileId);
  console.log('🔗 Compound condition file:', compoundFile.fileId);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('✨ Agent with TACo Example completed successfully!');

  return {
    balanceGated: balanceGatedFile,
    nftGated: nftGatedFile,
    timeLocked: timeLockedFile,
    compound: compoundFile,
  };
}

/**
 * Key Benefits of Agent with TACo:
 *
 * 1. 🔐 **Programmable Access Control**: Create files with sophisticated access conditions
 * 2. 🌐 **Cross-Chain Conditions**: TACo operates on Polygon Amoy, but conditions work on any chain
 * 3. 🎯 **Multiple Condition Types**: NFT ownership, token balances, time locks, custom RPC calls
 * 4. 🔗 **Compound Logic**: Combine conditions with AND/OR operators for complex access rules
 * 5. 🛡️ **Decentralized Encryption**: No centralized servers - powered by threshold cryptography
 * 6. 🔄 **Seamless Integration**: Same Agent API for both public and encrypted files
 *
 * Environment Variables Required:
 * - PRIVATE_KEY: Your wallet private key (0x...)
 * - PIMLICO_API_KEY: Pimlico API key for account abstraction
 * - PINATA_JWT: Pinata JWT token for IPFS storage
 * - PINATA_GATEWAY: Pinata gateway URL (e.g., https://your-gateway.mypinata.cloud)
 */

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  agentWithTacoExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Example failed:', error);
      process.exit(1);
    });
}

export { agentWithTacoExample };
