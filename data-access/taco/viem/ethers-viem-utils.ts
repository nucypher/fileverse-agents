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

import { isViemSignerAccount, isViemClient } from "./type-guards.js";

/**
 * Viem TACo Provider
 */
export class ViemTacoProvider {
  protected viemPublicClient: PublicClient;

  // Ethers.js compatibility property for contract validation
  readonly _isProvider = true;
  readonly _network: Promise<ethers.providers.Network>;

  constructor(viemPublicClient: PublicClient) {
    this.viemPublicClient = viemPublicClient;
    // Initialize network for ethers compatibility
    this._network = this.getNetwork();
  }

  async getNetwork(): Promise<ethers.providers.Network> {
    const chainId = await this.viemPublicClient.getChainId();
    const name = this.viemPublicClient.chain?.name || `chain-${chainId}`;
    return {
      name,
      chainId,
    };
  }

  async call(
    transaction: ethers.providers.TransactionRequest
  ): Promise<string> {
    const result = await this.viemPublicClient.call({
      to: transaction.to as `0x${string}`,
      data: transaction.data as `0x${string}`,
      value: transaction.value
        ? BigInt(transaction.value.toString())
        : undefined,
    });
    if (typeof result === "object" && result && "data" in result) {
      return result.data as string;
    }
    return result as string;
  }
}

/**
 * Viem TACo Signer
 *
 * This class implements the TacoSigner interface directly using viem accounts.
 */
export class ViemTacoSigner {
  protected viemAccount: Account;
  public provider?: ethers.providers.Provider | undefined;

  constructor(
    viemAccount: Account,
    provider?: ethers.providers.Provider | PublicClient | undefined
  ) {
    this.viemAccount = viemAccount;
    if (provider) {
      this.provider = toEthersProvider(provider as unknown as PublicClient);
    }
  }
  async getAddress(): Promise<string> {
    let address: string | undefined;
    if ("address" in this.viemAccount) {
      // viemAccount is a LocalAccount
      address = (this.viemAccount as any).address;
    } else if (
      "account" in this.viemAccount &&
      (this.viemAccount as any).account &&
      "address" in (this.viemAccount as any).account
    ) {
      // viemAccount is a WalletClient
      address = (this.viemAccount as any).account.address;
    }
    if (address) {
      // Get the checksummed address to avoid getting
      // "invalid EIP-55 address - 0x31663c14545df87044d2c5407ad0c2696b6d1402"
      // that might be thrown at package siwe-parser while perform decryption
      return ethers.utils.getAddress(address) as string;
    }
    throw new Error(
      'Unable to retrieve address from viem account. Expected a LocalAccount with "address" property or WalletClient with "account.address" property.'
    );
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    if (!this.viemAccount.signMessage) {
      throw new Error("Account does not support message signing");
    }
    const messageToSign =
      typeof message === "string" ? message : ethers.utils.hexlify(message);
    return await this.viemAccount.signMessage({ message: messageToSign });
  }

  connect(provider: ethers.providers.Provider): ethers.Signer {
    this.provider = provider;
    return this as unknown as ethers.Signer;
  }
}

/**
 * Create a TACo provider from viem PublicClient
 *
 * This function creates a TacoProvider directly from a viem client.
 */
export function toEthersProvider(
  providerLike: PublicClient
): ethers.providers.Provider {
  if (isViemClient(providerLike)) {
    return new ViemTacoProvider(
      providerLike
    ) as unknown as ethers.providers.Provider;
  } else {
    return providerLike;
  }
}

/**
 * Create a TACo signer from viem Account
 *
 * This function creates a TacoSigner directly from a viem account.
 *
 * @param viemAccount - Viem account for signing operations
 * @param provider - Optional TACo provider. If not provided, some operations will require a provider
 */
export function toEthersSigner(
  account: Account,
  client?: PublicClient
): ethers.Signer {
  if (isViemSignerAccount(account)) {
    // just to ensure the provider is already ethers' provider:
    const providerAdapter = client ? toEthersProvider(client) : undefined;
    return new ViemTacoSigner(
      account,
      providerAdapter
    ) as unknown as ethers.Signer;
  } else {
    return account as unknown as ethers.Signer;
  }
}
