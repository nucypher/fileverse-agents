import { Bee } from "@ethersphere/bee-js";
import { BaseStorageProvider } from "./base.js";

class SwarmStorageProvider extends BaseStorageProvider {
  constructor({ beeUrl, postageBatchId }) {
    super();
    if (!beeUrl) {
      throw new Error("Bee node URL is required");
    }
    if (!postageBatchId) {
      throw new Error(
        "Postage batch ID is required for uploading data to Swarm"
      );
    }
    this.bee = new Bee(beeUrl);
    this.postageBatchId = postageBatchId;
  }

  async protocol() {
    return "bzz://";
  }

  async upload(fileName, content) {
    try {
      const protocol = await this.protocol();
      // Create a File object from the content
      const file = new File([content], fileName, { type: "text/plain" });

      // Upload the file to Swarm
      const result = await this.bee.uploadFile(
        this.postageBatchId,
        file,
        fileName,
        {
          pin: true, // Pin the content to make it persistent
        }
      );

      // Return the Swarm reference as a URI
      return `${protocol}${result.reference}`;
    } catch (error) {
      console.error("Error uploading to Swarm:", error);
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
      const result = await this.bee.unpin(strippedReference);
      return `${protocol}${result.reference}`;
    } catch (error) {
      console.error("Error unpinning from Swarm:", error);
      throw error;
    }
  }

  /**
   * Download content from Swarm
   * @param {string} reference - The content reference/hash
   * @param {Object} options - Download options
   * @param {boolean} options.binary - If true, normalizes response to Uint8Array for binary content (default: false)
   * @returns {Promise<any|Uint8Array>} Raw data or normalized Uint8Array if binary option is true
   */
  async download(reference, options = {}) {
    try {
      const { binary = false } = options;

      const protocol = await this.protocol();
      const strippedReference =
      typeof reference === "string"
        ? reference.replace(protocol, "")
        : reference;
      const result = await this.bee.downloadFile(strippedReference);

      // Return raw data if not requesting binary normalization
      if (!binary) {
        return result;
      }

      // Use parent class method for binary normalization
      return this._normalizeToBinary(result);
    } catch (error) {
      console.error("Error downloading from Swarm:", error);
      throw error;
    }
  }

  async isConnected() {
    try {
      await this.bee.checkConnection();
      return true;
    } catch {
      return false;
    }
  }
}

export { SwarmStorageProvider };
