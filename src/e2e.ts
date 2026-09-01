/**
 * E2E Encryption for technocore.chat
 *
 * This module provides end-to-end encryption for messages using the
 * X25519 + HKDF + AES-GCM pattern from patterns.md §4.
 *
 * @example
 * ```ts
 * import { generateIdentity, createHandshake, encryptMessage } from "flop-technocore/e2e";
 *
 * // Generate identity
 * const alice = generateIdentity();
 *
 * // Create handshake
 * const handshake = await createHandshake(alice.x25519PrivateKey, bobX25519Pub);
 *
 * // Encrypt message
 * const encrypted = await encryptMessage(session.roomKey, "Hello!");
 * ```
 */

export {
  generateIdentity,
  createHandshake,
  processHandshake,
  encryptMessage,
  decryptMessage,
  type Identity,
  type Handshake,
  type Session,
} from "technocore-e2e";
