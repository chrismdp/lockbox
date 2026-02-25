"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStatePath = getStatePath;
exports.loadState = loadState;
exports.saveState = saveState;
exports.deleteState = deleteState;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const DEFAULT_STATE = {
    locked: false,
    locked_by: null,
    locked_at: null,
    blocked_tools: [],
};
function getStatePath(sessionId, tmpDir = os.tmpdir()) {
    return path.join(tmpDir, `lockbox-state-${sessionId}.json`);
}
function loadState(sessionId, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    try {
        const data = fs.readFileSync(p, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return { ...DEFAULT_STATE, blocked_tools: [] };
    }
}
function saveState(sessionId, state, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    fs.writeFileSync(p, JSON.stringify(state, null, 2));
}
function deleteState(sessionId, tmpDir) {
    const p = getStatePath(sessionId, tmpDir);
    try {
        fs.unlinkSync(p);
    }
    catch {
        // file may not exist — that's fine
    }
}
