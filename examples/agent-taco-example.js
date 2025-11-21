/**
 * Example: Agent with TACo Encryption
 *
 * This demonstrates how to configure and use the Fileverse Agent
 * with TACo encryption to support programmable access control.
 * See https://docs.taco.build/for-developers/access-control/quickstart-testnet
 */

import { Agent, TacoAccessProvider } from '../index.js';
import { PinataStorageProvider } from '../storage/pinata.js';
import { conditions } from '@nucypher/taco';
import { EIP4361AuthProvider } from '@nucypher/taco-auth';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { DOMAIN_NAMES } from "@nucypher/shared";
import dotenv from "dotenv";
dotenv.config();

const AGENT_CHAIN = process.env.AGENT_CHAIN;

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;

const TACO_DOMAIN = process.env.TACO_DOMAIN || DOMAIN_NAMES.TESTNET; // TACo testnet domain: tapir
const TACO_RITUAL_ID = parseInt(process.env.TACO_RITUAL_ID || 6);
const TACO_CHAIN_ID = parseInt(process.env.TACO_CHAIN_ID || 80002); // Polygon Amoy chain ID: 80002
const TACO_CHAIN_RPC_URL =
  process.env.TACO_CHAIN_RPC_URL || "https://rpc-amoy.polygon.technology";

// NFT contract address and chain ID
// You can create a new NFT Contract and mint an NFT on it here https://nfts2me.com/create/generative/
const NFT_CONTRACT_ADDRESS = "0x16878c1557a62868BA38C79E2f238861C69a0eCC";
const NFT_CONTRACT_CHAIN_ID = 11155111; // Sepolia chain ID: 11155111

// Key that its address has funds on the AGENT_CHAIN
// And that owns an NFT of the NFT_CONTRACT_ADDRESS on the NFT_CONTRACT_CHAIN_ID
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function agentWithTacoExample() {
  console.log("🚀 Starting Agent with TACo Encryption Example");

  // 1. Setup viem account
  const viemAccount = privateKeyToAccount(PRIVATE_KEY);
  console.log(`🔑 Viem account used: ${viemAccount.address}`);

  // 2. Setup separate viem client for TACo internal operations (Polygon Amoy for testnet)
  console.debug("🔐 Setting up TACo viem client...");

  const tacoViemClient = createPublicClient({
    chain: {
      id: Number(TACO_CHAIN_ID),
      rpcUrls: {
        default: { http: [TACO_CHAIN_RPC_URL] },
      },
    },
    transport: http(),
  });

  // 3. Initialize storage provider
  console.debug("💾 Setting up storage provider...");
  const storageProvider = new PinataStorageProvider({
    pinataJWT: PINATA_JWT,
    pinataGateway: PINATA_GATEWAY,
  });

  // 4. Setup TACo access control provider
  console.debug("🔐 Setting up TACo access control provider...");
  const tacoProvider = new TacoAccessProvider({
    domain: TACO_DOMAIN,
    ritualId: TACO_RITUAL_ID,
    viemClient: tacoViemClient,
  });

  // 5. Configure Agent with TACo support
  console.debug("🤖 Initializing Agent with TACo configuration...");
  const agent = new Agent({
    chain: AGENT_CHAIN,
    viemAccount,
    pimlicoAPIKey: PIMLICO_API_KEY,
    storageProvider,
    accessControlProvider: tacoProvider,
  });

  // 6. Setup storage with namespace
  await agent.setupStorage("taco-example");
  console.debug("✅ Agent initialized with TACo support");

  // 7. Create different types of access conditions
  console.debug("🔐 Creating access conditions...");

  // NFT Ownership Condition - any NFT from the collection must be owned by the user.
  const nftCondition = new conditions.predefined.erc721.ERC721Balance({
    contractAddress: NFT_CONTRACT_ADDRESS,
    parameters: [":userAddress"],
    chain: NFT_CONTRACT_CHAIN_ID,
    returnValueTest: {
      comparator: ">",
      value: 0,
    },
  });

  console.debug("✅ Access conditions created");

  // 8. Create encrypted file with NFT ownership condition
  console.log("📝 Creating encrypted file with NFT ownership condition...");

  // File 1: NFT-gated content
  const nftGatedFile = await agent.create(
    `This content requires the ownership of a NFT on ${NFT_CONTRACT_CHAIN_ID}`,
    {
      accessControlConfig: {
        accessCondition: nftCondition,
        authSigner: viemAccount,
      },
    }
  );
  console.log(`🎨 NFT-gated file created: ${nftGatedFile.fileId}`);
  console.log("✅ Encrypted file created successfully");

  // 9. Demonstrate file retrieval and decryption
  console.log("📖 Demonstrating file retrieval and decryption...");

  // Create EIP4361 (Sign-In with Ethereum) auth provider
  const authProvider = new EIP4361AuthProvider(tacoViemClient, viemAccount);

  // Get file info to retrieve contentIpfsHash and metadata
  const fileInfo = await agent.getFileInfo(nftGatedFile.fileId);

  // Read decryption context parameters from metadata
  const requestedContextParameters =
    fileInfo.metadata.accessControlConfig.requestedContextParameters;

  // In this example, there is one parameter: `:userAddress` that needs to be provided by the user.
  // In a real-world scenario, you may choose a different auth provider for each parameter.
  // Typically the parameters are application specific and their requirements would be documented either by the encryptor or according to the TACo RitualId.
  const contextParamsAndAuthProviders = [
    {
      // In this example, there will be one parameter that needs to be provided by the user.
      contextParam: requestedContextParameters[0], // ":userAddress"
      // This auth provider (EIP4361AuthProvider) will automatically aquire a valid auth signature made by the user address.
      provider: new EIP4361AuthProvider(agent.publicClient, agent.viemAccount),
    },
  ];

  try {
    // Decrypt NFT-gated content
    console.log("🔓 Decrypting NFT-gated file...");
    const decryptedNftGatedFile = await agent.getFile(nftGatedFile.fileId, {
      accessControlConfig: {
        // The contextParamsAndAuthProviders option will cause TACoAccessProvider to automatically construct the
        // TACo ConditionContext from the decrypt Ciphertext and add each context param and its auth provider to it.
        contextParamsAndAuthProviders,
      },
    });
    console.log(
      "✅ Decrypted NFT-gated content:",
      decryptedNftGatedFile.content
    );
  } catch (error) {
    console.log(
      "❌ Failed to decrypt file (expected only if the NFT condition was not met).\n\
      You can creat and mint an NFT at: https://nfts2me.com/create/generative/ or use your own NFT contract."
    );
    // Log full error if in debug mode
    console.debug(error);
  }

  // 10. Demonstrate file management with encryption
  console.log(
    "📝 Demonstrating encrypted file updates that replaces the old file with a new..."
  );

  // Time-based Condition (accessible after specific time)
  const timeCondition = new conditions.base.time.TimeCondition({
    chain: 11155111, // Sepolia
    returnValueTest: {
      comparator: ">=",
      value: Math.floor(Date.now() / 1000) + 3600, // Accessible after 1 hour from now
    },
  });

  // File 3: Time-locked content
  const expireInFutureFile = await agent.create(
    "This content will be accessible after the time condition",
    {
      accessControlConfig: {
        accessCondition: timeCondition,
        authSigner: viemAccount, // Pass authSigner for TACo encryption
      },
    }
  );
  console.log("⏰ Expire-in-future file created:", expireInFutureFile.fileId);

  try {
    const updatedFile = await agent.update(
      expireInFutureFile.fileId,
      "Updated encrypted content with new conditions",
      {
        accessControlConfig: {
          accessCondition: timeCondition,
          authSigner: viemAccount, // Pass authSigner for TACo encryption
        },
      }
    );
    console.log("✅ Updated encrypted file:", updatedFile.fileId);

    // Demonstrate file info retrieval
    const fileInfo = await agent.getFileInfo(expireInFutureFile.fileId);
    console.log("📋 File metadata:", {
      encrypted: fileInfo.metadata.encrypted,
      hasAccessControlConfig: !!fileInfo.metadata.accessControlConfig,
    });
  } catch (error) {
    console.error("❌ Error during file update:", error);
  }
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
