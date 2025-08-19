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
    try {
      const protocol = await this.protocol();
      const strippedReference =
        typeof reference === "string"
          ? reference.replace(protocol, "")
          : reference;

      // In the new SDK, we need the file ID, not the CID
      // First, find the file by CID to get its ID
      try {
        const filesResponse = await this.pinata.files.public
          .list()
          .cid(strippedReference);

        // Handle the response structure - it might be { files: [...] } or just [...]
        const files = filesResponse.files || filesResponse;

        if (!files || files.length === 0) {
          console.warn(`No file found with CID: ${strippedReference}`);
          return `${protocol}${strippedReference}`;
        }

        // Get the file ID and delete using the proper API
        const fileId = files[0].id;
        if (!fileId) {
          console.warn(`File found but no ID available for CID: ${strippedReference}`);
          throw new Error('File ID not available');
        }

        const result = await this.pinata.files.public.delete([fileId]);
        console.log(`Successfully unpinned file with CID: ${strippedReference} (ID: ${fileId})`);
      } catch (listError) {
        console.warn(`Failed to find file by CID ${strippedReference}:`, listError.message);
        // Fallback: try to use CID as ID (might not work but worth trying)
        const result = await this.pinata.files.public.delete([strippedReference]);
      }
      return `${protocol}${strippedReference}`;
    } catch (error) {
      console.error("Error unpinning from IPFS:", error);
      // For backward compatibility, don't throw error if delete fails
      console.warn('Unpin operation failed, but continuing for backward compatibility');
      return `ipfs://${strippedReference}`;
    }
  }

  async download(reference) {
    const protocol = await this.protocol();
    const strippedReference =
      typeof reference === "string"
        ? reference.replace(protocol, "")
        : reference;
    const result = await this.pinata.gateways.public.get(strippedReference);
    return result;
  }

  async downloadBytes(reference) {
    if (!reference) {
      throw new Error('Reference is required for downloading bytes');
    }

    const protocol = await this.protocol();
    const strippedReference =
      typeof reference === "string"
        ? reference.replace(protocol, "")
        : reference;

    if (!strippedReference || strippedReference.length === 0) {
      throw new Error('Invalid reference after protocol stripping');
    }

    if (!this.pinata?.config?.pinataGateway) {
      throw new Error('Pinata gateway configuration missing');
    }

    const url = `https://${this.pinata.config.pinataGateway}/ipfs/${strippedReference}`;

    try {
      console.log(`Downloading binary data from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/octet-stream',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength === '0') {
        throw new Error('Empty response from IPFS gateway');
      }

      const arrayBuffer = await response.arrayBuffer();

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Empty or invalid binary data received');
      }

      console.log(`Successfully downloaded ${arrayBuffer.byteLength} bytes`);
      return new Uint8Array(arrayBuffer);

    } catch (error) {
      const enhancedError = new Error(
        `Failed to download bytes from IPFS (${strippedReference}): ${error.message}`
      );
      enhancedError.originalError = error;
      enhancedError.reference = reference;
      enhancedError.url = url;

      console.error("Error downloading bytes from IPFS:", enhancedError);
      throw enhancedError;
    }
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
