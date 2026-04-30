import { Injectable } from '@angular/core';

/**
 * Encryption/Decryption service using the Web Crypto API (AES-256-GCM).
 *
 * Uses a server-provided encryption key exchanged during login.
 * The key is stored in sessionStorage and cleared on logout.
 *
 * Payload format: Base64( IV (12 bytes) + Ciphertext + AuthTag (16 bytes) )
 */
@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly KEY_STORAGE = 'encryptionKey';
  private cachedKey: CryptoKey | null = null;

  /**
   * Store the encryption key received from the backend (Base64-encoded).
   * Called after successful login if the backend provides a session key.
   */
  async setKey(base64Key: string): Promise<void> {
    sessionStorage.setItem(this.KEY_STORAGE, base64Key);
    this.cachedKey = null;
  }

  /** Clear cached key on logout */
  clearKey(): void {
    sessionStorage.removeItem(this.KEY_STORAGE);
    this.cachedKey = null;
  }

  /** Check if encryption is available */
  hasKey(): boolean {
    return !!sessionStorage.getItem(this.KEY_STORAGE);
  }

  /**
   * Encrypt a JSON payload.
   * Returns Base64-encoded string: IV (12 bytes) + ciphertext + tag.
   */
  async encrypt(data: any): Promise<string> {
    const key = await this.getKey();
    if (!key) throw new Error('Encryption key not available');

    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext,
    );

    // Combine IV + ciphertext into a single buffer
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined);
  }

  /**
   * Decrypt a Base64-encoded payload.
   * Expects format: IV (12 bytes) + ciphertext + auth tag.
   */
  async decrypt(encryptedBase64: string): Promise<any> {
    const key = await this.getKey();
    if (!key) throw new Error('Encryption key not available');

    const combined = this.base64ToArrayBuffer(encryptedBase64);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text);
  }

  // ---- Internal key management ----

  private async getKey(): Promise<CryptoKey | null> {
    if (this.cachedKey) return this.cachedKey;

    const stored = sessionStorage.getItem(this.KEY_STORAGE);
    if (!stored) return null;

    const raw = this.base64ToArrayBuffer(stored);
    this.cachedKey = await crypto.subtle.importKey(
      'raw',
      raw.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );

    return this.cachedKey;
  }

  // ---- Encoding utilities ----

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
