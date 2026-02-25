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
exports.mergeList = mergeList;
exports.mergeConfigs = mergeConfigs;
exports.loadConfig = loadConfig;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function mergeList(base, overlay) {
    const removals = new Set(overlay.filter((s) => s.startsWith("!")).map((s) => s.slice(1)));
    const additions = overlay.filter((s) => !s.startsWith("!"));
    const filtered = base.filter((s) => !removals.has(s));
    return [...additions, ...filtered];
}
function mergeConfigs(base, overlay) {
    // Scalar: last writer wins
    const mcp_default = overlay.mcp_default ?? base.mcp_default ?? "acting";
    // Dict: overlay keys overwrite base keys
    const mcp_tools = {
        ...(base.mcp_tools ?? {}),
        ...(overlay.mcp_tools ?? {}),
    };
    // List groups: merge each category
    const tools = {};
    const allToolKeys = new Set([
        ...Object.keys(base.tools ?? {}),
        ...Object.keys(overlay.tools ?? {}),
    ]);
    for (const k of allToolKeys) {
        tools[k] = mergeList((base.tools ?? {})[k] ?? [], (overlay.tools ?? {})[k] ?? []);
    }
    const bash_patterns = {};
    const allBashKeys = new Set([
        ...Object.keys(base.bash_patterns ?? {}),
        ...Object.keys(overlay.bash_patterns ?? {}),
    ]);
    for (const k of allBashKeys) {
        bash_patterns[k] = mergeList((base.bash_patterns ?? {})[k] ?? [], (overlay.bash_patterns ?? {})[k] ?? []);
    }
    return { tools, mcp_tools, mcp_default, bash_patterns };
}
function loadConfig(opts) {
    const pluginRoot = opts?.pluginRoot ??
        process.env.CLAUDE_PLUGIN_ROOT ??
        path.resolve(__dirname, "..");
    const homeDir = opts?.homeDir ?? os.homedir();
    const cwd = opts?.cwd ?? process.cwd();
    const defaultsPath = path.join(pluginRoot, "scripts", "lockbox-defaults.json");
    const base = JSON.parse(fs.readFileSync(defaultsPath, "utf-8"));
    const overridePaths = [
        path.join(homeDir, ".claude", "lockbox.json"),
        path.join(cwd, ".claude", "lockbox.json"),
    ];
    let config = base;
    for (const p of overridePaths) {
        try {
            const data = fs.readFileSync(p, "utf-8");
            config = mergeConfigs(config, JSON.parse(data));
        }
        catch {
            // file missing or invalid — skip
        }
    }
    return config;
}
