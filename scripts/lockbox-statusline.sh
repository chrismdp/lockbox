#!/bin/bash
# Lockbox statusline wrapper — prepends lock icon, chains to original statusline
# Discovers the original statusline command from ~/.claude/settings.json automatically.
# Install by adding to settings.local.json (overrides settings.json's statusLine).

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id' 2>/dev/null)
STATE="/tmp/lockbox-state-${SESSION_ID}.json"

# Lockbox icon: red key when locked, dim grid when clean
if [ -f "$STATE" ] && [ "$(jq -r '.locked' "$STATE" 2>/dev/null)" = "true" ]; then
    printf '\033[31m⚿\033[0m '
else
    printf '\033[2m⧇\033[0m '
fi

# Chain to original statusline from settings.json (not settings.local.json, which points here)
ORIGINAL=$(jq -r '.statusLine.command // empty' ~/.claude/settings.json 2>/dev/null)
if [ -n "$ORIGINAL" ]; then
    echo "$INPUT" | eval "$ORIGINAL"
fi
