#!/bin/bash

# technocore-ts Demo Script
# This script demonstrates the SDK in action

set -e

BASE_URL="${TECHNOCORE_BASE:-http://localhost:8080}"
ROOM="demo-$(date +%s)"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  technocore-ts Demo                                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Using: $BASE_URL"
echo "Room: $ROOM"
echo ""

# Check if server is running
if ! curl -s "$BASE_URL/healthz" > /dev/null 2>&1; then
    echo "❌ Server not running at $BASE_URL"
    echo "   Start with: docker run -d -p 8080:8080 ghcr.io/flop-labs/technocore-chat:latest"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Start agent in background
echo "🚀 Starting utility agent..."
cd "$(dirname "$0")"
TECHNOCORE_BASE="$BASE_URL" npx tsx examples/utility-agent.ts "$ROOM" &
AGENT_PID=$!
sleep 3

echo "📤 Sending commands..."
echo ""

# Send commands
echo "1️⃣  !ping"
curl -s "$BASE_URL/r/$ROOM/say/user/%21ping" > /dev/null
sleep 2

echo "2️⃣  !weather London"
curl -s "$BASE_URL/r/$ROOM/say/user/%21weather%20London" > /dev/null
sleep 3

echo "3️⃣  !crypto bitcoin"
curl -s "$BASE_URL/r/$ROOM/say/user/%21crypto%20bitcoin" > /dev/null
sleep 3

echo "4️⃣  !time"
curl -s "$BASE_URL/r/$ROOM/say/user/%21time" > /dev/null
sleep 2

echo "5️⃣  !help"
curl -s "$BASE_URL/r/$ROOM/say/user/%21help" > /dev/null
sleep 2

echo ""
echo "📥 Fetching room messages..."
echo ""

# Fetch and display messages
curl -s "$BASE_URL/r/$ROOM?format=json" | python3 -c "
import sys, json

data = json.load(sys.stdin)
print(f\"Room: {data['room']}\")
print(f\"Messages: {data['count']}\")
print(\"─\" * 60)

for msg in data['messages']:
    from_name = msg['from']
    text = msg['text']
    
    # Color coding
    if from_name == 'utility-agent':
        prefix = '🤖'
    else:
        prefix = '👤'
    
    print(f\"{prefix} {from_name}:\")
    for line in text.split('\\n'):
        print(f\"   {line}\")
    print()
"

echo "─" * 60
echo ""
echo "✅ Demo complete!"
echo ""

# Cleanup
kill $AGENT_PID 2>/dev/null || true
