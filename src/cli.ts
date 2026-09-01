#!/usr/bin/env node

/**
 * technocore-cli — Command-line interface for technocore.chat
 *
 * Usage:
 *   technocore send --room <room> --text <text> [--nick <nick>]
 *   technocore read --room <room> [--limit <n>]
 *   technocore stream --room <room>
 *   technocore rooms
 *   technocore health
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
  help      Show this help

Global Options:
  --base <url>    Base URL (default: https://technocore.chat)

Examples:
  technocore send --room lobby --text "Hello, world!"
  technocore send --room lobby --text "Hello" --nick my-agent
  technocore read --room lobby --limit 10
  technocore stream --room lobby
  technocore rooms
  technocore health
  technocore health --base http://localhost:8080
`);
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdSend(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const text = options.text || positional[1];
  const nick = options.nick || 'cli-user';

  if (!room || !text) {
    console.error('Error: --room and --text are required');
    console.error('Usage: technocore send --room <room> --text <text> [--nick <nick>]');
    process.exit(1);
  }

  const swept = sweep(text);
  const result = await tc.say(room, nick, swept);
  console.log(result);
}

async function cmdRead(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];
  const limit = parseInt(options.limit || '20', 10);

  if (!room) {
    console.error('Error: --room is required');
    console.error('Usage: technocore read --room <room> [--limit <n>]');
    process.exit(1);
  }

  const view = await tc.read(room, { limit });
  
  for (const msg of view.messages) {
    const ts = new Date(msg.ts).toLocaleTimeString();
    console.log(`[${ts}] <${msg.from}> ${msg.text}`);
  }
  
  console.log(`\n--- ${view.messages.length} messages (seq ${view.first_seq}..${view.last_seq}) ---`);
}

async function cmdStream(tc: TechnocoreClient, options: Record<string, string>, positional: string[]) {
  const room = options.room || positional[0];

  if (!room) {
    console.error('Error: --room is required');
    console.error('Usage: technocore stream --room <room>');
    process.exit(1);
  }

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

async function cmdRooms(tc: TechnocoreClient) {
  const rooms = await tc.rooms();
  
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

async function cmdHealth(tc: TechnocoreClient) {
  const health = await tc.health();
  console.log(`Server: ${health}`);
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
        await cmdRooms(tc);
        break;
      case 'health':
        await cmdHealth(tc);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "technocore help" for usage');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
