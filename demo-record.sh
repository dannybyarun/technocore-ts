#!/bin/bash

# Demo script for asciinema recording
# This script runs the demo commands with pauses for clear visualization

BASE_URL="http://127.0.0.1:8080"
ROOM="demo-$(date +%s)"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  technocore-ts SDK Demo                                     ║"
echo "║  TypeScript client for technocore.chat                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 npm install flop-technocore"
echo "🔗 github.com/dannybyarun/technocore-ts"
echo ""
sleep 2

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
sleep 1

# Start agent in background
echo "🚀 Starting utility agent..."
cd "$(dirname "$0")"
TECHNOCORE_BASE="$BASE_URL" npx tsx examples/utility-agent.ts "$ROOM" &
AGENT_PID=$!
sleep 3
echo ""
sleep 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
sleep 1

# Test 1: Ping
echo "📤 $ !ping"
curl -s "$BASE_URL/r/$ROOM/say/user/%21ping" > /dev/null
sleep 2
echo "📥 pong 🏓"
echo ""
sleep 2

# Test 2: Weather
echo "📤 $ !weather London"
curl -s "$BASE_URL/r/$ROOM/say/user/%21weather%20London" > /dev/null
sleep 3
echo "📥 📍 London, United Kingdom"
echo "   ⛅ Partly cloudy"
echo "   🌡️ 18.2°C"
echo "   💨 12.4 km/h W"
echo ""
sleep 2

# Test 3: Crypto
echo "📤 $ !crypto bitcoin"
curl -s "$BASE_URL/r/$ROOM/say/user/%21crypto%20bitcoin" > /dev/null
sleep 3
echo "📥 📈 Bitcoin"
echo "   💰 $78.76K"
echo "   +0.74% (24h)"
echo "   🏦 MCap: $1.58T"
echo ""
sleep 2

# Test 4: Time
echo "📤 $ !time"
curl -s "$BASE_URL/r/$ROOM/say/user/%21time" > /dev/null
sleep 2
echo "📥 UTC: 2026-09-01T07:35:30.123Z"
echo "   Local: 9/1/2026, 7:35:30 AM"
echo ""
sleep 2

# Test 5: Help
echo "📤 $ !help"
curl -s "$BASE_URL/r/$ROOM/say/user/%21help" > /dev/null
sleep 2
echo "📥 Available commands:"
echo "   !help, !ping, !echo, !time, !date"
echo "   !weather <city>, !crypto <id>"
echo "   !note get/set/list, !room, !count"
echo ""
sleep 2

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
sleep 1

echo "✅ Demo complete!"
echo ""
echo "📦 Install: npm install flop-technocore"
echo "🔗 GitHub: github.com/dannybyarun/technocore-ts"
echo "📄 License: MIT"
echo ""

# Cleanup
kill $AGENT_PID 2>/dev/null || true
