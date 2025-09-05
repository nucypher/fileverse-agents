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

import { FileType } from "../config/constants.js";

// Services
import { ValidationService } from "../services/ValidationService.js";

/**
 * Fileverse Agent - A comprehensive file management system with optional encryption
 *
 * @class Agent
 * @description The Agent class provides functionality for creating, reading, updating, and deleting
 * files with blockchain integration. When a data access provider is provided,
 * it automatically handles encrypted files using the provider pattern.
 *
 * Features:
 * - Public file operations (create, read, update, delete)
 * - Optional encryption with programmable access conditions via data access providers
 * - Pluggable provider architecture for different encryption backends
 * - Smart contract integration for on-chain metadata
 * - IPFS storage support via Pinata
 * - Account abstraction with Safe Wallets
 * - Transparent encryption/decryption when data access provider is configured
 */
class Agent {
  DELETED_HASH = "deleted";
  constructor({
    chain,
    viemAccount,
    pimlicoAPIKey,
    storageProvider,
    dataAccessProvider,
  }) {
    // Validate all input parameters
    console.debug("🚀 Initializing Fileverse Agent...");
    console.debug("Agent configuration:", {
      chain: typeof chain === "string" ? chain : chain?.name,
      accountAddress: viemAccount?.address,
      hasPimlicoAPIKey: !!pimlicoAPIKey,
      storageProvider: storageProvider?.constructor?.name || "Unknown",
      hasDataAccessProvider: !!dataAccessProvider,
    });

    ValidationService.validateAgentConfig({
      chain,
      viemAccount,
      pimlicoAPIKey,
      storageProvider,
    });

    console.debug("✅ Agent configuration validated");

    // Set core properties
    this.chain =
      chain === "gnosis" || chain?.name?.toLowerCase() === "gnosis"
        ? gnosis
        : sepolia;
    console.debug(
      `🔗 Chain selected: ${this.chain.name} (ID: ${this.chain.id})`
    );

    this.pimlicoAPIKey = pimlicoAPIKey;
    this.storageProvider = storageProvider;
    this.viemAccount = viemAccount;
    console.debug(`📁 Storage provider: ${storageProvider?.constructor?.name}`);

    // Generate clients
    console.debug("🔧 Generating blockchain clients...");
    const clients = this.generateClients();
    this.publicClient = clients.publicClient;
    this.walletClient = clients.walletClient;
    console.debug("✅ Blockchain clients generated");

    // Initialize data access provider
    if (dataAccessProvider) {
      console.debug("🔐 Data access provider provided:", {
        type: dataAccessProvider.getProviderType(),
      });
      this.dataAccessProvider = dataAccessProvider;
      // Defer validation to first use to avoid blocking constructor
      this._providerValidated = false;
    }

    // Set portal registry based on chain
    this.portalRegistry = this.setPortalRegistry();
    console.debug(`📜 Portal registry: ${this.portalRegistry}`);

    this.owner = this.viemAccount.address;
    console.debug(`✅ Agent initialized for address: ${this.owner}`);
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
        console.debug(`🔍 Storage already exists for namespace: ${namespace}`);
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
   * Create a new file (public or encrypted based on a composite or a simple accessCondition)
   *
   * @param {string|object} output - The file content (string for text, object for JSON)
   * @param {object} options - Configuration options
   * @param {object} [options.accessCondition] - Access condition for encryption. It could be a composite or a simple access condition.
   * @returns {Promise<object>} File creation result with fileId, hash, encrypted status
   * @throws {Error} If validation fails
   *
   * @example
   * // Create public file
   * const result = await agent.create('Hello World');
   *
   * @example
   * // Create encrypted file with time-based access condition (while using TACo as the data access provider)
   * const result = await agent.create('Secret content', {
   *   accessCondition: {
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
    let dataAccessMetadata = null;
    let filetype = FileType.PUBLIC;

    // Handle encryption if accessCondition is provided
    if (options.accessCondition) {
      if (!this.dataAccessProvider) {
        throw new Error(
          `Data access provider is required for encrypted files. Please provide a dataAccessProvider in the Agent constructor.`
        );
      }

      // Validate provider on first use
      if (!this._providerValidated) {
        await this.dataAccessProvider.validateConfig();
        this._providerValidated = true;
      }

      // Encrypt the content using the provider
      const encryptedBytes = await this.dataAccessProvider.encrypt(
        contentToUpload,
        options.accessCondition
      );
      contentToUpload = encryptedBytes;
      filename = "encrypted_content.bin";
      isEncrypted = true;

      // Get metadata config from data access provider
      if (this.dataAccessProvider) {
        dataAccessMetadata = this.dataAccessProvider.getMetadataConfig();
      }

      filetype = FileType.PRIVATE;
    }

    // Upload content (either original or encrypted)
    const contentIpfsHash = await this.uploadToStorage(
      filename,
      contentToUpload
    );

    // Create metadata
    const metadata = {
      name: `${this.portal.portalAddress}/${this.namespace}/${isEncrypted ? "encrypted_output.md" : "output.md"}`,
      description: isEncrypted
        ? "Encrypted Markdown file created by FileverseAgent"
        : "Markdown file created by FileverseAgent",
      encrypted: isEncrypted,
      ...(dataAccessMetadata && { dataAccessConfig: dataAccessMetadata }),
    };

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

    // Add the accessCondition to the return object if encrypted
    if (isEncrypted) {
      transaction.accessCondition = options.accessCondition;
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
      const metadataResult =
        await this.storageProvider.download(metadataIpfsHash);
      // Handle both old and new Pinata SDK response formats
      let metadataContent = metadataResult.data || metadataResult;

      // Simplified metadata handling: parse strings as JSON, use everything else as-is
      if (typeof metadataContent === "string") {
        try {
          metadata = JSON.parse(metadataContent);
        } catch (parseError) {
          console.warn(
            `Could not parse metadata as JSON for file ${fileId}:`,
            parseerror
          );
          metadata = {};
        }
      } else {
        // For all other cases, use metadata as is
        metadata = metadataContent || {};
      }
    } catch (error) {
      console.warn(`Could not retrieve metadata for file ${fileId}:`, error);
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

  /**
   * Get file metadata and content by ID, with automatic decryption for encrypted files
   * @param {string|number|bigint} fileId - The file ID to retrieve
   * @param {Object} conditionContext - Optional custom condition context for decryption.
   *                                   If not provided, creates basic context from messageKit.
   *                                   Caller is responsible for configuring auth providers.
   * @returns {Promise<object>} File information with content
   */
  async getFileContent(fileId, conditionContext = undefined) {
    ValidationService.validateFileId(fileId);
    const fileInfo = await this.getFile(fileId);

    // Use data access provider for encrypted files
    if (fileInfo.metadata.encrypted) {
      if (this.dataAccessProvider) {
        // Validate provider on first use
        if (!this._providerValidated) {
          await this.dataAccessProvider.validateConfig();
          this._providerValidated = true;
        }

        // Download encrypted bytes and decrypt
        const encryptedBytes = await this.storageProvider.downloadBytes(
          fileInfo.contentIpfsHash
        );

        // Decrypt with proper context
        const decryptedBytes = await this.dataAccessProvider.decrypt(
          encryptedBytes,
          conditionContext
        );

        // Convert Uint8Array to string
        const decryptedContent = new TextDecoder().decode(decryptedBytes);

        return {
          ...fileInfo,
          content: decryptedContent,
          decrypted: true,
        };
      } else {
        console.warn(
          `Encrypted file ${fileId} detected but no data access provider configured`
        );
        throw new Error(
          "Cannot decrypt encrypted file. Data access provider required for encrypted file operations."
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
      throw new Error(
        `Failed to download file content for fileId ${fileId}:`,
        error
      );
    }
  }

  /**
   * Update an existing file with new content
   * @param {string|number|bigint} fileId - The file ID to update
   * @param {string|object} output - The new file content
   * @param {object} options - Configuration options
   * @param {object} [options.accessCondition] - Access condition for encryption
   * @returns {Promise<object>} Transaction result
   */
  async update(fileId, output, options = {}) {
    ValidationService.validateFileId(fileId);
    ValidationService.validateFileContent(output);
    await this.prechecks();

    // Read latest metadata and content IPFS hashes from portal before updating,
    // in order to unpin them after a successful update transaction
    const fileBeforeUpdate = await this.getFile(fileId);

    let contentToUpload = output;
    let filename = "output.md";
    let isEncrypted = false;
    let dataAccessMetadata = null;

    let filetype = FileType.PUBLIC;

    // Handle encryption if accessCondition is provided
    if (options.accessCondition) {
      if (!this.dataAccessProvider) {
        throw new Error(
          `Data access provider is required for encrypted files. Please provide a dataAccessProvider in the Agent constructor.`
        );
      }

      // Validate provider on first use
      if (!this._providerValidated) {
        await this.dataAccessProvider.validateConfig();
        this._providerValidated = true;
      }

      // Encrypt the content using the provider
      const encryptedBytes = await this.dataAccessProvider.encrypt(
        contentToUpload,
        options.accessCondition
      );
      contentToUpload = encryptedBytes;
      filename = "encrypted_content.bin";
      isEncrypted = true;

      // Get metadata config from data access provider
      if (this.dataAccessProvider) {
        dataAccessMetadata = this.dataAccessProvider.getMetadataConfig();
      }

      filetype = FileType.PRIVATE; // Use PRIVATE for encrypted files
    }

    const contentIpfsHash = await this.uploadToStorage(
      filename,
      contentToUpload
    );

    const metadata = {
      name: `${this.portal.portalAddress}/${this.namespace}/${filename}`,
      description: isEncrypted
        ? "Updated encrypted file by FileverseAgent"
        : "Updated Markdown file by FileverseAgent",
      contentIpfsHash,
      encrypted: isEncrypted,
      ...(dataAccessMetadata && { dataAccessConfig: dataAccessMetadata }),
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
            filetype,
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
      console.error(`Error unpinning file ${fileId} from storage:`, error);
    }

    const transaction = {
      hash: hash,
      fileId,
      portalAddress: this.portal.portalAddress,
    };
    return transaction;
  }

  /**
   * Check if the agent has a data access provider configured
   * @returns {boolean} True if data access provider is available
   */
  hasDataAccessProvider() {
    return !!this.dataAccessProvider;
  }

  /**
   * Get the configured data access provider
   * @returns {DataAccessProvider|null} The configured provider or null
   */
  getDataAccessProvider() {
    return this.dataAccessProvider || null;
  }

  /**
   * Get information about the configured data access provider
   * @returns {object|null} Provider configuration info or null
   */
  getDataAccessProviderInfo() {
    if (!this.dataAccessProvider) {
      return null;
    }
    return this.dataAccessProvider.getConfig();
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
              FileType.PUBLIC, // filetype
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
        console.error(
          "Error unpinning file from storage during delete:",
          error
        );
      }

      const transaction = {
        hash: hash,
        fileId,
        portalAddress: this.portal.portalAddress,
      };
      return transaction;
    } catch (error) {
      console.error(`Error deleting file ${fileId}:`, error);
      throw new Error("File deletion failed.");
    }
  }
}

export { Agent };
