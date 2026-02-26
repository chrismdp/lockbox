import * as fs from "fs";
import { stopDelegate } from "./state.js";
export function main(stdinData, tmpDir) {
    let input;
    try {
        const raw = stdinData ?? fs.readFileSync(0, "utf-8");
        input = JSON.parse(raw);
    }
    catch {
        return;
    }
    if (input.agent_type !== "delegate" && input.agent_type !== "lockbox:delegate")
        return;
    const sessionId = input.session_id ?? "unknown";
    stopDelegate(sessionId, tmpDir);
}
const isEntry = process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isEntry)
    main();
