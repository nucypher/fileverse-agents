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
import { entryPoint07Address } from "viem/account-abstraction"
import { createSmartAccountClient } from "permissionless";
import fs from "fs";

class Agent {
  DELETED_HASH = "deleted";
  constructor({
    chain,
    viemAccount,
    pimlicoAPIKey,
    storageProvider,
    accessControlProvider,
  }) {
    if (!chain) {
      throw new Error("Chain is required - options: gnosis, sepolia");
    }
    if (!pimlicoAPIKey) {
      throw new Error("Pimlico API key is required");
    }
    if (!storageProvider) {
      throw new Error("Storage provider is required");
    }
    this.chain =
      chain === "gnosis" || chain?.name?.toLowerCase() === "gnosis"
        ? gnosis
        : sepolia;
    this.pimlicoAPIKey = pimlicoAPIKey;
    this.storageProvider = storageProvider;
    this.viemAccount = viemAccount;
    const clients = this.genrateClients();
    this.publicClient = clients.publicClient;
    this.walletClient = clients.walletClient;
    this.portalRegistry = this.setPortalRegistry();
    this.owner = this.viemAccount.address;
    this.accessControlProvider = accessControlProvider;

    // This is needed to check if the async validation was done later.
    // Because there can not be `await` in the constructor.
    this._asyncConfigValidated = false;
  }

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
        estimateFeesPerGas: async () => (await paymasterClient.getUserOperationGasPrice()).fast,
      },
    });
    this.smartAccountClient = smartAccountClient;
  }

  genrateClients() {
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
        calls: [{
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
        }]
      });
      const receipt = await this.smartAccountClient.waitForUserOperationReceipt({
        hash,
      });

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

    if (!this._asyncConfigValidated && this.accessControlProvider) {
      // any async validation should be added here
      await this.accessControlProvider.validateConfig();

      this._asyncConfigValidated = true;
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
   * @param {object} [options.accessControlConfig] - Access control configuration to be passed to the access control provider.
   * @returns {Promise<object>} File creation result with fileId, hash, encrypted status
   * @throws {Error} If validation fails
   *
   * @example
   * // Create public file
   * const result = await agent.create('Hello World');
   *
   * @example
   * // Create encrypted file with time-based access conditions, using TACo as the Access Control Provider
   * const result = await agent.create('Secret content', {
   *   accessControlConfig: {
   *     accessCondition: {
   *       type: 'time',
   *       returnValueTest: {
   *         comparator: '>=',
   *         value: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
   *       },
   *     },
   *   }
   * });
   */
  async create(output, options = {}) {
    await this.prechecks();

    let contentToUpload;
    let filename;
    let isEncrypted = false;
    let accessControlMetadata = null;

    // Handle if accessControlConfig is provided
    if (
      options &&
      options.accessControlConfig &&
      Object.keys(options.accessControlConfig).length > 0
    ) {
      if (!this.accessControlProvider) {
        throw new Error(
          `Access Control Provider is required to encrypt and share files. Please provide an accessControlProvider in the Agent constructor.`
        );
      }

      // Encrypt the content using the provider
      const encryptResult = await this.accessControlProvider.encrypt(
        output,
        // Pass options directly - the access control provider handle its own options
        options.accessControlConfig
      );
      contentToUpload = encryptResult.encryptedBytes;
      accessControlMetadata = encryptResult.accessControlMetadata;

      filename = "encrypted_output.bin";
      isEncrypted = true;
    } else {
      // No access control configuration provided
      contentToUpload = output;
      filename = "output.md";
    }

    // Upload content (either plaintext or encrypted)
    const contentIpfsHash = await this.uploadToStorage(
      filename,
      contentToUpload
    );

    // Create metadata
    const metadata = {
      name: `${this.portal.portalAddress}/${this.namespace}/${filename}`,
      description: isEncrypted
        ? "Encrypted Markdown file created by FileverseAgent"
        : "Markdown file created by FileverseAgent",
      encrypted: isEncrypted,
      ...(accessControlMetadata && {
        accessControlConfig: accessControlMetadata,
      }),
    };
    const metadataIpfsHash = await this.uploadToStorage(
      'metadata.json',
      JSON.stringify(metadata)
    );

    const hash = await this.smartAccountClient.sendUserOperation({
      calls: [{
        to: this.portal.portalAddress,
        abi: PortalABI,
        functionName: "addFile",
        args: [
          metadataIpfsHash,
          contentIpfsHash,
          "", // _gateIPFSHash (empty for public files)
          0, // filetype (0 = PUBLIC from enum)
          0, // version
        ],
      }]
    });

    const receipt = await this.smartAccountClient.waitForUserOperationReceipt({ hash });
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
   * Get file info and metadata by File ID
   * @param {string|number|bigint} fileId - The file ID to retrieve
   * @returns {Promise<object>} File information object with metadata
   */
  async getFileInfo(fileId) {
    await this.prechecks();
    const file = await this.publicClient.readContract({
      address: this.portal.portalAddress,
      abi: PortalABI,
      functionName: "files",
      args: [fileId],
    });
    const [metadataIpfsHash, contentIpfsHash] = file;

    let metadataContent;
    try {
      metadataContent = await this.storageProvider.download(metadataIpfsHash);
    } catch (error) {
      throw new Error(`Could not retrieve metadata for file ${fileId}:`, {
        cause: error,
      });
    }

    // Parse metadata: handle both string JSON and already-parsed objects
    let metadata;
    if (typeof metadataContent === "string") {
      try {
        metadata = JSON.parse(metadataContent);
      } catch (parseError) {
        throw new Error(
          `Could not parse metadata as JSON for file ${fileId}:`,
          { cause: parseError }
        );
      }
    } else if (metadataContent != null && typeof metadataContent === "object") {
      // Metadata was stored as JSON string but storage provider auto-parsed it (e.g., Pinata SDK)
      metadata = metadataContent;
    } else {
      throw new Error(
        `Unexpected metadata type for file ${fileId}: ${typeof metadataContent}`
      );
    }

    return {
      portal: this.portal,
      namespace: this.namespace,
      metadataIpfsHash,
      contentIpfsHash,
      metadata,
    };
  }

  /**
   * Get file with its content
   * @param {string|number|bigint|object} fileIdOrInfo - The file ID to retrieve or the file info object
   * @param {object} [options={}] - Configuration options
   * @param {object} [options.accessControlConfig] - Optional access control configuration for encrypted files
   * @returns {Promise<object>} File information object with content
   */
  async getFile(fileIdOrInfo, options = {}) {
    await this.prechecks();

    let fileInfo;
    if (
      typeof fileIdOrInfo === "string" ||
      typeof fileIdOrInfo === "number" ||
      typeof fileIdOrInfo === "bigint"
    ) {
      fileInfo = await this.getFileInfo(fileIdOrInfo);
    } else {
      fileInfo = fileIdOrInfo;
    }

    // Validate requirements for encrypted files
    if (fileInfo.metadata.encrypted && !this.accessControlProvider) {
      throw new Error(
        "Access control provider is required for encrypted files."
      );
    }

    try {
      // Use access control provider for encrypted files
      if (fileInfo.metadata.encrypted) {
        // Download encrypted bytes and decrypt
        const encryptedBytes = await this.storageProvider.download(
          fileInfo.contentIpfsHash,
          { binary: true }
        );

        const decryptedBytes = await this.accessControlProvider.decrypt(
          encryptedBytes,
          // Pass accessControlConfig options directly - each access control provider will handle its own options
          options.accessControlConfig
        );

        // Convert Uint8Array to string because the current implementation is specifically for .md MarkDown files which is text-based.
        // If the agent was expanded to support more file types, this would need to be changed among other changes.
        const decryptedContent = new TextDecoder().decode(decryptedBytes);

        return {
          ...fileInfo,
          content: decryptedContent,
          wasEncrypted: true,
        };
      }

      // Download public file content
      const content = await this.storageProvider.download(
        fileInfo.contentIpfsHash
      );

      return {
        ...fileInfo,
        content,
      };
    } catch (error) {
      throw new Error(
        `Failed to download file content for fileId ${
          fileInfo.fileId ?? "unknown"
        }: ${error.message || error}`
      );
    }
  }

  /**
   * Update an existing file with new content
   * @param {string|number|bigint} fileId - The file ID to update
   * @param {string|object} output - The new file content
   * @param {object} options - Configuration options
   * @param {object} [options.accessControlConfig] - Access control configuration to be passed to the access control provider.
   * @returns {Promise<object>} Transaction result
   */
  async update(fileId, output, options = {}) {
    await this.prechecks();

    // Read latest metadata and content IPFS hashes from portal before updating,
    // in order to unpin them after a successful update transaction
    const fileBeforeUpdate = await this.getFileInfo(fileId);

    let contentToUpload = output;
    let filename = "output.md";
    let isEncrypted = false;
    let accessControlMetadata = null;

    // Handle encryption if accessCondition is provided
    if (
      options &&
      options.accessControlConfig &&
      Object.keys(options.accessControlConfig).length > 0
    ) {
      if (!this.accessControlProvider) {
        throw new Error(
          `Access control provider is required for encrypted files. Please provide an accessControlProvider in the Agent constructor.`
        );
      }

      // Encrypt the content using the provider
      const encryptResult = await this.accessControlProvider.encrypt(
        contentToUpload,
        // Pass options directly - the access control provider handle its own options
        options.accessControlConfig
      );
      contentToUpload = encryptResult.encryptedBytes;
      accessControlMetadata = encryptResult.accessControlMetadata;
      filename = "encrypted_output.bin";
      isEncrypted = true;
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
      ...(accessControlMetadata && {
        accessControlConfig: accessControlMetadata,
      }),
    };
    const metadataIpfsHash = await this.uploadToStorage(
      "metadata.json",
      metadata
    );

    const hash = await this.smartAccountClient.sendUserOperation({
      calls: [{
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
      }]
    });

    // Wait for the user operation to be mined to ensure on-chain state is updated
    await this.smartAccountClient.waitForUserOperationReceipt({ hash });

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

  async delete(fileId) {
    await this.prechecks();
    try {
      const protocol = await this.storageProvider.protocol();

      // Read metadata and content IPFS hashes from portal before deleting,
      // in order to unpin them after a successful deletion transaction
      const fileBeforeDelete = await this.getFileInfo(fileId);

      const hash = await this.smartAccountClient.sendUserOperation({
        calls: [{
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
      }]
    });

      // Wait for user operation receipt to ensure deletion is finalized on-chain
      await this.smartAccountClient.waitForUserOperationReceipt({ hash });

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
