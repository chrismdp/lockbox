import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { main } from "../src/hook-post-tool-use";
import { loadState, saveState } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-post-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function hookInput(toolName: string, sessionId = "parent-session") {
  return JSON.stringify({ session_id: sessionId, tool_name: toolName, tool_input: {} });
}

describe("hook-post-tool-use", () => {
  it("locks parent when subagent session is tainted", () => {
    // Simulate a locked subagent session
    saveState("child-abc", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Task", "parent-session"), tmpDir);

    const state = loadState("parent-session", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("subagent (tainted data returned via Task)");
  });

  it("locks parent on TaskOutput with tainted subagent", () => {
    saveState("child-xyz", {
      locked: true,
      locked_by: "curl",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("TaskOutput", "parent-session"), tmpDir);

    const state = loadState("parent-session", tmpDir);
    expect(state.locked).toBe(true);
  });

  it("no-op when no subagent sessions are tainted", () => {
    saveState("child-clean", {
      locked: false,
      locked_by: null,
      locked_at: null,
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Task", "parent-session"), tmpDir);

    const state = loadState("parent-session", tmpDir);
    expect(state.locked).toBe(false);
  });

  it("no-op when parent is already locked", () => {
    saveState("parent-session", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["TaskStop"],
    }, tmpDir);
    saveState("child-abc", {
      locked: true,
      locked_by: "curl",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Task", "parent-session"), tmpDir);

    const state = loadState("parent-session", tmpDir);
    // Should keep original locked_by, not overwrite
    expect(state.locked_by).toBe("WebFetch");
    expect(state.blocked_tools).toEqual(["TaskStop"]);
  });

  it("no-op for non-Task tools", () => {
    saveState("child-abc", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Read", "parent-session"), tmpDir);

    const state = loadState("parent-session", tmpDir);
    expect(state.locked).toBe(false);
  });

  it("no-op on bad stdin", () => {
    expect(() => main("not json{{{", tmpDir)).not.toThrow();
  });
});
