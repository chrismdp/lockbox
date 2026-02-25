import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LockboxState } from "./types.js";

const DEFAULT_STATE: LockboxState = {
  locked: false,
  locked_by: null,
  locked_at: null,
  blocked_tools: [],
};

export function getStatePath(
  sessionId: string,
  tmpDir: string = os.tmpdir(),
): string {
  return path.join(tmpDir, `lockbox-state-${sessionId}.json`);
}

export function loadState(
  sessionId: string,
  tmpDir?: string,
): LockboxState {
  const p = getStatePath(sessionId, tmpDir);
  try {
    const data = fs.readFileSync(p, "utf-8");
    return JSON.parse(data) as LockboxState;
  } catch {
    return { ...DEFAULT_STATE, blocked_tools: [] };
  }
}

export function saveState(
  sessionId: string,
  state: LockboxState,
  tmpDir?: string,
): void {
  const p = getStatePath(sessionId, tmpDir);
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

export function deleteState(
  sessionId: string,
  tmpDir?: string,
): void {
  const p = getStatePath(sessionId, tmpDir);
  try {
    fs.unlinkSync(p);
  } catch {
    // file may not exist — that's fine
  }
}
