import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { main } from "../src/hook-session-end";
import { saveState, getStatePath } from "../src/state";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-end-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("hook-session-end", () => {
  it("deletes state on reason=clear", () => {
    saveState("clear-test", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    const p = getStatePath("clear-test", tmpDir);
    expect(fs.existsSync(p)).toBe(true);

    main(JSON.stringify({ session_id: "clear-test", reason: "clear" }), tmpDir);
    expect(fs.existsSync(p)).toBe(false);
  });

  it("leaves state on non-clear reason", () => {
    saveState("keep-test", {
      locked: true,
      locked_by: "WebFetch",
      locked_at: "2025-01-01T00:00:00Z",
      blocked_tools: [],
    }, tmpDir);

    main(JSON.stringify({ session_id: "keep-test", reason: "exit" }), tmpDir);
    const p = getStatePath("keep-test", tmpDir);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("does not error when state file is missing", () => {
    expect(() =>
      main(JSON.stringify({ session_id: "missing", reason: "clear" }), tmpDir),
    ).not.toThrow();
  });

  it("does not error on bad stdin", () => {
    expect(() => main("not json{{{", tmpDir)).not.toThrow();
  });
});
