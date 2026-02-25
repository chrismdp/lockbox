#!/usr/bin/env python3
"""Lockbox Stop hook — saves plan metadata when a locked session ends.

When a tainted session ends, this hook:
1. Checks if the session was locked
2. Finds the most recent plan file (from plan mode)
3. Saves taint metadata + plan path to /tmp/lockbox-plans/ for /lockbox-execute
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main():
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return

    session_id = hook_input.get("session_id", "unknown")
    state_path = Path(f"/tmp/lockbox-state-{session_id}.json")

    if not state_path.exists():
        return

    try:
        state = json.loads(state_path.read_text())
    except (json.JSONDecodeError, OSError):
        return

    if not state.get("locked"):
        return

    # Find the most recent plan file
    plans_dir = Path.cwd() / ".claude" / "plans"
    plan_file = None
    if plans_dir.exists():
        plan_files = sorted(
            plans_dir.glob("*.md"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if plan_files:
            plan_file = str(plan_files[0])

    # Save plan metadata for /lockbox-execute
    output_dir = Path("/tmp/lockbox-plans")
    output_dir.mkdir(exist_ok=True)

    metadata = {
        "session_id": session_id,
        "locked_by": state.get("locked_by"),
        "locked_at": state.get("locked_at"),
        "blocked_tools": state.get("blocked_tools", []),
        "plan_file": plan_file,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }

    output_path = output_dir / f"{session_id}.json"
    output_path.write_text(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
