/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

/**
 * TACo Domain Configuration and Validation
 *
 * This module provides domain configuration management, validation utilities,
 * and configuration processing for TACo operations across different networks.
 */

import { ethers } from "ethers";
import type { PublicClient } from "viem";

import type { TacoClientConfig } from "./client-config";

export type DomainName = "lynx" | "tapir" | "mainnet";

/**
 * TACo domain configuration with essential network data
 *
 * Contains domain names, chain IDs, and core infrastructure information
 * needed for TACo operations across different networks.
 *
 * @example
 * ```typescript
 * // Get domain information
 * const lynxInfo = DOMAINS.DEVNET;
 * console.log(lynxInfo.domain); // 'lynx'
 * console.log(lynxInfo.chainId); // 80002
 * ```
 */
export const DOMAINS = {
  // lynx - DEVNET: Bleeding-edge developer network
  DEVNET: {
    domain: "lynx",
    chainId: 80002,
  },
  // tapir - TESTNET: Stable testnet for current TACo release
  TESTNET: {
    domain: "tapir",
    chainId: 80002,
  },
  // mainnet - MAINNET: Production network
  MAINNET: {
    domain: "mainnet",
    chainId: 137,
  },
} as const;

/**
 * TACo Domain Name Constants
 *
 * Convenient constants for referencing TACo domain names in a type-safe manner.
 * Use these constants instead of hardcoded strings for better maintainability.
 */
export const DOMAIN_NAMES = {
  /** DEVNET domain ('lynx') - Bleeding-edge developer network */
  DEVNET: "lynx",
  /** TESTNET domain ('tapir') - Stable testnet for current TACo release */
  TESTNET: "tapir",
  /** MAINNET domain ('mainnet') - Production network */
  MAINNET: "mainnet",
} as const;

/**
 * Domain-ChainId validation type - creates a discriminated union
 * where each domain is linked to its specific chainId
 */
export type DomainChainConfig = {
  [K in keyof typeof DOMAINS]: {
    domain: (typeof DOMAINS)[K]["domain"];
    chainId: (typeof DOMAINS)[K]["chainId"];
  };
}[keyof typeof DOMAINS];

/**
 * Validates that the provided domain and chainId combination is correct
 * TypeScript will enforce that only valid domain/chainId pairs are accepted
 */
export function validateDomainChain(config: DomainChainConfig): boolean {
  const domainInfo = Object.values(DOMAINS).find(
    (info) => info.domain === config.domain
  );
  return !!domainInfo && domainInfo.chainId === config.chainId;
}

/**
 * Generic validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * TACo Configuration Validator
 *
 * Validates TACo client configurations, domains, and provider compatibility.
 * Provides both fast and full validation methods for TACo operations.
 */
export class TacoConfigValidator {
  /**
   * Get all supported TACo domain names
   * @returns {DomainName[]} Array of supported TACo domain names ('lynx', 'tapir', 'mainnet')
   */
  static getSupportedDomains(): DomainName[] {
    return Object.values(DOMAINS).map((domain) => domain.domain);
  }

  /**
   * Check if domain is valid
   * @param domain - TACo domain name to check ('lynx', 'tapir', 'mainnet')
   * @returns {boolean} True if domain exists
   */
  static isValidDomain(domain: DomainName): boolean {
    return !!domain && this.getSupportedDomains().includes(domain);
  }

  /**
   * Get expected chain ID for domain from DOMAINS configuration
   * @param domain - Domain name to look up
   * @returns {number | undefined} Chain ID for the domain, undefined if not found
   * @private
   */
  private static getExpectedChainId(domain: string): number | undefined {
    const domainEntry = Object.values(DOMAINS).find(
      (domainConfig) => domainConfig.domain === domain
    );
    return domainEntry?.chainId;
  }

  /**
   * Validate ritual ID (basic validation - positive number only)
   * @param domain - Domain name (unused but kept for API compatibility)
   * @param ritualId - Ritual ID to validate
   * @returns {boolean} True if valid (positive number)
   */
  static isValidRitualId(domain: DomainName, ritualId: number): boolean {
    return typeof ritualId === "number" && ritualId > 0;
  }

  /**
   * Validate provider compatibility with domain
   * @param domain - Domain name
   * @param provider - Provider to validate (viem PublicClient or ethers Provider)
   * @returns {Promise<boolean>} True if provider is valid for domain
   */
  static async isValidProvider(
    domain: DomainName,
    provider: PublicClient | ethers.providers.Provider
  ): Promise<boolean> {
    let chainId: number;

    if (!provider || typeof provider !== "object") {
      // Invalid provider
      return false;
    }

    // Try to detect provider type and get chain ID safely
    try {
      // Check if it's a viem PublicClient (has getChainId method)
      if (
        "getChainId" in provider &&
        typeof provider.getChainId === "function"
      ) {
        chainId = await (provider as PublicClient).getChainId();
      }
      // Check if it's an ethers Provider (has getNetwork method)
      else if (
        "getNetwork" in provider &&
        typeof provider.getNetwork === "function"
      ) {
        const network = await (
          provider as ethers.providers.Provider
        ).getNetwork();
        chainId = network.chainId;
      } else {
        // Unknown provider type
        return false;
      }
    } catch (error) {
      // Error getting chain ID
      return false;
    }

    // Check if the provider's chain ID matches the domain's expected chain ID
    return (
      Object.values(DOMAINS).find(
        (domainInfo) =>
          domainInfo.domain === domain && domainInfo.chainId === chainId
      ) !== undefined
    );
  }

  /**
   * Fast validation (everything except provider network checks)
   * @param config - Configuration to validate
   * @returns {ValidationResult} Validation result
   */
  static validateFast(config: TacoClientConfig): ValidationResult {
    const errors: string[] = [];

    // Validate domain
    if (!config.domain) {
      errors.push("The property `domain` is required");
    } else if (!this.isValidDomain(config.domain)) {
      errors.push(
        `Invalid domain name: ${config.domain}. Supported domains: ${this.getSupportedDomains().join(", ")}`
      );
    }

    // Validate ritual ID
    if (!config.ritualId) {
      errors.push("The property `ritualId` is required");
    } else if (!this.isValidRitualId(config.domain, config.ritualId)) {
      errors.push(
        `Invalid ritual ID: ${config.ritualId} for domain ${config.domain}`
      );
    }

    // Validate blockchain client configuration
    if (!config.viemClient || !config.viemAccount) {
      errors.push("Configuration must include viemClient and viemAccount");
    }

    // Validate chain compatibility (synchronous check)
    const chainValidation = this.validateChainCompatibility(config);
    if (!chainValidation.isValid) {
      errors.push(...chainValidation.errors);
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Synchronous chain compatibility validation
   * @private
   */
  private static validateChainCompatibility(
    config: TacoClientConfig
  ): ValidationResult {
    const errors: string[] = [];

    // Get expected chain ID for domain
    const expectedChainId = this.getExpectedChainId(config.domain);
    if (!expectedChainId) {
      errors.push(`Unsupported domain: ${config.domain}`);
      return { isValid: false, errors };
    }

    // Check viem client chain compatibility
    if ("viemClient" in config && config.viemClient) {
      const viemClient = config.viemClient as PublicClient;
      if (viemClient.chain && viemClient.chain.id !== expectedChainId) {
        errors.push(
          `Provider chain mismatch: viem client chain ID ${viemClient.chain.id} does not match domain '${config.domain}' (expected ${expectedChainId})`
        );
      }
    }

    // Check ethers provider chain compatibility
    if ("ethersProvider" in config && config.ethersProvider) {
      // Note: _network is not public API, but it's the only synchronous way to check
      // However, if the property `_network` was not available, no error will be thrown.
      const ethersProvider = config.ethersProvider as unknown as {
        _network?: { chainId: number };
      };
      if (
        ethersProvider._network &&
        ethersProvider._network.chainId !== expectedChainId
      ) {
        errors.push(
          `Provider chain mismatch: ethers provider chain ID ${ethersProvider._network.chainId} does not match domain '${config.domain}' (expected ${expectedChainId})`
        );
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Full validation including async provider network checks
   * @param config - Configuration to validate
   * @returns {Promise<ValidationResult>} Validation result with provider validation
   */
  static async validateFull(
    config: TacoClientConfig
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // First run fast validation
    const fastResult = this.validateFast(config);
    if (!fastResult.isValid) {
      errors.push(...fastResult.errors);
    }

    // Validate provider compatibility with domain (if both exist)
    if (config.viemClient && config.domain) {
      const isValidProvider = await this.isValidProvider(
        config.domain,
        config.viemClient
      );
      if (!isValidProvider) {
        errors.push(
          `Invalid provider for domain: ${config.domain}. Provider chain ID does not match domain requirements.`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
