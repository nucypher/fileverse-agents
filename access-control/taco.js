import { ThresholdMessageKit } from "@nucypher/nucypher-core";
import { AccessClient, conditions } from "@nucypher/taco";
import { AccessControlProvider } from "./base.js";

export const TACO_PROVIDER_TYPE = "TacoAccessProvider";
/**
 * @typedef {import('@nucypher/taco').conditions.context.CustomContextParam} CustomContextParam
 * @typedef {Record<string, CustomContextParam>} CustomContextParameters
 * @typedef {import('@nucypher/taco-auth').AuthProvider} AuthProvider
 * @typedef {{contextParam: string, provider: AuthProvider}} ContextParamAndAuthProvider
 */

/**
 * TACo-based access control provider
 * Provides encryption and decryption capabilities using TACo AccessClient
 *
 * @class TacoAccessProvider
 * @extends AccessControlProvider
 */
export class TacoAccessProvider extends AccessControlProvider {
  /**
   * Create a new TacoAccessProvider instance
   * @param {object} config - TACo configuration
   * @param {string} config.domain - TACo domain (e.g., 'testnet', 'devnet', 'mainnet')
   * @param {number} config.ritualId - TACo ritual ID
   * @param {object} config.viemClient - Viem public client for TACo operations
   * @param {string[]} [config.porterUris] - Optional porter URIs for decryption
   */
  constructor(config) {
    super();

    this.accessClient = new AccessClient(config);
  }

  /**
   * Get provider configuration information
   * @returns {object} Provider configuration details
   */
  getConfig() {
    return {
      type: this.getProviderType(),
      ...this.accessClient.getConfig(),
    };
  }

  /**
   * Get provider type identifier
   * @returns {string} Provider type
   */
  getProviderType() {
    return TACO_PROVIDER_TYPE;
  }

  /**
   * Validate that the provider is properly configured and ready for use
   * @returns {Promise<void>}
   * @throws {Error} If provider is not properly configured
   */
  async validateConfig() {
    // AccessClient.validateConfig() throws on validation failure
    await this.accessClient.validateConfig();
  }

  /**
   * Encrypt content with the given access condition
   * @param {string|object} content - Content to encrypt
   * @param {object} options - Encryption options
   * @param {object} options.accessCondition - TACo access condition object
   * @param {object} options.authSigner - Authentication signer (viem account or ethers signer)
   * @returns {Promise<{encryptedBytes: Uint8Array, accessControlMetadata: object}>} Encrypted data and metadata
   * @throws {Error} If encryption fails
   */
  async encrypt(content, options) {
    console.debug("🔐 Encrypting content with TacoAccessProvider");

    // Extract TACo-specific options
    const { accessCondition, authSigner } = options;

    if (!accessCondition) {
      throw new Error("accessCondition is required for TACo encryption");
    }
    if (!authSigner) {
      throw new Error("authSigner is required for TACo encryption");
    }

    // AccessClient handles all validation and error messages
    const messageKit = await this.accessClient.encrypt(
      content,
      accessCondition,
      authSigner
    );
    const encryptedBytes = messageKit.toBytes();

    console.debug(
      `✅ Content encrypted successfully (${encryptedBytes.length} bytes)`
    );

    // Get metadata config
    const config = this.accessClient.getConfig();
    const accessControlMetadata = {
      providerType: this.getProviderType(),
      domain: config.domain,
      ritualId: config.ritualId,
    };


    const conditionContext = new conditions.context.ConditionContext(
      accessCondition
    );

    accessControlMetadata.requestedContextParameters = Array.from(
      conditionContext.requestedContextParameters
    );

    return {
      encryptedBytes,
      accessControlMetadata,
    };
  }

  /**
   * Decrypt encrypted content
   * @param {Uint8Array} encryptedBytes - Encrypted data
   * @param {object} [options] - Decryption options
   *
   * Auto-create TACo Condition Context and add customContextParameters and authProviders to it
   * @param {ContextParamAndAuthProvider[]} [options.contextParamsAndAuthProviders] - Context parameter and Auth provider pairs to add to auto-created Condition Context
   * @param {CustomContextParameters} [options.customContextParameters] - Custom context parameters to add to auto-created Condition Context
   *
   * @returns {Promise<Uint8Array>} Decrypted data as bytes
   */
  async decrypt(encryptedBytes, options = {}) {
    console.debug("🔓 Decrypting content with TacoAccessProvider");

    // Extract TACo-specific options
    const { customContextParameters, contextParamsAndAuthProviders } = options;

    // Auto-create Condition Context from messageKit
    const messageKit = ThresholdMessageKit.fromBytes(encryptedBytes);
    const conditionContext =
      conditions.context.ConditionContext.fromMessageKit(messageKit);

    // Apply custom parameters if provided
    if (customContextParameters) {
      conditionContext.addCustomContextParameterValues(customContextParameters);
    }

    // Add context parameters and their auth providers if provided
    if (contextParamsAndAuthProviders) {
      contextParamsAndAuthProviders.forEach((contextParamAndAuthProvider) => {
        conditionContext.addAuthProvider(
          contextParamAndAuthProvider.contextParam,
          contextParamAndAuthProvider.provider
        );
      });
    }

    const decryptedBytes = await this.accessClient.decrypt(
      encryptedBytes,
      conditionContext
    );

    console.debug(
      `✅ Content decrypted successfully (${decryptedBytes.length} bytes)`
    );

    return decryptedBytes;
  }
}
