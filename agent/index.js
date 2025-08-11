import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
} from "viem";
import { gnosis, sepolia } from "viem/chains";
import { PortalRegistryABI, PortalABI } from "../abi/index.js";
import { generatePortalKeys, getPortalKeyVerifiers } from "./keys.js";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { toSafeSmartAccount } from "permissionless/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import fs from "fs";

// Services
import { ValidationService } from "../services/ValidationService.js";

/**
 * Fileverse Agent - A comprehensive file management system with optional encryption
 *
 * @class Agent
 * @description The Agent class provides functionality for creating, reading, updating, and deleting
 * files with blockchain integration. When TACo configuration is provided, it automatically
 * handles encrypted files using TacoEncryption internally.
 *
 * Features:
 * - Public file operations (create, read, update, delete)
 * - Optional TACo-based encryption with programmable access conditions
 * - Smart contract integration for on-chain metadata
 * - IPFS storage support via Pinata
 * - Account abstraction with Safe Wallets
 * - Transparent encryption/decryption when TACo is configured
 */
class Agent {
  DELETED_HASH = "deleted";
  constructor({ chain, viemAccount, pimlicoAPIKey, storageProvider, taco }) {
    // Validate all input parameters
    ValidationService.validateAgentConfig({
      chain,
      viemAccount,
      pimlicoAPIKey,
      storageProvider,
    });

    // Store TACo config for potential TacoEncryption creation
    this.tacoConfig = taco;

    // Set core properties
    this.chain =
      chain === "gnosis" || chain?.name?.toLowerCase() === "gnosis"
        ? gnosis
        : sepolia;
    this.pimlicoAPIKey = pimlicoAPIKey;
    this.storageProvider = storageProvider;
    this.viemAccount = viemAccount;

    // Generate clients
    const clients = this.generateClients();
    this.publicClient = clients.publicClient;
    this.walletClient = clients.walletClient;

    // Set portal registry based on chain
    this.portalRegistry = this.setPortalRegistry();

    this.owner = this.viemAccount.address;
  }

  /**
   * Get or create TacoEncryption instance when TACo configuration is available
   * @private
   */
  async _getTacoEncryption() {
    if (!this.tacoConfig) {
      return null;
    }

    if (!this._tacoEncryption) {
      // Import TacoEncryption dynamically to avoid circular imports
      const { TacoEncryption } = await import("./TacoEncryption.js");
      this._tacoEncryption = new TacoEncryption({
        taco: this.tacoConfig,
        agent: this,
      });

      // Initialize TACo service
      try {
        await this._tacoEncryption.initializeTaco();
      } catch (error) {
        console.warn("Failed to initialize TACo:", error.message);
      }
    }

    return this._tacoEncryption;
  }

  /**
   * Set up Safe smart account with Pimlico paymaster
   * @returns {Promise<object>} Smart account client instance
   */
  async setupSafe() {
    const pimlicoRpcUrl = `https://api.pimlico.io/v2/${this.chain.name.toLowerCase()}/rpc?apikey=${this.pimlicoAPIKey}`;
    const paymasterClient = createPimlicoClient({
      transport: http(pimlicoRpcUrl),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    });
    this.safeAccount = await toSafeSmartAccount({
      client: this.publicClient,
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      owners: [this.viemAccount],
      version: "1.4.1",
    });
    const smartAccountClient = createSmartAccountClient({
      account: this.safeAccount,
      chain: this.chain,
      paymaster: paymasterClient,
      bundlerTransport: http(pimlicoRpcUrl),
      userOperation: {
        estimateFeesPerGas: async () =>
          (await paymasterClient.getUserOperationGasPrice()).fast,
      },
    });
    this.smartAccountClient = smartAccountClient;
    return smartAccountClient;
  }

  /**
   * Generate viem clients for public and wallet operations
   * @returns {object} Object containing publicClient and walletClient
   */
  generateClients() {
    return {
      publicClient: createPublicClient({
        chain: this.chain,
        transport: http(),
      }),
      walletClient: createWalletClient({
        chain: this.chain,
        transport: http(),
        account: this.viemAccount,
      }),
    };
  }

  setPortalRegistry() {
    if (this.chain.name.toLowerCase() === "gnosis") {
      return "0x945690a516519daEE95834C05218839c8deEC88D";
    } else {
      return "0x8D9E28AC21D823ddE63fbf20FAD8EdD4F4a0cCfD";
    }
  }

  async getBlockNumber() {
    return this.publicClient.getBlockNumber();
  }

  async loadStorage(namespace) {
    if (!fs.existsSync("creds")) {
      fs.mkdirSync("creds");
    }
    if (!fs.existsSync(`creds/${namespace}.json`)) {
      return null;
    }
    const storage = fs.readFileSync(`creds/${namespace}.json`, "utf8");
    return JSON.parse(storage);
  }

  async setupStorage(namespace) {
    if (!namespace) {
      throw new Error("Namespace is required");
    }
    this.namespace = `${namespace}-${this.chain.name.toLowerCase()}`;
    await this.setupSafe();
    try {
      const storage = await this.loadStorage(this.namespace);
      if (storage && storage.namespace === this.namespace) {
        console.log("Storage already exists");
        this.portal = storage;
        return storage.portalAddress;
      }
      const metadataIPFSHash = await this.uploadToStorage(
        "metadata.json",
        JSON.stringify({
          namespace: this.namespace,
          source: "FileverseAgent",
          gateway: this.pinataGateway,
        })
      );
      const portalKeys = await generatePortalKeys();
      const verifiers = await getPortalKeyVerifiers(portalKeys);
      const hash = await this.smartAccountClient.sendUserOperation({
        calls: [
          {
            to: this.portalRegistry,
            abi: PortalRegistryABI,
            functionName: "mint",
            args: [
              metadataIPFSHash,
              portalKeys.viewDID,
              portalKeys.editDID,
              verifiers.portalEncryptionKeyVerifier,
              verifiers.portalDecryptionKeyVerifier,
              verifiers.memberEncryptionKeyVerifer,
              verifiers.memberDecryptionKeyVerifer,
            ],
          },
        ],
      });
      const receipt = await this.smartAccountClient.waitForUserOperationReceipt(
        {
          hash,
        }
      );

      const logs = parseEventLogs({
        abi: PortalRegistryABI,
        logs: receipt.logs,
        eventName: "Mint",
      });

      const portalAddress = logs[0].args.portal;

      if (!portalAddress) throw new Error("Portal not found");

      const portalData = {
        portalAddress,
        owner: this.owner,
        namespace: this.namespace,
        metadataIPFSHash,
        portalKeys,
        verifiers,
      };

      // Set portal data
      this.portal = portalData;

      fs.writeFileSync(
        `creds/${this.namespace}.json`,
        JSON.stringify(portalData, null, 2)
      );
      return portalAddress;
    } catch (error) {
      console.error("Error deploying portal:", error);
      throw error;
    }
  }

  async getPortal() {
    return this.portal;
  }

  async prechecks() {
    if (!this.safeAccount) {
      throw new Error("Storage not setup yet!");
    }
    if (!this.portal || !this.portal.portalAddress) {
      throw new Error("Portal not found!");
    }
  }

  async uploadToStorage(fileName, content) {
    return this.storageProvider.upload(fileName, content);
  }

  /**
   * Initialize TACo if configuration is available
   * @returns {Promise<boolean>} True if TACo was initialized, false if no config
   */
  async initializeTaco() {
    const tacoEncryption = await this._getTacoEncryption();
    if (tacoEncryption) {
      await tacoEncryption.initializeTaco();
      return true;
    }
    return false;
  }

  /**
   * Create a new file (public or encrypted based on accessConditions)
   *
   * @param {string|object} output - The file content (string for text, object for JSON)
   * @param {object} options - Configuration options
   * @param {object} [options.accessConditions] - TACo access conditions for encryption
   * @returns {Promise<object>} File creation result with fileId, hash, encrypted status
   * @throws {Error} If validation fails
   *
   * @example
   * // Create public file
   * const result = await agent.create('Hello World');
   *
   * @example
   * // Create encrypted file with time-based access condition (requires TACo config)
   * const result = await agent.create('Secret content', {
   *   accessConditions: {
   *     type: 'time',
   *     returnValueTest: {
   *       comparator: '>=',
   *       value: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
   *     }
   *   }
   * });
   */
  async create(output, options = {}) {
    // Validate inputs
    if (!output || (typeof output !== "string" && typeof output !== "object")) {
      throw new Error(
        "Output content is required and must be a string or object"
      );
    }

    if (typeof options !== "object") {
      throw new Error("Options must be an object");
    }

    await this.prechecks();

    let contentToUpload = output;
    let filename = "output.md";
    let isEncrypted = false;
    let tacoRitualId = null;
    let filetype = 0; // 0 = PUBLIC

    // Handle encryption if accessConditions are provided
    if (options.accessConditions) {
      const tacoEncryption = await this._getTacoEncryption();
      if (!tacoEncryption) {
        throw new Error(
          "Access conditions provided but TACo is not configured. TACo configuration is required for encrypted file operations."
        );
      }

      // Encrypt the content
      contentToUpload = await tacoEncryption.encryptContent(
        output,
        options.accessConditions
      );
      filename = "encrypted_content.bin";
      isEncrypted = true;
      tacoRitualId = tacoEncryption.tacoConfig.ritualId;
      filetype = 1; // 1 = ENCRYPTED
    }

    // Upload content (either original or encrypted)
    const contentIpfsHash = await this.uploadToStorage(
      filename,
      contentToUpload
    );

    // Create metadata
    const metadata = {
      name: `${this.portal.portalAddress}/${this.namespace}/${
        isEncrypted ? "encrypted_output.md" : "output.md"
      }`,
      description: isEncrypted
        ? "Encrypted Markdown file created by FileverseAgent"
        : "Markdown file created by FileverseAgent",
      encrypted: isEncrypted,
    };

    // Add TACo-specific metadata if encrypted
    if (isEncrypted) {
      metadata.tacoRitualId = tacoRitualId;
    }

    const metadataIpfsHash = await this.uploadToStorage(
      "metadata.json",
      JSON.stringify(metadata)
    );

    // Store on-chain
    const hash = await this.smartAccountClient.sendUserOperation({
      calls: [
        {
          to: this.portal.portalAddress,
          abi: PortalABI,
          functionName: "addFile",
          args: [
            metadataIpfsHash,
            contentIpfsHash,
            "", // _gateIPFSHash (empty for both public and TACo encrypted files)
            filetype,
            0, // version
          ],
        },
      ],
    });

    const receipt = await this.smartAccountClient.waitForUserOperationReceipt({
      hash,
    });
    const logs = parseEventLogs({
      abi: PortalABI,
      logs: receipt.logs,
      eventName: "AddedFile",
    });

    const addedFileLog = logs[0];

    if (!addedFileLog) {
      throw new Error("AddedFile event not found");
    }

    const fileId = addedFileLog.args?.fileId;
    const transaction = {
      hash: hash,
      fileId,
      portalAddress: this.portal.portalAddress,
      encrypted: isEncrypted,
    };

    // Add accessConditions to return object if encrypted
    if (isEncrypted) {
      transaction.accessConditions = options.accessConditions;
    }

    return transaction;
  }

  /**
   * Get file metadata and information by ID
   * @param {string|number|bigint} fileId - The file ID to retrieve
   * @returns {Promise<object>} File information object
   */
  async getFile(fileId) {
    ValidationService.validateFileId(fileId);

    await this.prechecks();

    const file = await this.publicClient.readContract({
      address: this.portal.portalAddress,
      abi: PortalABI,
      functionName: "files",
      args: [fileId],
    });

    const [metadataIpfsHash, contentIpfsHash] = file;

    // Get metadata to check if file is encrypted
    let metadata = {};
    try {
      const metadataResult = await this.storageProvider.download(
        metadataIpfsHash
      );
      // Handle both old and new Pinata SDK response formats
      let metadataContent = metadataResult.data || metadataResult;

      // Simplified metadata handling: parse strings as JSON, use everything else as-is
      if (typeof metadataContent === "string") {
        try {
          metadata = JSON.parse(metadataContent);
        } catch (parseError) {
          console.warn("Could not parse string as JSON metadata:", parseError);
          metadata = {};
        }
      } else {
        // For all other cases, use metadata as is
        metadata = metadataContent || {};
      }
    } catch (error) {
      console.warn("Could not retrieve metadata:", error);
      metadata = {};
    }

    const fileInfo = {
      portal: this.portal,
      namespace: this.namespace,
      metadataIpfsHash,
      contentIpfsHash,
      metadata,
      encrypted: metadata.encrypted || false,
    };

    return fileInfo;
  }

  async getFileContent(fileId, signer = undefined) {
    ValidationService.validateFileId(fileId);
    const fileInfo = await this.getFile(fileId);

    // Use TacoEncryption for encrypted files
    if (fileInfo.metadata.encrypted) {
      const tacoEncryption = await this._getTacoEncryption();
      if (tacoEncryption) {
        // Download encrypted bytes and decrypt
        const encryptedBytes = await this.storageProvider.downloadBytes(
          fileInfo.contentIpfsHash
        );
        const decryptedContent = await tacoEncryption.decryptContent(
          encryptedBytes,
          signer
        );

        return {
          ...fileInfo,
          content: decryptedContent,
          decrypted: true,
        };
      } else {
        console.warn(
          "Encrypted file detected but TACo is not configured. Cannot decrypt."
        );
        throw new Error(
          "Cannot decrypt encrypted file. TACo configuration required for encrypted file operations."
        );
      }
    }

    // For public files, download content directly
    try {
      const result = await this.storageProvider.download(
        fileInfo.contentIpfsHash
      );
      // Handle both old and new Pinata SDK response formats
      let content = result.data || result;

      // Handle Blob objects from new Pinata SDK
      if (content instanceof Blob) {
        content = await content.text();
      }

      return {
        ...fileInfo,
        content,
        decrypted: false,
      };
    } catch (error) {
      throw new Error(`Failed to download file content: ${error.message}`);
    }
  }

  /**
   * Update an existing file with new content
   * @param {string|number|bigint} fileId - The file ID to update
   * @param {string|object} output - The new file content
   * @returns {Promise<object>} Transaction result
   */
  async update(fileId, output) {
    ValidationService.validateFileId(fileId);
    ValidationService.validateFileContent(output);
    await this.prechecks();

    // Read latest metadata and content IPFS hashes from portal before updating,
    // in order to unpin them after a successful update transaction
    const fileBeforeUpdate = await this.getFile(fileId);

    const contentIpfsHash = await this.uploadToStorage("output.md", output);

    const metadata = {
      name: `${this.portal.portalAddress}/${this.namespace}/output.md`,
      description: "Updated Markdown file by FileverseAgent",
      contentIpfsHash,
    };
    const metadataIpfsHash = await this.uploadToStorage(
      "metadata.json",
      JSON.stringify(metadata)
    );

    const hash = await this.smartAccountClient.sendUserOperation({
      calls: [
        {
          to: this.portal.portalAddress,
          abi: PortalABI,
          functionName: "editFile",
          args: [
            fileId,
            metadataIpfsHash,
            contentIpfsHash,
            "", // _gateIPFSHash (empty for public files)
            0, // filetype (0 = PUBLIC from enum)
            0, // version
          ],
        },
      ],
    });

    // try to unpin the file content and metadata
    try {
      const { metadataIpfsHash, contentIpfsHash } = fileBeforeUpdate;
      await this.storageProvider.unpin(metadataIpfsHash);
      await this.storageProvider.unpin(contentIpfsHash);
    } catch (error) {
      console.error("Error unpinning file from storage:", error);
    }

    const transaction = {
      hash: hash,
      fileId,
      portalAddress: this.portal.portalAddress,
    };
    return transaction;
  }

  /**
   * Delete a file by setting its content to 'deleted'
   * @param {string|number|bigint} fileId - The file ID to delete
   * @returns {Promise<object>} Transaction result
   */
  async delete(fileId) {
    ValidationService.validateFileId(fileId);
    await this.prechecks();
    try {
      const protocol = await this.storageProvider.protocol();

      // Read metadata and content IPFS hashes from portal before deleting,
      // in order to unpin them after a successful deletion transaction
      const fileBeforeDelete = await this.getFile(fileId);

      const hash = await this.smartAccountClient.sendUserOperation({
        calls: [
          {
            to: this.portal.portalAddress,
            abi: PortalABI,
            functionName: "editFile",
            args: [
              fileId,
              `${protocol}${this.DELETED_HASH}`,
              `${protocol}${this.DELETED_HASH}`,
              "", // _gateIPFSHash (empty for deleted files)
              0, // filetype (0 = PUBLIC from enum)
              0, // version
            ],
          },
        ],
      });

      try {
        const { metadataIpfsHash, contentIpfsHash } = fileBeforeDelete;
        await this.storageProvider.unpin(metadataIpfsHash);
        await this.storageProvider.unpin(contentIpfsHash);
      } catch (error) {
        console.error("Error unpinning file from storage:", error);
      }

      const transaction = {
        hash: hash,
        fileId,
        portalAddress: this.portal.portalAddress,
      };
      return transaction;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw new Error("File deletion failed.");
    }
  }
}

export { Agent };
export { TacoEncryption } from "./TacoEncryption.js";
