import * as fs from "fs";
import { HookInput } from "./types";
import { deleteState } from "./state";

export function main(stdinData?: string, tmpDir?: string): void {
  let hookInput: HookInput;
  try {
    const raw = stdinData ?? fs.readFileSync(0, "utf-8");
    hookInput = JSON.parse(raw);
  } catch {
    return; // ignore bad input
  }

  if (hookInput.reason !== "clear") return;

  const sessionId = hookInput.session_id ?? "unknown";
  deleteState(sessionId, tmpDir);
}

/* istanbul ignore next */
if (require.main === module) {
  main();
}
