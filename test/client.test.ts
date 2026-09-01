import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TechnocoreClient,
  sweep,
  TechnocoreError,
  BadRequestError,
  RateLimitError,
  DuplicateError,
  ConflictError,
} from "../dist/index.js";

const BASE = process.env.LIVE_BASE ?? "http://localhost:8080";
const tc = new TechnocoreClient({ baseUrl: BASE, timeoutMs: 10_000 });

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry a write operation on rate limit, backing off. */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RateLimitError && i < retries - 1) {
        const wait = (err.retryAfter ?? 2) * 1000 + 500;
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

// ─── sweep() unit tests ──────────────────────────────────────

describe("sweep()", () => {
  it("replaces newlines with spaces", () => {
    assert.equal(sweep("hello\nworld"), "hello world");
  });

  it("replaces carriage returns", () => {
    assert.equal(sweep("hello\rworld"), "hello world");
  });

  it("replaces tabs", () => {
    assert.equal(sweep("hello\tworld"), "hello world");
  });

  it("trims leading and trailing whitespace", () => {
    assert.equal(sweep("  hello  "), "hello");
  });

  it("replaces null bytes", () => {
    assert.equal(sweep("hello\x00world"), "hello world");
  });

  it("replaces zero-width joiners", () => {
    assert.equal(sweep("hello\u200Bworld"), "hello world");
  });

  it("replaces U+2028 LINE SEPARATOR", () => {
    assert.equal(sweep("hello\u2028world"), "hello world");
  });

  it("replaces U+2029 PARAGRAPH SEPARATOR", () => {
    assert.equal(sweep("hello\u2029world"), "hello world");
  });

  it("does not modify clean ASCII", () => {
    assert.equal(sweep("hello world"), "hello world");
  });

  it("handles empty string", () => {
    assert.equal(sweep(""), "");
  });

  it("handles emoji (preserved)", () => {
    assert.equal(sweep("hello 🌍"), "hello 🌍");
  });
});

// ─── Error classes tests ─────────────────────────────────────

describe("error classes", () => {
  it("BadRequestError parses field name", () => {
    const err = new BadRequestError("400 bad from: must be a string");
    assert.equal(err.status, 400);
    assert.equal(err.field, "from");
  });

  it("BadRequestError handles unknown format", () => {
    const err = new BadRequestError("400 something went wrong");
    assert.equal(err.field, null);
  });

  it("RateLimitError has correct status", () => {
    const err = new RateLimitError("reads: 0 left", null);
    assert.equal(err.status, 429);
    assert.equal(err.retryAfter, null);
  });

  it("RateLimitError parses retry-after", () => {
    const err = new RateLimitError("writes: wait 5s", "5");
    assert.equal(err.retryAfter, 5);
  });

  it("DuplicateError has correct status", () => {
    const err = new DuplicateError("duplicate text");
    assert.equal(err.status, 422);
  });

  it("ConflictError stores currentValue", () => {
    const err = new ConflictError("current value here");
    assert.equal(err.status, 409);
    assert.equal(err.currentValue, "current value here");
  });

  it("TechnocoreError base class", () => {
    const err = new TechnocoreError(500, "server error");
    assert.equal(err.status, 500);
    assert.equal(err.body, "server error");
    assert.ok(err.message.includes("500"));
  });
});

// ─── Live integration tests ──────────────────────────────────

const LIVE = BASE !== "http://localhost:8080" || process.env.LIVE_BASE;

describe("TechnocoreClient (live)", { skip: !LIVE ? "Set LIVE_BASE or start local server" : false }, () => {
  const testRoom = `test-ts-${Date.now()}`;

  it("health check returns true", async () => {
    const healthy = await tc.health();
    assert.equal(healthy, true);
  });

  it("manifest returns limits", async () => {
    const manifest = await tc.manifest();
    assert.ok(manifest.limits);
    assert.ok(manifest.limits.message_chars > 0);
    assert.ok(manifest.limits.note_chars > 0);
  });

  it("config returns deployment knobs", async () => {
    const config = await tc.config();
    assert.ok(typeof config === "object");
  });

  // ─── Room reads ──────────────────────────────────────────

  it("read returns a view for an empty room", async () => {
    const view = await tc.read(testRoom, { format: "json" });
    assert.ok(Array.isArray(view.messages));
    assert.equal(view.messages.length, 0);
    assert.equal(view.last_seq, 0);
  });

  it("read with limit parameter", async () => {
    const view = await tc.read("lobby", { limit: 5 });
    assert.ok(view.messages.length <= 5);
  });

  // ─── Room writes ─────────────────────────────────────────

  it("say writes a message via GET lane", async () => {
    const result = await withRetry(() =>
      tc.say(testRoom, "alice", "hello from sdk"),
    );
    assert.ok(result);
  });

  it("say writes a second message", async () => {
    const result = await withRetry(() =>
      tc.say(testRoom, "bob", "hi alice"),
    );
    assert.ok(result);
  });

  it("read returns messages in order", async () => {
    const view = await tc.read(testRoom, { format: "json" });
    assert.ok(view.messages.length >= 2);
    assert.equal(view.messages[0].from, "alice");
    assert.equal(view.messages[0].text, "hello from sdk");
    assert.equal(view.messages[1].from, "bob");
    assert.equal(view.messages[1].text, "hi alice");
    assert.ok(view.last_seq > 0);
  });

  it("post writes via POST lane", async () => {
    const result = await withRetry(() =>
      tc.post(testRoom, {
        from: "charlie",
        text: "posted from typescript",
      }),
    );
    assert.ok(result);
  });

  it("read confirms POST message", async () => {
    const view = await tc.read(testRoom, { format: "json" });
    const charlie = view.messages.find((m) => m.from === "charlie");
    assert.ok(charlie);
    assert.equal(charlie.text, "posted from typescript");
  });

  // ─── since parameter ─────────────────────────────────────

  it("since returns only newer messages", async () => {
    const view1 = await tc.read(testRoom, { format: "json" });

    await withRetry(() => tc.say(testRoom, "dave", "new message"));

    const view2 = await tc.read(testRoom, {
      since: view1.last_seq,
      format: "json",
    });
    assert.equal(view2.messages.length, 1);
    assert.equal(view2.messages[0].from, "dave");
  });

  // ─── Long-poll ───────────────────────────────────────────

  it("poll returns quickly when message is already available", async () => {
    const view = await tc.read(testRoom, { format: "json" });
    const start = Date.now();
    const polled = await tc.poll(testRoom, {
      since: view.last_seq - 1, // already behind
      wait: 2,
      format: "json",
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `Should return quickly, took ${elapsed}ms`);
    assert.ok(polled.messages.length > 0);
  });

  it("poll returns empty after wait when no new messages", async () => {
    const view = await tc.read(testRoom, { format: "json" });
    const start = Date.now();
    const polled = await tc.poll(testRoom, {
      since: view.last_seq,
      wait: 1,
      format: "json",
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 800, `Should wait ~1s, took ${elapsed}ms`);
    assert.equal(polled.messages.length, 0);
  });

  // ─── Export ──────────────────────────────────────────────

  it("export returns JSONL with room data", async () => {
    const { jsonl } = await tc.export(testRoom);
    assert.ok(jsonl.length > 0);
    assert.ok(jsonl.includes("alice"));
    assert.ok(jsonl.includes("bob"));
  });

  // ─── Notes ───────────────────────────────────────────────

  it("note set and get round-trips", async () => {
    const ns = `test-ns-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "key1", "value1"));
    const val = await tc.note.get(ns, "key1");
    assert.equal(val, "value1");
  });

  it("note overwrite", async () => {
    const ns = `test-ow-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "key", "old"));
    await sleep(1500); // wait for rate limit bucket to refill
    await withRetry(() => tc.note.set(ns, "key", "new"));
    const val = await tc.note.get(ns, "key");
    assert.equal(val, "new");
  });

  it("note CAS succeeds when value matches", async () => {
    const ns = `test-cas-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "key", "expected"));
    await sleep(1500);
    await withRetry(() => tc.note.set(ns, "key", "updated", { if: "expected" }));
    const val = await tc.note.get(ns, "key");
    assert.equal(val, "updated");
  });

  it("note CAS fails with 409 when value changed", async () => {
    const ns = `test-cas-fail-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "key", "original"));
    await sleep(1500);
    await withRetry(() => tc.note.set(ns, "key", "changed-by-other"));
    await sleep(1500);

    try {
      await withRetry(() =>
        tc.note.set(ns, "key", "should-fail", { if: "original" }),
      );
      assert.fail("Should have thrown ConflictError");
    } catch (err) {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.currentValue, "changed-by-other");
    }
  });

  it("note if_absent succeeds when key is new", async () => {
    const ns = `test-absent-${Date.now()}`;
    await withRetry(() =>
      tc.note.set(ns, "key", "first", { if_absent: true }),
    );
    const val = await tc.note.get(ns, "key");
    assert.equal(val, "first");
  });

  it("note if_absent fails when key exists", async () => {
    const ns = `test-absent-fail-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "key", "existing"));
    await sleep(1500);

    try {
      await withRetry(() =>
        tc.note.set(ns, "key", "should-fail", { if_absent: true }),
      );
      assert.fail("Should have thrown ConflictError");
    } catch (err) {
      assert.ok(err instanceof ConflictError);
      assert.equal(err.currentValue, "existing");
    }
  });

  it("note list returns keys", async () => {
    const ns = `test-list-${Date.now()}`;
    await withRetry(() => tc.note.set(ns, "alpha", "1"));
    await sleep(2500);
    await withRetry(() => tc.note.set(ns, "beta", "2"));
    const keys = await tc.note.list(ns);
    assert.ok(keys.includes("alpha"));
    assert.ok(keys.includes("beta"));
  });

  it("note get returns null for missing key", async () => {
    const ns = `test-missing-${Date.now()}`;
    const val = await tc.note.get(ns, "nonexistent");
    assert.equal(val, null);
  });

  // ─── Rooms listing ──────────────────────────────────────

  it("rooms returns array of room info", async () => {
    const rooms = await tc.rooms();
    assert.ok(Array.isArray(rooms));
    assert.ok(rooms.length > 0);
    const found = rooms.find((r) => r.room === testRoom);
    assert.ok(found, `Expected to find ${testRoom} in room list`);
    assert.ok(found!.last_seq > 0);
    assert.ok(typeof found!.idle_seconds === "number");
  });

  it("rooms respects limit", async () => {
    const rooms = await tc.rooms(3);
    assert.ok(rooms.length <= 3);
  });

  // ─── Message sweep in writes ─────────────────────────────

  it("say sweeps newlines in message text", async () => {
    const sweepRoom = `test-sweep-${Date.now()}`;
    await sleep(2500);
    await withRetry(() => tc.say(sweepRoom, "sweep-test", "line1\nline2"));
    const view = await tc.read(sweepRoom, { format: "json" });
    assert.equal(view.messages[0].text, "line1 line2");
  });

  // ─── Error handling ──────────────────────────────────────

  it("reading nonexistent room returns empty view", async () => {
    const view = await tc.read("nonexistent-room-name", { format: "json" });
    assert.equal(view.messages.length, 0);
  });

  it("manifest has consistent limits", async () => {
    const manifest = await tc.manifest();
    assert.ok(manifest.limits.message_chars >= 4096);
    assert.ok(manifest.limits.note_chars >= 8192);
  });
});
