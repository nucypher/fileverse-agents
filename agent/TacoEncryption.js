/**
 * TacoEncryption - TACo encryption/decryption service
 * 
 * This class provides only TACo-specific operations:
 * - TACo initialization
 * - Content encryption with access conditions
 * - Content decryption
 * - TACo condition creation and serialization
 * 
 * All file management operations remain in the Agent class.
 */

import { TacoService } from "../services/TacoService.js";
import { createRequire } from "module";

export class TacoEncryption {
  constructor({ taco, agent }) {
    // Validate configuration
    if (!taco) {
      throw new Error("TACo configuration is required");
    }
    if (!agent) {
      throw new Error("Agent instance is required");
    }

    // Store reference to the agent for blockchain operations
    this.agent = agent;
    
    // Store TACo config for internal use
    this.tacoConfig = {
      ritualId: taco.ritualId,
      domain: taco.domain
    };
    
    // TacoService will be initialized lazily in initializeTaco()
    this.tacoService = null;
    this._initializationPromise = null;
  }

  /**
   * Initialize TACo service
   * @returns {Promise<void>}
   */
  async initializeTaco() {
    // Only initialize once
    if (!this._initializationPromise) {
      this._initializationPromise = this._initializeTacoService();
    }
    
    return await this._initializationPromise;
  }

  /**
   * Internal method to create and initialize TACo service
   * @private
   * @returns {Promise<void>}
   */
  async _initializeTacoService() {
    try {
      // Create dedicated TACo provider and signer for TACo network
      const tacoProvider = await this._createTacoProvider(this.tacoConfig);
      const tacoSigner = await this._createTacoSigner(this.agent.viemAccount, tacoProvider);
      
      // Initialize TACo service
      this.tacoService = new TacoService({
        ritualId: this.tacoConfig.ritualId,
        domain: this.tacoConfig.domain,
        provider: tacoProvider,
        signer: tacoSigner,
      });
      
      // Initialize the service
      await this.tacoService.initialize();
      
    } catch (error) {
      console.warn("TACo initialization failed:", error.message);
      // Reset the promise so it can be retried
      this._initializationPromise = null;
      throw error;
    }
  }

  /**
   * Encrypt content with TACo access conditions
   * @param {string|object} content - Content to encrypt
   * @param {object} accessConditions - TACo access conditions
   * @returns {Promise<Uint8Array>} Encrypted bytes
   */
  async encryptContent(content, accessConditions) {
    if (!accessConditions) {
      throw new Error("Access conditions are required for encryption");
    }

    if (!this.tacoService || !this.tacoService.isInitialized()) {
      throw new Error("TACo service not initialized. Cannot encrypt content.");
    }

    try {
      // Create condition from access conditions
      const condition = await this.createConditionFromConfig(accessConditions);

      // Use TacoService to encrypt the content
      const messageKit = await this.tacoService.encryptContent(content, condition);

      // Return encrypted bytes
      return messageKit.toBytes();
    } catch (error) {
      console.error("TacoEncryption: Error encrypting content:", error);
      throw new Error(`TACo encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted content
   * @param {Uint8Array} encryptedBytes - Encrypted content bytes
   * @param {object} signer - Signer for decryption
   * @returns {Promise<string>} Decrypted content
   */
  async decryptContent(encryptedBytes, signer) {
    if (!this.tacoService || !this.tacoService.isInitialized()) {
      throw new Error("TACo service not initialized. Cannot decrypt content.");
    }

    try {
      // Use TacoService to decrypt content
      const decryptedContent = await this.tacoService.decryptContent(
        encryptedBytes,
        signer
      );

      return decryptedContent;
    } catch (error) {
      console.error("TacoEncryption: Error decrypting content:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTacoConditionFailure = errorMessage.includes(
        "Threshold of responses not met"
      );

      throw new Error(
        isTacoConditionFailure
          ? "Access denied: TACo condition not satisfied"
          : `Decryption failed: ${errorMessage}`
      );
    }
  }

  /**
   * Create TACo condition from configuration
   * @param {object} conditionConfig - Condition configuration
   * @returns {Promise<object>} TACo condition object
   */
  async createConditionFromConfig(conditionConfig) {
    if (!this.tacoService) {
      throw new Error("TACo service not available. TACo configuration required.");
    }
    return await this.tacoService.createCondition(conditionConfig);
  }

  /**
   * Serialize TACo condition for storage
   * @param {object} condition - TACo condition object
   * @returns {string} Serialized condition
   */
  serializeCondition(condition) {
    if (!this.tacoService) {
      throw new Error("TACo service not initialized. TACo configuration required.");
    }
    return this.tacoService.serializeCondition(condition);
  }
  
  /**
   * Create a dedicated TACo provider for the TACo network
   * @private
   * @param {Object} tacoConfig - TACo configuration
   * @returns {Object} Ethers provider for TACo network
   */
  async _createTacoProvider(tacoConfig) {
    // Import ethers dynamically
    const ethers = await import('ethers');
    
    // Map TACo domain to network configuration
    const networkConfig = this._getTacoNetworkConfig(tacoConfig.domain);
    
    // Create ethers provider for TACo network
    // Handle both default and named exports
    const EthersLib = ethers.default || ethers;
    return new EthersLib.providers.JsonRpcProvider(networkConfig.rpcUrl);
  }

  /**
   * Get network configuration for TACo domain
   * @private
   * @param {string} domain - TACo domain
   * @returns {Object} Network configuration
   */
  _getTacoNetworkConfig(domain) {
    // TACo network configurations
    const networks = {
      'lynx': {
        chainId: 80002,
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        name: 'Polygon Amoy'
      },
      'TESTNET': {
        chainId: 80002,
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        name: 'Polygon Amoy'
      },
      'MAINNET': {
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        name: 'Polygon Mainnet'
      }
    };
    
    const config = networks[domain];
    if (!config) {
      throw new Error(`Unsupported TACo domain: ${domain}. Supported domains: ${Object.keys(networks).join(', ')}`);
    }
    
    return config;
  }



  /**
   * Create ethers.js signer for TACo network from viem account
   * @param {object} viemAccount - Viem account
   * @param {object} tacoProvider - Ethers provider for TACo network
   * @returns {object} Ethers.Wallet signer for TACo
   * @private
   */
  async _createTacoSigner(viemAccount, tacoProvider) {
    // Create an ethers-compatible signer that wraps the viem account
    // This works with any viem account (private key, browser wallet, etc.)
    return {
      address: viemAccount.address,
      provider: tacoProvider,
      
      async getAddress() {
        return viemAccount.address;
      },
      
      async signMessage(message) {
        // Convert message to proper format for viem
        const messageToSign = typeof message === 'string' ? message : new TextDecoder().decode(message);
        return await viemAccount.signMessage({ message: messageToSign });
      },
      
      async signTransaction(transaction) {
        // Note: For TACo, transaction signing might not be needed as it mainly uses message signing
        // But we provide it for completeness
        return await viemAccount.signTransaction(transaction);
      },
      
      async signTypedData(domain, types, message) {
        return await viemAccount.signTypedData({
          domain,
          types,
          message,
          primaryType: Object.keys(types).find(key => key !== 'EIP712Domain')
        });
      },
      
      // Additional ethers signer interface methods
      connect(provider) {
        // Return a new signer instance with the new provider
        // Note: We create a similar wrapper but can't call _createTacoSigner from here
        // This is mainly for ethers compatibility
        return {
          ...this,
          provider: provider
        };
      },
      
      // For debugging and compatibility
      _isViemWrappedSigner: true,
      _viemAccount: viemAccount
    };
  }


}
