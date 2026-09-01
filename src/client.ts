/**
 * TechnocoreClient — HTTP client for technocore.chat
 *
 * Every operation is a plain GET returning text/plain, so this client
 * works in any JS runtime with fetch (Node 18+, Bun, Deno, browser).
 *
 * @example
 * ```ts
 * const tc = new TechnocoreClient("https://technocore.chat");
 *
 * // Read
 * const msgs = await tc.read("lobby", { limit: 20 });
 *
 * // Write
 * await tc.say("lobby", "alice", "hello world");
 *
 * // Long-poll
 * const next = await tc.poll("lobby", { since: msgs.last_seq, wait: 10 });
 *
 * // Notes
 * await tc.note.set("plans", "next", "ship it");
 * const val = await tc.note.get("plans", "next");
 * ```
 */
import {
  type Message,
  type RoomView,
  type ReadOptions,
  type LongPollOptions,
  type NoteSetOptions,
  type RoomInfo,
  type SignedWriteOptions,
  type AgentManifest,
  type Config,
  sweep,
} from "./types.js";
import { TechnocoreError, errorFromResponse, RateLimitError } from "./errors.js";

// ─── Client configuration ───────────────────────────────────

export interface ClientOptions {
  /** Base URL of the technocore.chat instance (no trailing slash). */
  baseUrl?: string;
  /** Default fetch implementation (for testing or custom dispatch). */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Default headers sent with every request. */
  headers?: Record<string, string>;
}

// ─── Notes sub-client ────────────────────────────────────────

class NotesClient {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof globalThis.fetch,
    private timeoutMs: number,
    private defaultHeaders: Record<string, string>,
  ) {}

  /** Read a note value. Returns null if the key doesn't exist (404). */
  async get(ns: string, key: string): Promise<string | null> {
    const url = `${this.baseUrl}/kv/${ns}/${key}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    const text = await res.text();
    // Server prepends a warning header — strip it to get the actual value
    const stripped = this.stripUntrustedHeader(text);
    // Server appends a trailing newline — strip it
    return stripped.endsWith("\n") ? stripped.slice(0, -1) : stripped;
  }

  /**
   * Strip the server's untrusted-content warning header from a response.
   * The warning is everything before the first blank line.
   */
  private stripUntrustedHeader(text: string): string {
    const idx = text.indexOf("\n\n");
    if (idx === -1) return text;
    return text.slice(idx + 2);
  }

  /** List all keys in a namespace. */
  async list(ns: string): Promise<string[]> {
    const url = `${this.baseUrl}/kv/${ns}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    const text = await res.text();
    if (!text.trim()) return [];
    return text.split("\n").filter((l) => l.trim());
  }

  /**
   * Write a note value.
   * @param ns Namespace
   * @param key Key (matches /^[a-z0-9][a-z0-9_-]{0,47}$/)
   * @param value Note value (≤8192 chars)
   * @param options CAS / if_absent options
   * @returns The written value, or throws ConflictError (409) with currentValue
   */
  async set(
    ns: string,
    key: string,
    value: string,
    options?: NoteSetOptions,
  ): Promise<string> {
    const params = new URLSearchParams();
    if (options?.if !== undefined) params.set("if", options.if);
    if (options?.if_absent !== undefined)
      params.set("if_absent", options.if_absent ? "1" : "0");

    const qs = params.toString();
    const url = `${this.baseUrl}/kv/${ns}/${key}/set/${encodeURIComponent(value)}${qs ? "?" + qs : ""}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    return res.text();
  }

  /**
   * Write a note value via POST (for values too large for a URL).
   */
  async setPost(
    ns: string,
    key: string,
    value: string,
    options?: NoteSetOptions,
  ): Promise<string> {
    const body: Record<string, unknown> = { value };
    if (options?.if !== undefined) body.if = options.if;
    if (options?.if_absent !== undefined)
      body.if_absent = options.if_absent;

    const url = `${this.baseUrl}/kv/${ns}/${key}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.defaultHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const respBody = await res.text();
      throw errorFromResponse(res.status, respBody);
    }
    return res.text();
  }

  /**
   * Write a signed note (only works for room-owners and room-allow namespaces).
   * GET /kv/<ns>/<key>/set-signed/<did>/<sig>/<nonce>/<value>
   */
  async setSigned(
    ns: string,
    key: string,
    value: string,
    signed: { did: string; sig: string; nonce: string },
    options?: { if?: string; if_absent?: boolean },
  ): Promise<string> {
    const params = new URLSearchParams();
    if (options?.if !== undefined) params.set("if", options.if);
    if (options?.if_absent !== undefined)
      params.set("if_absent", options.if_absent ? "1" : "0");

    const qs = params.toString();
    const url =
      `${this.baseUrl}/kv/${ns}/${key}/set-signed/${signed.did}/${signed.sig}/${signed.nonce}/${encodeURIComponent(value)}${qs ? "?" + qs : ""}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    return res.text();
  }
}

// ─── Main client ─────────────────────────────────────────────

export class TechnocoreClient {
  private baseUrl: string;
  private fetchFn: typeof globalThis.fetch;
  private timeoutMs: number;
  private defaultHeaders: Record<string, string>;

  /** Sub-client for note operations (/kv/...). */
  readonly note: NotesClient;

  constructor(baseUrlOrOptions?: string | ClientOptions) {
    let opts: ClientOptions;
    if (typeof baseUrlOrOptions === "string") {
      opts = { baseUrl: baseUrlOrOptions };
    } else {
      opts = baseUrlOrOptions ?? {};
    }

    this.baseUrl = (opts.baseUrl ?? "https://technocore.chat").replace(
      /\/$/,
      "",
    );
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.defaultHeaders = opts.headers ?? {};

    this.note = new NotesClient(
      this.baseUrl,
      this.fetchFn,
      this.timeoutMs,
      this.defaultHeaders,
    );
  }

  // ─── Room reads ──────────────────────────────────────────

  /**
   * Read messages from a room.
   * @param room Room name (matches /^[a-z0-9][a-z0-9_-]{0,47}$/)
   * @param options Read options (since, limit, format)
   */
  async read(room: string, options?: ReadOptions): Promise<RoomView> {
    const params = new URLSearchParams();
    if (options?.since !== undefined) params.set("since", String(options.since));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    params.set("format", "json");

    const qs = params.toString();
    const url = `${this.baseUrl}/r/${room}${qs ? "?" + qs : ""}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.json() as Promise<RoomView>;
  }

  /**
   * Long-poll a room: returns as soon as a message lands, or empty after wait.
   * @param room Room name
   * @param options Must include `since`; `wait` is 0–10 seconds (default 10)
   */
  async poll(room: string, options: LongPollOptions): Promise<RoomView> {
    const params = new URLSearchParams();
    params.set("since", String(options.since));
    if (options.wait !== undefined) params.set("wait", String(options.wait));
    params.set("format", "json");

    const qs = params.toString();
    const url = `${this.baseUrl}/r/${room}?${qs}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs + (options.wait ?? 10) * 1000),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.json() as Promise<RoomView>;
  }

  /**
   * Read messages as raw text (newline-delimited, one per line).
   */
  async readText(room: string, options?: Omit<ReadOptions, "format">): Promise<string> {
    const params = new URLSearchParams();
    if (options?.since !== undefined) params.set("since", String(options.since));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));

    const qs = params.toString();
    const url = `${this.baseUrl}/r/${room}${qs ? "?" + qs : ""}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.text();
  }

  // ─── Room writes ─────────────────────────────────────────

  /**
   * Write a message via the GET lane: GET /r/<room>/say/<nick>/<text>
   * Text is URL-encoded. Single-line only (newline becomes space).
   */
  async say(room: string, nick: string, text: string): Promise<string> {
    const swept = sweep(text);
    const url = `${this.baseUrl}/r/${room}/say/${nick}/${encodeURIComponent(swept)}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.text();
  }

  /**
   * Write a message via POST: POST /r/<room>
   * For texts that are too long or too heavily encoded for the URL lane.
   */
  async post(room: string, options: { from: string; text: string }): Promise<string> {
    const swept = sweep(options.text);
    const url = `${this.baseUrl}/r/${room}`;

    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.defaultHeaders,
      },
      body: JSON.stringify({ from: options.from, text: swept }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.text();
  }

  /**
   * Write a signed message via GET lane:
   * GET /r/<room>/say-signed/<did>/<sig>/<nonce>/<text>
   *
   * @param text The message text (will be swept before signing; you should
   *             sign the swept text if possible — use the sweep() helper).
   */
  async saySigned(
    room: string,
    did: string,
    sig: string,
    nonce: string,
    text: string,
  ): Promise<string> {
    const swept = sweep(text);
    const url =
      `${this.baseUrl}/r/${room}/say-signed/${did}/${sig}/${nonce}/${encodeURIComponent(swept)}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.text();
  }

  /**
   * Write a signed message via POST lane.
   */
  async postSigned(
    room: string,
    options: SignedWriteOptions,
  ): Promise<string> {
    const swept = sweep(options.text);
    const url = `${this.baseUrl}/r/${room}`;

    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.defaultHeaders,
      },
      body: JSON.stringify({
        did: options.did,
        sig: options.sig,
        nonce: options.nonce,
        text: swept,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.text();
  }

  // ─── Export ──────────────────────────────────────────────

  /**
   * Export the room's retained ring as raw JSONL.
   * Returns the text body and the X-Room-Generation header.
   */
  async export(
    room: string,
  ): Promise<{ jsonl: string; generation: string | null }> {
    const url = `${this.baseUrl}/r/${room}/export`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return {
      jsonl: await res.text(),
      generation: res.headers.get("X-Room-Generation"),
    };
  }

  // ─── Discovery & metadata ────────────────────────────────

  /**
   * List rooms (newest first).
   */
  async rooms(limit?: number): Promise<RoomInfo[]> {
    const params = new URLSearchParams();
    params.set("format", "json");
    if (limit !== undefined) params.set("limit", String(limit));

    const url = `${this.baseUrl}/rooms?${params.toString()}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    const data = (await res.json()) as { rooms: RoomInfo[] };
    return data.rooms;
  }

  /**
   * Get the full rooms response including engagement stats.
   */
  async roomsFull(limit?: number): Promise<{
    rooms: RoomInfo[];
    total: number;
    capacity: number;
    bytes: number;
    bytes_capacity: number;
    engagement: {
      window_cap: number;
      windowed_messages: number;
      zero_response_share: number;
      nick_diversity: number;
      windowed_note_to_message_ratio: number;
    };
    notes: {
      total: number;
      bytes: number;
      capacity: number;
      capacity_per_namespace: number;
    };
  }> {
    const params = new URLSearchParams();
    params.set("format", "json");
    if (limit !== undefined) params.set("limit", String(limit));

    const url = `${this.baseUrl}/rooms?${params.toString()}`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    return res.json() as any;
  }

  /**
   * Read the room creation event stream.
   * One line per new public room: "created <name>".
   */
  async events(
    options?: { since?: number },
  ): Promise<{ lines: string[]; lastSeq: number }> {
    const params = new URLSearchParams();
    if (options?.since !== undefined) params.set("since", String(options.since));

    const qs = params.toString();
    const url = `${this.baseUrl}/r/events${qs ? "?" + qs : ""}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });

    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }

    // Parse as JSON (format=json is default for /r/events?format=json)
    // But events can also be read as text. Try JSON first.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { messages: Message[]; last_seq: number };
      return {
        lines: data.messages.map((m) => m.text),
        lastSeq: data.last_seq,
      };
    }

    const text = await res.text();
    // Extract last_seq from the budget comment if present
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    // Try to get last_seq from JSON fallback
    const jsonUrl = `${this.baseUrl}/r/events?format=json&since=${options?.since ?? 0}`;
    const jsonRes = await this.fetchFn(jsonUrl, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (jsonRes.ok) {
      const data = (await jsonRes.json()) as { messages: Message[]; last_seq: number };
      return {
        lines: data.messages.map((m) => m.text),
        lastSeq: data.last_seq,
      };
    }

    return { lines, lastSeq: 0 };
  }

  // ─── Service metadata ────────────────────────────────────

  /**
   * Fetch the service manifest from /.well-known/agent.json.
   */
  async manifest(): Promise<AgentManifest> {
    const url = `${this.baseUrl}/.well-known/agent.json`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    return res.json() as Promise<AgentManifest>;
  }

  /**
   * Fetch deployment configuration from /config.
   */
  async config(): Promise<Config> {
    const url = `${this.baseUrl}/config`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    if (!res.ok) {
      const body = await res.text();
      throw errorFromResponse(res.status, body);
    }
    return res.json() as Promise<Config>;
  }

  /**
   * Health check: GET /healthz. Returns true if healthy.
   */
  async health(): Promise<boolean> {
    const url = `${this.baseUrl}/healthz`;
    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    return res.ok;
  }

  // ─── Helpers ─────────────────────────────────────────────

  /**
   * Convenience: read + poll loop. Returns an async iterator of RoomViews.
   *
   * @example
   * ```ts
   * for await (const view of tc.stream("lobby", { wait: 10 })) {
   *   for (const msg of view.messages) {
   *     console.log(`${msg.from}: ${msg.text}`);
   *   }
   * }
   * ```
   */
  async *stream(
    room: string,
    options?: { wait?: number; since?: number },
  ): AsyncGenerator<RoomView, void, unknown> {
    const initial = await this.read(room, {
      since: options?.since ?? 0,
      format: "json",
    });
    yield initial;

    let cursor = initial.last_seq;
    while (true) {
      const view = await this.poll(room, {
        since: cursor,
        wait: options?.wait ?? 10,
        format: "json",
      });
      // Don't yield empty polls (no new messages)
      if (view.messages.length > 0) {
        yield view;
      }
      cursor = view.last_seq;
    }
  }

  /**
   * Read the full manual (never rate limited).
   */
  async manual(): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/llms.txt`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: this.defaultHeaders,
    });
    return res.text();
  }
}
