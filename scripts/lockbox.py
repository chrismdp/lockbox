#!/usr/bin/env python3
"""Lockbox PreToolUse hook — taint-aware tool gating for Claude Code.

Reads tool call info from stdin, classifies the tool, manages taint state,
and blocks external-facing (acting) tools when untrusted data has entered
the session context.

Categories:
  safe          — always allowed (local reads, writes, search, plan mode)
  unsafe        — taints the session, but the read is allowed
  acting        — blocked when session is tainted, passthrough otherwise
  unsafe_acting — taints on first use; blocked if already tainted
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def get_state_path(session_id: str) -> Path:
    return Path(f"/tmp/lockbox-state-{session_id}.json")


def load_state(session_id: str) -> dict:
    path = get_state_path(session_id)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "locked": False,
        "locked_by": None,
        "locked_at": None,
        "blocked_tools": [],
    }


def save_state(session_id: str, state: dict):
    path = get_state_path(session_id)
    path.write_text(json.dumps(state, indent=2))


def load_config() -> dict:
    config_path = Path(__file__).parent / "lockbox-classify.json"
    return json.loads(config_path.read_text())


def classify_tool(tool_name: str, tool_input: dict, config: dict) -> str:
    """Classify a tool call. Returns 'safe', 'unsafe', 'acting', or 'unsafe_acting'."""
    tools = config["tools"]

    if tool_name in tools.get("safe", []):
        return "safe"
    if tool_name in tools.get("acting", []):
        return "acting"
    if tool_name in tools.get("unsafe", []):
        return "unsafe"
    if tool_name in tools.get("unsafe_acting", []):
        return "unsafe_acting"

    # MCP tools: exact match, then prefix-based default
    mcp_tools = config.get("mcp_tools", {})
    if tool_name in mcp_tools:
        return mcp_tools[tool_name]
    if tool_name.startswith("mcp__"):
        return config.get("mcp_default", "acting")

    # Bash: classify by command content
    if tool_name == "Bash":
        return classify_bash(
            tool_input.get("command", ""), config.get("bash_patterns", {})
        )

    # Unknown tool → acting (conservative)
    return "acting"


def classify_bash(command: str, patterns: dict) -> str:
    """Split piped/chained commands, classify each segment.

    Tracks unsafe (taints context) and acting (external action) independently.
    A pipe that both reads untrusted data and acts externally gets unsafe_acting.
    """
    segments = re.split(r"\s*[|;&]+\s*", command)

    has_unsafe = False
    has_acting = False

    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        cat = classify_bash_segment(seg, patterns)
        if cat in ("unsafe", "unsafe_acting"):
            has_unsafe = True
        if cat in ("acting", "unsafe_acting"):
            has_acting = True

    if has_unsafe and has_acting:
        return "unsafe_acting"
    if has_acting:
        return "acting"
    if has_unsafe:
        return "unsafe"
    return "safe"


def classify_bash_segment(segment: str, patterns: dict) -> str:
    """First-match-wins across unsafe → acting → safe. Default: acting."""
    for p in patterns.get("unsafe", []):
        if re.search(p, segment):
            return "unsafe"
    for p in patterns.get("acting", []):
        if re.search(p, segment):
            return "acting"
    for p in patterns.get("safe", []):
        if re.search(p, segment):
            return "safe"
    return "acting"


def tool_description(tool_name: str, tool_input: dict) -> str:
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        return f"Bash: {cmd[:120]}"
    return tool_name


def taint_session(state: dict, tool_name: str, tool_input: dict, session_id: str):
    """Mark the session as tainted by an unsafe tool."""
    state["locked"] = True
    state["locked_by"] = tool_description(tool_name, tool_input)
    state["locked_at"] = datetime.now(timezone.utc).isoformat()
    state["blocked_tools"] = []
    save_state(session_id, state)


def block_tool(state: dict, tool_name: str, tool_input: dict, session_id: str):
    """Block an acting tool and emit the lockbox message."""
    desc = tool_description(tool_name, tool_input)
    if desc not in state["blocked_tools"]:
        state["blocked_tools"].append(desc)
        save_state(session_id, state)

    reason = (
        "LOCKBOX: External action blocked — your context contains untrusted data.\n"
        "\n"
        f"Locked at {state['locked_at']} by: {state['locked_by']}\n"
        "\n"
        "You CAN: read/write/edit local files, search, enter plan mode.\n"
        "You CANNOT: send emails, push to git, create external tasks, fetch URLs.\n"
        "\n"
        "Enter plan mode (EnterPlanMode) and describe the external actions you need.\n"
        "Write your plan to the plan file. The user will review it and can run\n"
        "/lockbox-execute in a clean session to carry out approved actions."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return  # passthrough on bad input

    session_id = hook_input.get("session_id", "unknown")
    tool_name = hook_input.get("tool_name", "")
    tool_input = hook_input.get("tool_input", {})

    config = load_config()
    state = load_state(session_id)
    category = classify_tool(tool_name, tool_input, config)
    is_locked = state["locked"]

    # Safe: always passthrough
    if category == "safe":
        return

    # Unsafe (read-only taint): taint the session, allow the read
    if category == "unsafe":
        if not is_locked:
            taint_session(state, tool_name, tool_input, session_id)
        return  # passthrough — normal permission logic applies

    # Unsafe+Acting: taint on first use, block if already tainted
    if category == "unsafe_acting":
        if not is_locked:
            taint_session(state, tool_name, tool_input, session_id)
            return  # allow the first use (read happens, session now tainted)
        # Already locked → fall through to block (prevents exfiltration)

    # Acting (or unsafe_acting when already locked): block if tainted
    if is_locked:
        block_tool(state, tool_name, tool_input, session_id)
        return

    # Acting but session not tainted → passthrough (normal permissions apply)


if __name__ == "__main__":
    main()
