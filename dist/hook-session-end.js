import * as fs from "fs";
import { deleteState } from "./state.js";
export function main(stdinData, tmpDir) {
    let hookInput;
    try {
        const raw = stdinData ?? fs.readFileSync(0, "utf-8");
        hookInput = JSON.parse(raw);
    }
    catch {
        return; // ignore bad input
    }
    if (hookInput.reason !== "clear")
        return;
    const sessionId = hookInput.session_id ?? "unknown";
    deleteState(sessionId, tmpDir);
}
const isEntry = process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntry)
    main();
