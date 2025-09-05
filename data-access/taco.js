import { TacoClient } from "@nucypher/taco";
import { DataAccessProvider } from "./base.js";

export const TACO_PROVIDER_TYPE = "TacoProvider";
/**
 * TACo-based data access provider
 * Provides encryption and decryption capabilities using TacoClient
 *
 * @class TacoProvider
 * @extends DataAccessProvider
 */
export class TacoProvider extends DataAccessProvider {
  /**
   * Create a new TacoProvider instance
   * @param {object} config - TACo configuration
   * @param {string} config.domain - TACo domain (e.g., 'testnet', 'devnet', 'mainnet')
   * @param {number} config.ritualId - TACo ritual ID
   * @param {object} config.viemClient - Viem public client for TACo operations
   * @param {object} config.viemAccount - Viem account for signing
   */
  constructor(config) {
    super();

    this.tacoClient = new TacoClient(config);
  }

  /**
   * Get provider configuration information
   * @returns {object} Provider configuration details
   */
  getConfig() {
    return {
      type: this.getProviderType(),
      ...this.tacoClient.getConfig(),
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
   * @returns {Promise<boolean>} True if provider is ready
   * @throws {Error} If provider is not properly configured
   */
  async validateConfig() {
    try {
      // TacoClient.validateConfig() throws on validation failure
      await this.tacoClient.validateConfig();
      return true;
    } catch (error) {
      throw error; // Let TacoClient's detailed error messages pass through
    }
  }

  /**
   * Encrypt content with the given access condition
   * @param {string|object} content - Content to encrypt
   * @param {object} accessCondition - TACo access condition object
   * @returns {Promise<Uint8Array>} Encrypted data as bytes
   * @throws {Error} If encryption fails
   */
  async encrypt(content, accessCondition) {
    console.debug("🔐 Encrypting content with TacoProvider");

    // TacoClient handles all validation and error messages
    const messageKit = await this.tacoClient.encrypt(content, accessCondition);
    const encryptedBytes = messageKit.toBytes();

    console.debug(
      `✅ Content encrypted successfully (${encryptedBytes.length} bytes)`
    );

    return encryptedBytes;
  }

  /**
   * Decrypt encrypted content
   * @param {Uint8Array} encryptedBytes - Encrypted data
   * @param {object} [conditionContext] - Optional condition context for decryption
   * @returns {Promise<Uint8Array>} Decrypted data as bytes
   * @throws {Error} If decryption fails
   */
  async decrypt(encryptedBytes, conditionContext = undefined) {
    console.debug("🔓 Decrypting content with TacoProvider");

    const decryptedBytes = await this.tacoClient.decrypt(
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
    const config = this.tacoClient.getConfig();
    return {
      providerType: this.getProviderType(),
      domain: config.domain,
      ritualId: config.ritualId,
    };
  }
}
