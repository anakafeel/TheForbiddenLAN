// Encryption — AES-GCM audio chunk encryption via Web Crypto API.
// Hardcoded test key used until Shri's KDF(master_secret, talkgroup_id, rotation_counter) is ready.
const TEST_KEY_HEX = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

export class Encryption {
  private key: CryptoKey | null = null;

  async init(hexKey: string = TEST_KEY_HEX): Promise<void> {
    const keyBytes = new Uint8Array(
      hexKey.match(/.{2}/g)!.map(b => parseInt(b, 16))
    );
    this.key = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
  }

  async encrypt(base64Data: string): Promise<string> {
    if (!this.key) throw new Error('Encryption not initialized');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, this.key, data
    );
    // Prepend IV to encrypted data, return as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(base64Data: string): Promise<string> {
    if (!this.key) throw new Error('Encryption not initialized');
    const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, this.key, data
    );
    return btoa(String.fromCharCode(...new Uint8Array(decrypted)));
  }
}
