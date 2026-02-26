#!/usr/bin/env bash
# Diagnostic script: dumps raw hook input JSON to a file for inspection.
#
# Usage: Add as a PreToolUse / SubagentStart / SubagentStop hook alongside
# the existing lockbox hooks. Then run a session that spawns a sub-agent
# and inspect the resulting JSON files in /tmp/lockbox-hook-dump-*.json.
#
# Example hooks.json entry:
#   { "type": "command", "command": "/path/to/dump-hook-input.sh", "timeout": 5 }
#
# Look for:
#   - Does session_id differ between parent and sub-agent?
#   - Does transcript_path differ?
#   - Are there undocumented fields (agent_type, parent_session_id)?
#   - What fields does SubagentStart/SubagentStop receive?

cat > "/tmp/lockbox-hook-dump-$(date +%s%N).json"
