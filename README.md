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
import { Agent, TacoAccessProvider } from '@fileverse/agents';
import { conditions } from '@nucypher/taco';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { PinataStorageProvider } from '@fileverse/agents/storage';

// Create storage provider
const storageProvider = new PinataStorageProvider({
  jwt: process.env.PINATA_JWT,
  gateway: process.env.PINATA_GATEWAY,
});

// Optional: Create a custom viem client for TACo operations
// This connects to Polygon Amoy where TACo operations occur
// (If not provided, Agent will use its default client)
const tacoViemClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(),
});

// Initialize agent (with optional TACo encryption)
const agent = new Agent({
  chain: process.env.CHAIN, // required - options: gnosis, sepolia
  viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY), // required - viem account instance
  pimlicoAPIKey: process.env.PIMLICO_API_KEY, // required - see how to get API keys below
  storageProvider, // required - storage provider instance
  dataAccessProvider: new TacoAccessProvider({
    // optional - for encrypted files with programmable access conditions
    domain: process.env.TACO_DOMAIN, // required - options: 'lynx', 'tapir', 'mainnet'
    ritualId: parseInt(process.env.TACO_RITUAL_ID), // required - TACo ritual ID (e.g., 6 for tapir, 27 for lynx)
    viemClient: tacoViemClient, // optional - custom viem client for TACo operations (uses agent's client by default)
  }),
});

// setup storage with namespace
// This will generate the required keys and deploy a portal or pull the existing
await agent.setupStorage('my-namespace'); // file is generated as the creds/${namespace}.json in the main directory

const latestBlockNumber = await agent.getBlockNumber();
console.log(`Latest block number: ${latestBlockNumber}`);

// create a new file
const file = await agent.create('Hello World');
console.log(`File created: ${file}`);

// create an encrypted file with access conditions (requires TaCo config already passed at the Agent constructor)
// Note: You must pass authSigner in options for TACo encryption

// Create a TACo access condition using the TACo SDK
const timeCondition = new conditions.base.time.TimeCondition({
  chain: 11155111, // Sepolia
  method: 'blocktime',
  returnValueTest: {
    comparator: '>=',
    value: Math.floor(Date.now() / 1000) + 3600, // Accessible 1 hour from now
  },
});

const encryptedFile = await agent.create(
  'This is a secret message',
  {
    dataAccessConfig: {
      accessCondition: timeCondition, // Actual TACo condition object
      authSigner: agent.viemAccount  // Pass authSigner for TACo encryption
    }
  }
);
console.log(`Encrypted file created: ${encryptedFile}`);

// Get file metadata only (no content download)
const fileInfo = await agent.getFileInfo(encryptedFile.fileId);
console.log(`File metadata:`, fileInfo);
console.log(`Is encrypted: ${fileInfo.metadata.encrypted}`);

// Get file with content (automatically downloads and decrypts if needed)
const fileWithContent = await agent.getFile(encryptedFile.fileId, {
  dataAccessConfig: {
    // Optional: Your decryption configuration here
    // If not provided, the data access provider will use default behavior
  }
});
console.log(`Decrypted content: ${fileWithContent.content}`); // Output: "This is a secret message"

// update the file and pass the dataAccessConfig to the used access provider - Which is TACo in this example.
// Note: if no encryption dataAccessConfig was provided the new content will be public
const updatedFile = await agent.update(file.fileId, 'Hello World 2', {
  dataAccessConfig: {
    accessCondition,
    authSigner: agent.viemAccount  // Required for TACo encryption
  }
});
console.log(`File updated: ${updatedFile}`);

// update with encryption - create a new condition for the update
const balanceCondition = new conditions.base.rpc.RpcCondition({
  chain: 11155111, // Sepolia
  method: 'eth_getBalance',
  parameters: [':userAddress', 'latest'],
  returnValueTest: {
    comparator: '>=',
    value: 0, // User must have any balance
  },
});

const encryptedUpdate = await agent.update(file.fileId, 'Updated encrypted content', {
  dataAccessConfig: {
    accessCondition: balanceCondition,
    authSigner: agent.viemAccount
  }
});
console.log(`File updated with encryption: ${encryptedUpdate}`);

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

## DataAccessProvider

DataAccessProviders enable encrypted file storage with programmable access conditions. The Agent supports different types of data access providers:

### TACo (Threshold Access Control)

When TACo DataAccessProvider is configured, you can create encrypted files with programmable access conditions:

- **Time-based conditions**: files accessible after a specific time
- **Token balance conditions**: files accessible to users with minimum token balances
- **NFT ownership conditions**: files accessible to holders of specific NFTs
- **Custom RPC conditions**: files with complex blockchain-based access logic
- **Compound conditions**: combine multiple conditions with AND/OR logic
- **And more** as documented at https://docs.taco.build/for-developers/references/conditions

#### TACo Configuration Options

Supported TACo domains and their characteristics:

- **DEVNET** (`lynx`): Bleeding-edge developer network (Chain: Polygon Amoy 80002)
- **TESTNET** (`tapir`): Stable testnet for current TACo release (Chain: Polygon Amoy 80002)
- **MAINNET** (`mainnet`): Production network (Chain: Polygon Mainnet 137)

For current ritual IDs and detailed domain information, see: https://docs.taco.build/for-developers/get-started-with-tac

**Important**: TACo operations occur on Polygon networks, so your TACo viem client must connect to the corresponding Polygon chain (Amoy for testnet, Mainnet for production). However, access conditions can be evaluated on any supported blockchain (Sepolia, Ethereum Mainnet, etc.).

**Working Example**: See the [Agent with TACo example](./examples/agent-taco-example.js) for a complete working implementation that demonstrates encryption, decryption, and access control.

## Run Tests

To run the tests, you need to have something like the following environment variables set.
Create a `.env` file in the root directory of the project.

```bash
# Keys
PRIVATE_KEY=[FILL_YOUR_PRIVATE_KEY_HERE]

# Pinata
PINATA_GATEWAY=[FILL_YOUR_PINATA_GATEWAY_HERE]

# Pimlico
PIMLICO_API_KEY=[FILL_YOUR_PIMLICO_API_KEY_HERE]

# TACo
TACO_DOMAIN=tapir
TACO_RITUAL_ID=6
TACO_CHAIN_ID=11155111

# Agent
AGENT_CHAIN=sepolia

```

Run the tests:

```bash
npm i && npm run test
```

---

PS: Remember to put creds directory in your .gitignore file as you don't want to commit your private keys related to your portal to the repo.
