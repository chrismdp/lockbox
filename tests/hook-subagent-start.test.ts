import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { main } from "../src/hook-subagent-start";
import { saveState, loadState, isDelegateActive } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-sa-start-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function hookInput(agentType: string, sessionId = "test-session") {
  return JSON.stringify({ session_id: sessionId, agent_type: agentType });
}

describe("hook-subagent-start", () => {
  it("starts delegate for delegate agent", () => {
    saveState("sess-1", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["git push"],
    }, tmpDir);

    main(hookInput("delegate", "sess-1"), tmpDir);

    expect(isDelegateActive("sess-1", tmpDir)).toBe(true);
    // State should be cleared for delegate
    const state = loadState("sess-1", tmpDir);
    expect(state.locked).toBe(false);
    // Backup should exist
    const backupPath = path.join(tmpDir, "lockbox-state-sess-1.delegate-backup.json");
    expect(fs.existsSync(backupPath)).toBe(true);
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
    expect(backup.locked).toBe(true);
    expect(backup.locked_by).toBe("WebFetch");
  });

  it("starts delegate for lockbox:delegate agent (namespaced)", () => {
    saveState("sess-ns", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("lockbox:delegate", "sess-ns"), tmpDir);

    expect(isDelegateActive("sess-ns", tmpDir)).toBe(true);
    const state = loadState("sess-ns", tmpDir);
    expect(state.locked).toBe(false);
  });

  it("ignores non-delegate agents", () => {
    saveState("sess-2", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("general-purpose", "sess-2"), tmpDir);

    expect(isDelegateActive("sess-2", tmpDir)).toBe(false);
    const state = loadState("sess-2", tmpDir);
    expect(state.locked).toBe(true);
  });

  it("is idempotent — second call does not overwrite backup", () => {
    saveState("sess-3", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("delegate", "sess-3"), tmpDir);

    // Simulate delegate getting tainted
    saveState("sess-3", {
      locked: true,
      locked_by: "curl in delegate",
      locked_at: "2025-06-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    // Second call should not overwrite the original backup
    main(hookInput("delegate", "sess-3"), tmpDir);

    const backupPath = path.join(tmpDir, "lockbox-state-sess-3.delegate-backup.json");
    const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
    expect(backup.locked_by).toBe("WebFetch"); // original, not overwritten
  });

  it("no-op on bad stdin", () => {
    expect(() => main("not json{{{", tmpDir)).not.toThrow();
  });
});
