/*
 * ⚠️ PLEASE DO NOT REVIEW THIS FILE
 * This is temporary code copied from work-in-progress taco-web commits.
 * The file will be most likely deleted or edited once the following PRs are concluded:
 * - https://github.com/nucypher/taco-web/pull/700
 * - https://github.com/nucypher/taco-web/pull/692
 * - https://github.com/nucypher/taco-web/pull/701
 */

/**
 * TacoClient configuration types and utilities
 *
 * This module contains all configuration interfaces, type definitions, and utility functions
 * for configuring TacoClient instances with different blockchain client libraries (viem, ethers.js).
 */

import type { ethers } from "ethers";
import { type Account, type PublicClient } from "viem";

import type { DomainName } from "./taco-config-validator";

/**
 * TacoClient configuration
 */
export type TacoClientConfig = {
  /** TACo domain name (e.g., 'lynx', 'tapir', 'mainnet') */
  domain: DomainName;
  /** Ritual ID for the TACo operations */
  ritualId: number;
  /** Optional Porter URIs */
  porterUris?: string[];
  /** Viem PublicClient for blockchain operations */
  viemClient: PublicClient;
  /** Viem Account for signing operations */
  viemAccount: Account;
};
