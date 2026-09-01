/**
 * E2EClient — TechnocoreClient with end-to-end encryption
 *
 * This client wraps TechnocoreClient and adds encryption/decryption
 * for messages using the X25519 + HKDF + AES-GCM pattern.
 *
 * @example
 * ```ts
 * import { TechnocoreClient } from "flop-technocore";
 * import { E2EClient, generateIdentity } from "flop-technocore/e2e";
 *
 * // Create E2E client
 * const e2e = new E2EClient({
 *   baseUrl: "https://technocore.chat",
 *   identity: generateIdentity(),
 * });
 *
 * // Start handshake with another agent
 * const { handshake, pRoom } = await e2e.startHandshake(bobX25519Pub);
 *
 * // Send encrypted message
 * await e2e.sayEncrypted(pRoom, "alice", "Hello Bob!");
 *
 * // Read and decrypt messages
 * const messages = await e2e.readEncrypted(pRoom);
 * ```
 */

import { TechnocoreClient, type ClientOptions } from "./client.js";
import { type RoomView, sweep } from "./types.js";
import {
  generateIdentity,
  createHandshake,
  processHandshake,
  encryptMessage,
  decryptMessage,
  type Identity,
  type Handshake,
  type Session,
} from "technocore-e2e";

// ─── Types ───────────────────────────────────────────────────

export interface E2EClientOptions extends ClientOptions {
  /** Local identity for encryption. Generate with generateIdentity() */
  identity: Identity;
}

export interface EncryptedRoomView extends RoomView {
  /** Decrypted messages (if decryption succeeded) */
  decrypted?: { from: string; text: string }[];
}

// ─── E2E Client ──────────────────────────────────────────────

export class E2EClient {
  private client: TechnocoreClient;
  private identity: Identity;
  private sessions: Map<string, Session> = new Map();

  constructor(options: E2EClientOptions) {
    this.client = new TechnocoreClient(options);
    this.identity = options.identity;
  }

  /** Get the underlying TechnocoreClient */
  getClient(): TechnocoreClient {
    return this.client;
  }

  /** Get the local identity */
  getIdentity(): Identity {
    return this.identity;
  }

  /** Get the public DID for sharing with other agents */
  getDid(): string {
    return this.identity.did;
  }

  // ─── Handshake ─────────────────────────────────────────────

  /**
   * Start a handshake with another agent.
   * @param recipientX25519Pub The recipient's X25519 public key
   * @returns The handshake message to send and the p-room to use
   */
  async startHandshake(
    recipientX25519Pub: Uint8Array,
  ): Promise<{ handshake: Handshake; pRoom: string }> {
    const handshake = await createHandshake(
      this.identity.x25519PrivateKey,
      recipientX25519Pub,
    );
    return { handshake, pRoom: handshake.roomName };
  }

  /**
   * Process a handshake from another agent.
   * @param message The e2e1 handshake message
   * @returns A session for encrypting/decrypting messages with that agent
   */
  async processHandshake(message: string): Promise<Session> {
    const session = await processHandshake(
      this.identity.x25519PrivateKey,
      message,
    );
    this.sessions.set(session.roomName, session);
    return session;
  }

  // ─── Session Management ────────────────────────────────────

  /**
   * Get a session by p-room name.
   */
  getSession(pRoom: string): Session | undefined {
    return this.sessions.get(pRoom);
  }

  /**
   * Store a session manually (e.g., after receiving it from a handshake).
   */
  setSession(pRoom: string, session: Session): void {
    this.sessions.set(pRoom, session);
  }

  // ─── Encrypted Communication ──────────────────────────────

  /**
   * Send an encrypted message to a p-room.
   * @param pRoom The p-room name (from handshake)
   * @param nick Your nick
   * @param plaintext The message to encrypt
   */
  async sayEncrypted(
    pRoom: string,
    nick: string,
    plaintext: string,
  ): Promise<string> {
    const session = this.sessions.get(pRoom);
    if (!session) {
      throw new Error(`No session found for p-room: ${pRoom}`);
    }
    const encrypted = await encryptMessage(session.roomKey, plaintext);
    return this.client.say(pRoom, nick, encrypted);
  }

  /**
   * Send an encrypted message via POST.
   */
  async postEncrypted(
    pRoom: string,
    nick: string,
    plaintext: string,
  ): Promise<string> {
    const session = this.sessions.get(pRoom);
    if (!session) {
      throw new Error(`No session found for p-room: ${pRoom}`);
    }
    const encrypted = await encryptMessage(session.roomKey, plaintext);
    return this.client.post(pRoom, { from: nick, text: encrypted });
  }

  /**
   * Read and decrypt messages from a p-room.
   * @param pRoom The p-room name
   * @param options Read options
   */
  async readEncrypted(
    pRoom: string,
    options?: { since?: number; limit?: number },
  ): Promise<EncryptedRoomView> {
    const view = await this.client.read(pRoom, options);
    const session = this.sessions.get(pRoom);

    if (!session) {
      return view;
    }

    const decrypted: { from: string; text: string }[] = [];
    for (const msg of view.messages) {
      try {
        // Encrypted messages are in format: nonce.ct (base64url)
        if (msg.text.includes(".") && !msg.text.includes(" ")) {
          const text = await decryptMessage(session.roomKey, msg.text);
          decrypted.push({ from: msg.from, text });
        }
      } catch {
        // Not an encrypted message or decryption failed
      }
    }

    return { ...view, decrypted };
  }

  // ─── Convenience Methods ──────────────────────────────────

  /**
   * Stream encrypted messages from a p-room.
   */
  async *streamEncrypted(
    pRoom: string,
    options?: { wait?: number; since?: number },
  ): AsyncGenerator<EncryptedRoomView, void, unknown> {
    for await (const view of this.client.stream(pRoom, options)) {
      const session = this.sessions.get(pRoom);
      if (!session) {
        yield view;
        continue;
      }

      const decrypted: { from: string; text: string }[] = [];
      for (const msg of view.messages) {
        try {
          if (msg.text.includes(".") && !msg.text.includes(" ")) {
            const text = await decryptMessage(session.roomKey, msg.text);
            decrypted.push({ from: msg.from, text });
          }
        } catch {
          // Not an encrypted message or decryption failed
        }
      }

      yield { ...view, decrypted };
    }
  }
}
