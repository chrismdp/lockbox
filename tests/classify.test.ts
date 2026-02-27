import { describe, it, expect } from "vitest";
import { LockboxConfig } from "../src/types";
import {
  classifyTool,
  classifyBash,
  classifyBashSegment,
  splitCommand,
  toolDescription,
} from "../src/classify";

const CONFIG: LockboxConfig = {
  tools: {
    safe: ["Read", "Write", "Edit", "Glob", "Grep"],
    acting: ["TaskStop", "SendMessage"],
    unsafe: [],
    unsafe_acting: ["WebFetch"],
  },
  mcp_tools: {
    "mcp__perplexity__perplexity_search": "safe",
    "mcp__perplexity__perplexity_ask": "unsafe",
    "mcp__nanoclaw__send_message": "acting",
  },
  mcp_default: "acting",
  bash_patterns: {
    override_safe: ["--help", "--version"],
    unsafe_acting: ["curl\\s", "wget\\s"],
    unsafe: [],
    acting: [
      "lockbox-state",
      "git\\s+(push|rebase)",
      "ssh\\s",
      "npm\\s+publish",
    ],
    safe: [
      "^(date|ls|cat|head|tail|wc|find|grep|rg)(\\s|$)",
      "^(echo|printf|tee|touch|sort|uniq|tr|cut|xargs)(\\s|$)",
      "^(timeout|time|env|which|type|file|stat|readlink)(\\s|$)",
      "^(rm|mv|cp|mkdir)\\s",
      "git\\s+(status|log|diff|show|branch|add|commit|stash|fetch|tag|remote|reset)",
    ],
  },
};

describe("classifyTool", () => {
  it("classifies safe built-in tools", () => {
    expect(classifyTool("Read", {}, CONFIG)).toBe("safe");
    expect(classifyTool("Write", {}, CONFIG)).toBe("safe");
    expect(classifyTool("Edit", {}, CONFIG)).toBe("safe");
    expect(classifyTool("Glob", {}, CONFIG)).toBe("safe");
    expect(classifyTool("Grep", {}, CONFIG)).toBe("safe");
  });

  it("classifies acting built-in tools", () => {
    expect(classifyTool("TaskStop", {}, CONFIG)).toBe("acting");
    expect(classifyTool("SendMessage", {}, CONFIG)).toBe("acting");
  });

  it("classifies unsafe_acting built-in tools", () => {
    expect(classifyTool("WebFetch", {}, CONFIG)).toBe("unsafe_acting");
  });

  it("classifies MCP tools by exact match", () => {
    expect(classifyTool("mcp__perplexity__perplexity_search", {}, CONFIG)).toBe("safe");
    expect(classifyTool("mcp__perplexity__perplexity_ask", {}, CONFIG)).toBe("unsafe");
    expect(classifyTool("mcp__nanoclaw__send_message", {}, CONFIG)).toBe("acting");
  });

  it("classifies unknown MCP tools using mcp_default", () => {
    expect(classifyTool("mcp__unknown__tool", {}, CONFIG)).toBe("acting");
  });

  it("classifies unknown non-MCP tools as acting", () => {
    expect(classifyTool("SomeNewTool", {}, CONFIG)).toBe("acting");
  });

  it("reclassifies Edit/Write to lockbox files as acting (tamper resistance)", () => {
    expect(classifyTool("Edit", { file_path: "/home/user/.claude/lockbox.json", old_string: "x", new_string: "y" }, CONFIG)).toBe("acting");
    expect(classifyTool("Write", { file_path: "/home/user/.claude/lockbox.json", content: "{}" }, CONFIG)).toBe("acting");
    expect(classifyTool("Edit", { file_path: "/tmp/lockbox-state-abc123.json", old_string: "x", new_string: "y" }, CONFIG)).toBe("acting");
    expect(classifyTool("Write", { file_path: "/project/.claude/lockbox.json", content: "{}" }, CONFIG)).toBe("acting");
  });

  it("does not block Edit/Write to non-lockbox files", () => {
    expect(classifyTool("Edit", { file_path: "/home/user/project/src/main.ts", old_string: "x", new_string: "y" }, CONFIG)).toBe("safe");
    expect(classifyTool("Write", { file_path: "/home/user/notes.md", content: "hello" }, CONFIG)).toBe("safe");
  });

  it("classifies Read of Claude session transcripts as unsafe", () => {
    expect(classifyTool("Read", { file_path: "/home/user/.claude/projects/foo/abc123.jsonl" }, CONFIG)).toBe("unsafe");
    expect(classifyTool("Read", { file_path: "/home/user/.claude/projects/foo/subagents/agent-xyz.jsonl" }, CONFIG)).toBe("unsafe");
  });

  it("classifies Grep/Glob targeting .claude session dirs as unsafe", () => {
    expect(classifyTool("Grep", { path: "/home/user/.claude/projects/foo/", pattern: "secret" }, CONFIG)).toBe("unsafe");
    expect(classifyTool("Glob", { path: "/home/user/.claude/projects/", pattern: "*.jsonl" }, CONFIG)).toBe("unsafe");
  });

  it("does not classify Read of non-session .jsonl as unsafe", () => {
    expect(classifyTool("Read", { file_path: "/home/user/project/data.jsonl" }, CONFIG)).toBe("safe");
  });

  it("does not classify Read of .claude non-jsonl files as unsafe", () => {
    expect(classifyTool("Read", { file_path: "/home/user/.claude/settings.json" }, CONFIG)).toBe("safe");
  });

  it("delegates Bash to classifyBash", () => {
    expect(classifyTool("Bash", { command: "ls -la" }, CONFIG)).toBe("safe");
    expect(classifyTool("Bash", { command: "git push origin main" }, CONFIG)).toBe("acting");
    expect(classifyTool("Bash", { command: "curl https://example.com" }, CONFIG)).toBe("unsafe_acting");
  });
});

describe("splitCommand", () => {
  it("splits on pipe", () => {
    expect(splitCommand("cat file | grep foo")).toEqual(["cat file", "grep foo"]);
  });

  it("splits on semicolon", () => {
    expect(splitCommand("echo a; echo b")).toEqual(["echo a", "echo b"]);
  });

  it("splits on ampersand", () => {
    expect(splitCommand("cmd1 && cmd2")).toEqual(["cmd1", "cmd2"]);
  });

  it("does not split inside double quotes", () => {
    expect(splitCommand('grep "a|b" file')).toEqual(['grep "a|b" file']);
  });

  it("does not split inside single quotes", () => {
    expect(splitCommand("grep 'a|b' file")).toEqual(["grep 'a|b' file"]);
  });

  it("handles escaped characters", () => {
    expect(splitCommand("echo hello\\|world")).toEqual(["echo hello\\|world"]);
  });

  it("handles the quoted-pipe grep bug case", () => {
    // This was a real bug: \| inside double quotes was being split
    const cmd = 'grep -ri telegram /plans/ -l 2>/dev/null; grep -ri "heartbeat\\|telegram" /home/.claude/';
    const segments = splitCommand(cmd);
    expect(segments).toEqual([
      "grep -ri telegram /plans/ -l 2>/dev/null",
      'grep -ri "heartbeat\\|telegram" /home/.claude/',
    ]);
  });

  it("does not split on >& redirect (2>&1 bug)", () => {
    expect(splitCommand("gog gmail get --help 2>&1 | head -20")).toEqual([
      "gog gmail get --help 2>&1",
      "head -20",
    ]);
  });

  it("does not split on >& in stderr redirect", () => {
    expect(splitCommand("cmd 2>&1")).toEqual(["cmd 2>&1"]);
  });

  it("still splits on standalone &", () => {
    expect(splitCommand("cmd1 && cmd2")).toEqual(["cmd1", "cmd2"]);
  });

  it("handles empty input", () => {
    expect(splitCommand("")).toEqual([]);
  });
});

describe("classifyBashSegment", () => {
  const patterns = CONFIG.bash_patterns;

  it("override_safe takes priority", () => {
    expect(classifyBashSegment("curl --help", patterns)).toBe("safe");
    expect(classifyBashSegment("gog --version 2>&1", patterns)).toBe("safe");
  });

  it("unsafe_acting patterns", () => {
    expect(classifyBashSegment("curl https://example.com", patterns)).toBe("unsafe_acting");
    expect(classifyBashSegment("wget https://example.com", patterns)).toBe("unsafe_acting");
  });

  it("acting patterns", () => {
    expect(classifyBashSegment("git push origin main", patterns)).toBe("acting");
    expect(classifyBashSegment("ssh user@host", patterns)).toBe("acting");
    expect(classifyBashSegment("npm publish", patterns)).toBe("acting");
  });

  it("safe patterns", () => {
    expect(classifyBashSegment("ls -la", patterns)).toBe("safe");
    expect(classifyBashSegment("grep foo bar.txt", patterns)).toBe("safe");
    expect(classifyBashSegment("echo hello", patterns)).toBe("safe");
    expect(classifyBashSegment("git status", patterns)).toBe("safe");
    expect(classifyBashSegment("git commit -m 'msg'", patterns)).toBe("safe");
    expect(classifyBashSegment("rm -rf build/", patterns)).toBe("safe");
  });

  it("unknown commands default to acting", () => {
    expect(classifyBashSegment("someunknowntool --flag", patterns)).toBe("acting");
  });

  it("lockbox-state commands are classified as acting (tamper resistance)", () => {
    expect(classifyBashSegment("cat /tmp/lockbox-state-abc.json", patterns)).toBe("acting");
    expect(classifyBashSegment("cat > /tmp/lockbox-state-abc.json", patterns)).toBe("acting");
    expect(classifyBashSegment("rm /tmp/lockbox-state-abc.json", patterns)).toBe("acting");
    expect(classifyBashSegment("echo '{}' > /tmp/lockbox-state-abc.json", patterns)).toBe("acting");
  });
});

describe("classifyBash", () => {
  const patterns = CONFIG.bash_patterns;

  it("safe | safe = safe", () => {
    expect(classifyBash("ls -la | grep foo", patterns)).toBe("safe");
  });

  it("unsafe | safe = unsafe", () => {
    expect(classifyBash("curl http://x ; ls", patterns)).toBe("unsafe_acting");
    // curl is unsafe_acting, so has_unsafe=true and has_acting=true
  });

  it("safe ; acting = acting", () => {
    expect(classifyBash("ls; git push origin main", patterns)).toBe("acting");
  });

  it("unsafe_acting alone = unsafe_acting", () => {
    expect(classifyBash("curl http://x", patterns)).toBe("unsafe_acting");
  });

  it("which && --version is safe (bug regression)", () => {
    expect(classifyBash("which gog && gog --version 2>&1", patterns)).toBe("safe");
  });

  it("quoted pipe in grep does not split (bug regression)", () => {
    // The \| inside quotes must not be treated as a pipe
    const cmd = 'grep -ri "heartbeat\\|telegram" /home/.claude/plans/';
    expect(classifyBash(cmd, patterns)).toBe("safe");
  });
});

describe("toolDescription", () => {
  it("formats Bash commands with truncation", () => {
    expect(toolDescription("Bash", { command: "ls -la" })).toBe("Bash: ls -la");
  });

  it("truncates long Bash commands to 120 chars", () => {
    const long = "x".repeat(200);
    expect(toolDescription("Bash", { command: long })).toBe(`Bash: ${"x".repeat(120)}`);
  });

  it("returns tool name for non-Bash tools", () => {
    expect(toolDescription("Read", {})).toBe("Read");
  });
});
