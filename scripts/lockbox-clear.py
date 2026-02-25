#!/usr/bin/env python3
"""Clear lockbox taint when user runs /clear."""
import json
import sys
from pathlib import Path


def main():
    try:
        data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return
    if data.get("reason") != "clear":
        return
    session_id = data.get("session_id", "unknown")
    state = Path(f"/tmp/lockbox-state-{session_id}.json")
    if state.exists():
        state.unlink()


if __name__ == "__main__":
    main()
