/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

import { ethers } from "ethers";

import { type Account, type PublicClient } from "viem";
/**
 * Type guard to determine if the client is a viem PublicClient
 */
export function isViemClient(provider: any): provider is PublicClient {
  const hasViemProperties = "chain" in provider;
  const hasViemMethods =
    typeof (provider as { getChainId: () => Promise<number> }).getChainId ===
    "function";
  const isNotEthersProvider = !(
    provider instanceof ethers.providers.BaseProvider
  );

  return isNotEthersProvider && (hasViemProperties || hasViemMethods);
}

/**
 * Type guard to determine if the signer is a viem Account
 */
export function isViemSignerAccount(signer: any): signer is Account {
  // Check for viem Account properties
  const hasViemAccountProperties =
    // Local Account:
    ("address" in signer &&
      typeof (signer as { address: string }).address === "string") ||
    // Wallet Client:
    ("account" in signer &&
      typeof (signer as { account: Account }).account.address === "string");

  const doesNotHaveEthersSignerProperties = !("provider" in signer); // ethers.Signer has provider property

  // Check if it's not an ethers.Signer
  const isNotEthersSigner = !(signer instanceof ethers.Signer);

  return (
    isNotEthersSigner &&
    doesNotHaveEthersSignerProperties &&
    hasViemAccountProperties
  );
}
