# Lockbox

Taint-aware context quarantine for Claude Code. Blocks external actions when untrusted data enters your session. Read the [announcement blog post](https://chrismdp.com/lockbox-prompt-injection-defence/) for the full security model and why it matters.

<img src="lockbox.jpg" alt="Lockbox: agent reads untrusted content, session taints, actions blocked, plan mode escape hatch, clean agent executes" />

## The problem

AI agents that read external content can be tricked into taking actions you did not intend. A web page, an email, or an API response can contain hidden instructions that tell your agent to exfiltrate data, send messages, or run destructive commands.

Permission prompts do not help. You approve 85 commands correctly, stop reading the prompts, and rubber-stamp the 86th, which is the one that emails your SSH keys to an attacker. Security research calls this approval theatre: the more often a prompt is correct, the less attention you pay to it.

Simon Willison calls the combination of **private data**, **untrusted content**, and **external communication** the [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/). When all three exist in the same session, you have a data exfiltration system. Claude Code sessions routinely have all three.

## What lockbox does

Lockbox automatically detects when untrusted data enters your Claude Code session and blocks external actions until you review a plan in a clean context.

1. **You read something external** (WebFetch, curl, Perplexity) and lockbox marks your session as tainted
2. **You keep working normally** because file reads, writes, edits, searches, and local Bash all still work
3. **You try to take an external action** (git push, send email, deploy) and lockbox blocks it
4. **You enter plan mode** and write out exactly what you want to do with all concrete data inline
5. **You clear context** so Claude Code starts fresh from your plan, with no tainted data in the conversation
6. **The clean agent executes your plan** and external actions proceed safely

The harness detects the taint, not the agent. This matters because by the time untrusted data enters the conversation, the agent may already be compromised. Lockbox does not ask the agent whether it has been influenced. It tracks what the agent has been exposed to and restricts what it can do next.

## Install

### 1. Add the plugin

Install lockbox from the [Claude Code marketplace](https://github.com/chrismdp/claude-marketplace):

```
claude mcp add-from-claude-marketplace lockbox
```

### 2. Allow WebFetch

Open `~/.claude/settings.json` and add `WebFetch` to your global allow list:

```json
{
  "permissions": {
    "allow": [
      "WebFetch"
    ]
  }
}
```

Without lockbox, allowing unrestricted WebFetch is risky — a compromised agent could fetch attacker-controlled content and then act on it. With lockbox, the fetch taints the session and all external actions are blocked until you clear context through plan mode. The damage path is cut, so the fetch is safe.

### 3. Use Claude Code normally

There is nothing else to configure. Lockbox runs automatically in the background. You will only notice it when it blocks an external action after untrusted data has entered your session.

This is the counterintuitive result: lockbox makes your agent **more** useful, not less. Without it, you either block external reads entirely or approve each one manually and hope you catch the bad one. With lockbox, approve them all. The system prevents the damage regardless.

## How it works

### Categories

Every tool and Bash command falls into one of four categories:

| Category | What it does | Blocked when tainted? | Examples |
|---|---|---|---|
| **safe** | Local read/write operations | Never | Read, Write, Edit, Grep, Glob, git status |
| **unsafe** | Reads external data | Never (but taints the session) | WebFetch, Perplexity, curl |
| **acting** | Takes external action | Yes | git push, ssh, npm publish, send email |
| **unsafe_acting** | Reads external AND acts | Yes (after first use) | curl piped to external service |

### Tainting

Session state lives in `/tmp/lockbox-state-{session_id}.json`. When any `unsafe` tool runs, lockbox sets `locked: true` and records what caused it. From that point, all `acting` tools are blocked before execution with a message explaining why and what to do next.

Detection happens at the harness level through a `PreToolUse` hook. The hook fires before the tool executes, checks session state, and returns a block decision if the session is tainted. The agent never gets a chance to run the blocked tool.

### Pattern priority

For Bash commands, lockbox classifies by checking patterns in this order:

1. `override_safe` (e.g. `--help` on any command)
2. `unsafe_acting` (e.g. curl, wget)
3. `unsafe` (external reads)
4. `acting` (e.g. git push, ssh, sudo)
5. `safe` (local file operations, git status)
6. Default: `acting` (unknown commands are blocked when tainted)

For piped or chained commands (`|`, `&`, `;`), each segment is classified independently. If any segment is `unsafe` and any segment is `acting`, the whole command is classified as `unsafe_acting`.

User patterns prepend to built-in lists, so they are checked first and take priority.

### Configuration

Lockbox uses a three-layer configuration hierarchy. Each layer can add patterns or remove them:

| Layer | File | Scope |
|---|---|---|
| Plugin defaults | `lockbox.json` | Ships with lockbox |
| User overrides | `~/.claude/lockbox.json` | All your projects |
| Project overrides | `.claude/lockbox.json` | This project only, committable |

Later layers override earlier ones. Within each category's pattern list:

- New patterns **prepend** to the base list (checked first, higher priority)
- Patterns prefixed with `!` **remove** matching entries from the base list
- Scalar values like `mcp_default` use last-writer-wins

Example user override (`~/.claude/lockbox.json`):

```json
{
  "bash_patterns": {
    "safe": ["mytool\\s+(list|get|status)"],
    "acting": ["mytool\\s+(deploy|rollback|send)"],
    "unsafe": ["mytool\\s+(fetch|download)"]
  },
  "mcp_tools": {
    "mcp__slack__post_message": "acting"
  }
}
```

To remove a plugin default pattern, prefix it with `!`:

```json
{
  "bash_patterns": {
    "safe": ["!^(rm|mv|cp|mkdir)\\s"]
  }
}
```

See [`lockbox.example.json`](lockbox.example.json) for a minimal starter config.

### Plan mode escape hatch

When lockbox blocks an action, you can still get it done:

1. Enter plan mode (`/plan` or `EnterPlanMode`)
2. Write a plan with **all concrete data inline**: exact email bodies, branch names, URLs. No vague references like "the email" or "the page"
3. Order phases: safe actions first, then acting, then unsafe
4. Exit plan mode and select "Clear context and bypass permissions"
5. Claude Code starts fresh from your plan with no tainted data in conversation

The clean agent executes from a plan written by you, not from a conversation that may contain adversarial instructions.

## Get involved

Lockbox is early and actively developed. Every team has different tools and every workflow surfaces new patterns.

- **Try it** and use Claude Code normally
- **Open issues** at [github.com/chrismdp/claude-marketplace](https://github.com/chrismdp/claude-marketplace) for bugs, feature requests, and pattern suggestions
- **Give me feedback**: what got blocked that should not have? What got through that should not have?
- **Contribute patterns** for tools lockbox does not classify yet

## Background

Lockbox implements ideas from several lines of research on prompt injection defence:

- [The lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) (Simon Willison, 2025): private data + untrusted content + external communication = exfiltration
- [CaMeL](https://arxiv.org/abs/2503.18813) (Google DeepMind, 2025): separates control flow from data flow with capability-based security
- [Design Patterns for Securing LLM Agents](https://arxiv.org/abs/2506.08837) (2025): six patterns including plan-then-execute and dual LLM
- [The Dual LLM pattern](https://simonwillison.net/2023/Apr/25/dual-llm-pattern/) (Simon Willison, 2023): privileged vs quarantined LLM separation

See the [full blog post](https://chrismdp.com/lockbox-prompt-injection-defence/) for a detailed explanation of the security model and why it matters.
