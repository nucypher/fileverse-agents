import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { Agent, TacoEncryption } from "../agent/index.js";
import { PinataStorageProvider } from "../storage/pinata.js";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

// TACo imports will be loaded dynamically
let taco, domains, conditions;

const TACO_DOMAIN = process.env.TACO_DOMAIN || "lynx";
const TACO_RITUAL_ID = parseInt(process.env.TACO_RITUAL_ID || 27);

const CHAIN_ID = parseInt(process.env.CHAIN_ID || 11155111);
const CHAIN = process.env.CHAIN || "sepolia";

dotenv.config();

describe("TACo Integration Tests - TACo Available", function () {
  this.timeout(60000); // Increase timeout for TACo operations

  let agent;
  let storageProvider;

  before(async function () {
    // Import TACo - tests will fail if TACo is not available
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);

    taco = require("@nucypher/taco");
    ({ domains, conditions } = taco);

    // Initialize storage provider
    storageProvider = new PinataStorageProvider({
      pinataJWT: process.env.PINATA_JWT || "test-jwt",
      pinataGateway:
        process.env.PINATA_GATEWAY || "https://test-gateway.mypinata.cloud",
    });

    // Initialize agent with TACo configuration
    agent = new Agent({
      chain: CHAIN,
      viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY),
      pimlicoAPIKey: process.env.PIMLICO_API_KEY,
      storageProvider,
      taco: {
        domain: TACO_DOMAIN,
        ritualId: parseInt(TACO_RITUAL_ID),
        provider: null, // Will use publicClient
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
        chain: CHAIN,
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
      const accessConditions = {
        type: "rpc",
        chain: CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 0, // Any balance
        },
      };

      const result = await agent.create("This is an encrypted test file", {
        accessConditions,
      });

      expect(result).to.have.property("fileId");
      expect(result).to.have.property("encrypted", true);
      expect(result).to.have.property("accessConditions");
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
      // Create TacoEncryption instance for testing condition creation
      tacoEncryption = new TacoEncryption({
        taco: {
          ritualId: TACO_RITUAL_ID,
          domain: TACO_DOMAIN,
        },
        agent: agent,
      });

      // Initialize TACo for condition creation tests (this might fail but that's ok for testing conditions)
      try {
        await tacoEncryption.initializeTaco();
      } catch (error) {
        console.log(
          "TACo initialization failed in test, but continuing with condition tests"
        );
      }
    });

    it("should create valid contract conditions", async function () {
      const conditionConfig = {
        type: "contract",
        chain: CHAIN_ID,
        contractAddress: "0x1234567890123456789012345678901234567890",
        method: "balanceOf",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: ">=",
          value: 1,
        },
        standardContractType: "ERC721",
      };

      const condition = await tacoEncryption.createConditionFromConfig(
        conditionConfig
      );
      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("ContractCondition");
    });

    it("should create valid time conditions", async function () {
      const conditionConfig = {
        type: "time",
        chain: CHAIN_ID,
        method: "blocktime",
        returnValueTest: {
          comparator: "<=",
          value: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        },
      };

      const condition = await tacoEncryption.createConditionFromConfig(
        conditionConfig
      );
      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("TimeCondition");
    });

    it("should create valid RPC conditions", async function () {
      const conditionConfig = {
        type: "rpc",
        chain: CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 1000000000000000, // 0.001 ETH in wei (smaller number for validation)
        },
      };

      const condition = await tacoEncryption.createConditionFromConfig(
        conditionConfig
      );
      expect(condition).to.exist;
      expect(condition.constructor.name).to.equal("RpcCondition");
    });

    it("should throw error for unsupported condition types", async function () {
      const conditionConfig = {
        type: "unsupported",
        chain: CHAIN_ID,
      };

      try {
        await tacoEncryption.createConditionFromConfig(conditionConfig);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include("Unsupported condition type");
      }
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
      chain: CHAIN,
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

    it("should throw error when accessConditions provided but TACo not configured", async function () {
      const accessConditions = {
        type: "rpc",
        chain: CHAIN_ID,
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">=",
          value: 0,
        },
      };

      try {
        await agentWithoutTaco.create("Test with conditions but no TACo", {
          accessConditions,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.include(
          "Access conditions provided but TACo is not configured"
        );
      }
    });
  });

  describe("TacoEncryption without TACo package", function () {
    it("should throw error when creating TacoEncryption without TACo config", function () {
      expect(() => {
        new TacoEncryption({
          taco: null, // No TACo config
          agent: agentWithoutTaco,
        });
      }).to.throw("TACo configuration is required");
    });

    it("should throw error when creating TacoEncryption without agent", function () {
      expect(() => {
        new TacoEncryption({
          taco: { ritualId: TACO_RITUAL_ID, domain: TACO_DOMAIN },
          agent: null, // No agent
        });
      }).to.throw("Agent instance is required");
    });
  });
});
