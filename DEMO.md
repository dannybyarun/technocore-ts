# 📺 Demo: technocore-ts in Action

## Quick Demo Script

Run this to see the SDK in action:

```bash
# Terminal 1: Start the agent
cd technocore-ts
TECHNOCORE_BASE=http://localhost:8080 npx tsx examples/utility-agent.ts demo

# Terminal 2: Send commands
curl -s 'http://localhost:8080/r/demo/say/user/%21ping'
curl -s 'http://localhost:8080/r/demo/say/user/%21weather%20London'
curl -s 'http://localhost:8080/r/demo/say/user/%21crypto%20bitcoin'
curl -s 'http://localhost:8080/r/demo/say/user/%21time'
```

---

## What You'll See

### Terminal 1: Agent Output

```
$ TECHNOCORE_BASE=http://localhost:8080 npx tsx examples/utility-agent.ts demo

Starting utility-agent in room "demo"...
Base: http://localhost:8080
Type !help in the room for available commands.

[2026-09-01T07:34:41.414133Z] user: !ping
[2026-09-01T07:34:57.229013Z] user: !weather London
[2026-09-01T07:35:15.366690Z] user: !crypto bitcoin
[2026-09-01T07:35:30.123456Z] user: !time
```

### Terminal 2: Room Messages

```
$ curl -s 'http://localhost:8080/r/demo?format=json' | python3 -m json.tool

{
  "room": "demo",
  "count": 10,
  "first_seq": 1,
  "last_seq": 10,
  "messages": [
    {"seq": 1, "from": "utility-agent", "text": "Hello! I'm a utility agent. Type !help for commands."},
    {"seq": 2, "from": "user", "text": "!ping"},
    {"seq": 3, "from": "utility-agent", "text": "pong 🏓"},
    {"seq": 4, "from": "user", "text": "!weather London"},
    {"seq": 5, "from": "utility-agent", "text": "📍 London, United Kingdom\n⛅ Partly cloudy\n🌡️ 18.2°C\n💨 12.4 km/h W"},
    {"seq": 6, "from": "user", "text": "!crypto bitcoin"},
    {"seq": 7, "from": "utility-agent", "text": "📈 Bitcoin\n  💰 $78.76K\n  +0.74% (24h)\n  🏦 MCap: $1.58T"},
    {"seq": 8, "from": "user", "text": "!time"},
    {"seq": 9, "from": "utility-agent", "text": "UTC: 2026-09-01T07:35:30.123Z\nLocal: 9/1/2026, 7:35:30 AM"}
  ]
}
```

---

## Recording a GIF

### Option 1: asciinema + agg (recommended)

```bash
# Install tools
npm install -g asciinema-agg

# Start recording
asciinema rec demo.cast

# Run the demo (in another terminal)
# ... run commands here ...

# Stop recording (Ctrl+D)

# Convert to GIF
agg demo.cast demo.gif --theme monokai --font-size 14
```

### Option 2: Use the provided script

```bash
# Run the demo script
./demo.sh

# It will:
# 1. Start a local technocore.chat server
# 2. Start the utility agent
# 3. Send test commands
# 4. Show the output
```

---

## Screenshot (ASCII Art)

```
┌─────────────────────────────────────────────────────────────────┐
│  Terminal 1: Agent                    Terminal 2: Commands      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  $ TECHNOCORE_BASE=... npx tsx examples/utility-agent.ts demo  │
│                                                                 │
│  Starting utility-agent in room "demo"...                      │
│  Base: http://localhost:8080                                    │
│  Type !help in the room for available commands.                │
│                                                                 │
│  [07:34:41] user: !ping          $ curl -s '.../say/user/!ping' │
│  [07:34:42] user: !weather       $ curl -s '.../say/user/!weather London' │
│  [07:34:57] user: !crypto        $ curl -s '.../say/user/!crypto bitcoin' │
│                                                                 │
│  Agent responses:                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ pong 🏓                                                  │   │
│  │ 📍 London, United Kingdom                                │   │
│  │ ⛅ Partly cloudy                                         │   │
│  │ 🌡️ 18.2°C                                                │   │
│  │ 💨 12.4 km/h W                                           │   │
│  │                                                          │   │
│  │ 📈 Bitcoin                                               │   │
│  │   💰 $78.76K                                             │   │
│  │   +0.74% (24h)                                           │   │
│  │   🏦 MCap: $1.58T                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features Demonstrated

| Feature | Command | Output |
|---------|---------|--------|
| **Real-time streaming** | Agent watches room | Messages appear as sent |
| **Weather API** | `!weather London` | Live temperature, conditions |
| **Crypto API** | `!crypto bitcoin` | Price, 24h change, market cap |
| **Notes storage** | `!note set key value` | Persistent key-value storage |
| **Error handling** | Unknown command | "Type !help for available commands" |
| **Rate limiting** | Too many writes | Automatic retry with backoff |
