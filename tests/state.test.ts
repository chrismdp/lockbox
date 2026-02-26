import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getStatePath, loadState, saveState, deleteState, findLockedSessions } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getStatePath", () => {
  it("uses tmpDir and session id", () => {
    const p = getStatePath("abc123", tmpDir);
    expect(p).toBe(path.join(tmpDir, "lockbox-state-abc123.json"));
  });
});

describe("loadState", () => {
  it("returns default state when file is missing", () => {
    const state = loadState("missing", tmpDir);
    expect(state).toEqual({
      locked: false,
      locked_by: null,
      locked_at: null,
      blocked_tools: [],
    });
  });

  it("loads valid state file", () => {
    const data = {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: ["Bash: git push"],
    };
    fs.writeFileSync(
      path.join(tmpDir, "lockbox-state-valid.json"),
      JSON.stringify(data),
    );
    const state = loadState("valid", tmpDir);
    expect(state).toEqual(data);
  });

  it("returns default state on corrupt JSON", () => {
    fs.writeFileSync(
      path.join(tmpDir, "lockbox-state-corrupt.json"),
      "not json{{{",
    );
    const state = loadState("corrupt", tmpDir);
    expect(state.locked).toBe(false);
  });
});

describe("saveState", () => {
  it("roundtrips with loadState", () => {
    const data = {
      locked: true,
      locked_by: "curl",
      locked_at: "2025-06-01T12:00:00Z",
      blocked_tools: ["Bash: ssh user@host"],
    };
    saveState("rt", data, tmpDir);
    const loaded = loadState("rt", tmpDir);
    expect(loaded).toEqual(data);
  });
});

describe("deleteState", () => {
  it("deletes existing state file", () => {
    saveState("del", { locked: true, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    const p = getStatePath("del", tmpDir);
    expect(fs.existsSync(p)).toBe(true);
    deleteState("del", tmpDir);
    expect(fs.existsSync(p)).toBe(false);
  });

  it("does not throw when file is missing", () => {
    expect(() => deleteState("nope", tmpDir)).not.toThrow();
  });
});

describe("findLockedSessions", () => {
  it("finds locked sessions excluding own", () => {
    saveState("parent", { locked: false, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    saveState("child-1", { locked: true, locked_by: "WebFetch", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);
    saveState("child-2", { locked: true, locked_by: "curl", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);

    const result = findLockedSessions("parent", tmpDir);
    expect(result).toContain("child-1");
    expect(result).toContain("child-2");
    expect(result).not.toContain("parent");
  });

  it("excludes own session even if locked", () => {
    saveState("self", { locked: true, locked_by: "WebFetch", locked_at: "2025-01-01T00:00:00Z", blocked_tools: [] }, tmpDir);
    const result = findLockedSessions("self", tmpDir);
    expect(result).toEqual([]);
  });

  it("ignores unlocked sessions", () => {
    saveState("clean", { locked: false, locked_by: null, locked_at: null, blocked_tools: [] }, tmpDir);
    const result = findLockedSessions("parent", tmpDir);
    expect(result).toEqual([]);
  });

  it("handles corrupt state files gracefully", () => {
    fs.writeFileSync(path.join(tmpDir, "lockbox-state-corrupt.json"), "not json{{{");
    const result = findLockedSessions("parent", tmpDir);
    expect(result).toEqual([]);
  });

  it("handles missing tmpDir gracefully", () => {
    const result = findLockedSessions("parent", "/nonexistent/path");
    expect(result).toEqual([]);
  });
});
