# Lockbox

Claude Code security quarantine plugin. Classifies tool calls as safe/unsafe/acting and blocks external actions when a session contains untrusted data.

## Build & Test

```bash
npm run build    # tsc
npm test         # vitest run
```

## Local Development

Use `--plugin-dir` to load lockbox directly from source without caching:

```bash
claude --plugin-dir /home/cp/code/lockbox
```

This avoids the plugin cache entirely — no risk of stale files or rogue `settings.json` leaking into `~/.claude/plugins/cache/`. Edit code, `npm run build`, restart Claude Code. Do not use a local marketplace for development — plugin `settings.json` files are loaded from the cache and can silently override permissions.

## Releasing

After pushing, always ask: patch, minor, or major?
- **Patch** (0.10.3 → 0.10.4, or 0.10.9 → 0.10.10): Bug fixes, config pattern additions
- **Minor** (0.10.x → 0.11.0): New features, hook changes, new classification categories
- **Major** (0.x → 1.0): Breaking config format changes

Patch numbers are not limited to single digits — 0.10.9 → 0.10.10 is valid. Only bump the minor version for genuinely new features.

Bump version in all three places, commit with "Bump version to X.Y.Z", and push:
- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

After pushing, create a GitHub release and update the remote marketplace:
```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes here"
```

Then update `chrismdp/claude-marketplace` — bump the lockbox version in `.claude-plugin/marketplace.json`, commit, and push.

Always add a changelog entry to the `## Changelog` section in `README.md` for every release.

## Updating Rules at Runtime

When a command is wrongly blocked, the user needs to add a safe pattern to `~/.claude/lockbox.json`. The current session can't do this itself — editing lockbox config from a locked session is classified as `acting` (tamper resistance). The user runs a separate Claude Code session or terminal to update the rules. The `/lockbox:classify` skill guides users through what to add.

**Known limitation:** delegate sessions start clean, so they *could* edit lockbox config. This is mitigated by the user reviewing the delegate prompt — they'd see any attempt to weaken rules. A hard block on config edits regardless of state is a future option.

## Architecture

- `src/classify.ts` — Pattern matching and command classification
- `src/config.ts` — 3-layer config loading (plugin defaults → user → project)
- `src/hook-pre-tool-use.ts` — Main enforcement hook (blocks acting when locked)
- `src/hook-post-tool-use.ts` — Taint propagation from subagents
- `src/state.ts` — Session lock state in `/tmp/lockbox-state-{id}.json`
- `lockbox.json` — Default classification patterns

## Classification Categories

| Category | When clean | When locked |
|----------|-----------|-------------|
| safe | allowed | allowed |
| unsafe | allowed, locks session | allowed |
| acting | allowed | **blocked** |
| unsafe_acting | allowed, locks session | **blocked** |

Unknown bash commands default to `acting`. Priority order: override_safe → unsafe_acting → unsafe → acting → safe.

## Adding Patterns

Edit `lockbox.json`. Patterns are regex tested against the bash command string. For piped/chained commands, each segment is classified independently — if any segment is unsafe AND any is acting, the whole command becomes unsafe_acting.

**Default patterns must be generic** — no user-specific CLI tools (e.g. `gog`) in `lockbox.json`. User-specific tools belong in `~/.claude/lockbox.json`. The skills guide sessions to add patterns there when commands are wrongly blocked.

## Shell Parsing Pitfalls

`splitCommand` splits on `|`, `&`, `;` — but must not split on `>&` (redirect syntax like `2>&1`). When adding new splitting logic, test against common shell redirect patterns.
