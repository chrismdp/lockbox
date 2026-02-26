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
export function findLockedSessions(excludeSessionId, tmpDir = os.tmpdir()) {
    const locked = [];
    let files;
    try {
        files = fs.readdirSync(tmpDir);
    }
    catch {
        return locked;
    }
    const prefix = "lockbox-state-";
    const suffix = ".json";
    for (const file of files) {
        if (!file.startsWith(prefix) || !file.endsWith(suffix))
            continue;
        const sessionId = file.slice(prefix.length, -suffix.length);
        if (sessionId === excludeSessionId)
            continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(tmpDir, file), "utf-8"));
            if (data.locked === true)
                locked.push(sessionId);
        }
        catch {
            // corrupt or unreadable — skip
        }
    }
    return locked;
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
// --- Delegate state management ---
function getDelegateMarkerPath(sessionId, tmpDir = os.tmpdir()) {
    return path.join(tmpDir, `lockbox-delegate-${sessionId}.active`);
}
function getBackupPath(sessionId, tmpDir = os.tmpdir()) {
    return path.join(tmpDir, `lockbox-state-${sessionId}.delegate-backup.json`);
}
export function isDelegateActive(sessionId, tmpDir) {
    return fs.existsSync(getDelegateMarkerPath(sessionId, tmpDir));
}
export function startDelegate(sessionId, tmpDir) {
    const marker = getDelegateMarkerPath(sessionId, tmpDir);
    // Idempotent: if already active, don't double-backup
    if (fs.existsSync(marker))
        return;
    // Backup current state (may be locked or clean)
    const statePath = getStatePath(sessionId, tmpDir);
    const backupPath = getBackupPath(sessionId, tmpDir);
    try {
        fs.copyFileSync(statePath, backupPath);
    }
    catch {
        // No state file to backup — delegate starts clean anyway
    }
    // Clear state so delegate starts clean
    deleteState(sessionId, tmpDir);
    // Set marker
    fs.writeFileSync(marker, "");
}
export function stopDelegate(sessionId, tmpDir) {
    const marker = getDelegateMarkerPath(sessionId, tmpDir);
    // Only restore if delegate was active
    if (!fs.existsSync(marker))
        return;
    // Delete delegate's accumulated state
    deleteState(sessionId, tmpDir);
    // Restore parent's backed-up state
    const backupPath = getBackupPath(sessionId, tmpDir);
    const statePath = getStatePath(sessionId, tmpDir);
    try {
        fs.copyFileSync(backupPath, statePath);
        fs.unlinkSync(backupPath);
    }
    catch {
        // No backup — parent was clean, nothing to restore
    }
    // Remove marker
    try {
        fs.unlinkSync(marker);
    }
    catch {
        // already removed
    }
}
