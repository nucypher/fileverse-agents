/**
 * TACo Configuration Management
 *
 * Unified class for TACo domain configuration, validation, and normalization.
 * Consolidates functionality from taco-domains.js and taco-config-validator.js.
 */

/**
 * TACo Domain Configuration
 *
 * Minimal data structure containing only essential configuration
 * needed for TACo encryption/decryption operations.
 */
export const TACO_DOMAINS = {
  // DEVNET (also called lynx) - Bleeding-edge developer network - use only when working on new features that are not yet available on testnet or mainnet
  // L1: Sepolia (11155111), L2: Polygon Amoy (80002)
  // Cohort: 2-of-3, Portal: https://lynx-3.nucypher.network:9151/status
  // Status: Testnet (Development) - May have breaking changes
  // Monitoring: https://lynx-3.nucypher.network:9151/status
  DEVNET: {
    chainId: 80002,
    suggestedProviderRpcUrls: [
      "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy.drpc.org",
    ],
    rituals: [
      27, // Open ritual, no encryptor restrictions
      // Contact TACo team if you would like to perform a new ritual and obtain a new custom ritual id on devnet.
    ],
    alias: "lynx",
  },

  // TESTNET (also called tapir) - Stable testnet for current TACo release
  // L1: Sepolia (11155111), L2: Polygon Amoy (80002)
  // Cohort: 4-of-6, Portal: https://tapir-2.nucypher.network:9151/status
  // Status: Testnet (Stable) - Recommended for development and testing
  // Monitoring: https://tapir-2.nucypher.network:9151/status
  TESTNET: {
    chainId: 80002,
    suggestedProviderRpcUrls: [
      "https://rpc-amoy.polygon.technology",
      "https://polygon-amoy.drpc.org",
    ],
    rituals: [
      6, // Open ritual, no encryptor restrictions
      // Contact TACo team if you would like to perform a new ritual and obtain a new custom ritual id on testnet.
    ],
    alias: "tapir",
  },

  // MAINNET - Production network
  // L1: Ethereum Mainnet (1), L2: Polygon Mainnet (137)
  // Status: Production - Requires custom ritual setup and payment
  // Monitoring: Contact TACo team for production monitoring endpoints
  // Requirements: Custom ritual setup, DAI payment, minimum 12 months commitment
  MAINNET: {
    chainId: 137,
    suggestedProviderRpcUrls: [
      "https://polygon-rpc.com",
      "https://rpc-mainnet.polygon.technology",
    ],
    rituals: [
      // No open rituals - all custom
      // Contact TACo team to set up a custom ritual for your production use on mainnet.
    ],
    alias: "mainnet",
  },
};

/**
 * Unified TACo Configuration Management
 *
 * Provides domain configuration access, validation, normalization, and auto-correction
 * for TACo configurations in a single, cohesive class.
 */
export class TacoConfig {
  /**
   * Get the domain configuration data
   * @returns {Object} TACO_DOMAINS object
   */
  static get DOMAINS() {
    return TACO_DOMAINS;
  }

  // ========================================
  // Domain Information Methods
  // ========================================

  /**
   * Get list of supported domain names
   * @returns {Array<string>} Array of supported domain names
   */
  static getSupportedDomains() {
    return Object.keys(TACO_DOMAINS);
  }

  /**
   * Check if a domain is valid
   * @param {string} domain - Domain name to validate
   * @returns {boolean} True if domain is valid
   */
  static isValidDomain(domain) {
    return domain && TACO_DOMAINS[domain] !== undefined;
  }

  /**
   * Check if domain is production environment
   * @param {string} domain - Domain name to check
   * @returns {boolean} True if domain is production
   */
  static isProductionDomain(domain) {
    return domain === 'MAINNET';
  }

  /**
   * Get default ritual ID for a domain
   * @param {string} domain - Domain name
   * @returns {number|null} Default ritual ID or null if none available
   */
  static getDefaultRitualId(domain) {
    if (!this.isValidDomain(domain)) return null;
    const config = TACO_DOMAINS[domain];

    // Return first ritual ID, or null if no rituals available
    return config.rituals.length > 0 ? config.rituals[0] : null;
  }

  /**
   * Get all available ritual IDs for a domain
   * @param {string} domain - Domain name
   * @returns {Array<number>} Array of available ritual IDs
   */
  static getAvailableRituals(domain) {
    if (!this.isValidDomain(domain)) return [];
    return TACO_DOMAINS[domain].rituals;
  }

  /**
   * Get default RPC URL for a domain
   * @param {string} domain - Domain name
   * @returns {string|null} Default RPC URL or null if domain invalid
   */
  static getDefaultRpcUrl(domain) {
    if (!this.isValidDomain(domain)) return null;
    return TACO_DOMAINS[domain].suggestedProviderRpcUrls[0];
  }

  /**
   * Check if ritual ID is valid for a domain
   * @param {string} domain - Domain name
   * @param {number} ritualId - Ritual ID to validate
   * @returns {boolean} True if ritual ID is valid for the domain
   */
  static isValidRitualId(domain, ritualId) {
    if (!this.isValidDomain(domain)) return false;
    const config = TACO_DOMAINS[domain];

    // For mainnet, any positive number is valid (custom rituals)
    if (domain === 'MAINNET') {
      return typeof ritualId === 'number' && ritualId > 0;
    }

    // For testnets, check if ritual ID is in the allowed list
    return config.rituals.includes(ritualId);
  }

  // ========================================
  // Configuration Management Methods
  // ========================================

  /**
   * Validate a TACo configuration (pure validation only)
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result with isValid, errors, and config
   */
  static validate(config) {
    const errors = [];

    if (!config.domain) {
      errors.push('Domain is required');
    } else if (!this.isValidDomain(config.domain)) {
      errors.push(`Invalid domain: ${config.domain}. Supported: ${this.getSupportedDomains().join(', ')}`);
    }

    if (config.domain && this.isValidDomain(config.domain)) {
      if (this.isProductionDomain(config.domain)) {
        // Mainnet requires custom ritual ID
        if (!config.ritualId) {
          errors.push('Mainnet requires a custom ritual ID (contact TACo team for setup)');
        } else if (!this.isValidRitualId(config.domain, config.ritualId)) {
          errors.push('Invalid ritual ID for mainnet (must be positive number)');
        }
      } else {
        // Testnets can use default or specified ritual ID
        const ritualId = config.ritualId || this.getDefaultRitualId(config.domain);
        if (!ritualId) {
          errors.push(`No available rituals for ${config.domain}`);
        } else if (!this.isValidRitualId(config.domain, ritualId)) {
          const availableRituals = this.getAvailableRituals(config.domain);
          errors.push(`Invalid ritual ID for ${config.domain}. Available: ${availableRituals.join(', ')}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      config: errors.length === 0 ? {
        domain: config.domain,
        ritualId: config.ritualId || (this.isValidDomain(config.domain) ? this.getDefaultRitualId(config.domain) : null)
      } : null
    };
  }

  /**
   * Process a TACo configuration (auto-correct + validate + normalize)
   * @param {Object} userConfig - User-provided TACo configuration
   * @returns {Object} Fully processed and normalized configuration
   * @throws {Error} If configuration is invalid after auto-correction
   */
  static process(userConfig) {
    // Step 1: Auto-correct common mistakes
    let config = { ...userConfig };

    // Auto-correct domain casing
    if (typeof config.domain === 'string') {
      const upperDomain = config.domain.toUpperCase();
      if (this.getSupportedDomains().includes(upperDomain)) {
        config.domain = upperDomain;
      }
      else {
        // Check if the domain matches any of the aliases in TACO_DOMAINS
        // that is to check if the provided name was: `lynx`, `tapir` or `mainnet`.
        const domainEntry = Object.entries(TACO_DOMAINS).find(([, domainConfig]) =>
          domainConfig.alias && domainConfig.alias.toLowerCase() === config.domain.toLowerCase()
        );
        if (domainEntry) {
          config.domain = domainEntry[0].alias;
        }
      }
    }

    // Auto-set default ritual ID for testnets if missing
    if (config.domain && this.isValidDomain(config.domain)) {
      if (!this.isProductionDomain(config.domain) && !config.ritualId) {
        const defaultRitualId = this.getDefaultRitualId(config.domain);
        if (defaultRitualId) {
          config.ritualId = defaultRitualId;
        }
      }
    }

    // Step 2: Validate the corrected configuration
    const validation = this.validate(config);
    if (!validation.isValid) {
      throw new Error(`TACo Configuration Error: ${validation.errors.join(', ')}`);
    }

    // Step 3: Normalize with additional properties
    const domainConfig = TACO_DOMAINS[config.domain];

    return {
      ...config,
      ritualId: config.ritualId || this.getDefaultRitualId(config.domain),
      chainId: domainConfig.chainId,
      rpcUrl: config.rpcUrl || this.getDefaultRpcUrl(config.domain)
    };
  }
}

