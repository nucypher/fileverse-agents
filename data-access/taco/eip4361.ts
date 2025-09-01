/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

/**
 * TACo EIP4361 Authentication Provider for Viem
 *
 * Provides EIP4361 authentication functionality compatible with viem blockchain clients.
 * Uses global variables and dynamic imports to handle TACo package loading.
 */

import { type Account, type PublicClient } from "viem";
import { toEthersProvider, toEthersSigner } from "./viem/ethers-viem-utils.js";

/**
 * Factory function to create EIP4361AuthProvider instances with viem support
 */
export async function loadEIP4361AuthProviderClass(): Promise<any> {
  let EIP4361AuthProvider;

  // Try dynamic import first, fallback to require for better compatibility
  try {
    const tacoAuthModule = await import("@nucypher/taco-auth");
    EIP4361AuthProvider =
      tacoAuthModule.default?.EIP4361AuthProvider ||
      tacoAuthModule.EIP4361AuthProvider;
  } catch {
    // Fallback to require for CommonJS compatibility
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const tacoAuthModule = require("@nucypher/taco-auth");
    EIP4361AuthProvider = tacoAuthModule.EIP4361AuthProvider;
  }

  /**
   * Viem-compatible EIP4361 Authentication Provider
   *
   * This class provides a clean interface that dynamically extends EIP4361AuthProvider
   * when needed, avoiding static import issues.
   */
  return class ViemEIP4361AuthProvider extends EIP4361AuthProvider {
    constructor(viemClient: PublicClient, viemAccount: Account) {
      // Convert viem objects to ethers-compatible objects for the base class
      const ethersProvider = toEthersProvider(viemClient);
      const ethersSigner = toEthersSigner(viemAccount, viemClient);

      // Call the parent constructor with converted objects
      super(ethersProvider, ethersSigner);
    }
  };
}
export async function createEIP4361AuthProvider(
  viemClient: PublicClient,
  viemAccount: Account
) {
  const EIP4361AuthProvider = await loadEIP4361AuthProviderClass();
  return new EIP4361AuthProvider(viemClient, viemAccount);
}
