/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

import { Domain } from "@nucypher/shared";
import { Account, PublicClient } from "viem";
import { toEthersProvider, toEthersSigner } from "./viem/ethers-viem-utils.js";

/**
 * Encrypts a message under given conditions using viem clients.
 *
 * @export
 * @param {PublicClient} viemPublicClient - Viem PublicClient for network operations
 * @param {Domain} domain - Represents the logical network for encryption (must match ritualId)
 * @param {Uint8Array | string} message - The message to be encrypted
 * @param {Condition} condition - Condition under which the message will be encrypted
 * @param {number} ritualId - The ID of the DKG Ritual to be used for encryption
 * @param {Account} viemAuthSigner - The viem account that will be used to sign the encrypter authorization
 *
 * @returns {Promise<ThresholdMessageKit>} Returns Promise that resolves with an instance of ThresholdMessageKit
 *
 * @throws {Error} If the active DKG Ritual cannot be retrieved an error is thrown

 */
export async function encrypt(
  viemPublicClient: PublicClient,
  domain: Domain,
  message: Uint8Array | string,
  condition: any, // Will be typed as conditions.condition.Condition when dynamically loaded
  ritualId: number,
  viemAuthSigner: Account
): Promise<any> {
  // Will be typed as ThresholdMessageKit when dynamically loaded
  // Try dynamic import first, fallback to require for better compatibility
  let ethersEncrypt;
  try {
    const tacoModule = await import("@nucypher/taco");
    ethersEncrypt = tacoModule.default?.encrypt || tacoModule.encrypt;
  } catch {
    // Fallback to require for CommonJS compatibility
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const tacoModule = require("@nucypher/taco");
    ethersEncrypt = tacoModule.encrypt;
  }

  // Create TACo provider and signer adapters from viem objects
  const providerAdapter = toEthersProvider(viemPublicClient);
  const signerAdapter = toEthersSigner(viemAuthSigner, viemPublicClient);

  return ethersEncrypt(
    providerAdapter,
    domain,
    message,
    condition,
    ritualId,
    signerAdapter
  );
}

/**
 * Decrypts an encrypted message.
 *
 * @export
 * @param {PublicClient} viemPublicClient - Viem PublicClient for network operations
 * @param {Domain} domain - Represents the logical network in which the decryption will be performed.
 * Must match the `ritualId`.
 * @param {ThresholdMessageKit} messageKit - The kit containing the message to be decrypted
 * @param {ConditionContext} context - Optional context data used for decryption time values for the condition(s) within the `messageKit`.
 * @param {string[]} [porterUris] - Optional URI(s) for the Porter service. If not provided, a value will be obtained
 * from the Domain
 *
 * @returns {Promise<Uint8Array>} Returns Promise that resolves with a decrypted message
 *
 * @throws {Error} If the active DKG Ritual cannot be retrieved or decryption process throws an error,
 * an error is thrown.
 */
export async function decrypt(
  viemPublicClient: PublicClient,
  domain: Domain,
  messageKit: any, // Will be typed as ThresholdMessageKit when dynamically loaded
  context?: any, // Will be typed as conditions.context.ConditionContext when dynamically loaded
  porterUris?: string[]
): Promise<Uint8Array> {
  // Try dynamic import first, fallback to require for better compatibility
  let ethersDecrypt;
  try {
    const tacoModule = await import("@nucypher/taco");
    ethersDecrypt = tacoModule.default?.decrypt || tacoModule.decrypt;
  } catch {
    // Fallback to require for CommonJS compatibility
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const tacoModule = require("@nucypher/taco");
    ethersDecrypt = tacoModule.decrypt;
  }

  const providerAdapter = await toEthersProvider(viemPublicClient);
  return ethersDecrypt(
    providerAdapter,
    domain,
    messageKit,
    context,
    porterUris
  );
}
