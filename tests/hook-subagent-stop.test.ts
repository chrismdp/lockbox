import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { main } from "../src/hook-subagent-stop";
import { saveState, loadState, startDelegate, isDelegateActive } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-sa-stop-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function hookInput(agentType: string, sessionId = "test-session") {
  return JSON.stringify({ session_id: sessionId, agent_type: agentType });
}

describe("hook-subagent-stop", () => {
  it("restores parent state when delegate stops", () => {
    // Set up locked parent, then start delegate
    saveState("sess-1", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["git push"],
    }, tmpDir);
    startDelegate("sess-1", tmpDir);

    // Verify delegate is active and state is clean
    expect(isDelegateActive("sess-1", tmpDir)).toBe(true);
    expect(loadState("sess-1", tmpDir).locked).toBe(false);

    // Stop delegate
    main(hookInput("delegate", "sess-1"), tmpDir);

    // Delegate marker should be removed
    expect(isDelegateActive("sess-1", tmpDir)).toBe(false);
    // Parent state should be restored
    const state = loadState("sess-1", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
    expect(state.blocked_tools).toEqual(["git push"]);
    // Backup should be cleaned up
    const backupPath = path.join(tmpDir, "lockbox-state-sess-1.delegate-backup.json");
    expect(fs.existsSync(backupPath)).toBe(false);
  });

  it("restores parent state for lockbox:delegate agent (namespaced)", () => {
    saveState("sess-ns", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);
    startDelegate("sess-ns", tmpDir);

    expect(isDelegateActive("sess-ns", tmpDir)).toBe(true);

    main(hookInput("lockbox:delegate", "sess-ns"), tmpDir);

    expect(isDelegateActive("sess-ns", tmpDir)).toBe(false);
    const state = loadState("sess-ns", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
  });

  it("ignores non-delegate agents", () => {
    saveState("sess-2", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);
    startDelegate("sess-2", tmpDir);

    main(hookInput("general-purpose", "sess-2"), tmpDir);

    // Delegate should still be active
    expect(isDelegateActive("sess-2", tmpDir)).toBe(true);
  });

  it("discards delegate taint on stop", () => {
    saveState("sess-3", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);
    startDelegate("sess-3", tmpDir);

    // Simulate delegate getting tainted
    saveState("sess-3", {
      locked: true,
      locked_by: "curl in delegate",
      locked_at: "2025-06-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    // Stop delegate — should restore parent's original state, not delegate's taint
    main(hookInput("delegate", "sess-3"), tmpDir);

    const state = loadState("sess-3", tmpDir);
    expect(state.locked_by).toBe("WebFetch"); // parent's original
    expect(state.locked_by).not.toBe("curl in delegate");
  });

  it("no-op when delegate is not active", () => {
    saveState("sess-4", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    // Stop without starting — should be a no-op
    main(hookInput("delegate", "sess-4"), tmpDir);

    const state = loadState("sess-4", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("WebFetch");
  });

  it("no-op on bad stdin", () => {
    expect(() => main("not json{{{", tmpDir)).not.toThrow();
  });
});
