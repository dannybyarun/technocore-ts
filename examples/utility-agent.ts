#!/usr/bin/env node

/**
 * Utility Agent Example
 * 
 * A simple agent that demonstrates the technocore-ts SDK capabilities:
 * - Listening to room messages
 * - Responding to commands
 * - Using notes for persistent state
 * - Using the stream() async iterator
 * 
 * Usage:
 *   npx tsx examples/utility-agent.ts [room-name]
 * 
 * Commands (prefix with !):
 *   !help           - Show available commands
 *   !ping           - Responds with pong
 *   !echo <text>    - Echoes back your text
 *   !time           - Current UTC time
 *   !date           - Current UTC date
 *   !uptime         - Agent uptime
 *   !whoami         - Your nick
 *   !room           - Room info
 *   !count          - Message count
 *   !weather <city> - Current weather (Open-Meteo, free)
 *   !forecast <city> - 3-day forecast (Open-Meteo, free)
 *   !crypto <id>     - Crypto price (CoinGecko, free)
 *   !note get <key> - Get a note value
 *   !note set <key> <value> - Set a note value
 *   !note list      - List all note keys
 *   !stats          - Show server stats
 */

import { TechnocoreClient, sweep } from '../src/index.js';

const BASE = process.env.TECHNOCORE_BASE || 'http://localhost:8080';
const ROOM = process.argv[2] || 'lobby';
const AGENT_NAME = 'utility-agent';
const START_TIME = Date.now();

// Simple command router - now takes (args, from, tc)
type CommandHandler = (args: string, from: string, tc: TechnocoreClient) => Promise<string>;

const commands: Record<string, CommandHandler> = {};

function registerCommand(name: string, handler: CommandHandler) {
  commands[name] = handler;
}

// ─── Weather helpers (Open-Meteo, no API key required) ───────────────────────

const WMO_CODES: Record<number, string> = {
  0: '☀️ Clear sky',
  1: '🌤️ Mainly clear',
  2: '⛅ Partly cloudy',
  3: '☁️ Overcast',
  45: '🌫️ Fog',
  48: '🌫️ Rime fog',
  51: '🌦️ Light drizzle',
  53: '🌦️ Moderate drizzle',
  55: '🌦️ Dense drizzle',
  61: '🌧️ Slight rain',
  63: '🌧️ Moderate rain',
  65: '🌧️ Heavy rain',
  71: '❄️ Slight snow',
  73: '❄️ Moderate snow',
  75: '❄️ Heavy snow',
  80: '🌦️ Slight rain showers',
  81: '🌦️ Moderate rain showers',
  82: '🌦️ Violent rain showers',
  85: '🌨️ Slight snow showers',
  86: '🌨️ Heavy snow showers',
  95: '⛈️ Thunderstorm',
  96: '⛈️ Thunderstorm with hail',
  99: '⛈️ Severe thunderstorm with hail',
};

interface GeoResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

async function geocode(city: string): Promise<GeoResult> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  
  const data = await res.json() as { results?: Array<{ name: string; country: string; latitude: number; longitude: number }> };
  if (!data.results || data.results.length === 0) {
    throw new Error(`City not found: ${city}`);
  }
  return data.results[0];
}

async function getWeather(city: string): Promise<string> {
  const geo = await geocode(city);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current_weather=true&temperature_unit=celsius&windspeed_unit=kmh`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
  
  const data = await res.json() as {
    current_weather: {
      temperature: number;
      windspeed: number;
      winddirection: number;
      weathercode: number;
      time: string;
    };
  };
  
  const w = data.current_weather;
  const condition = WMO_CODES[w.weathercode] || `Code ${w.weathercode}`;
  const windDir = getWindDirection(w.winddirection);
  
  return [
    `📍 ${geo.name}, ${geo.country}`,
    `${condition}`,
    `🌡️ ${w.temperature}°C`,
    `💨 ${w.windspeed} km/h ${windDir}`,
  ].join('\n');
}

async function getForecast(city: string): Promise<string> {
  const geo = await geocode(city);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=celsius&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
  
  const data = await res.json() as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weathercode: number[];
    };
  };
  
  const lines = [`📍 ${geo.name}, ${geo.country}`];
  
  for (let i = 0; i < Math.min(3, data.daily.time.length); i++) {
    const date = new Date(data.daily.time[i]);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const max = data.daily.temperature_2m_max[i];
    const min = data.daily.temperature_2m_min[i];
    const code = data.daily.weathercode[i];
    const condition = WMO_CODES[code] || `Code ${code}`;
    
    lines.push(`${dayName}: ${condition}`);
    lines.push(`  🌡️ ${min}°C – ${max}°C`);
  }
  
  return lines.join('\n');
}

function getWindDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

// ─── Crypto helpers (CoinGecko, no API key required) ────────────────────────

async function getCryptoPrice(ids: string[]): Promise<string> {
  // CoinGecko free API (no key required)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
  
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('CoinGecko rate limit (try again later)');
    }
    throw new Error(`Crypto API failed: ${res.status}`);
  }
  
  const data = await res.json() as Record<string, {
    usd?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
  }>;
  
  const lines: string[] = [];
  for (const id of ids) {
    const crypto = data[id];
    if (!crypto || crypto.usd === undefined) {
      lines.push(`❓ ${id}: Not found`);
      continue;
    }
    
    const price = crypto.usd;
    const change = crypto.usd_24h_change;
    const marketCap = crypto.usd_market_cap;
    const arrow = (change ?? 0) >= 0 ? '📈' : '📉';
    const sign = (change ?? 0) >= 0 ? '+' : '';
    
    lines.push(`${arrow} ${id.charAt(0).toUpperCase() + id.slice(1)}`);
    lines.push(`  💰 $${formatNumber(price)}`);
    if (change !== undefined) {
      lines.push(`  ${sign}${change.toFixed(2)}% (24h)`);
    }
    if (marketCap !== undefined) {
      lines.push(`  🏦 MCap: $${formatNumber(marketCap)}`);
    }
  }
  
  return lines.join('\n');
}

function formatNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

// ─── Commands ────────────────────────────────────────────────────────────────

registerCommand('help', async () => {
  const help = [
    'Available commands:',
    '  !help              - Show this help',
    '  !ping              - Pong!',
    '  !echo <text>       - Echo back text',
    '  !time              - Current UTC time',
    '  !date              - Current UTC date',
    '  !uptime            - Agent uptime',
    '  !whoami            - Your nick',
    '  !room              - Room info',
    '  !count             - Message count',
    '  !weather <city>    - Current weather (Open-Meteo)',
    '  !forecast <city>   - 3-day forecast (Open-Meteo)',
    '  !crypto <id>       - Crypto price (CoinGecko)',
    '  !note get <key>    - Get a note value',
    '  !note set <k> <v>  - Set a note value',
    '  !note list         - List all note keys',
    '  !stats             - Show server stats',
  ].join('\n');
  return help;
});

registerCommand('ping', async () => 'pong 🏓');

registerCommand('echo', async (text) => text || '(nothing to echo)');

registerCommand('time', async () => {
  const now = new Date();
  return `UTC: ${now.toISOString()}\nLocal: ${now.toLocaleString()}`;
});

registerCommand('date', async () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

registerCommand('uptime', async () => {
  const elapsed = Date.now() - START_TIME;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `Uptime: ${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `Uptime: ${hours}h ${minutes % 60}m`;
  return `Uptime: ${minutes}m ${seconds % 60}s`;
});

registerCommand('whoami', async (_args, from) => {
  return `You are: ${from}`;
});

registerCommand('weather', async (city) => {
  if (!city) return 'Usage: !weather <city>\nExample: !weather London';
  try {
    return await getWeather(city);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
});

registerCommand('forecast', async (city) => {
  if (!city) return 'Usage: !forecast <city>\nExample: !forecast Tokyo';
  try {
    return await getForecast(city);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
});

registerCommand('crypto', async (ids) => {
  if (!ids) return 'Usage: !crypto <id>\nExamples: !crypto bitcoin, !crypto ethereum solana';
  const coinIds = ids.toLowerCase().split(/[\s,]+/).filter(Boolean);
  // CoinGecko uses specific IDs, map common symbols
  const idMap: Record<string, string> = {
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
    doge: 'dogecoin',
    xrp: 'ripple',
    ada: 'cardano',
    dot: 'polkadot',
    avax: 'avalanche-2',
    matic: 'matic-network',
    usdt: 'tether',
    usdc: 'usd-coin',
  };
  const mapped = coinIds.map(id => idMap[id] || id);
  try {
    return await getCryptoPrice(mapped);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
});

registerCommand('room', async (_args, _from, tc) => {
  const view = await tc.read(ROOM);
  return [
    `Room: ${ROOM}`,
    `Messages: ${view.messages.length}`,
    `Range: ${view.first_seq}..${view.last_seq}`,
    `Generation: ${view.generation}`,
  ].join('\n');
});

registerCommand('count', async (_args, _from, tc) => {
  const view = await tc.read(ROOM);
  return `Message count: ${view.messages.length}`;
});

registerCommand('note', async (args, _from, tc) => {
  const parts = args.split(/\s+/);
  const action = parts[0];

  if (action === 'get') {
    const key = parts[1];
    if (!key) return 'Usage: !note get <key>';
    const value = await tc.note.get('utility-agent', key);
    if (value === null) return `Note "${key}" not found`;
    return `${key} = ${value}`;
  }

  if (action === 'set') {
    const key = parts[1];
    const value = parts.slice(2).join(' ');
    if (!key || !value) return 'Usage: !note set <key> <value>';
    await tc.note.set('utility-agent', key, value);
    return `Set ${key} = ${value}`;
  }

  if (action === 'list') {
    const keys = await tc.note.list('utility-agent');
    if (keys.length === 0) return 'No notes stored.';
    return `Notes (${keys.length}):\n${keys.map(k => `  - ${k}`).join('\n')}`;
  }

  return 'Usage: !note (get|set|list) <key> [value]';
});

registerCommand('stats', async (_args, _from, tc) => {
  const manifest = await tc.manifest();
  const rooms = await tc.rooms();
  return [
    `Server: ${manifest.name} v${manifest.version}`,
    `Rooms: ${rooms.length}`,
    `Max message chars: ${manifest.message_chars}`,
    `Max note chars: ${manifest.note_chars}`,
  ].join('\n');
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function processMessage(text: string, from: string, tc: TechnocoreClient): Promise<void> {
  // Sweep the text per protocol rules
  const swept = sweep(text);

  // Only handle commands (prefixed with !)
  if (!swept.startsWith('!')) {
    return;
  }

  const [command, ...rest] = swept.slice(1).split(/\s+/);
  const args = rest.join(' ');

  const handler = commands[command.toLowerCase()];
  if (!handler) {
    await tc.say(ROOM, AGENT_NAME, `Unknown command !${command}. Type !help for available commands.`);
    return;
  }

  try {
    const response = await handler(args, from, tc);
    await tc.say(ROOM, AGENT_NAME, response);
  } catch (err) {
    console.error(`Error handling !${command}:`, err);
    await tc.say(ROOM, AGENT_NAME, 'Error executing command.');
  }
}

async function main() {
  console.log(`Starting ${AGENT_NAME} in room "${ROOM}"...`);
  console.log(`Base: ${BASE}`);
  console.log('Type !help in the room for available commands.\n');

  const tc = new TechnocoreClient(BASE);

  // Announce presence
  await tc.say(ROOM, AGENT_NAME, `Hello! I'm a utility agent. Type !help for commands.`);

  // Listen for messages using stream()
  let lastSeq = 0;
  
  try {
    for await (const view of tc.stream(ROOM)) {
      for (const msg of view.messages) {
        // Skip our own messages
        if (msg.from === AGENT_NAME) {
          continue;
        }

        // Skip already-processed messages
        if (msg.seq <= lastSeq) {
          continue;
        }
        lastSeq = msg.seq;

        console.log(`[${msg.ts}] ${msg.from}: ${msg.text}`);

        // Process commands
        await processMessage(msg.text, msg.from, tc);
      }
    }
  } catch (err) {
    console.error('Stream error:', err);
    process.exit(1);
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
