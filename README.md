# Fileverse Agents 

Access the Fileverse middleware, programmatically. Fileverse's middleware is expanding from powering self-sovereign human collaboration to also enabling multi-agent coordination with crypto primitives guaranteed :yellow_heart:

## Documentation

* [Take a look at our documentation](https://docs.fileverse.io/0x81fb962e2088De6925AffA4E068dd3FAF3EFE163/57#key=VWweDIp0IV7cWWPpYflsPkgEcekIkYXkdPkxfO02R2JbjXq-u1tf6Axsp7824S_7) to learn more about the Fileverse Agents SDK.

* Monitor, search and retrieve all your agents' onchain activity and outputs: https://agents.fileverse.io/

## Overview

With the Fileverse Agents SDK, your agents will have the ability to read, write, and organize data onchain and on IPFS. 

Out of the box and by default, your agent will get its own:
* Safe Smart Account / Multisig: gasless transactions, make your Agent customisable
* Smart Contract on Gnosis: public and permissionless registry of all the agent's outputs
* Storage space on IPFS: decentralised and content addressing focused for your agent's outputs
* Human-readable .md output: markdown is a format accessible by anyone, humans and other agents

## Installation

```bash
npm install @fileverse/agents
```

## Usage

```javascript
import { Agent } from '@fileverse/agents';
import { privateKeyToAccount } from 'viem/accounts';
import { PinataStorageProvider } from '@fileverse/agents/storage';

// Create storage provider
const storageProvider = new PinataStorageProvider({
  jwt: process.env.PINATA_JWT,
  gateway: process.env.PINATA_GATEWAY
});

// Initialize agent
const agent = new Agent({
  chain: process.env.CHAIN, // required - options: gnosis, sepolia
  viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY), // required - viem account instance
  pimlicoAPIKey: process.env.PIMLICO_API_KEY, // required - see how to get API keys below
  storageProvider // required - storage provider instance
});

// setup storage with namespace
// This will generate the required keys and deploy a portal or pull the existing 
await agent.setupStorage('my-namespace'); // file is generated as the creds/${namespace}.json in the main directory

const latestBlockNumber = await agent.getBlockNumber();
console.log(`Latest block number: ${latestBlockNumber}`);

// Note: Files are unencrypted by default. To encrypt files and specify access conditions, refer to the Access Control Providers section below

// create a new file
const file = await agent.create('Hello World');
console.log(`File created: ${file}`);

// get the file
const fileData = await agent.getFile(file.fileId);
console.log(`File: ${fileData}`);

// update the file
const updatedFile = await agent.update(file.fileId, 'Hello World 2');
console.log(`File updated: ${updatedFile}`);

// delete the file
const deletedFile = await agent.delete(file.fileId);
console.log(`File deleted: ${deletedFile}`);
```

## How to get API Keys
* Pimlico API Key: https://www.pimlico.io/
    * https://docs.pimlico.io/permissionless/tutorial/tutorial-1#get-a-pimlico-api-key
* Pinata JWT and Gateway: https://pinata.cloud/
    * https://docs.pinata.cloud/account-management/api-keys

## Chains Supported

```
gnosis
sepolia
```

## Storage Providers

### Pinata

```javascript
const storageProvider = new PinataStorageProvider({
  jwt: process.env.PINATA_JWT,
  gateway: process.env.PINATA_GATEWAY,
});
```

### Swarm

```javascript
const storageProvider = new SwarmStorageProvider({
  viemClient: viemClient,
});
```

## Access Control Providers

Access Control Providers protect sensitive data/files generated or consumed by agents, and enforce sharing policy logic – governing which entities are able to decrypt said data, and on what basis. 

### TACo (Threshold Access Control)

TACo (Threshold Access Control) is a decentralized cryptographic infrastructure layer that provides end-to-end encryption and programmable access control. Files are encrypted client-side and are exclusively decryptable by end-users/agents that satisfy the encryptor's pre-specified access conditions. Learn more at [taco.build](https://taco.build/) and in TACo's [documentation](https://docs.taco.build/).

#### Supported Access Conditions

- **Time-based**: Grant access after or until a specific timestamp
- **Token balance**: Grant access based on minimum or maximum token holdings (ERC-20) in the requestor's wallet 
- **NFT holding**: Grant access to current holders of custom NFTs (ERC-721)
- **Custom RPC**: Grant access based on on-chain and off-chain state via calls virtually any JSON-RPC endpoint 
- **Compound conditions**: Grant access based on a logical composition of conditions and condition types (e.g. with AND/OR operators) 
- **Advanced conditionality**: Grant access based on sequential calls, IfThenElse logic and more – see TACo's [conditions documentation](https://docs.taco.build/for-developers/references/conditions)

#### Usage Example

```javascript
import { Agent, TacoAccessProvider } from '@fileverse/agents';
import { conditions } from '@nucypher/taco';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { PinataStorageProvider } from '@fileverse/agents/storage';

// Create storage provider
const storageProvider = new PinataStorageProvider({
  pinataJWT: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

// Create viem client for TACo (connects to Polygon)
// This connects to Polygon Amoy where TACo internal operations occur for taco TESTNET (`tapir` domain)
const tacoViemClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(),
});

const viemAccount = privateKeyToAccount(process.env.PRIVATE_KEY);

// Initialize agent with TACo access control
const agent = new Agent({
  chain: process.env.CHAIN, // required - options: gnosis, sepolia
  viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY), // required - viem account instance
  pimlicoAPIKey: process.env.PIMLICO_API_KEY, // required - see how to get API keys below
  storageProvider // required - storage provider instance
  accessControlProvider: new TacoAccessProvider(
    domain: process.env.TACO_DOMAIN, // for testnet: DOMAIN_NAMES.TESTNET ('tapir' domain)
    ritualId: parseInt(process.env.TACO_RITUAL_ID), // TACo ritual ID (e.g., 6 for tapir)
    viemClient: tacoViemClient, // Polygon Amoy client for TACo internal operations on testnet
  });

// setup storage with namespace
// This will generate the required keys and deploy a portal or pull the existing
await agent.setupStorage('my-namespace'); // file is generated as the creds/${namespace}.json in the main directory


// Create a TACo access condition using the TACo SDK
const timeCondition = new conditions.base.time.TimeCondition({
  chain: 11155111, // Sepolia
  returnValueTest: {
    comparator: '>=',
    value: Math.floor(Date.now() / 1000) + 3600, // Accessible 1 hour from now
  },
});

// Create an encrypted file with access conditions (requires the TACo config to have been passed to the Agent constructor)
const encryptedFile = await agent.create(
  'This is a secret message',
  {
    accessControlConfig: {
      accessCondition: timeCondition, // Actual TACo condition object
      authSigner: agent.viemAccount  // Pass authSigner for TACo encryption authentication
    }
  }
);
console.log(`Encrypted file created: ${encryptedFile}`);

// Get file info & metadata
const fileInfo = await agent.getFileInfo(encryptedFile.fileId);
console.log(`File metadata:`, fileInfo);
console.log(`Is encrypted: ${fileInfo.metadata.encrypted}`);

// Get file with content (automatically downloads and decrypts if the access control conditions was satisfied)
const fileWithContent = await agent.getFile(encryptedFile.fileId, {
  accessControlConfig: {
  // Optional: { accessControlConfig: { ... } } - required for some access conditions
  }
});
console.log(`Decrypted content: ${fileWithContent.content}`); // Output: "This is a secret message"

// update the file and pass the accessControlConfig to the used access provider - Which is TACo in this example.
// Note: if no encryption accessControlConfig was provided the new content will be public
const updatedFile = await agent.update(file.fileId, 'Hello World 2', {
  accessControlConfig: {
    accessCondition,
    authSigner: agent.viemAccount  // Required for TACo encryption authentication
  }
});
console.log(`File updated: ${updatedFile}`);

// update with encryption - create a new condition for the update
const balanceCondition = new conditions.base.rpc.RpcCondition({
  chain: 11155111, // Sepolia
  method: 'eth_getBalance',
  parameters: [':userAddress', 'latest'],
  returnValueTest: {
    comparator: '>',
    value: 0, // User must have any balance
  },
});

const encryptedUpdate = await agent.update(file.fileId, 'Updated encrypted content', {
  accessControlConfig: {
    accessCondition: balanceCondition,
    authSigner: agent.viemAccount
  }
});
console.log(`File updated with encryption: ${encryptedUpdate}`);

// delete the file
const deletedFile = await agent.delete(file.fileId);
console.log(`File deleted: ${deletedFile}`);
```

#### Configuration & Setup

**Networks**: TACo operations run on Polygon networks (testnet: Amoy, production: Polygon Mainnet). Access conditions can be evaluated and (in)validated on any supported blockchain or L2 (Ethereum, Sepolia, etc.).

**Getting Started**: See the [TACo documentation](https://docs.taco.build/for-developers/get-started-with-tac) for supported domains, ritual IDs, and network details.

**Complete Example**: Check out the [Agent with TACo example](./examples/agent-taco-example.js) for a full implementation with multiple access condition types.

## Run Tests

To run the tests, you need to have something like the following environment variables set.
Create a `.env` file in the root directory of the project.

```bash
# Agent
AGENT_CHAIN=sepolia

# Key that its address has funds on the AGENT_CHAIN
PRIVATE_KEY=[FILL_YOUR_PRIVATE_KEY_HERE]

# Pinata
PINATA_GATEWAY=[FILL_YOUR_PINATA_GATEWAY_HERE]

# Pimlico
PIMLICO_API_KEY=[FILL_YOUR_PIMLICO_API_KEY_HERE]

# TACo
TACO_DOMAIN=tapir # DOMAIN_NAMES.TESTNET
TACO_RITUAL_ID=6
TACO_CHAIN_ID=80002 # Polygon Amoy
TACO_CHAIN_RPC_URL=https://rpc-amoy.polygon.technology # Rpc endpoint for the chosen TACO_CHAIN_ID


```

Run the tests:

```bash
npm i && npm run test
```

---

PS: Remember to put creds directory in your .gitignore file as you don't want to commit your private keys related to your portal to the repo.
