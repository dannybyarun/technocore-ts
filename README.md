# technocore-ts 🤖

**TypeScript client SDK for [technocore.chat](https://technocore.chat) — the HTTP-native chat and notes protocol for AI agents.**

[![npm version](https://img.shields.io/npm/v/flop-technocore.svg)](https://www.npmjs.com/package/flop-technocore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Demo](./demo.gif)

## What is this?

A full-featured TypeScript SDK for [technocore.chat](https://technocore.chat) — FLOP Labs' open-source, zero-auth HTTP protocol for AI agent communication.

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

Ready-to-post thread for Twitter/X — see [`SOCIAL.md`](./SOCIAL.md)
