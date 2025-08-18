import { describe, it, before } from 'mocha';
import { expect } from "chai";
import { Agent } from "../index.js";
import { TacoService } from "../services/TacoService.js";
import { createRequire } from "module";

// Create require function for CommonJS imports
const require = createRequire(import.meta.url);

// TACo modules - loaded via require
let domains, conditions;
import { PinataStorageProvider } from "../storage/pinata.js";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { polygonAmoy } from "viem/chains";
import dotenv from "dotenv";

const TACO_DOMAIN = process.env.TACO_DOMAIN || "lynx";
const TACO_RITUAL_ID = parseInt(process.env.TACO_RITUAL_ID || 27);

// TACo testing with domain tapir on Polygon Amoy (chain ID 80002)
const TACO_CHAIN_ID = parseInt(process.env.TACO_CHAIN_ID || 80002);

const AGENT_CHAIN = process.env.AGENT_CHAIN || "sepolia";

dotenv.config();

describe("TACo Integration Tests - TACo Available", function () {
  this.timeout(60000); // Increase timeout for TACo operations

  let agent;
  let storageProvider;

  before(async function () {
    this.timeout(30000); // Increase timeout for network operations

    try {
      // Load TACo using require for reliable CommonJS import
      const TACo = require("@nucypher/taco");
      ({ domains, conditions } = TACo);

      if (!domains || !conditions) {
        throw new Error("TACo packages not properly loaded");
      }
    } catch (error) {
      throw new Error(`Failed to load TACo packages: ${error.message}`);
    }

    // Initialize storage provider
    storageProvider = new PinataStorageProvider({
      pinataJWT: process.env.PINATA_JWT || "test-jwt",
      pinataGateway:
        process.env.PINATA_GATEWAY || "https://test-gateway.mypinata.cloud",
    });

    // Create TACo-specific viem client for the Agent
    const agentTacoClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(),
    });

    console.log(
      `✅ Created Agent's TACo viem client for chain ${await agentTacoClient.getChainId()}`
    );

    // Initialize agent with TACo configuration
    agent = new Agent({
      chain: AGENT_CHAIN,
      viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
      pimlicoAPIKey: process.env.PIMLICO_API_KEY,
      storageProvider,
      taco: {
        domain: TACO_DOMAIN,
        ritualId: parseInt(TACO_RITUAL_ID),
        provider: null, // Will use publicClient for basic operations
        viemClient: agentTacoClient, // Provide TACo-specific client
      },
    });

    // Setup storage with namespace
    await agent.setupStorage("taco-test");
  });

  describe("TACo Configuration", function () {
    it("should initialize TACo when configuration is provided", function () {
      expect(agent.tacoConfig).to.exist;
      expect(agent.tacoConfig.ritualId).to.be.a("number");
      expect(agent.tacoConfig.domain).to.equal(TACO_DOMAIN);
    });

    it("should handle missing TACo configuration gracefully", function () {
      const agentWithoutTaco = new Agent({
        chain: AGENT_CHAIN,
        viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
        pimlicoAPIKey: process.env.PIMLICO_API_KEY,
        storageProvider,
        // No taco configuration
      });

      expect(agentWithoutTaco.tacoConfig).to.be.undefined;
    });
  });

  describe("File Operations", function () {
    it("should create public files when no accessConditions are provided", async function () {
      const result = await agent.create("This is a public test file");

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", false);
      expect(result).to.have.property("hash");
    });

    it("should create encrypted files when accessConditions are provided", async function () {
      // Log chain configuration for encryption test
      const agentChainId = await agent.publicClient.getChainId();
      console.log(`🔍 Encryption Test Configuration:`);
      console.log(`   Agent Chain ID: ${agentChainId}`);
      console.log(`   Condition Chain ID: ${TACO_CHAIN_ID}`);
      console.log(`   TACo Domain: ${TACO_DOMAIN}`);

      // Use loaded TACo conditions (from require)

      // Create a native TACo RPC condition (simple balance check)
      const accessConditions = new conditions.base.rpc.RpcCondition({
        chain: TACO_CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 0, // Any balance
        },
      });

      const result = await agent.create("This is an encrypted test file", {
        accessCondition: accessConditions,
      });

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", true);
      expect(result).to.have.property("accessCondition");
      expect(result).to.have.property("hash");
    });

    it("should retrieve file metadata including encryption status", async function () {
      const publicFile = await agent.create("Public file for metadata test");
      const fileInfo = await agent.getFile(publicFile.fileId);

      expect(fileInfo).to.have.property("metadata");
      expect(fileInfo).to.have.property("encrypted");
      expect(fileInfo.encrypted).to.be.false;
    });

    it("should download public file content", async function () {
      const publicFile = await agent.create("Public content to download");
      const fileContent = await agent.getFileContent(publicFile.fileId);

      expect(fileContent).to.have.property("content");
      expect(fileContent.content).to.include("Public content to download");
      expect(fileContent).to.have.property("decrypted", false);
    });
  });

  describe("TacoEncryption", function () {
    let tacoEncryption;

    beforeEach(async function () {
      // Log the chain configuration mismatch issue
      const agentChainId = await agent.publicClient.getChainId();
      console.log(`🔍 Configuration Analysis:`);
      console.log(`   Agent Chain: ${AGENT_CHAIN}`);
      console.log(`   Agent Client Chain ID: ${agentChainId}`);
      console.log(`   TACo Chain ID: ${TACO_CHAIN_ID}`);
      console.log(`   TACo Domain: ${TACO_DOMAIN}`);
      console.log(`   TACo Ritual ID: ${TACO_RITUAL_ID}`);

      if (agentChainId !== TACO_CHAIN_ID) {
        console.warn(
          `⚠️  CHAIN MISMATCH: Agent client (${agentChainId}) != TACo chain (${TACO_CHAIN_ID})`
        );
        console.warn(`   This will cause coordinator contract lookup to fail!`);
      }

      // Create TACo-specific viem client connected to Polygon Amoy
      const tacoViemClient = createPublicClient({
        chain: polygonAmoy,
        transport: http(),
      });

      console.log(
        `✅ Created TACo viem client for chain ${await tacoViemClient.getChainId()}`
      );

      // Create TacoService instance with correct chain client
      tacoEncryption = new TacoService({
        ritualId: TACO_RITUAL_ID,
        domain: TACO_DOMAIN,
        viemClient: tacoViemClient, // Use TACo-specific client
        viemAccount: agent.viemAccount,
      });

      // Initialize TACo for condition creation tests
      await tacoEncryption.initialize();
    });

    it("should create valid contract conditions", async function () {
      // Create native TACo contract condition
      const condition = new conditions.base.contract.ContractCondition({
        chain: TACO_CHAIN_ID,
        contractAddress: "0x1234567890123456789012345678901234567890",
        method: "balanceOf",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: ">=",
          value: 1,
        },
        standardContractType: "ERC721",
      });

      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("ContractCondition");
    });

    it("should create valid time conditions", async function () {
      // Create native TACo time condition
      const condition = new conditions.base.time.TimeCondition({
        chain: TACO_CHAIN_ID,
        method: "blocktime",
        returnValueTest: {
          comparator: "<=",
          value: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        },
      });

      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("TimeCondition");
    });

    it("should create valid RPC conditions", async function () {
      // Create native TACo RPC condition
      const condition = new conditions.base.rpc.RpcCondition({
        chain: TACO_CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 1000000000000000, // 0.001 ETH in wei (smaller number for validation)
        },
      });

      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("RpcCondition");
    });

    it("should validate native TACo condition objects", async function () {
      // Test that native TACo conditions work with proper validation
      const validCondition = new conditions.base.rpc.RpcCondition({
        chain: TACO_CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 0,
        },
      });

      expect(validCondition).to.exist;
      expect(validCondition.constructor.name).to.equal("RpcCondition");
      // Test that the condition was created successfully with proper structure
    });
  });
});

// Separate test suite for when TACo is NOT available
describe("TACo Integration Tests - TACo Not Available", function () {
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

    // Initialize agent WITHOUT TACo configuration
    agentWithoutTaco = new Agent({
      chain: AGENT_CHAIN,
      viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
      pimlicoAPIKey: process.env.PIMLICO_API_KEY,
      storageProvider,
      // No taco configuration
    });

    await agentWithoutTaco.setupStorage("no-taco-test");
  });

  describe("Agent without TACo configuration", function () {
    it("should have undefined tacoConfig when no TACo config provided", function () {
      expect(agentWithoutTaco.tacoConfig).to.be.undefined;
    });

    it("should create public files when no accessConditions are provided", async function () {
      const result = await agentWithoutTaco.create(
        "This is a public test file"
      );

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", false);
      expect(result).to.have.property("hash");
    });

    it("should throw error when accessCondition provided but TACo not configured", async function () {
      // Create a mock TACo condition object (since we don't have TACo loaded in this test)
      const accessCondition = {
        chain: TACO_CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 0,
        },
      };

      try {
        await agentWithoutTaco.create("Test with conditions but no TACo", {
          accessCondition,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include(
          "Access condition provided but TACo is not configured"
        );
      }
    });
  });

  describe("TacoService without TACo package", function () {
    it("should throw error when creating TacoService without ritualId", function () {
      expect(function () {
        new TacoService({
          domain: "TESTNET",
          viemClient: "valid_client",
          viemAccount: "valid_account",
        });
      }).to.throw("Valid ritual ID is required for TACo initialization");
    });

    it("should throw error when creating TacoService without viemClient", function () {
      expect(function () {
        new TacoService({
          ritualId: 6,
          domain: "TESTNET",
          viemAccount: "valid_account",
        });
      }).to.throw("Viem client is required for TACo operations");
    });
  });
});
