/**
 * Example: Using Native TACo Conditions with Agent.create()
 * 
 * This demonstrates the completed API where users create TACo condition
 * objects directly instead of passing JSON configurations.
 */

// Example of how the API works once TACo packages are properly installed
async function createEncryptedFileExample() {
  console.log('🚀 Starting TACo Encrypted File Example');
  
  // 1. Import TACo to create condition objects
  console.debug('📦 Importing TACo conditions...');
  const { conditions } = await import("@nucypher/taco");
  console.debug('✅ TACo conditions imported successfully');
  
  // 2. Create native TACo condition objects
  console.debug('🔐 Creating TACo access conditions...');
  
  console.debug('   ⚒️ Creating balance condition (Polygon Amoy)...');
  const balanceCondition = new conditions.base.rpc.RpcCondition({
    chain: 80002, // Polygon Amoy
    method: "eth_getBalance",
    parameters: [":userAddress", "latest"],
    returnValueTest: {
      comparator: ">=",
      value: 0, // Any balance
    },
  });
  console.debug('   ✅ Balance condition created');

  console.debug('   🖼️ Creating NFT ownership condition (Sepolia)...');
  const nftOwnershipCondition = new conditions.predefined.erc721.ERC721Ownership({
    contractAddress: '0x1e988ba4692e52Bc50b375bcC8585b95c48AaD77',
    parameters: [3591],
    chain: 11155111, // Sepolia
  });
  console.debug('   ✅ NFT ownership condition created');

  console.debug('   🔗 Creating compound condition (AND logic)...');
  const compoundCondition = new conditions.compound.CompoundCondition({
    operator: 'and',
    operands: [balanceCondition, nftOwnershipCondition]
  });
  console.debug('   ✅ Compound condition created with 2 operands');
  console.debug('✅ All TACo conditions ready for encryption');

  // 3. Use with Agent.create() - pass TACo condition directly
  console.debug('📝 Creating encrypted file with TACo conditions...');
  const result = await agent.create("Encrypted content", {
    accessCondition: compoundCondition, // Native TACo object, not JSON
  });
  console.debug('🔒 File encryption completed');

  console.log('✨ Encrypted file created successfully!');
  console.log('📊 File Details:', {
    fileId: result.fileId,
    encrypted: result.encrypted,
    hasAccessConditions: !!result.accessConditions,
    portalAddress: result.portalAddress
  });
  
  console.log('✅ TACo Encrypted File Example completed successfully!');
  
  return result;
}

/**
 * Key Benefits of This API:
 * 
 * 1. ✅ Native TACo Integration: Users work directly with TACo condition objects
 * 2. ✅ Full TACo Feature Access: All condition types available (RPC, ERC721, JWT, etc.)
 * 3. ✅ Type Safety: Proper TypeScript support for condition parameters
 * 4. ✅ No JSON Conversion: Eliminates the need for custom JSON-to-condition parsing
 * 5. ✅ Clean Architecture: Direct integration with TACo's condition system
 */

export { createEncryptedFileExample };
