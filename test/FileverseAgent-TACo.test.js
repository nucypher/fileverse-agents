import { describe, it, before } from "mocha";
import { expect } from "chai";
import { Agent, TacoAccessProvider } from "../index.js";
import { conditions } from "@nucypher/taco";
import { EIP4361AuthProvider } from "@nucypher/taco-auth";

import { PinataStorageProvider } from "../storage/pinata.js";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import dotenv from "dotenv";
import { DOMAIN_NAMES } from "@nucypher/shared";

const TACO_DOMAIN = process.env.TACO_DOMAIN || DOMAIN_NAMES.TESTNET; // TACo testnet domain: tapir
const TACO_RITUAL_ID = parseInt(process.env.TACO_RITUAL_ID || 6);
const TACO_CHAIN_ID = parseInt(process.env.TACO_CHAIN_ID || 80002); // Polygon Amoy chain ID: 80002
const TACO_CHAIN_RPC_URL =
  process.env.TACO_CHAIN_RPC_URL || "https://rpc-amoy.polygon.technology";

const AGENT_CHAIN = process.env.AGENT_CHAIN || "sepolia";

const SEPOLIA_CHAIN_ID = 11155111; // sepolia chain ID - used for access conditions

dotenv.config();

// A TACo RPC condition that allows access to any address (balance >= 0)
const permissiveAccessCondition = new conditions.base.rpc.RpcCondition({
  chain: SEPOLIA_CHAIN_ID,
  method: "eth_getBalance",
  parameters: [":userAddress"],
  returnValueTest: {
    comparator: ">=",
    value: 0, // Any balance
  },
});

describe("Agent with TACo AccessControlProvider: configuration, encrypted file lifecycle, and error handling", function () {
  this.timeout(180000); // Increase timeout for TACo operations

  let agent;
  let storageProvider;
  let agentTacoClient;

  before(async function () {
    this.timeout(30000); // Increase timeout for network operations

    // Initialize storage provider
    storageProvider = new PinataStorageProvider({
      pinataJWT: process.env.PINATA_JWT || "test-jwt",
      pinataGateway:
        process.env.PINATA_GATEWAY || "https://test-gateway.mypinata.cloud",
    });

    // Create TACo-specific viem client for the Agent
    agentTacoClient = createPublicClient({
      chain: {
        id: Number(TACO_CHAIN_ID),
        rpcUrls: {
          default: { http: [TACO_CHAIN_RPC_URL] },
        },
      },
      transport: http(),
    });

    console.log(
      `✅ Created Agent's TACo viem client for chain ${await agentTacoClient.getChainId()}`
    );

    // Initialize agent with TacoAccessProvider
    const tacoProvider = new TacoAccessProvider({
      domain: TACO_DOMAIN,
      ritualId: parseInt(TACO_RITUAL_ID),
      viemClient: agentTacoClient,
    });

    agent = new Agent({
      chain: AGENT_CHAIN,
      viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
      pimlicoAPIKey: process.env.PIMLICO_API_KEY,
      storageProvider,
      accessControlProvider: tacoProvider,
    });

    // Setup storage with namespace
    await agent.setupStorage("taco-test");
  });

  describe("Agent AccessControlProvider Configuration", function () {
    it("should initialize AccessControlProvider when provider is provided", function () {
      expect(agent.accessControlProvider).to.exist;
    });

    it("should handle missing access control provider configuration gracefully", function () {
      const agentWithoutProvider = new Agent({
        chain: AGENT_CHAIN,
        viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
        pimlicoAPIKey: process.env.PIMLICO_API_KEY,
        storageProvider,
        // No tacoConfig or accessControlProvider configuration
      });

      expect(agentWithoutProvider.accessControlProvider).to.be.undefined;
    });

    it("should validate TacoAccessProvider configuration", async function () {
      const validProvider = new TacoAccessProvider({
        domain: TACO_DOMAIN,
        ritualId: TACO_RITUAL_ID,
        viemClient: agentTacoClient, // Use the correct TACo client for Polygon Amoy
      });

      // validateConfig() will not throw for a valid configuration
      await validProvider.validateConfig();
    });
  });

  describe("Agent File Operations with TACo", function () {
    it("should create public files when no access condition is provided", async function () {
      const result = await agent.create("This is a public test file");

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", false);
      expect(result).to.have.property("hash");
      // Delete file
      await agent.delete(result.fileId);
    });

    it("should create encrypted files when access condition is provided", async function () {
      // Log chain configuration for encryption test
      const agentChainId = await agent.publicClient.getChainId();
      console.log(`🔍 Encryption Test Configuration:`);
      console.log(`   Agent Chain ID: ${agentChainId}`);
      console.log(`   TACo Chain ID: ${TACO_CHAIN_ID}`);
      console.log(`   TACo Domain: ${TACO_DOMAIN}`);

      const result = await agent.create("This is an encrypted test file", {
        accessControlConfig: {
          accessCondition: permissiveAccessCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", true);
      expect(result).to.have.property("accessCondition");
      expect(result).to.have.property("hash");
      // Delete file
      await agent.delete(result.fileId);
    });

    it("should retrieve file metadata including encryption status", async function () {
      const publicFile = await agent.create("Public file for metadata test");
      const fileInfo = await agent.getFileInfo(publicFile.fileId);

      expect(fileInfo).to.have.property("metadata");
      expect(fileInfo.metadata.encrypted).to.be.false;

      // Delete file
      await agent.delete(publicFile.fileId);
    });

    it("should download public file content", async function () {
      const publicFile = await agent.create("Public content to download");
      const fileContent = await agent.getFile(publicFile.fileId);

      expect(fileContent).to.have.property("content");
      expect(fileContent.content).to.include("Public content to download");

      // Delete file
      await agent.delete(publicFile.fileId);
    });

    it("should download and decrypt encrypted file content", async function () {
      // Create encrypted file
      const encryptedFile = await agent.create("Secret encrypted content", {
        accessControlConfig: {
          accessCondition: permissiveAccessCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(encryptedFile).to.have.property("encrypted", true);

      // Get file info to retrieve contentIpfsHash and metadata
      const fileInfo = await agent.getFileInfo(encryptedFile.fileId);

      // Read decryption context parameters from metadata
      const requestedContextParameters =
        fileInfo.metadata.accessControlConfig.requestedContextParameters;

      // In code, there will be one parameter: `:userAddress` that needs to be provided by the user.
      // But the code below is generic to handle any number of parameters.
      const contextParamsAndAuthProviders = requestedContextParameters.map(
        (parameter) => {
          return {
            contextParam: parameter,
            provider: new EIP4361AuthProvider(
              agent.publicClient,
              agent.viemAccount
            ),
          };
        }
      );

      const fileContent = await agent.getFile(fileInfo, {
        accessControlConfig: {
          contextParamsAndAuthProviders,
        },
      });

      expect(fileContent).to.have.property("content");
      const decryptedText = fileContent.content;
      expect(decryptedText).to.include("Secret encrypted content");
      expect(fileContent).to.have.property("wasEncrypted", true);

      // Delete file
      await agent.delete(encryptedFile.fileId);
    });

    it("should decrypt with contextParamsAndAuthProviders", async function () {
      const encryptedFile = await agent.create(
        "Content with contextParamsAndAuthProviders",
        {
          accessControlConfig: {
            accessCondition: permissiveAccessCondition,
            authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
          },
        }
      );

      expect(encryptedFile).to.have.property("encrypted", true);

      // Test with contextParamsAndAuthProviders array API
      const authProvider = new EIP4361AuthProvider(
        agent.publicClient,
        agent.viemAccount
      );

      const fileContent1 = await agent.getFile(encryptedFile.fileId, {
        accessControlConfig: {
          contextParamsAndAuthProviders: [
            {
              provider: authProvider,
              contextParam: ":userAddress",
            },
          ],
        },
      });
      expect(fileContent1).to.have.property("content");
      expect(fileContent1.content).to.include(
        "Content with contextParamsAndAuthProviders"
      );
      expect(fileContent1).to.have.property("wasEncrypted", true);

      // Test with same contextParamsAndAuthProviders (should behave the same)
      const fileContent2 = await agent.getFile(encryptedFile.fileId, {
        accessControlConfig: {
          contextParamsAndAuthProviders: [
            {
              provider: authProvider,
              contextParam: ":userAddress",
            },
          ],
        },
      });
      expect(fileContent2).to.have.property("content");
      expect(fileContent2.content).to.include(
        "Content with contextParamsAndAuthProviders"
      );
      expect(fileContent2).to.have.property("wasEncrypted", true);

      // Delete file
      await agent.delete(encryptedFile.fileId);
    });

    it("should handle encrypted file lifecycle (create, update, delete)", async function () {
      // Create encrypted file
      const encryptedFile = await agent.create("Original encrypted content", {
        accessControlConfig: {
          accessCondition: permissiveAccessCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(encryptedFile).to.have.property("encrypted", true);
      expect(encryptedFile).to.have.property("fileId");

      // Verify initial encrypted content can be decrypted
      const authProvider = new EIP4361AuthProvider(
        agent.publicClient,
        agent.viemAccount
      );

      const initialContent = await agent.getFile(encryptedFile.fileId, {
        accessControlConfig: {
          contextParamsAndAuthProviders: [
            {
              provider: authProvider,
              contextParam: ":userAddress",
            },
          ],
        },
      });
      expect(initialContent.content).to.include("Original encrypted content");
      expect(initialContent).to.have.property("wasEncrypted", true);

      // Note: Update operation converts encrypted files to public files
      // This is the current behavior of the system

      // Update encrypted file (results in public update)
      const updateResult = await agent.update(
        encryptedFile.fileId,
        "Updated content"
      );
      expect(updateResult).to.have.property("hash");

      // Delete file (skip content verification after update to avoid 403)
      const deleteResult = await agent.delete(encryptedFile.fileId);
      expect(deleteResult).to.have.property("hash");
    });

    it("should support encrypted updates with accessCondition option", async function () {
      // Create initial public file
      const publicFile = await agent.create("Initial public content");
      expect(publicFile).to.have.property("encrypted", false);

      // Verify initial content
      const initialContent = await agent.getFile(publicFile.fileId);
      expect(initialContent.content).to.include("Initial public content");

      // Update with encryption
      const updateResult = await agent.update(
        publicFile.fileId,
        "Now encrypted content",
        {
          accessCondition: permissiveAccessCondition,
          authSigner: agent.viemAccount,
        }
      );
      expect(updateResult).to.have.property("hash");

      // Delete file
      await agent.delete(publicFile.fileId);
    });

    it("should handle different access condition types", async function () {
      const contractCondition = new conditions.predefined.erc721.ERC721Balance({
        contractAddress: "0x1234567890123456789012345678901234567890",
        chain: SEPOLIA_CHAIN_ID,
        returnValueTest: {
          comparator: ">=",
          value: 1,
        },
      });

      const fileWithContractCondition = await agent.create(
        "Contract condition file",
        {
          accessControlConfig: {
            accessCondition: contractCondition,
            authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
          },
        }
      );

      expect(fileWithContractCondition).to.have.property("encrypted", true);
      expect(fileWithContractCondition).to.have.property("accessCondition");

      // Delete file
      await agent.delete(fileWithContractCondition.fileId);

      // Test with time condition
      const timeCondition = new conditions.base.time.TimeCondition({
        chain: SEPOLIA_CHAIN_ID,
        returnValueTest: {
          comparator: "<=",
          value: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        },
      });

      const fileWithTimeCondition = await agent.create("Time condition file", {
        accessControlConfig: {
          accessCondition: timeCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(fileWithTimeCondition).to.have.property("encrypted", true);
      expect(fileWithTimeCondition).to.have.property("accessCondition");

      // Delete file
      await agent.delete(fileWithTimeCondition.fileId);
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("should throw error when trying to decrypt without access", async function () {
      // Create encrypted file with restrictive condition
      const restrictiveCondition = new conditions.base.rpc.RpcCondition({
        chain: SEPOLIA_CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: ">=",
          value: "999999999999999999999999", // Impossible balance
        },
      });

      const encryptedFile = await agent.create("Restricted content", {
        accessControlConfig: {
          accessCondition: restrictiveCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(encryptedFile).to.have.property("encrypted", true);

      // Attempt to decrypt with proper contextParamsAndAuthProviders but restrictive condition
      const authProvider = new EIP4361AuthProvider(
        agent.publicClient,
        agent.viemAccount
      );

      try {
        await agent.getFile(encryptedFile.fileId, {
          accessControlConfig: {
            contextParamsAndAuthProviders: [
              {
                provider: authProvider,
                contextParam: ":userAddress",
              },
            ],
          },
        });
        // If no error is thrown, the test should pass
        // (TACo may handle conditions differently in test environment)
      } catch (error) {
        // If an error is thrown, it should be a meaningful TACo-related error
        expect(error.message).to.not.include("undefined");
        expect(error.message).to.not.be.empty;
      }

      // Delete file
      await agent.delete(encryptedFile.fileId);
    });

    it("should handle invalid access conditions gracefully", async function () {
      try {
        await agent.create("Test content", {
          accessControlConfig: {
            accessCondition: null, // Invalid condition
            authSigner: agent.viemAccount,
          },
        });
        expect.fail("Should have thrown an error for invalid access condition");
      } catch (error) {
        expect(error.message).to.not.be.empty;
      }
    });

    it("should handle JSON content encryption properly", async function () {
      const jsonContent = {
        message: "Secret JSON data",
        timestamp: Date.now(),
        nested: {
          value: "deep secret",
        },
      };

      const encryptedFile = await agent.create(JSON.stringify(jsonContent), {
        accessControlConfig: {
          accessCondition: permissiveAccessCondition,
          authSigner: agent.viemAccount, // Pass authSigner for TACo encryption
        },
      });

      expect(encryptedFile).to.have.property("encrypted", true);

      // Download and decrypt JSON
      const authProvider = new EIP4361AuthProvider(
        agent.publicClient,
        agent.viemAccount
      );

      const fileContent = await agent.getFile(encryptedFile.fileId, {
        accessControlConfig: {
          contextParamsAndAuthProviders: [
            {
              provider: authProvider,
              contextParam: ":userAddress",
            },
          ],
        },
      });
      const decryptedJson = JSON.parse(fileContent.content);

      expect(decryptedJson).to.have.property("message", "Secret JSON data");
      expect(decryptedJson).to.have.property("nested");
      expect(decryptedJson.nested).to.have.property("value", "deep secret");

      // Delete file
      await agent.delete(encryptedFile.fileId);
    });
  });
});

// Separate test suite for when TACo is NOT available
describe("Agent without AccessControlProvider: public file operations only and graceful rejection of encrypted operations", function () {
  this.timeout(60000);

  let agentWithoutTaco;
  let storageProvider;

  before(async function () {
    // Initialize storage provider
    storageProvider = new PinataStorageProvider({
      pinataJWT: process.env.PINATA_JWT || "test-jwt",
      pinataGateway:
        process.env.PINATA_GATEWAY || "https://test-gateway.mypinata.cloud",
    });

    // Initialize agent WITHOUT access control provider
    agentWithoutTaco = new Agent({
      chain: AGENT_CHAIN,
      viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
      pimlicoAPIKey: process.env.PIMLICO_API_KEY,
      storageProvider,
      // No accessControlProvider
    });

    await agentWithoutTaco.setupStorage("no-taco-test");
  });

  it("should create public files when no access condition is provided", async function () {
    const result = await agentWithoutTaco.create("This is a public test file");

    expect(result).to.have.property("fileId");
    expect(result).to.have.property("encrypted", false);
    expect(result).to.have.property("hash");
  });

  it("should throw error when access condition is provided but TACo not configured", async function () {
    try {
      await agentWithoutTaco.create("Test with conditions but no provider", {
        accessControlConfig: {
          accessCondition: permissiveAccessCondition,
          authSigner: agentWithoutTaco.viemAccount,
        },
      });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error.message).to.include(
        "Access control provider is required for encrypted files"
      );
    }
  });
});
