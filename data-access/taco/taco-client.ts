/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

/**
 * TacoClient - Object-Oriented Interface for TACo Operations
 *
 * Provides a higher-level, client-oriented abstraction over the functional TACo API.
 * This complements the existing functional API and caters to developers who prefer
 * class-based architectures.
 */

import { type TacoClientConfig } from "./client-config.js";
import {
  TacoConfigValidator,
  type ValidationResult,
} from "./taco-config-validator.js";
import { decrypt, encrypt } from "./taco.js";

/**
 * TacoClient provides an object-oriented interface for TACo operations
 *
 * This class encapsulates TACo configuration and provides simplified methods
 * for encrypting and decrypting data with TACo (Threshold Access Control).
 * It handles WASM initialization automatically and provides a clean API
 * for viem clients.
 *
 * **Key Features:**
 * - Automatic WASM initialization (singleton pattern)
 * - Supports viem
 * - Configuration validation with helpful error messages
 * - Thread-safe initialization across multiple instances
 *
 * @example Using with viem:
 * ```typescript
 * import { TacoClient } from './taco-client.js';
 * import { createPublicClient, http } from 'viem';
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { polygonAmoy } from 'viem/chains';
 *
 * // Create viem client and account
 * const viemClient = createPublicClient({
 *   chain: polygonAmoy,
 *   transport: http('https://rpc-amoy.polygon.technology')
 * });
 * const viemAccount = privateKeyToAccount('0x...');
 *
 * // Create TacoClient - WASM initializes automatically
 * const tacoClient = new TacoClient({
 *   domain: 'tapir',
 *   ritualId: 6,
 *   viemClient,
 *   viemAccount
 * });
 *
 * // Operations are safe and wait for readiness
 * const messageKit = await tacoClient.encrypt('Hello, secret!', condition);
 * const decrypted = await tacoClient.decrypt(messageKit, conditionContext);
 * ```
 */
export class TacoClient {
  private config: TacoClientConfig;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize TACo WASM module (singleton pattern)
   * This method is automatically called by encrypt/decrypt operations
   */
  static async initialize(): Promise<void> {
    if (TacoClient.initPromise) {
      return TacoClient.initPromise;
    }

    // Try dynamic import first, fallback to require for better compatibility
    try {
      const tacoModule = await import("@nucypher/taco");
      TacoClient.initPromise = tacoModule.default?.initialize
        ? tacoModule.default.initialize()
        : tacoModule.initialize();
    } catch {
      // Fallback to require for CommonJS compatibility
      const { createRequire } = await import("module");
      const require = createRequire(import.meta.url);
      const tacoModule = require("@nucypher/taco");
      TacoClient.initPromise = tacoModule.initialize();
    }
    await TacoClient.initPromise;
  }

  /**
   * Create a new TacoClient instance
   *
   * @param config - Configuration for the TacoClient
   * @throws {Error} If configuration is invalid
   */
  constructor(config: TacoClientConfig) {
    // Validate configuration using TacoConfig
    const result = TacoConfigValidator.validateFast(config);
    if (!result.isValid) {
      throw new Error(`Invalid configuration: ${result.errors.join(", ")}`);
    }

    this.config = config;
    TacoClient.initialize();
  }

  /**
   * Fully validate the configuration including network provider checks
   *
   * @returns {Promise<ValidationResult>} Promise resolving to validation result with isValid boolean and errors array
   */
  async validateConfig(): Promise<ValidationResult> {
    const validationResult = await TacoConfigValidator.validateFull(
      this.config
    );
    if (!validationResult.isValid) {
      throw new Error(
        `Invalid configuration: ${validationResult.errors.join(", ")}`
      );
    }
    return validationResult;
  }

  /**
   * Encrypt data using TACo
   *
   * @param data - String or Uint8Array to encrypt
   * @param accessCondition - Access condition for decryption (dynamically typed)
   * @returns {Promise<any>} Encrypted message kit (ThresholdMessageKit when loaded)
   */
  async encrypt(
    data: string | Uint8Array,
    accessCondition: any // Will be typed as conditions.condition.Condition when dynamically loaded
  ): Promise<any> {
    // Will be typed as ThresholdMessageKit when dynamically loaded
    await TacoClient.initialize();

    try {
      const messageKit = await encrypt(
        this.config.viemClient,
        this.config.domain,
        data,
        accessCondition,
        this.config.ritualId,
        this.config.viemAccount
      );

      return messageKit;
    } catch (error) {
      throw new Error(`TACo encryption failed: ${error}`);
    }
  }

  /**
   * Decrypt data using TACo
   *
   * @param encryptedData - ThresholdMessageKit or encrypted bytes (dynamically typed)
   * @param conditionContext - Optional context for condition evaluation (dynamically typed)
   * @returns {Promise<Uint8Array>} Decrypted data
   */
  async decrypt(
    encryptedData: any, // Will be typed as ThresholdMessageKit | Uint8Array when dynamically loaded
    conditionContext?: any // Will be typed as conditions.context.ConditionContext when dynamically loaded
  ): Promise<Uint8Array> {
    await TacoClient.initialize();

    // Handle both ThresholdMessageKit and raw bytes
    let messageKit = encryptedData;
    if (encryptedData instanceof Uint8Array) {
      // Try dynamic import first, fallback to require for better compatibility
      try {
        const tacoModule = await import("@nucypher/taco");
        const ThresholdMessageKit =
          tacoModule.default?.ThresholdMessageKit ||
          tacoModule.ThresholdMessageKit;
        messageKit = ThresholdMessageKit.fromBytes(encryptedData);
      } catch {
        // Fallback to require for CommonJS compatibility
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        const tacoModule = require("@nucypher/taco");
        messageKit = tacoModule.ThresholdMessageKit.fromBytes(encryptedData);
      }
    }

    try {
      const decrypted = await decrypt(
        this.config.viemClient,
        this.config.domain,
        messageKit,
        conditionContext,
        this.config.porterUris
      );

      return decrypted;
    } catch (error) {
      throw new Error(`TACo decryption failed: ${error}`);
    }
  }

  /**
   * Get the current configuration (read-only)
   */
  getConfig(): Readonly<TacoClientConfig> {
    return { ...this.config } as Readonly<TacoClientConfig>;
  }
}
