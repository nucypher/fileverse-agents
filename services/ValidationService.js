/**
 * Validation Service
 * Centralized validation logic for the Fileverse Agents SDK
 */

import { ERROR_MESSAGES, NETWORK_CONFIG } from '../config/constants.js';

export class ValidationService {
  /**
   * Validate Agent constructor parameters
   */
  static validateAgentConfig({ chain, viemAccount, pimlicoAPIKey, storageProvider }) {
    // Validate required parameters
    if (!chain) {
      throw new Error(ERROR_MESSAGES.CHAIN_REQUIRED);
    }

    if (!viemAccount) {
      throw new Error(ERROR_MESSAGES.ACCOUNT_REQUIRED);
    }

    if (!pimlicoAPIKey || typeof pimlicoAPIKey !== 'string') {
      throw new Error(ERROR_MESSAGES.PIMLICO_KEY_REQUIRED);
    }

    if (!storageProvider) {
      throw new Error(ERROR_MESSAGES.STORAGE_PROVIDER_REQUIRED);
    }

    // Validate chain
    this.validateChain(chain);
  }

  /**
   * Validate chain configuration
   */
  static validateChain(chain) {
    const chainName = typeof chain === 'string' ? chain : chain?.name?.toLowerCase();

    if (!NETWORK_CONFIG.SUPPORTED_CHAINS.includes(chainName)) {
      throw new Error(
        `Unsupported chain: ${chainName}. Supported chains: ${NETWORK_CONFIG.SUPPORTED_CHAINS.join(', ')}`
      );
    }
  }

  /**
   * Validate file ID
   */
  static validateFileId(fileId) {
    if (!fileId || (typeof fileId !== 'string' && typeof fileId !== 'number' && typeof fileId !== 'bigint')) {
      throw new Error(ERROR_MESSAGES.INVALID_FILE_ID);
    }
  }

  /**
   * Validate file content
   */
  static validateFileContent(content) {
    if (content === null || content === undefined) {
      throw new Error('File content cannot be null or undefined');
    }
  }

  /**
   * Validate create options
   */
  static validateCreateOptions(options = {}) {
    if (typeof options !== 'object') {
      throw new Error('Options must be an object');
    }

    // Validate access conditions if provided
    if (options.accessConditions && !Array.isArray(options.accessConditions)) {
      throw new Error('Access conditions must be an array');
    }
  }

  /**
   * Validate storage provider
   */
  static validateStorageProvider(provider) {
    if (!provider) {
      throw new Error(ERROR_MESSAGES.STORAGE_PROVIDER_REQUIRED);
    }

    const requiredMethods = ['upload', 'download', 'downloadBytes', 'unpin', 'protocol', 'isConnected'];

    for (const method of requiredMethods) {
      if (typeof provider[method] !== 'function') {
        throw new Error(`Storage provider must implement ${method} method`);
      }
    }
  }

  /**
   * Validate reference format
   */
  static validateReference(reference) {
    if (!reference || typeof reference !== 'string') {
      throw new Error('Reference must be a non-empty string');
    }
  }

  /**
   * Validate network response
   */
  static validateNetworkResponse(response, context = 'Network request') {
    if (!response) {
      throw new Error(`${context} failed: No response received`);
    }

    if (response.error) {
      throw new Error(`${context} failed: ${response.error}`);
    }
  }
}
