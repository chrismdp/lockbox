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
import os
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


def merge_lists(base: list, overlay: list) -> list:
    removals = {item[1:] for item in overlay if item.startswith("!")}
    additions = [item for item in overlay if not item.startswith("!")]
    filtered = [item for item in base if item not in removals]
    return additions + filtered


def merge_configs(base: dict, overlay: dict) -> dict:
    result = {}
    for key in ("mcp_default",):
        result[key] = overlay.get(key, base.get(key))
    for key in ("mcp_tools",):
        merged = dict(base.get(key, {}))
        merged.update(overlay.get(key, {}))
        result[key] = merged
    for key in ("tools", "bash_patterns"):
        bg = base.get(key, {})
        og = overlay.get(key, {})
        mg = {}
        for k in set(list(bg.keys()) + list(og.keys())):
            mg[k] = merge_lists(bg.get(k, []), og.get(k, []))
        result[key] = mg
    return result


def load_config() -> dict:
    plugin_root = Path(os.environ.get("CLAUDE_PLUGIN_ROOT", Path(__file__).parent.parent))
    config = json.loads((plugin_root / "scripts" / "lockbox-classify.json").read_text())
    for override_path in (
        Path.home() / ".claude" / "lockbox.json",
        Path.cwd() / ".claude" / "lockbox.json",
    ):
        if override_path.exists():
            try:
                config = merge_configs(config, json.loads(override_path.read_text()))
            except (json.JSONDecodeError, OSError):
                pass
    return config


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
    """Override-safe first, then unsafe_acting → unsafe → acting → safe. Default: acting."""
    for p in patterns.get("override_safe", []):
        if re.search(p, segment):
            return "safe"
    for p in patterns.get("unsafe_acting", []):
        if re.search(p, segment):
            return "unsafe_acting"
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
        "LOCKBOX: Action blocked — session contains untrusted data.\n"
        "\n"
        f"Tainted by: {state['locked_by']} at {state['locked_at']}\n"
        f"Blocked: {tool_description(tool_name, tool_input)}\n"
        "\n"
        "Continue working — read, write, edit, search, and Bash all work.\n"
        "\n"
        "When ready to take external actions:\n"
        "1. Enter plan mode (EnterPlanMode)\n"
        "2. Write plan with ALL concrete data inline (exact email bodies, etc.)\n"
        "3. Order phases: safe first, then acting, then unsafe\n"
        "4. Exit plan mode — user selects 'Clear context and bypass permissions'"
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
