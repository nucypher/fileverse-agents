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
import { createPublicClient, http } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { PinataStorageProvider } from '@fileverse/agents/storage';

// Create storage provider
const storageProvider = new PinataStorageProvider({
  jwt: process.env.PINATA_JWT,
  gateway: process.env.PINATA_GATEWAY,
});

// Optional: Create dedicated TACo viem client for Polygon Amoy operations
// (If not provided, Agent will use its default client)
const optionalTacoViemClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(),
});

// Initialize agent (with optional TACo encryption)
const agent = new Agent({
  chain: process.env.CHAIN, // required - options: gnosis, sepolia
  viemAccount: privateKeyToAccount(process.env.PRIVATE_KEY), // required - viem account instance
  pimlicoAPIKey: process.env.PIMLICO_API_KEY, // required - see how to get API keys below
  storageProvider, // required - storage provider instance
  taco: {
    // optional - for encrypted files with programmable access conditions
    domain: process.env.TACO_DOMAIN, // required - options: 'DEVNET', 'TESTNET', 'MAINNET'
    ritualId: parseInt(process.env.TACO_RITUAL_ID), // required - TACo ritual ID (e.g., 6 for TESTNET, 27 for DEVNET)
    viemClient: optionalTacoViemClient, // optional - custom viem client for TACo operations (uses agent's client by default)
  },
});

// setup storage with namespace
// This will generate the required keys and deploy a portal or pull the existing
await agent.setupStorage('my-namespace'); // file is generated as the creds/${namespace}.json in the main directory

const latestBlockNumber = await agent.getBlockNumber();
console.log(`Latest block number: ${latestBlockNumber}`);

// create a new file
const file = await agent.create('Hello World');
console.log(`File created: ${file}`);

// create an encrypted file with access conditions (requires TACo config already passed at the Agent constructor)

const { conditions } = await import('@nucypher/taco');

// Access conditions can target any supported blockchain (independent of TACo's operation chain)
const accessCondition = new conditions.base.rpc.RpcCondition({
  chain: 11155111, // Sepolia testnet - where to check the condition
  method: 'eth_getBalance',
  parameters: [':userAddress', 'latest'],
  returnValueTest: { comparator: '>=', value: 0 },
});

const encryptedFile = await agent.create('Secret data', {
  accessCondition,
});
console.log(`Encrypted file created: ${encryptedFile}`);

// Get decrypted file content (requires the wallet/signer to satisfy the access conditions)
// Note: The agent automatically handles condition context creation and authentication
const decryptedContent = await agent.getFileContent(
  encryptedFile.fileId,
  decryptorViemAccount // if it is different than agent.viemAccount,
);
console.log(`Decrypted content: ${decryptedContent.content}`); // Output: "Secret data"

// Optional: Use a different viem account for decryption (useful when access conditions require a different wallet)
// import { privateKeyToAccount } from 'viem/accounts';
// const customViemAccount = privateKeyToAccount('0x...differentPrivateKey');
// const decryptedWithCustomAccount = await agent.getFileContent(encryptedFile.fileId, customViemAccount);

// update the file - if no encryption conditions was provided the new content will be public
const updatedFile = await agent.update(file.fileId, 'Hello World 2'{
  accessCondition,
});
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


## TACo Encryption

When TACo is configured, you can create encrypted files with programmable access conditions:

- **Time-based conditions**: files accessible after a specific time
- **Token balance conditions**: files accessible to users with minimum token balances
- **NFT ownership conditions**: files accessible to holders of specific NFTs
- **Custom RPC conditions**: files with complex blockchain-based access logic
- **Compound conditions**: combine multiple conditions with AND/OR logic
- **And more** as in https://docs.taco.build/for-developers/references/conditions...

### TACo Configuration Options

Supported TACo domains and their characteristics:

- **DEVNET** (`lynx`): Bleeding-edge developer network (Chain: Polygon Amoy 80002)
- **TESTNET** (`tapir`): Stable testnet for current TACo release (Chain: Polygon Amoy 80002)
- **MAINNET**: (`mainnet`) Production network (Chain: Polygon Mainnet 137)

For current ritual IDs and detailed domain information, see: https://docs.taco.build/for-developers/get-started-with-tac

**Important**: TACo operations occur on Polygon networks, so your viem client must connect to the corresponding Polygon chain (Amoy for testnet, Mainnet for production). However, access conditions can be evaluated on any supported blockchain (Sepolia, Ethereum Mainnet, etc.).

See the [Agent with TACo example](./examples/agent-taco-example.js) for more detailed encryption usage.

---

**Note**: Remember to put the `creds` directory in your `.gitignore` file as you don't want to commit your private keys to the repo.
