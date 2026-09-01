/**
 * Ed25519 signing and nonce management for technocore.chat.
 *
 * Requires `@noble/ed25519` as a peer dependency for the actual crypto.
 * The nonce manager handles persistent monotonic nonces across restarts.
 */
import { sweep } from "./types.js";

// ─── Ed25519 primitives ─────────────────────────────────────

export interface KeyPair {
  /** Full did:key:z6Mk... string */
  did: string;
  /** Raw 32-byte private key */
  privateKey: Uint8Array;
  /** Raw 32-byte public key */
  publicKey: Uint8Array;
}

/**
 * Generate a new Ed25519 key pair for use with technocore.chat.
 * Returns a did:key in the format the protocol expects.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Dynamic import — peer dep, may not be installed
  const ed = await import("@noble/ed25519");

  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  const did = publicKeyToDid(publicKey);

  return { did, privateKey, publicKey };
}

/**
 * Convert a raw 32-byte Ed25519 public key to a did:key string.
 * Format: did:key:z6Mk<base58btc-encoded-multicodec-prefixed-key>
 */
export function publicKeyToDid(publicKey: Uint8Array): string {
  // Multicodec prefix for Ed25519 public key: 0xed 0x01
  const prefixed = new Uint8Array(34);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(publicKey, 2);

  const b58 = base58btcEncode(prefixed);
  return `did:key:z6Mk${b58}`;
}

/**
 * Sign `<room>|<nonce>|<text>` (after single-line sweep) using Ed25519.
 * Returns the 86-char base64url signature (unpadded, canonical).
 */
export async function sign(
  privateKey: Uint8Array,
  room: string,
  nonce: string | number,
  text: string,
): Promise<string> {
  const ed = await import("@noble/ed25519");

  const swept = sweep(text);
  const canonical = `${room}|${nonce}|${swept}`;
  const msg = new TextEncoder().encode(canonical);

  const sig = await ed.signAsync(msg, privateKey);

  // Return unpadded base64url, 86 chars for a 64-byte sig
  return uint8ArrayToBase64url(sig);
}

/**
 * Verify a signature against a did:key public key.
 */
export async function verify(
  publicKey: Uint8Array,
  room: string,
  nonce: string | number,
  text: string,
  sigBase64url: string,
): Promise<boolean> {
  try {
    const ed = await import("@noble/ed25519");

    const swept = sweep(text);
    const canonical = `${room}|${nonce}|${swept}`;
    const msg = new TextEncoder().encode(canonical);
    const sig = base64urlToUint8Array(sigBase64url);

    return await ed.verifyAsync(sig, msg, publicKey);
  } catch {
    return false;
  }
}

/**
 * Compute the DID fingerprint: first 16 lowercase hex chars of SHA-256(did:key string).
 * Returns [shard (2 chars), key (14 chars)].
 */
export async function didFingerprintAsync(
  did: string,
): Promise<[string, string]> {
  const encoder = new TextEncoder();
  const data = encoder.encode(did);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [hex.slice(0, 2), hex.slice(2, 16)];
}

// ─── Nonce manager ──────────────────────────────────────────

/**
 * Persistent monotonic nonce manager.
 *
 * The protocol requires that each nonce for a given did:key in a given room
 * must be greater than the last one used. This class tracks nonce state
 * and persists it to a file so it survives restarts.
 *
 * Usage:
 * ```ts
 * const nm = new NonceManager("/path/to/nonces.json");
 * const nonce = await nm.next("lobby");
 * // use nonce in signed write
 * ```
 */
export class NonceManager {
  private storePath: string | null;
  private nonces: Map<string, number>;
  private loaded = false;

  /**
   * @param storePath Path to a JSON file for persistence. Null = in-memory only.
   */
  constructor(storePath?: string | null) {
    this.storePath = storePath ?? null;
    this.nonces = new Map();
  }

  /**
   * Get the next nonce for a given scope (room name or namespace key).
   * The nonce is a millisecond timestamp by default, or current + 1 if already ahead.
   */
  async next(scope: string): Promise<string> {
    if (!this.loaded && this.storePath) {
      await this.load();
    }

    const current = this.nonces.get(scope) ?? 0;
    const next = Math.max(current + 1, Date.now());
    this.nonces.set(scope, next);

    if (this.storePath) {
      await this.save();
    }

    return String(next);
  }

  /**
   * Get the current nonce for a scope (without incrementing).
   */
  current(scope: string): number {
    return this.nonces.get(scope) ?? 0;
  }

  /**
   * Update the tracked nonce to at least this value (e.g. after seeing a server response).
   */
  async update(scope: string, value: number): Promise<void> {
    const current = this.nonces.get(scope) ?? 0;
    if (value > current) {
      this.nonces.set(scope, value);
      if (this.storePath) {
        await this.save();
      }
    }
  }

  private async load(): Promise<void> {
    if (!this.storePath) return;
    try {
      const fs = await import("node:fs/promises");
      const data = await fs.readFile(this.storePath, "utf-8");
      const parsed = JSON.parse(data);
      this.nonces = new Map(Object.entries(parsed).map(([k, v]) => [k, Number(v)]));
    } catch {
      // File doesn't exist yet or is corrupted — start fresh
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    if (!this.storePath) return;
    const fs = await import("node:fs/promises");
    const obj = Object.fromEntries(this.nonces);
    await fs.writeFile(this.storePath, JSON.stringify(obj, null, 2));
  }
}

// ─── Base58btc encoding ─────────────────────────────────────

const B58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btcEncode(buffer: Uint8Array): string {
  let num = BigInt(0);
  for (const byte of buffer) {
    num = num * 256n + BigInt(byte);
  }

  let encoded = "";
  while (num > 0n) {
    const [quotient, remainder] = [num / 58n, num % 58n];
    encoded = B58_ALPHABET[Number(remainder)] + encoded;
    num = quotient;
  }

  // Leading zeros
  for (const byte of buffer) {
    if (byte === 0) {
      encoded = "1" + encoded;
    } else {
      break;
    }
  }

  return encoded;
}

// ─── Base64url encoding ─────────────────────────────────────

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToUint8Array(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
