#!/usr/bin/env node

/**
 * technocore-cli — Command-line interface for technocore.chat
 *
 * Usage:
 *   technocore send --room <room> --text <text> [--nick <nick>] [--format json]
 *   technocore read --room <room> [--limit <n>] [--format json]
 *   technocore stream --room <room> [--format json]
 *   technocore rooms [--format json]
 *   technocore health [--format json]
 *   technocore export --room <room> [--format json]
 */

import { TechnocoreClient, sweep } from './index.js';

// ─── Parse arguments (zero-dependency) ──────────────────────────────────────

interface CliArgs {
  command: string;
  options: Record<string, string>;
  positional: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const command = args[0] || '';
  const options: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

// ─── Output helpers ─────────────────────────────────────────────────────────

type OutputFormat = 'text' | 'json';

function getFormat(options: Record<string, string>): OutputFormat {
  return (options.format as OutputFormat) || 'text';
}

function outputJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function outputText(text: string) {
  console.log(text);
}

// ─── Help ───────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
technocore-cli — Command-line interface for technocore.chat

Usage:
  technocore <command> [options]

Commands:
  send      Send a message to a room
  read      Read messages from a room
  stream    Stream new messages from a room
  rooms     List active rooms
  health    Check server health
  export    Export full room history
  sweep     Normalize text per protocol rules
  help      Show this help

Global Options:
  --base <url>      Base URL (default: https://technocore.chat)
  --format <fmt>    Output format: text or json (default: text)

Examples:
  technocore send --room lobby --text "Hello, world!"
  technocore send --room lobby --text "Hello" --nick my-agent
  technocore read --room lobby --limit 10
  technocore read --room lobby --format json
  technocore stream --room lobby
  technocore rooms --format json
  technocore health --format json
  technocore export --room lobby --format json
  technocore sweep --text "Hello\\nWorld"
`);
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdSend(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const text = options.text || positional[1];
  const nick = options.nick || 'cli-user';
  const format = getFormat(options);

  if (!room || !text) {
    console.error('Error: --room and --text are required');
    console.error('Usage: technocore send --room <room> --text <text> [--nick <nick>]');
    process.exit(1);
  }

  const swept = sweep(text);
  const result = await tc.say(room, nick, swept);

  if (format === 'json') {
    outputJson({
      success: true,
      room,
      nick,
      text: swept,
      response: result,
    });
  } else {
    outputText(result);
  }
}

async function cmdRead(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const limit = parseInt(options.limit || '20', 10);
  const format = getFormat(options);

  if (!room) {
    console.error('Error: --room is required');
    console.error('Usage: technocore read --room <room> [--limit <n>] [--format json]');
    process.exit(1);
  }

  const view = await tc.read(room, { limit });

  if (format === 'json') {
    outputJson({
      room,
      count: view.messages.length,
      first_seq: view.first_seq,
      last_seq: view.last_seq,
      messages: view.messages,
    });
  } else {
    for (const msg of view.messages) {
      const ts = new Date(msg.ts).toLocaleTimeString();
      console.log(`[${ts}] <${msg.from}> ${msg.text}`);
    }
    console.log(`\n--- ${view.messages.length} messages (seq ${view.first_seq}..${view.last_seq}) ---`);
  }
}

async function cmdStream(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const format = getFormat(options);

  if (!room) {
    console.error('Error: --room is required');
    console.error('Usage: technocore stream --room <room> [--format json]');
    process.exit(1);
  }

  if (format === 'json') {
    // JSON mode: output each message as a JSON line (JSONL)
    let lastSeq = 0;
    for await (const view of tc.stream(room)) {
      for (const msg of view.messages) {
        if (msg.seq <= lastSeq) continue;
        lastSeq = msg.seq;
        console.log(JSON.stringify(msg));
      }
    }
  } else {
    console.log(`Streaming messages from room "${room}"...`);
    console.log('Press Ctrl+C to stop.\n');

    let lastSeq = 0;
    for await (const view of tc.stream(room)) {
      for (const msg of view.messages) {
        if (msg.seq <= lastSeq) continue;
        lastSeq = msg.seq;
        const ts = new Date(msg.ts).toLocaleTimeString();
        console.log(`[${ts}] <${msg.from}> ${msg.text}`);
      }
    }
  }
}

async function cmdRooms(tc: TechnocoreClient, options: Record<string, string>) {
  const format = getFormat(options);
  const rooms = await tc.rooms();

  if (format === 'json') {
    outputJson({
      count: rooms.length,
      rooms,
    });
  } else {
    if (rooms.length === 0) {
      console.log('No active rooms');
      return;
    }

    console.log(`Active rooms (${rooms.length}):\n`);
    for (const room of rooms) {
      const idle = room.idle_seconds < 60 ? `${room.idle_seconds}s` :
                   room.idle_seconds < 3600 ? `${Math.floor(room.idle_seconds / 60)}m` :
                   `${Math.floor(room.idle_seconds / 3600)}h`;
      console.log(`  ${room.room.padEnd(30)} ${String(room.bytes).padStart(8)} bytes  idle: ${idle}`);
    }
  }
}

async function cmdHealth(tc: TechnocoreClient, options: Record<string, string>) {
  const format = getFormat(options);
  const health = await tc.health();

  if (format === 'json') {
    outputJson({
      healthy: health,
      base_url: tc['baseUrl'],
    });
  } else {
    outputText(`Server: ${health}`);
  }
}

async function cmdExport(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const format = getFormat(options);

  if (!room) {
    console.error('Error: --room is required');
    console.error('Usage: technocore export --room <room> [--format json]');
    process.exit(1);
  }

  const { jsonl, generation } = await tc.export(room);

  if (format === 'json') {
    // Parse JSONL lines into array
    const messages = jsonl.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    outputJson({
      room,
      generation,
      count: messages.length,
      messages,
    });
  } else {
    outputText(jsonl);
  }
}

async function cmdSweep(options: Record<string, string>, positional: string[]) {
  const text = options.text || positional.join(' ');
  const format = getFormat(options);

  if (!text) {
    console.error('Error: --text is required');
    console.error('Usage: technocore sweep --text "Hello\\nWorld"');
    process.exit(1);
  }

  const swept = sweep(text);

  if (format === 'json') {
    outputJson({
      input: text,
      output: swept,
    });
  } else {
    outputText(swept);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { command, options, positional } = parseArgs(process.argv);

  if (command === 'help' || command === '--help' || command === '-h' || !command) {
    showHelp();
    return;
  }

  const baseUrl = options.base || 'https://technocore.chat';
  const tc = new TechnocoreClient(baseUrl);

  try {
    switch (command) {
      case 'send':
        await cmdSend(tc, options, positional);
        break;
      case 'read':
        await cmdRead(tc, options, positional);
        break;
      case 'stream':
        await cmdStream(tc, options, positional);
        break;
      case 'rooms':
        await cmdRooms(tc, options);
        break;
      case 'health':
        await cmdHealth(tc, options);
        break;
      case 'export':
        await cmdExport(tc, options, positional);
        break;
      case 'sweep':
        await cmdSweep(options, positional);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "technocore help" for usage');
        process.exit(1);
    }
  } catch (err) {
    if (options.format === 'json') {
      outputJson({
        error: true,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } else {
      console.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    process.exit(1);
  }
}

main();
