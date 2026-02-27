import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { main } from "../src/hook-pre-tool-use";
import { loadState, saveState, isDelegateActive } from "../src/state";
import * as permissions from "../src/permissions";

let tmpDir: string;
let tmpPlugin: string;

// Capture stdout
let stdoutData: string;
const originalWrite = process.stdout.write;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-hook-"));
  tmpPlugin = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-hookp-"));

  // Set up plugin defaults
  fs.copyFileSync(
    path.join(__dirname, "..", "lockbox.json"),
    path.join(tmpPlugin, "lockbox.json"),
  );

  process.env.CLAUDE_PLUGIN_ROOT = tmpPlugin;

  stdoutData = "";
  process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
    stdoutData += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(tmpPlugin, { recursive: true, force: true });
});

function hookInput(toolName: string, toolInput: Record<string, unknown> = {}, sessionId = "test-session", permissionMode?: string) {
  const input: Record<string, unknown> = { session_id: sessionId, tool_name: toolName, tool_input: toolInput };
  if (permissionMode) input.permission_mode = permissionMode;
  return JSON.stringify(input);
}

describe("hook-pre-tool-use", () => {
  it("safe tool passes through (no output)", () => {
    main(hookInput("Read"), tmpDir);
    expect(stdoutData).toBe("");
  });

  it("unsafe tool locks session but passes through", () => {
    main(hookInput("mcp__perplexity__perplexity_ask", {}, "taint-test"), tmpDir);
    expect(stdoutData).toBe("");
    const state = loadState("taint-test", tmpDir);
    expect(state.locked).toBe(true);
    expect(state.locked_by).toBe("mcp__perplexity__perplexity_ask");
  });

  it("acting tool passes through when session is clean", () => {
    main(hookInput("TaskStop"), tmpDir);
    expect(stdoutData).toBe("");
  });

  it("acting tool is blocked when session is locked", () => {
    // Lock the session first
    saveState("blocked-test", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("TaskStop", {}, "blocked-test"), tmpDir);
    const output = JSON.parse(stdoutData);
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("LOCKBOX");
    expect(output.reason).toContain("TaskStop");
  });

  it("unsafe_acting tool is allowed on first use and locks", () => {
    main(hookInput("WebFetch", { url: "https://example.com" }, "ua-test"), tmpDir);
    expect(stdoutData).toBe(""); // allowed
    const state = loadState("ua-test", tmpDir);
    expect(state.locked).toBe(true);
  });

  it("unsafe_acting tool is blocked when already locked", () => {
    saveState("ua-blocked", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("WebFetch", { url: "https://evil.com" }, "ua-blocked"), tmpDir);
    const output = JSON.parse(stdoutData);
    expect(output.decision).toBe("block");
  });

  it("bad stdin passes through without error", () => {
    expect(() => main("not json{{{", tmpDir)).not.toThrow();
    expect(stdoutData).toBe("");
  });

  it("block message includes lock source and blocked tool", () => {
    saveState("msg-test", {
      locked: true,
      locked_by: "Bash: curl https://evil.com",
      locked_at: "2025-06-01T12:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Bash", { command: "git push origin main" }, "msg-test"), tmpDir);
    const output = JSON.parse(stdoutData);
    expect(output.reason).toContain("Bash: curl https://evil.com");
    expect(output.reason).toContain("Bash: git push origin main");
    expect(output.reason).toContain("STOP");
    expect(output.reason).toContain("/lockbox:escape");
    expect(output.reason).toContain("delegate");
  });

  it("block message includes permissions warning when misconfigured", () => {
    vi.spyOn(permissions, "checkPermissions").mockReturnValue([
      "Task(lockbox:delegate) auto-allowed — delegate sub-agent executes without user review",
    ]);

    saveState("perm-test", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Bash", { command: "git push" }, "perm-test"), tmpDir);
    const output = JSON.parse(stdoutData);
    expect(output.reason).toContain("LOCKBOX PERMISSIONS NOT CONFIGURED");
    expect(output.reason).toContain("delegate");
    expect(output.reason).toContain("/lockbox:install");

    vi.restoreAllMocks();
  });

  it("block message has no permissions warning when configured correctly", () => {
    vi.spyOn(permissions, "checkPermissions").mockReturnValue([]);

    saveState("perm-ok", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(hookInput("Bash", { command: "git push" }, "perm-ok"), tmpDir);
    const output = JSON.parse(stdoutData);
    expect(output.reason).not.toContain("PERMISSIONS NOT CONFIGURED");

    vi.restoreAllMocks();
  });

  describe("dangerous mode (bypassPermissions)", () => {
    function lockSession(sessionId: string) {
      saveState(sessionId, {
        locked: true,
        locked_by: "WebFetch",
        locked_at: "2025-01-01T00:00:00Z",
        blocked_tools: [],
      }, tmpDir);
    }

    it("blocks acting tool with dangerous mode message when locked", () => {
      lockSession("danger-act");
      main(hookInput("Bash", { command: "git push" }, "danger-act", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("DANGEROUS MODE DETECTED");
      expect(output.reason).toContain("Switch to a safer permission mode");
      expect(output.reason).not.toContain("/lockbox:escape");
    });

    it("blocks delegate Task when locked + dangerous mode", () => {
      lockSession("danger-del");
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "danger-del", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("DANGEROUS MODE DETECTED");
      expect(output.reason).toContain("auto-approve");
    });

    it("allows delegate Task when locked + normal mode", () => {
      lockSession("normal-del");
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "normal-del", "acceptEdits"), tmpDir);
      expect(stdoutData).toBe("");
      expect(isDelegateActive("normal-del", tmpDir)).toBe(true);
    });

    it("allows unsafe tool in dangerous mode (still locks session)", () => {
      main(hookInput("mcp__perplexity__perplexity_ask", {}, "danger-unsafe", "bypassPermissions"), tmpDir);
      expect(stdoutData).toBe("");
      const state = loadState("danger-unsafe", tmpDir);
      expect(state.locked).toBe(true);
    });

    it("allows acting tool in dangerous mode when session is clean", () => {
      main(hookInput("TaskStop", {}, "danger-clean", "bypassPermissions"), tmpDir);
      expect(stdoutData).toBe("");
    });

    it("allows delegate Task when clean + dangerous mode (no lock = no block)", () => {
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "danger-clean-del", "bypassPermissions"), tmpDir);
      expect(stdoutData).toBe("");
    });

    it("blocks unsafe_acting tool when already locked in dangerous mode", () => {
      lockSession("danger-ua");
      main(hookInput("WebFetch", { url: "https://evil.com" }, "danger-ua", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("DANGEROUS MODE DETECTED");
    });

    it("dangerous mode message does not suggest delegation or /lockbox:escape", () => {
      lockSession("danger-msg");
      main(hookInput("Bash", { command: "git push" }, "danger-msg", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.reason).not.toContain("/lockbox:escape");
      expect(output.reason).not.toContain("lockbox:delegate");
      expect(output.reason).toContain("delegation is disabled");
    });

    it("records blocked tool in state during dangerous mode block", () => {
      lockSession("danger-state");
      main(hookInput("Bash", { command: "git push origin main" }, "danger-state", "bypassPermissions"), tmpDir);
      const state = loadState("danger-state", tmpDir);
      expect(state.blocked_tools).toContain("Bash: git push origin main");
    });

    it("records delegate Task in blocked_tools during dangerous mode block", () => {
      lockSession("danger-del-state");
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "danger-del-state", "bypassPermissions"), tmpDir);
      const state = loadState("danger-del-state", tmpDir);
      expect(state.blocked_tools).toContain("Task");
    });

    it("full flow: unsafe locks, then acting blocked in dangerous mode", () => {
      // Step 1: unsafe tool locks the session
      main(hookInput("mcp__perplexity__perplexity_ask", {}, "danger-flow", "bypassPermissions"), tmpDir);
      expect(stdoutData).toBe("");
      const state1 = loadState("danger-flow", tmpDir);
      expect(state1.locked).toBe(true);

      // Step 2: acting tool is blocked with dangerous mode message
      stdoutData = "";
      main(hookInput("Bash", { command: "git push" }, "danger-flow", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("DANGEROUS MODE DETECTED");
    });

    it("full flow: unsafe locks, then delegate blocked in dangerous mode", () => {
      // Step 1: unsafe tool locks the session
      main(hookInput("WebFetch", { url: "https://example.com" }, "danger-flow2", "bypassPermissions"), tmpDir);
      expect(stdoutData).toBe("");
      const state1 = loadState("danger-flow2", tmpDir);
      expect(state1.locked).toBe(true);

      // Step 2: delegate Task is blocked
      stdoutData = "";
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "danger-flow2", "bypassPermissions"), tmpDir);
      const output = JSON.parse(stdoutData);
      expect(output.decision).toBe("block");
      expect(output.reason).toContain("DANGEROUS MODE DETECTED");
      expect(output.reason).toContain("auto-approve");

      // Step 3: delegate does NOT start
      expect(isDelegateActive("danger-flow2", tmpDir)).toBe(false);
    });

    it("does not start delegate when blocked in dangerous mode", () => {
      lockSession("danger-no-del");
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push" }, "danger-no-del", "bypassPermissions"), tmpDir);
      expect(isDelegateActive("danger-no-del", tmpDir)).toBe(false);
    });
  });

  describe("delegate Task detection", () => {
    function lockSession(sessionId: string) {
      saveState(sessionId, {
        locked: true,
        locked_by: "WebFetch",
        locked_at: "2025-01-01T00:00:00Z",
        blocked_tools: [],
      }, tmpDir);
    }

    it("starts delegate when Task has subagent_type 'delegate' and session is locked", () => {
      lockSession("del-task-1");
      main(hookInput("Task", { subagent_type: "delegate", prompt: "push code" }, "del-task-1"), tmpDir);
      expect(stdoutData).toBe(""); // allowed through
      expect(isDelegateActive("del-task-1", tmpDir)).toBe(true);
      // State should be cleared for delegate
      const state = loadState("del-task-1", tmpDir);
      expect(state.locked).toBe(false);
    });

    it("starts delegate when Task has subagent_type 'lockbox:delegate' (namespaced)", () => {
      lockSession("del-task-ns");
      main(hookInput("Task", { subagent_type: "lockbox:delegate", prompt: "push code" }, "del-task-ns"), tmpDir);
      expect(stdoutData).toBe(""); // allowed through
      expect(isDelegateActive("del-task-ns", tmpDir)).toBe(true);
      const state = loadState("del-task-ns", tmpDir);
      expect(state.locked).toBe(false);
    });

    it("does not start delegate for non-delegate Task", () => {
      lockSession("del-task-2");
      main(hookInput("Task", { subagent_type: "general-purpose", prompt: "research" }, "del-task-2"), tmpDir);
      expect(stdoutData).toBe(""); // Task is safe, passes through
      expect(isDelegateActive("del-task-2", tmpDir)).toBe(false);
      // State should still be locked
      const state = loadState("del-task-2", tmpDir);
      expect(state.locked).toBe(true);
    });

    it("does not start delegate when session is clean", () => {
      main(hookInput("Task", { subagent_type: "delegate", prompt: "push code" }, "del-task-3"), tmpDir);
      expect(stdoutData).toBe(""); // allowed through
      expect(isDelegateActive("del-task-3", tmpDir)).toBe(false);
    });

    it("Task without subagent_type passes through normally", () => {
      lockSession("del-task-4");
      main(hookInput("Task", { prompt: "do something" }, "del-task-4"), tmpDir);
      expect(stdoutData).toBe(""); // Task is safe
      expect(isDelegateActive("del-task-4", tmpDir)).toBe(false);
    });
  });

});
