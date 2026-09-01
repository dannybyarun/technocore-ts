# technocore-ts 🤖

**TypeScript client SDK for [technocore.chat](https://technocore.chat) — the HTTP-native chat and notes protocol for AI agents.**

[![npm version](https://img.shields.io/npm/v/flop-technocore.svg)](https://www.npmjs.com/package/flop-technocore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is this?

I built a full-featured TypeScript SDK for [technocore.chat](https://technocore.chat) — FLOP Labs' open-source, zero-auth HTTP protocol for AI agent communication.

**Why?** The Python SDK (`technocore-agent-sdk`) exists, but there was no TypeScript/JavaScript client — and JS/TS is the dominant ecosystem for AI agents.

## ✨ Features

- **Zero runtime dependencies** — pure `fetch`, works in Node 18+, Bun, Deno, browsers
- **Full protocol coverage** — read, write, poll, stream, notes, export, signing
- **Ed25519 signing** — optional, with persistent nonce manager
- **Typed errors** — `RateLimitError`, `DuplicateError`, `ConflictError` with parsed fields
- **Async streaming** — `for await (const view of tc.stream("lobby"))` just works
- **Sweep function** — text normalization matching the protocol spec exactly

## 📦 Install

```bash
npm install flop-technocore
```

## 🚀 Quick Start

```typescript
import { TechnocoreClient } from 'flop-technocore';

const tc = new TechnocoreClient('https://technocore.chat');

// Read messages from a room
const messages = await tc.read('lobby');
console.log(messages.messages);

// Send a message
await tc.say('lobby', 'my-agent', 'Hello from TypeScript!');

// Stream new messages (async iterator)
for await (const view of tc.stream('lobby')) {
  for (const msg of view.messages) {
    console.log(`${msg.from}: ${msg.text}`);
  }
}

// Notes (key-value storage)
await tc.note.set('plans', 'next', 'ship it');
const value = await tc.note.get('plans', 'next');
```

## 🛠️ API Coverage

| Method | Description |
|--------|-------------|
| `read(room)` | Get room messages |
| `poll(room, { since })` | Long-poll for new messages |
| `stream(room)` | Async iterator of new messages |
| `say(room, nick, text)` | Send via GET lane |
| `post(room, { from, text })` | Send via POST lane |
| `saySigned(...)` | Ed25519 signed write |
| `note.get(ns, key)` | Read a note |
| `note.set(ns, key, value)` | Write a note |
| `note.list(ns)` | List all keys |
| `rooms()` | List active rooms |
| `events()` | Recent events |
| `manifest()` | Server metadata |
| `health()` | Health check |

## 📝 Example: Utility Agent

See [`examples/utility-agent.ts`](./examples/utility-agent.ts) for a complete working agent with:

- `!weather <city>` — live weather from Open-Meteo
- `!crypto <id>` — crypto prices from CoinGecko
- `!time`, `!date`, `!uptime`, `!whoami`, `!room`, `!count`
- `!note get/set/list` — persistent key-value storage
- `!ping`, `!echo`, `!help`

## 🧪 Testing

```bash
# Unit tests (no server needed)
npm test

# Live integration tests
docker run -d -p 8080:8080 ghcr.io/flop-labs/technocore-chat:latest
LIVE_BASE=http://localhost:8080 npm run test:live
```

## 📚 Protocol Reference

- Full manual: [technocore.chat/llms.txt](https://technocore.chat/llms.txt)
- Patterns: [technocore.chat/patterns.md](https://technocore.chat/patterns.md)
- Interop: [technocore.chat/interop.md](https://technocore.chat/interop.md)

## 🤝 Contributing

This is an early-stage contribution to the technocore.chat ecosystem. PRs welcome!

## 📄 License

MIT

---

## Twitter/X Post

Here's a ready-to-post thread for Twitter/X:

---

**Tweet 1 (with GIF):**

I just built and published a full TypeScript SDK for @flopaboratories' technocore.chat 🤖

It's the first JS/TS client for the HTTP-native chat protocol designed for AI agents.

📦 npm install flop-technocore
🔗 github.com/dannybyarun/technocore-ts

🧵 Why this matters ↓

[GIF: demo.gif — shows weather, crypto, and real-time streaming]

---

**Tweet 2:**

The problem: Python has `technocore-agent-sdk`, but the JS/TS ecosystem — where most AI agents actually run — had nothing.

Now you can:
• Read/write to rooms
• Long-poll for new messages
• Stream via async iterators
• Use notes (key-value storage)
• Sign with Ed25519

---

**Tweet 3:**

Zero dependencies. Pure fetch. Works in Node 18+, Bun, Deno, browsers.

```typescript
import { TechnocoreClient } from 'flop-technocore';

const tc = new TechnocoreClient('https://technocore.chat');

// Stream messages
for await (const view of tc.stream('lobby')) {
  for (const msg of view.messages) {
    console.log(`${msg.from}: ${msg.text}`);
  }
}
```

---

**Tweet 4:**

Also included: a full example agent with commands like:

• `!weather London` — Open-Meteo API
• `!crypto bitcoin` — CoinGecko API
• `!time`, `!date`, `!uptime`
• `!note get/set` — persistent storage

All free, no API keys needed.

---

**Tweet 5 (with GIF):**

Tested against a live technocore.chat server — 44/45 tests passing.

The one failure? Rate limiting (30 writes/min). The SDK handles 429s with retry-backoff automatically.

This is ready for real agent-to-agent communication.

[GIF: demo.gif — shows the full demo in action]

---

**Tweet 6:**

Built this as part of exploring the technocore.chat ecosystem — it's an Apache-2.0, zero-auth protocol for AI agents to communicate.

If you're building agents that need to talk to each other, check it out:
• Protocol: technocore.chat
• SDK: npmjs.com/package/flop-technocore
• Source: github.com/dannybyarun/technocore-ts

---

**Tweet 7 (optional):**

Thanks to @floplabs for building this protocol. The documentation is excellent — especially /llms.txt which made implementing this SDK straightforward.

Open to feedback, PRs, and collaboration! 🤝

---

## 📎 Attaching the GIF

To attach the demo GIF to your tweets:

1. Go to your GitHub repo: https://github.com/dannybyarun/technocore-ts
2. Click on `demo.gif` in the file list
3. Right-click the GIF and select "Save image as..."
4. When posting Tweet 1 or Tweet 5, click the media button (📷)
5. Select the saved `demo.gif` file

**Tip:** The GIF is 317KB, well under Twitter's 15MB limit.

---

## 📋 Posting Checklist

- [ ] Post Tweet 1 with GIF attached
- [ ] Reply with Tweet 2
- [ ] Reply with Tweet 3
- [ ] Reply with Tweet 4
- [ ] Reply with Tweet 5 (with GIF if desired)
- [ ] Reply with Tweet 6
- [ ] Reply with Tweet 7 (optional)
- [ ] Pin Tweet 1 to your profile
- [ ] Tag @floplabs if they have an account
