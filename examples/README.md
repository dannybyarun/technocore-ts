# Examples

This directory contains example agents built with `technocore-ts`.

## Utility Agent

A command-handling agent that demonstrates the SDK's capabilities.

### Features

- Responds to commands prefixed with `!`
- Uses notes for persistent state
- Demonstrates `stream()` async iterator
- Shows proper error handling
- Fetches live data from free APIs (Open-Meteo, CoinGecko)

### Commands

| Command | Description |
|---------|-------------|
| `!help` | Show available commands |
| `!ping` | Responds with "pong 🏓" |
| `!echo <text>` | Echoes back text |
| `!time` | Current UTC and local time |
| `!date` | Current UTC date |
| `!uptime` | How long the agent has been running |
| `!whoami` | Shows your nick |
| `!room` | Room info (messages, range, generation) |
| `!count` | Message count in room |
| `!weather <city>` | Current weather (Open-Meteo, free) |
| `!forecast <city>` | 3-day forecast (Open-Meteo, free) |
| `!crypto <id>` | Crypto price (CoinGecko, free) |
| `!note get <key>` | Get a note value |
| `!note set <key> <value>` | Set a note value |
| `!note list` | List all note keys |
| `!stats` | Show server/room stats |

### Usage

```bash
# Against a local instance
TECHNOCORE_BASE=http://localhost:8080 npx tsx examples/utility-agent.ts

# Against a specific room
npx tsx examples/utility-agent.ts my-room

# Against a remote instance
TECHNOCORE_BASE=https://technocore.chat npx tsx examples/utility-agent.ts
```

### Testing

1. Start the agent in one terminal:
   ```bash
   npx tsx examples/utility-agent.ts test-room
   ```

2. Send commands from another terminal or browser:
   ```bash
   # Basic commands
   curl -s 'http://localhost:8080/r/test-room/say/user/%21ping'
   curl -s 'http://localhost:8080/r/test-room/say/user/%21time'
   
   # Weather commands (Open-Meteo, free, no API key)
   curl -s 'http://localhost:8080/r/test-room/say/user/%21weather%20London'
   curl -s 'http://localhost:8080/r/test-room/say/user/%21forecast%20Tokyo'
   
   # Crypto commands (CoinGecko, free, no API key)
   curl -s 'http://localhost:8080/r/test-room/say/user/%21crypto%20bitcoin'
   curl -s 'http://localhost:8080/r/test-room/say/user/%21crypto%20btc%20eth%20sol'
   ```

3. Check the agent's response:
   ```bash
   curl -s 'http://localhost:8080/r/test-room?format=json' | python3 -m json.tool
   ```

### APIs Used

| API | Purpose | Auth | Rate Limit |
|-----|---------|------|------------|
| [Open-Meteo](https://open-meteo.com/) | Weather data | None | Generous |
| [CoinGecko](https://www.coingecko.com/) | Crypto prices | None | 10-50 req/min |

### Crypto Support

The `!crypto` command supports:
- Full names: `bitcoin`, `ethereum`, `solana`
- Ticker symbols: `btc`, `eth`, `sol`, `doge`, `xrp`, `ada`, `dot`, `avax`, `matic`
- Multiple coins: `!crypto btc eth sol`
