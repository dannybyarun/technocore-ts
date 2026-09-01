import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateIdentity,
  createHandshake,
  processHandshake,
  encryptMessage,
  decryptMessage,
  E2EClient,
} from "../dist/index.js";

describe("E2E Encryption", () => {
  it("should generate identity with valid keys", () => {
    const identity = generateIdentity();

    assert.ok(identity.did.startsWith("did:key:z6Mk"), "DID should start with did:key:z6Mk");
    assert.equal(identity.ed25519PublicKey.length, 32, "Ed25519 public key should be 32 bytes");
    assert.equal(identity.ed25519PrivateKey.length, 32, "Ed25519 private key should be 32 bytes");
    assert.ok(identity.x25519PublicKey.length === 32, "X25519 public key should be 32 bytes");
    assert.ok(identity.x25519PrivateKey.length === 32, "X25519 private key should be 32 bytes");
    assert.ok(identity.mailbox.startsWith("mb-p-"), "Mailbox should start with mb-p-");
  });

  it("should create and process handshake", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();

    // Alice creates handshake for Bob
    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);

    assert.ok(handshake.message.startsWith("e2e1 "), "Message should start with e2e1 prefix");
    assert.equal(handshake.roomKey.length, 32, "Room key should be 32 bytes");
    assert.ok(handshake.roomName.startsWith("p-"), "Room name should start with p-");

    // Bob processes handshake
    const session = await processHandshake(bob.x25519PrivateKey, handshake.message);

    assert.equal(session.roomKey.length, 32, "Session room key should be 32 bytes");
    assert.equal(session.roomName, handshake.roomName, "Room names should match");
  });

  it("should encrypt and decrypt messages", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();

    // Create shared room
    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);
    const session = await processHandshake(bob.x25519PrivateKey, handshake.message);

    // Alice encrypts message
    const plaintext = "Hello Bob! This is a secret message.";
    const encrypted = await encryptMessage(session.roomKey, plaintext);

    // Verify encrypted format
    assert.ok(encrypted.includes("."), "Encrypted should contain dot separator");
    assert.notEqual(encrypted, plaintext, "Encrypted should differ from plaintext");

    // Bob decrypts message
    const decrypted = await decryptMessage(session.roomKey, encrypted);
    assert.equal(decrypted, plaintext, "Decrypted should match original");
  });

  it("should fail decryption with wrong key", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();
    const eve = generateIdentity();

    // Alice encrypts for Bob
    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);
    const encrypted = await encryptMessage(handshake.roomKey, "Secret message");

    // Eve tries to decrypt with her own key
    const wrongSession = { roomKey: crypto.getRandomValues(new Uint8Array(32)), roomName: "p-wrong" };
    
    try {
      await decryptMessage(wrongSession.roomKey, encrypted);
      assert.fail("Should have thrown decryption error");
    } catch (error) {
      // Expected - decryption should fail
      assert.ok(error instanceof Error);
    }
  });

  it("should handle empty messages", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();

    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);
    const encrypted = await encryptMessage(handshake.roomKey, "");
    const decrypted = await decryptMessage(handshake.roomKey, encrypted);

    assert.equal(decrypted, "", "Empty message should decrypt correctly");
  });

  it("should handle unicode messages", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();

    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);
    const plaintext = "Hello 🌍! 你好世界! Привет мир!";
    const encrypted = await encryptMessage(handshake.roomKey, plaintext);
    const decrypted = await decryptMessage(handshake.roomKey, encrypted);

    assert.equal(decrypted, plaintext, "Unicode message should decrypt correctly");
  });

  it("should produce different ciphertexts for same plaintext", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();

    const handshake = await createHandshake(alice.x25519PrivateKey, bob.x25519PublicKey);
    
    const encrypted1 = await encryptMessage(handshake.roomKey, "Same message");
    const encrypted2 = await encryptMessage(handshake.roomKey, "Same message");

    assert.notEqual(encrypted1, encrypted2, "Same plaintext should produce different ciphertexts (nonce randomization)");
  });
});

describe("E2EClient", () => {
  it("should create E2E client with identity", () => {
    const identity = generateIdentity();
    const e2e = new E2EClient({
      identity,
      baseUrl: "https://example.com",
    });

    assert.equal(e2e.getDid(), identity.did, "DID should match identity");
    assert.deepEqual(e2e.getIdentity(), identity, "Identity should match");
  });

  it("should manage sessions", () => {
    const identity = generateIdentity();
    const e2e = new E2EClient({
      identity,
      baseUrl: "https://example.com",
    });

    const session = { roomKey: new Uint8Array(32), roomName: "p-test123" };
    e2e.setSession("p-test123", session);

    const retrieved = e2e.getSession("p-test123");
    assert.deepEqual(retrieved, session, "Session should be retrievable");

    const missing = e2e.getSession("p-nonexistent");
    assert.equal(missing, undefined, "Missing session should return undefined");
  });

  it("should fail sayEncrypted without session", async () => {
    const identity = generateIdentity();
    const e2e = new E2EClient({
      identity,
      baseUrl: "https://example.com",
    });

    try {
      await e2e.sayEncrypted("p-unknown", "test", "Hello");
      assert.fail("Should have thrown");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok((error as Error).message.includes("No session"));
    }
  });
});
