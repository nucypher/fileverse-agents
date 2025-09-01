/**
 * Configuration constants for the Fileverse Agents SDK
 */

// Network configuration
export const NETWORK_CONFIG = {
  SUPPORTED_CHAINS: ["gnosis", "sepolia"],
};

// FileType enum based on FileversePortal contract
// https://github.com/fileverse/fileverse-smartcontracts/blob/main/contracts/FileversePortal.sol#L42
export const FileType = {
  PUBLIC: 0,
  PRIVATE: 1,
  GATED: 2,
  MEMBER_PRIVATE: 3,
};

// Error messages
export const ERROR_MESSAGES = {
  CHAIN_REQUIRED: "Chain is required - options: gnosis, sepolia",
  ACCOUNT_REQUIRED: "Viem account is required",
  PIMLICO_KEY_REQUIRED: "Pimlico API key must be a non-empty string",
  STORAGE_PROVIDER_REQUIRED: "Storage provider is required",
  TACO_RITUAL_ID_INVALID: "TACo ritualId must be a positive number",
  TACO_DOMAIN_INVALID: "TACo domain must be a string",
  TACO_CONFIG_MISSING: "TACo configuration not found",
  TACO_NOT_INITIALIZED: "TACo is not initialized",
  CONDITION_CONFIG_INVALID: "Condition configuration must be a valid object",
  CONDITION_TYPE_REQUIRED: "Condition type is required and must be a string",
  INVALID_FILE_ID: "Invalid file ID provided",
};
