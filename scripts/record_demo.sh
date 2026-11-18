#!/usr/bin/env bash
# Record a multi-turn conversation demo and convert it to an animated GIF.
#
# Requirements:
#   pip install asciinema          (or: brew install asciinema)
#   cargo install --git https://github.com/asciinema/agg  (or: brew install agg)
#
# Usage:
#   chmod +x scripts/record_demo.sh
#   ./scripts/record_demo.sh
#
# Output: docs/demo.gif

set -euo pipefail

CAST_FILE="docs/demo.cast"
GIF_FILE="docs/demo.gif"
API="http://localhost:8000/api/v1/chat"

echo "Recording demo — press Ctrl+D or Ctrl+C when done."
echo ""

asciinema rec "$CAST_FILE" --cols 100 --rows 30 --title "Digimon RAG Assistant demo" -- bash -c '
set -euo pipefail
API="http://localhost:8000/api/v1/chat"

echo "=== Digimon RAG Assistant — multi-turn demo ==="
echo ""
sleep 1

echo "# Turn 1: ask about Agumon"
sleep 0.5
RESP=$(curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d '"'"'{"query": "Tell me about Agumon"}'"'"')
echo "$RESP" | python3 -m json.tool
CONV_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)[\"conversation_id\"])")
echo ""
sleep 2

echo "# Turn 2: follow-up using a pronoun — guardrail resolves it"
sleep 0.5
curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"What does it digivolve into?\", \"conversation_id\": \"$CONV_ID\"}" \
  | python3 -m json.tool
echo ""
sleep 2

echo "# Turn 3: another pronoun follow-up"
sleep 0.5
curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"What are its skills?\", \"conversation_id\": \"$CONV_ID\"}" \
  | python3 -m json.tool
echo ""
sleep 2

echo "# Guardrail: off-topic query is blocked"
sleep 0.5
curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d '"'"'{"query": "What is the capital of France?"}'"'"' \
  | python3 -m json.tool
echo ""
sleep 1
echo "=== Done ==="
'

echo ""
echo "Converting to GIF..."
agg "$CAST_FILE" "$GIF_FILE" --font-size 14 --speed 1.5
echo "Done: $GIF_FILE"
