import { PinataSDK } from "pinata";
import { BaseStorageProvider } from "./base.js";

class PinataStorageProvider extends BaseStorageProvider {
  constructor({ pinataJWT, pinataGateway }) {
    super();
    if (!pinataJWT || !pinataGateway) {
      throw new Error("Pinata JWT and gateway are required");
    }
    this.pinata = new PinataSDK({
      pinataJwt: pinataJWT,
      pinataGateway: pinataGateway,
    });
  }

  async protocol() {
    return "ipfs://";
  }

  async upload(fileName, content) {
    try {
      const protocol = await this.protocol();
      const file = new File([content], fileName, { type: "text/plain" });
      const result = await this.pinata.upload.public.file(file);
      return `${protocol}${result.cid}`;
    } catch (error) {
      console.error("Error uploading to IPFS:", error);
      throw error;
    }
  }

  async unpin(reference) {
    if (!reference) {
      throw new Error("Reference is required for unpinning");
    }

    const protocol = await this.protocol();
    const strippedReference =
      typeof reference === "string"
        ? reference.replace(protocol, "")
        : reference;

    if (!strippedReference || strippedReference.length === 0) {
      throw new Error("Invalid reference after protocol stripping");
    }

    try {
      // Preflight: ensure storage provider is authenticated/connected
      const connected = await this.isConnected();
      if (!connected) {
        throw new Error(
          `PinataStorageProvider: Error at unpin for ${strippedReference} - storage provider is not authenticated/connected`
        );
      }

      // Step 1: Find the file by CID to get its ID
      const filesResponse = await this.pinata.files.public
        .list()
        .cid(strippedReference);

      // Handle the response structure - it might be { files: [...] } or just [...]
      const files = filesResponse.files || filesResponse;

      if (!files || files.length === 0) {
        throw new Error(`File not found with CID: ${strippedReference}`);
      }

      // Step 2: Get the file ID
      const fileId = files[0].id;
      if (!fileId) {
        throw new Error(`File ID not available for CID: ${strippedReference}`);
      }

      // Step 3: Delete the file using its ID
      await this.pinata.files.public.delete([fileId]);

      return `${protocol}${strippedReference}`;
    } catch (error) {
      console.error("Error unpinning from IPFS:", error);
      throw error;
    }
  }

  async download(reference) {
    const protocol = await this.protocol();
    const strippedReference =
      typeof reference === "string"
        ? reference.replace(protocol, "")
        : reference;
    const result = await this.pinata.gateways.public.get(strippedReference);
    return result?.data;
  }

  async isConnected() {
    try {
      const result = await this.pinata.testAuthentication();
      return result;
    } catch (error) {
      console.error("Error testing Pinata auth:", error);
      return false;
    }
  }
}

export { PinataStorageProvider };
