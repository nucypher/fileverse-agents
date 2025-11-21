class BaseStorageProvider {
  async upload(fileName, content) {
    throw new Error('Method not implemented');
  }

  /**
   * Download content from storage
   * @param {string} reference - The content reference/CID
   * @param {Object} [options] - Download options
   * @param {boolean} [options.binary] - If true, normalizes response to Uint8Array for binary content
   * @returns {Promise<any|Uint8Array>} Raw data or normalized Uint8Array if binary option is true
   */
  async download(reference, options = {}) {
    throw new Error('Method not implemented');
  }

  async unpin(reference) {
    throw new Error('Method not implemented');
  }

  async protocol() {
    throw new Error('Method not implemented');
  }

  async isConnected() {
    throw new Error('Method not implemented');
  }

  /**
   * Method to be used by child classes (Protected Method) to normalize data to Uint8Array for binary content
   * @param {*} data - Raw data from storage provider
   * @returns {Promise<Uint8Array>} Normalized binary data as Uint8Array
   * @protected
   */
  async _normalizeToBinary(data) {
    // Handle Blob objects from new SDK versions
    if (data instanceof Blob) {
      data = await data.arrayBuffer();
    }

    // Normalize to Uint8Array for consumers (allow raw bytes)
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    // Covers Node.js Buffer and all TypedArrays
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset ?? 0, data.byteLength);
    }

    // Last-resort fallback for unexpected shapes
    return new TextEncoder().encode(
      typeof data === "object" ? JSON.stringify(data) : String(data)
    );
  }
}

export { BaseStorageProvider };
