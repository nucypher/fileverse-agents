/**
 * TACo Service with Published Package Compatibility
 * Uses the new temporary published TACo packages with native viem support
 */

import { ERROR_MESSAGES } from "../config/constants.js";

// TACo functions - loaded via dynamic import for browser and Node.js compatibility
// TODO: investigate the es/commonjs compatibility issue between the agent and taco-web and resolve it to use static imports like:
// import { encryptWithViem, decryptWithViem, initialize, conditions, domains } from "@nucypher/taco";
// For now, the dynamic import is used to load the TACo functions
let encryptWithViem, decryptWithViem, initialize, conditions, domains;

// TACo Auth functions with viem support - loaded via dynamic import
let tacoAuthModules;

export class TacoService {
  constructor({ ritualId, domain, viemClient, viemAccount }) {
    // Validate required parameters
    if (!ritualId || ritualId <= 0) {
      throw new Error("Valid ritual ID is required for TACo initialization");
    }
    if (!domain) {
      throw new Error("TACo domain is required");
    }
    if (!viemClient) {
      throw new Error("Viem client is required for TACo operations");
    }
    if (!viemAccount) {
      throw new Error("Viem account is required for TACo operations");
    }

    this.viemClient = viemClient;
    this.viemAccount = viemAccount;
    this.ritualId = ritualId;
    this.domain = domain;
    this.initialized = false;

    console.debug(`🔧 TACo Configuration:`);    
    console.debug(`   Domain: ${this.domain}`);
    console.debug(`   Ritual ID: ${this.ritualId}`);
    console.debug(`   Chain ID: ${this.getChainId()}`);
    console.debug(`   Has Viem Client: ${!!this.viemClient}`);
    console.debug(`   Has Viem Account: ${!!this.viemAccount}`);
    console.debug(`   Account Address: ${this.viemAccount?.address || "N/A"}`);
  }

  /**
   * Initialize TACo functions via createRequire (reliable with local packages)
   */
  static async initializeTaco() {
    if (encryptWithViem && decryptWithViem) {
      return; // Already initialized
    }

    try {
      console.debug('Initializing TACo modules');

      let TACo;
      // Environment detection: use createRequire in Node.js, dynamic import in browser
      if (typeof window === "undefined" && process?.versions?.node) {
        // Node.js environment - use createRequire for local linked packages
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        TACo = require("@nucypher/taco");
        console.debug('TACo loaded via require (Node.js environment)');
      } else {
        // Browser environment - use dynamic import
        TACo = await import("@nucypher/taco");
        console.debug('TACo loaded via dynamic import (Browser environment)');
      }

      // Extract functions from the imported module
      ({ encryptWithViem, decryptWithViem, initialize, conditions, domains } =
        TACo);

      // Load TACo Auth modules with viem support
      let TacoAuth;
      if (typeof window === "undefined" && process?.versions?.node) {
        // Node.js environment
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        TacoAuth = require("@nucypher/taco-auth");
        console.debug('TACo Auth loaded via require (Node.js environment)');
      } else {
        // Browser environment
        TacoAuth = await import("@nucypher/taco-auth");
        console.debug('TACo Auth loaded via dynamic import (Browser environment)');
      }

      // Store auth modules for later use
      tacoAuthModules = TacoAuth;

      // Log available functions for debugging
      console.debug('Available TACo functions', {
        encryptWithViem: !!encryptWithViem,
        decryptWithViem: !!decryptWithViem,
        initialize: !!initialize,
        conditions: !!conditions,
        domains: !!domains
      });
      
      // Debug domain structure
      if (domains) {
        console.debug('Available TACo domains:', Object.keys(domains));
      }

      if (!encryptWithViem || !decryptWithViem) {
        throw new Error(
          "TACo viem functions (encryptWithViem/decryptWithViem) not available. " +
            "The npm version (@nucypher/taco v0.6.0) doesn't include viem support. " +
            "Please use a newer version once available or build from the GitHub branch with viem support."
        );
      }

      console.debug('TACo initialization successful');
    } catch (error) {
      console.error('❌ TACo initialization failed:', error.message);
      console.debug('Error details:', {
        domain: this.domain,
        ritualId: this.ritualId,
        chainId: this.getChainId(),
        hasViemClient: !!this.viemClient,
        hasViemAccount: !!this.viemAccount,
        stack: error.stack
      });
      throw new Error(`Failed to initialize TACo: ${error.message}`);
    }
  }

  /**
   * Initialize TACo instance (public method for explicit initialization)
   */
  async initialize() {
    await this._ensureInitialized();
  }

  /**
   * Private method to ensure TACo is fully initialized (modules + domains)
   * Handles both static module loading and instance domain initialization
   */
  async _ensureInitialized() {
    try {
      // Step 1: Ensure TACo modules are loaded (static)
      await TacoService.initializeTaco();

      // Step 2: Ensure TACo domains are initialized for this instance
      if (!this.initialized) {
        console.debug('🔗 Initializing TACo domains...');
        await initialize();
        this.initialized = true;

        // Validate domain exists and log appropriately
        if (domains && domains[this.domain]) {
          const chainId = domains[this.domain].CHAIN_ID || domains[this.domain].chainId || 'Unknown';
          console.debug(`✅ TACo domains initialized: ${this.domain} (Chain: ${chainId})`);
        } else {
          console.debug(`✅ TACo domains initialized for: ${this.domain}`);
          console.warn(`⚠️ Domain ${this.domain} not found in domains object`);
          if (domains) {
            console.debug('Available domains:', Object.keys(domains));
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error.message ||
        'Unknown error occurred during TACo initialization';

      console.error('❌ TACo initialization failed:', errorMessage);
      console.debug('TACo initialization error details:', {
        domain: this.domain,
        ritualId: this.ritualId,
        chainId: this.getChainId(),
        originalError: error?.message,
        stack: error?.stack
      });

      this.initialized = false;

      throw new Error(`TACo initialization failed: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Encrypt data using the published TACo viem integration
   * Matches the exact signature: encryptWithViem(viemPublicClient, domain, message, condition, ritualId, viemAuthSigner)
   */
  async encrypt(data, accessCondition) {
    try {
      // Ensure TACo is fully initialized (modules + domains)
      await this._ensureInitialized();

      console.debug(`🔐 Starting TACo encryption for domain ${this.domain}, ritual ${this.ritualId}`);

      // Convert data to appropriate format
      const message = typeof data === "string" ? data : new Uint8Array(data);

      // Create access conditions using TACo conditions API
      if (!accessCondition.chain) {
        accessCondition.chain = this.getChainId();
      }
      // Use the published package's encryptWithViem function directly
      // Signature: encryptWithViem(viemPublicClient, domain, message, condition, ritualId, viemAuthSigner)
      const messageKit = await encryptWithViem(
        this.viemClient, // viemPublicClient
        this.domain, // domain
        message, // message (string or Uint8Array)
        accessCondition, // condition
        this.ritualId, // ritualId
        this.viemAccount // viemAuthSigner
      );

      console.debug('✅ TACo encryption successful');
      return messageKit;
    } catch (error) {
      console.error('❌ TACo encryption failed:', error.message);
      console.debug('Encryption error context:', {
        domain: this.domain,
        ritualId: this.ritualId,
        hasViemClient: !!this.viemClient,
        hasViemAccount: !!this.viemAccount,
        accountAddress: this.viemAccount?.address || 'N/A',
        dataType: typeof data,
        hasAccessCondition: !!accessCondition
      });
      throw new Error(`TACo encryption failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Create condition context with authentication for decryption using viem
   * @param {Object} messageKit - The encrypted message kit
   * @param {Object} customViemAccount - Optional custom viem account for authentication
   * @returns {Object} ConditionContext with authentication providers
   */
  async createConditionContext(messageKit, customViemAccount = null) {
    try {
      await this._ensureInitialized();
      
      const { conditions } = tacoModules;
      const { ViemEIP4361AuthProvider, USER_ADDRESS_PARAM_DEFAULT } = tacoAuthModules;
      
      // Create condition context from messageKit
      const conditionContext = conditions.context.ConditionContext.fromMessageKit(messageKit);
      
      // Use custom viem account if provided, otherwise use Agent's configured account
      const viemAccount = customViemAccount || this.viemAccount;
      
      // Create viem-native authentication provider
      const authProvider = await ViemEIP4361AuthProvider.create(
        this.viemClient, // viem PublicClient
        viemAccount      // viem Account
      );
      
      conditionContext.addAuthProvider(USER_ADDRESS_PARAM_DEFAULT, authProvider.ethersProvider);
      
      return conditionContext;
    } catch (error) {
      console.error('❌ Failed to create condition context:', error.message);
      throw new Error(`Failed to create condition context: ${error.message}`);
    }
  }

  /**
   * Decrypt data using the published TACo viem integration
   * Matches the exact signature: decryptWithViem(viemPublicClient, domain, messageKit, context?, porterUris?)
   */
  async decrypt(messageKit, conditionContext) {
    try {
      // Ensure TACo is fully initialized (modules + domains)
      await this._ensureInitialized();

      console.debug(`🔓 Starting TACo decryption for domain ${this.domain}`);

      // Use the published package's decryptWithViem function directly
      // Signature: decryptWithViem(viemPublicClient, domain, messageKit, context?, porterUris?)
      const decryptedData = await decryptWithViem(
        this.viemClient, // viemPublicClient
        this.domain, // domain
        messageKit, // messageKit
        conditionContext, // context (optional)
        undefined // porterUris (optional)
      );

      console.debug('✅ TACo decryption successful');

      // Convert Uint8Array to string for text data
      if (decryptedData instanceof Uint8Array) {
        return new TextDecoder().decode(decryptedData);
      }

      return decryptedData;
    } catch (error) {
      console.error('❌ TACo decryption failed:', error.message);
      console.debug('Decryption error context:', {
        domain: this.domain,
        hasMessageKit: !!messageKit,
        hasViemClient: !!this.viemClient,
        accountAddress: this.viemAccount?.address || 'N/A'
      });
      throw new Error(`TACo decryption failed: ${error.message}`);
    }
  }

  /**
   * Convenience method to decrypt with automatic condition context creation using viem
   * @param {Object} messageKit - The encrypted message kit
   * @param {Object} customViemAccount - Optional custom viem account for authentication
   * @returns {string} Decrypted content
   */
  async decryptWithAutoContext(messageKit, customViemAccount = null) {
    const conditionContext = await this.createConditionContext(messageKit, customViemAccount);
    return await this.decrypt(messageKit, conditionContext);
  }

  /**
   * Get chain ID for the current domain
   */
  getChainId() {
    const chainMapping = {
      lynx: 80002, // DEVNET - Polygon Amoy
      DEVNET: 80002,
      tapir: 80002, // TESTNET - Polygon Amoy
      TESTNET: 80002,
      MAINNET: 137, // MAINNET - Polygon
    };

    return chainMapping[this.domain] || 80002; // Default to Amoy
  }

  /**
   * Validate TACo configuration
   */
  static validateConfig(config) {
    const errors = [];

    if (!config.ritualId || config.ritualId <= 0) {
      errors.push("Valid ritual ID is required");
    }

    if (!config.domain) {
      errors.push("TACo domain is required");
    } else if (
      !["lynx", "DEVNET", "tapir", "TESTNET", "MAINNET"].includes(config.domain)
    ) {
      errors.push(
        "Invalid TACo domain. Supported: lynx, DEVNET, tapir, TESTNET, MAINNET"
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
