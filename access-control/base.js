/**
 * Abstract base class for access control providers
 * Defines the contract for encryption, decryption, and access control operations
 *
 * @abstract
 * @class AccessControlProvider
 */
export class AccessControlProvider {
  /**
   * Get provider configuration information
   * @abstract
   * @returns {object} Provider configuration details
   */
  getConfig() {
    throw new Error("getConfig() must be implemented by subclass");
  }

  /**
   * Encrypt content with provider-specific options
   * @abstract
   * @param {string|object} content - Content to encrypt
   * @param {object} options - Provider-specific encryption options
   *                          Example: TACo requires { accessCondition, authSigner }
   * @returns {Promise<{encryptedBytes: Uint8Array, accessControlMetadata: object}>} Encrypted data and metadata
   * @throws {Error} If encryption fails or is not supported
   */
  async encrypt(content, options) {
    throw new Error("encrypt() must be implemented by subclass");
  }
  /**
   * Decrypt encrypted content
   * @abstract
   * @param {Uint8Array} encryptedBytes - Encrypted data
   * @param {object} [options] - Provider-specific decryption options
   *                           Example: TACo supports { conditionContext }
   * @returns {Promise<Uint8Array>} Decrypted data as bytes
   * @throws {Error} If decryption fails or is not supported
   */
  async decrypt(encryptedBytes, options) {
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
   * @returns {Promise<void>}
   * @throws {Error} If provider is not properly configured
   */
  async validateConfig() {
    throw new Error("validateConfig() must be implemented by subclass");
  }
}

