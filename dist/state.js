import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const DEFAULT_STATE = {
    locked: false,
    locked_by: null,
    locked_at: null,
    blocked_tools: [],
};
export function getStatePath(sessionId, tmpDir = os.tmpdir()) {
    return path.join(tmpDir, `lockbox-state-${sessionId}.json`);
}
export function loadState(sessionId, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    try {
        const data = fs.readFileSync(p, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return { ...DEFAULT_STATE, blocked_tools: [] };
    }
}
export function saveState(sessionId, state, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    fs.writeFileSync(p, JSON.stringify(state, null, 2));
}
export function deleteState(sessionId, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    try {
        fs.unlinkSync(p);
    }
    catch {
        // file may not exist — that's fine
    }
}
