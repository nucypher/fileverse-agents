/**
 * TACo (Threshold Access Control) Service
 * Handles TACo encryption/decryption and condition management
 */

import { TACO_CONFIG, ERROR_MESSAGES } from "../config/constants.js";

// TACo imports will be loaded dynamically
let taco, tacoAuth, initialize, conditions, encrypt, decrypt, domains, ThresholdMessageKit, EIP4361AuthProvider, USER_ADDRESS_PARAM_DEFAULT;

export class TacoService {
  constructor(config) {
    this.config = {
      ritualId: config.ritualId,
      domain: config.domain || TACO_CONFIG.DEFAULT_DOMAIN,
      provider: config.provider,
      signer: config.signer,
      isInitialized: false,
      networkError: null,
    };
  }

  /**
   * Initialize TACo with dynamic imports
   */
  async initialize() {
    if (!this.config) {
      throw new Error(ERROR_MESSAGES.TACO_CONFIG_MISSING);
    }

    try {
      await this._loadTacoModules();
      await this._validateNetwork();
      await this._initializeTaco();

      this.config.isInitialized = true;
      this.config.networkError = null;

      console.log(
        `TACo initialized successfully on network ${await this._getChainId()} with ritual ${
          this.config.ritualId
        }`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn("TACo initialization failed:", errorMessage);

      this.config.isInitialized = false;
      this.config.networkError = errorMessage;

      if (errorMessage.includes("Failed to import TACo dependencies")) {
        throw error;
      }
    }
  }

  /**
   * Create condition from configuration
   */
  async createCondition(conditionConfig) {
    this._validateConditionConfig(conditionConfig);

    if (!conditions) {
      throw new Error(
        "TACo conditions not available. Ensure TACo is properly initialized."
      );
    }

    const { type, ...params } = conditionConfig;

    try {
      switch (type.toLowerCase()) {
        case "contract":
          this._validateContractConditionParams(params);
          return new conditions.base.contract.ContractCondition(params);
        case "time":
          this._validateTimeConditionParams(params);
          return new conditions.base.time.TimeCondition(params);
        case "rpc":
          this._validateRpcConditionParams(params);
          return new conditions.base.rpc.RpcCondition(params);
        default:
          throw new Error(
            `Unsupported condition type: ${type}. Supported types: contract, time, rpc`
          );
      }
    } catch (error) {
      throw new Error(`Failed to create ${type} condition: ${error.message}`);
    }
  }

  /**
   * Encrypt content with TACo
   */
  async encryptContent(content, accessConditions) {
    if (!this.isInitialized()) {
      throw new Error(ERROR_MESSAGES.TACO_NOT_INITIALIZED);
    }

    try {
      const message =
        typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;
      const messageKit = await encrypt(
        this.config.provider,
        this.config.domain,
        message,
        accessConditions,
        this.config.ritualId,
        this.config.signer
      );
      return messageKit;
    } catch (error) {
      throw new Error(`TACo encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt content with TACo
   */
  async decryptContent(encryptedData, signer) {
    if (!this.isInitialized()) {
      throw new Error(ERROR_MESSAGES.TACO_NOT_INITIALIZED);
    }

    try {
      const messageKitFromBytes = ThresholdMessageKit.fromBytes(encryptedData);
      const conditionContext =
        conditions.context.ConditionContext.fromMessageKit(messageKitFromBytes);

      // Add auth provider for condition if needed
      if (
        conditionContext.requestedContextParameters.has(
          USER_ADDRESS_PARAM_DEFAULT
        )
      ) {
        const authProvider = new EIP4361AuthProvider(
          this.config.provider,
          signer
        );
        conditionContext.addAuthProvider(
          USER_ADDRESS_PARAM_DEFAULT,
          authProvider
        );
      }

      const decryptedMessage = await decrypt(
        this.config.provider,
        this.config.domain,
        messageKitFromBytes,
        conditionContext
      );
      return new TextDecoder().decode(decryptedMessage);
    } catch (error) {
      throw new Error(`TACo decryption failed: ${error.message}`);
    }
  }

  /**
   * Serialize condition for storage
   */
  serializeCondition(condition) {
    return {
      type: condition.constructor.name,
      params: condition.toDict ? condition.toDict() : condition,
    };
  }

  /**
   * Check if TACo is initialized
   */
  isInitialized() {
    return this.config?.isInitialized === true;
  }

  /**
   * Get TACo configuration
   */
  getConfig() {
    return { ...this.config };
  }

  // Private methods
  async _loadTacoModules() {
    if (!taco) {
      try {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        taco = require("@nucypher/taco");
        tacoAuth = require("@nucypher/taco-auth");

        if (
          !taco.initialize ||
          !taco.conditions ||
          !taco.encrypt ||
          !taco.decrypt
        ) {
          throw new Error("Required TACo exports not found");
        }

        ({
          initialize,
          conditions,
          encrypt,
          decrypt,
          domains,
          ThresholdMessageKit,
        } = taco);
        ({ EIP4361AuthProvider, USER_ADDRESS_PARAM_DEFAULT } = tacoAuth);
      } catch (error) {
        throw new Error(`Failed to import TACo dependencies: ${error.message}`);
      }
    }
  }

  async _getChainId() {
    // Handle both ethers v5 and v6 provider APIs
    if (typeof this.config.provider.getChainId === 'function') {
      return await this.config.provider.getChainId();
    } else if (typeof this.config.provider.getNetwork === 'function') {
      const network = await this.config.provider.getNetwork();
      return network.chainId;
    } else {
      throw new Error('Provider does not support chain ID retrieval');
    }
  }

  async _validateNetwork() {
    if (!this.config.provider) {
      throw new Error("Provider is required for TACo initialization");
    }

    const chainId = await this._getChainId();
    if (!TACO_CONFIG.SUPPORTED_NETWORKS.includes(chainId)) {
      throw new Error(`Network ${chainId} is not supported by TACo.`);
    }

    if (!this.config.ritualId || this.config.ritualId <= 0) {
      throw new Error("Valid ritual ID is required for TACo initialization");
    }
  }

  async _initializeTaco() {
    await initialize();
  }

  _validateConditionConfig(conditionConfig) {
    if (!conditionConfig || typeof conditionConfig !== "object") {
      throw new Error(ERROR_MESSAGES.CONDITION_CONFIG_INVALID);
    }

    if (!conditionConfig.type || typeof conditionConfig.type !== "string") {
      throw new Error(ERROR_MESSAGES.CONDITION_TYPE_REQUIRED);
    }
  }

  _validateContractConditionParams(params) {
    if (!params.contractAddress || typeof params.contractAddress !== "string") {
      throw new Error("contractAddress is required for contract conditions");
    }
    if (!params.method || typeof params.method !== "string") {
      throw new Error("method is required for contract conditions");
    }
    if (!params.chain || typeof params.chain !== "number") {
      throw new Error("chain ID is required for contract conditions");
    }
  }

  _validateTimeConditionParams(params) {
    if (!params.method || typeof params.method !== "string") {
      throw new Error("method is required for time conditions");
    }
    if (!params.chain || typeof params.chain !== "number") {
      throw new Error("chain ID is required for time conditions");
    }
  }

  _validateRpcConditionParams(params) {
    if (!params.method || typeof params.method !== "string") {
      throw new Error("method is required for RPC conditions");
    }
    if (!params.chain || typeof params.chain !== "number") {
      throw new Error("chain ID is required for RPC conditions");
    }
  }
}
