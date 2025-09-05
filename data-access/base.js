/**
 * Abstract base class for data access providers
 * Defines the contract for encryption, decryption, and access control operations
 *
 * @abstract
 * @class DataAccessProvider
 */
export class DataAccessProvider {
  /**
   * Get provider configuration information
   * @abstract
   * @returns {object} Provider configuration details
   */
  getConfig() {
    throw new Error("getConfig() must be implemented by subclass");
  }

  /**
   * Check if the provider supports encryption
   * @abstract
   * @returns {boolean} True if encryption is supported
   */
  supportsEncryption() {
    throw new Error("supportsEncryption() must be implemented by subclass");
  }

  /**
   * Encrypt content with the given access condition
   * @abstract
   * @param {string|object} content - Content to encrypt
   * @param {object} accessCondition - Access condition for decryption
   * @returns {Promise<Uint8Array>} Encrypted data as bytes
   * @throws {Error} If encryption fails or is not supported
   */
  async encrypt(content, accessCondition) {
    throw new Error("encrypt() must be implemented by subclass");
  }

  /**
   * Decrypt encrypted content
   * @abstract
   * @param {Uint8Array} encryptedBytes - Encrypted data
   * @param {object} [conditionContext] - Optional condition context for decryption
   * @returns {Promise<Uint8Array>} Decrypted data as bytes
   * @throws {Error} If decryption fails or is not supported
   */
  async decrypt(encryptedBytes, conditionContext) {
    throw new Error("decrypt() must be implemented by subclass");
  }

  /**
   * Get provider type/name for identification
   * @abstract
   * @returns {string} Provider type identifier
   */
  getProviderType() {
    throw new Error("getProviderType() must be implemented by subclass");
  }

  /**
   * Validate that the provider is properly configured and ready for use
   * @abstract
   * @returns {Promise<boolean>} True if provider is ready
   * @throws {Error} If provider is not properly configured
   */
  async validateConfig() {
    throw new Error("validateConfig() must be implemented by subclass");
  }

  /**
   * Get configuration data suitable for metadata storage
   * This should return only the essential configuration that needs to be persisted
   * @abstract
   * @returns {object} Serializable configuration data for metadata
   */
  getMetadataConfig() {
    throw new Error("getMetadataConfig() must be implemented by subclass");
  }
}
