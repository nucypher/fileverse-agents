import { AccessClient } from "@nucypher/taco";
import { DataAccessProvider } from "./base.js";

export const TACO_PROVIDER_TYPE = "TacoAccessProvider";
/**
 * TACo-based data access provider
 * Provides encryption and decryption capabilities using TACo AccessClient
 *
 * @class TacoAccessProvider
 * @extends DataAccessProvider
 */
export class TacoAccessProvider extends DataAccessProvider {
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
   * Check if the provider supports encryption
   * @returns {boolean} True (TACo always supports encryption)
   */
  supportsEncryption() {
    return true;
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
   * @returns {Promise<Uint8Array>} Encrypted data as bytes
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

    return encryptedBytes;
  }

  /**
   * Decrypt encrypted content
   * @param {Uint8Array} encryptedBytes - Encrypted data
   * @param {object} [options] - Decryption options
   * @param {object} [options.conditionContext] - TACo-specific condition context for decryption
   * @returns {Promise<Uint8Array>} Decrypted data as bytes
   * @throws {Error} If decryption fails
   */
  async decrypt(encryptedBytes, options = {}) {
    console.debug("🔓 Decrypting content with TacoAccessProvider");

    // Extract TACo-specific options (conditionContext is optional for decrypt)
    const { conditionContext } = options;

    const decryptedBytes = await this.accessClient.decrypt(
      encryptedBytes,
      conditionContext
    );

    console.debug(
      `✅ Content decrypted successfully (${decryptedBytes.length} bytes)`
    );

    return decryptedBytes;
  }

  /**
   * Get configuration data suitable for metadata storage
   * Returns only the essential TACo configuration that needs to be persisted
   * @returns {object} Serializable configuration data for metadata
   */
  getMetadataConfig() {
    const config = this.accessClient.getConfig();
    return {
      providerType: this.getProviderType(),
      domain: config.domain,
      ritualId: config.ritualId,
    };
  }
}
