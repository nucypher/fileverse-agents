/**
 * Example: Agent with TACo Encryption
 *
 * This demonstrates how to configure and use the Fileverse Agent
 * with TACo encryption for creating encrypted files with programmable
 * access conditions.
 */

import { Agent, TacoAccessProvider } from "../index.js";
import { PinataStorageProvider } from '../storage/pinata.js';
import { conditions } from '@nucypher/taco';
import { EIP4361AuthProvider } from '@nucypher/taco-auth';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import 'dotenv/config';

async function agentWithTacoExample() {

  console.log("🚀 Starting Agent with TACo Encryption Example");

  // 1. Setup viem account
  const viemAccount = privateKeyToAccount(process.env.PRIVATE_KEY);

  // 2. Setup separate viem client for TACo operations (Polygon Amoy for testnet)
  console.debug("🔐 Setting up TACo viem client...");

  const tacoViemClient = createPublicClient({
    chain: polygonAmoy, // TACo operates on Polygon Amoy for testnet
    transport: http(),
  });

  // 3. Initialize storage provider
  console.debug("💾 Setting up storage provider...");
  const storageProvider = new PinataStorageProvider({
    pinataJWT: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY,
  });

  // 4. Setup TACo data access provider
  console.debug('🔐 Setting up TACo data access provider...');
  const tacoProvider = new TacoAccessProvider({
    domain: 'tapir', // Use tapir domain for testnet
    ritualId: 6, // Current ritual ID for tapir domain
    viemClient: tacoViemClient, // Polygon Amoy client for TACo operations
  });

  // 5. Configure Agent with TACo support
  console.debug('🤖 Initializing Agent with TACo configuration...');
  const agent = new Agent({
    chain: "sepolia",
    viemAccount,
    pimlicoAPIKey: process.env.PIMLICO_API_KEY,
    storageProvider,
    dataAccessProvider: tacoProvider,
  });

  // 6. Setup storage namespace
  await agent.setupStorage('taco-example');
  console.debug('✅ Agent initialized with TACo support');

  // 7. Create different types of access conditions
  console.debug('🔐 Creating access conditions...');

  // NFT Ownership Condition (user must own specific NFT)
  const nftCondition = new conditions.predefined.erc721.ERC721Ownership({
    contractAddress: '0x16878c1557a62868BA38C79E2f238861C69a0eCC',
    parameters: [3591],
    chain: 11155111, // Sepolia
  });

  console.debug('✅ Access conditions created');

  // 8. Create encrypted file with NFT ownership condition
  console.log('📝 Creating encrypted file with NFT ownership condition...');

  // File 1: NFT-gated content
  const nftGatedFile = await agent.create(
    'This content requires ownership of NFT #3591 on Sepolia',
    {
      accessCondition: nftCondition,
      authSigner: viemAccount,  // Pass authSigner for TACo encryption
    }
  );
  console.log('🎨 NFT-gated file created:', nftGatedFile.fileId);

  console.log('✅ Encrypted file created successfully');

  // 9. Demonstrate file retrieval and decryption
  console.log('📖 Demonstrating file retrieval and decryption...');

  const conditionContext = new conditions.context.ConditionContext(
    nftCondition
  );

  // Create EIP4361 auth provider
  const authProvider = new EIP4361AuthProvider(
    tacoViemClient,
    viemAccount
  );
  conditionContext.addAuthProvider(':userAddress', authProvider);

  try {
    // Decrypt NFT-gated content (TACo provider handles auth automatically)
    console.log('🔓 Decrypting NFT-gated file...');
    const decryptedNftGatedFile = await agent.getFile(nftGatedFile.fileId, {
      dataAccessConfig: { conditionContext },
    });
    console.log(
      '✅ Decrypted NFT-gated content:',
      decryptedNftGatedFile.content
    );
  } catch (error) {
    console.log(
      '❌ Failed to decrypt file (expected if NFT condition not met):',
      error.message
    );
  }

  // 10. Demonstrate file management with encryption
  console.log(
    '📝 Demonstrating encrypted file updates that replaces the old file with a new...'
  );

  // Time-based Condition (accessible after specific time)
  const timeCondition = new conditions.base.time.TimeCondition({
    chain: 11155111, // Sepolia
    method: "blocktime",
    returnValueTest: {
      comparator: '>=',
      value: Math.floor(Date.now() / 1000) + 3600, // Accessible after 1 hour from now
    },
  });

  // File 3: Time-locked content
  const expireInFutureFile = await agent.create(
    'This content will be accessible after the time condition',
    {
      accessCondition: timeCondition,
      authSigner: viemAccount,  // Pass authSigner for TACo encryption
    }
  );
  console.log('⏰ Expire-in-future file created:', expireInFutureFile.fileId);

  try {
    const updatedFile = await agent.update(
      expireInFutureFile.fileId,
      'Updated encrypted content with new conditions',
      {
        accessCondition: timeCondition,
        authSigner: viemAccount,  // Pass authSigner for TACo encryption
      }
    );
    console.log('✅ Updated encrypted file:', updatedFile.fileId);

    // Demonstrate file info retrieval
    const fileInfo = await agent.getFileInfo(expireInFutureFile.fileId);
    console.log('📋 File metadata:', {
      encrypted: fileInfo.metadata.encrypted,
      hasDataAccessConfig: !!fileInfo.metadata.dataAccessConfig,
    });
  } catch (error) {
    console.error('❌ Error during file update:', error);
  }

  console.log('🎉 TACo encryption example completed successfully!');
  console.log('\n📊 Summary:');
  console.log('- Created encrypted files with NFT ownership and time-based conditions');
  console.log('- Demonstrated decryption with condition context and authentication');
  console.log('- Showed file updates with new access conditions');
  console.log(
    '- All operations used TACo\'s threshold cryptography for secure access control'
  );
}

// Run the example
agentWithTacoExample()
  .then(() => {
    console.log('✅ Example completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
  });

export { agentWithTacoExample };
