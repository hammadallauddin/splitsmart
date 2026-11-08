# Building Claude Code Plugins: A Practical Engineering Guide

> **Reference implementation:** this repository (`splitsmart`).
> **Verified against:** Claude Code 2.1.289 on Windows.
> **Audience:** engineers who want a repeatable, reviewable way to package MCP servers, skills, commands, agents, and hooks.

This guide explains the contract Claude Code expects, why each file exists, and how to test the result before publishing. Every command and convention marked as verified was exercised against the reference repository.

---

## Table of contents

1. [The plugin model](#1-the-plugin-model)
2. [Repository layout](#2-repository-layout)
3. [Scaffolding and toolchain](#3-scaffolding-and-toolchain)
4. [Plugin manifest](#4-plugin-manifest)
5. [Marketplace manifest](#5-marketplace-manifest)
6. [MCP servers](#6-mcp-servers)
7. [Skills](#7-skills)
8. [Slash commands](#8-slash-commands)
9. [Subagents](#9-subagents)
10. [Hooks](#10-hooks)
11. [Build and distribution](#11-build-and-distribution)
12. [Validation and end-to-end testing](#12-validation-and-end-to-end-testing)
13. [Publishing and updating](#13-publishing-and-updating)
14. [Reference](#14-reference)
15. [Appendix: the reference plugin end to end](#15-appendix-the-reference-plugin-end-to-end)

---

## 1. The plugin model

A Claude Code plugin is a **directory contract**. There is no plugin runtime to start and no registration API to call. Claude Code scans known paths, reads manifests and frontmatter, and merges the components into the session.

### 1.1 Components

| Component | Location | Discovery | Invocation |
| --- | --- | --- | --- |
| Plugin manifest | `.claude-plugin/plugin.json` | Automatic | Identity, versioning, validation |
| Marketplace manifest | `.claude-plugin/marketplace.json` | Automatic | Installation source |
| MCP servers | `.mcp.json` | Automatic | Tool calls from Claude |
| Skills | `skills/<name>/SKILL.md` | Automatic | Model-selected, or `/name` |
| Slash commands | `commands/<name>.md` | Automatic | User types `/name` |
| Subagents | `agents/<name>.md` | Automatic | Delegated by Claude |
| Hooks | `hooks/hooks.json` | Automatic | Lifecycle events |

MCP servers are the only component that runs as a separate process. Skills, commands, and agents are prompt assets. Hooks are short-lived processes triggered by lifecycle events.

### 1.2 Trust and execution model

- Plugin code runs with your user privileges. A hook or MCP server can read files, execute commands, and make network requests.
- A marketplace is a distribution index, not a sandbox. Installing a plugin from an untrusted marketplace is equivalent to running its code.
- MCP servers persist for the session. Hooks must be fast because they run inline with tool calls.
- Treat plugin installation like adding a dependency: review the source, pin versions, and prefer least privilege.

### 1.3 Identity and naming

Three names matter:

| Name | Example | Used for |
| --- | --- | --- |
| Plugin name | `splitsmart` | Install ID, MCP tool prefix, data directory identity |
| Marketplace name | `splitsmart` | Install ID and marketplace management |
| MCP server key | `splitsmart` | MCP tool prefix and health checks |

The install ID is `<plugin>@<marketplace>`, for example `splitsmart@splitsmart`.

For plugin-provided MCP tools, Claude Code uses:

```text
mcp__plugin_<plugin>_<server>__<tool>
```

Non-alphanumeric characters in the plugin or server name become `_`. With plugin `splitsmart`, server `splitsmart`, and tool `get_ledger`, the fully qualified name is:

```text
mcp__plugin_splitsmart_splitsmart__get_ledger
```

This is the name you must use in a subagent's `tools:` field or an exact hook matcher. Renaming a plugin or MCP server is a breaking change because it changes tool identity.

---

## 2. Repository layout

The reference repository uses the following layout:

```text
splitsmart/
├── .claude-plugin/
│   ├── plugin.json              # plugin identity and metadata
│   └── marketplace.json         # marketplace index
├── .mcp.json                    # MCP server registration
├── package.json                 # npm metadata, scripts, dependencies
├── package-lock.json            # reproducible dependency tree
├── tsconfig.json                # type-checking configuration
├── src/
│   ├── ledger.ts                # domain + storage logic
│   ├── args.ts                  # CLI argument parsing
│   ├── cli.ts                   # CLI entry point
│   └── mcp-server.ts            # MCP entry point
├── test/
│   └── args.test.ts             # unit tests
├── agents/
│   └── ledger-auditor.md        # subagent definition
├── commands/
│   └── split-bill.md            # slash command
├── skills/
│   └── splitsmart-parser/
│       └── SKILL.md             # skill instructions
├── hooks/
│   ├── hooks.json               # hook registration
│   └── scripts/
│       └── guard.mjs            # hook implementation
├── scripts/
│   ├── build.mjs                # esbuild bundle step
│   └── setup-plugin.ps1         # optional publishing helper
├── dist/                        # committed build output
│   ├── cli.js
│   └── mcp-server.js
├── README.md
└── guide.md
```

**Required for a minimal plugin:** `plugin.json`. Everything else is optional, but a useful plugin will normally have at least one component.

**Committed build output:** `dist/` is committed so Claude Code can run the plugin from a checkout without installing dependencies. This is a deliberate distribution choice; see [section 11](#11-build-and-distribution).

---

## 3. Scaffolding and toolchain

### 3.1 Prerequisites

```bash
node -v      # 18 or later
npm -v
git --version
claude --version
```

The reference uses TypeScript, Node's built-in test runner, and esbuild. The runtime target is Node 18, matching `engines.node`.

### 3.2 `package.json`

```json
{
    "name": "splitsmart",
    "version": "1.2.0",
    "description": "A local shared-expense ledger and bill-splitting MCP server built for Claude Code",
    "type": "module",
    "bin": {
        "splitsmart": "dist/cli.js"
    },
    "files": ["dist"],
    "engines": { "node": ">=18" },
    "scripts": {
        "typecheck": "tsc --noEmit",
        "build": "npm run typecheck && node scripts/build.mjs",
        "start": "node dist/mcp-server.js",
        "dev": "tsx src/mcp-server.ts",
        "cli": "node dist/cli.js",
        "test": "tsx --test test/args.test.ts"
    },
    "dependencies": {
        "@modelcontextprotocol/sdk": "^1.0.1",
        "zod": "^3.23.8"
    },
    "devDependencies": {
        "@types/node": "^20.11.0",
        "esbuild": "^0.24.0",
        "tsx": "^4.19.0",
        "typescript": "^5.3.3"
    }
}
```

`type: "module"` makes the bundled `.js` files ESM. `bin` exposes the CLI after `npm link` or global install. `files` controls what npm publishes; Claude Code uses the repository contents, not the npm tarball, so `dist/` must also be committed.

### 3.3 `tsconfig.json`

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true
    },
    "include": ["src/**/*"]
}
```

The build does **not** use `tsc` to emit. `tsc --noEmit` only type-checks; esbuild emits the bundle.

### 3.4 `.gitignore`

```gitignore
node_modules/
.DS_Store
```

Do not ignore `dist/` if you want the zero-install distribution model.

---

## 4. Plugin manifest

`.claude-plugin/plugin.json` is the plugin's identity document.

### 4.1 Fields

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | Yes | Plugin ID. Lowercase and hyphenated; changes are breaking. |
| `version` | Recommended | Semantic version used by installation and update tooling. |
| `description` | Recommended | Human-readable summary. |
| `author` | Recommended | `{ "name": "...", "email": "...", "url": "..." }`. |
| `repository` | Optional | Source URL. |
| `homepage` | Optional | Project or documentation URL. |
| `license` | Optional | SPDX identifier, for example `MIT`. |
| `keywords` | Optional | Discovery metadata. |

### 4.2 Reference manifest

```json
{
    "name": "splitsmart",
    "version": "1.2.0",
    "description": "Tracks shared expenses in a local ledger and settles group balances.",
    "author": {
        "name": "Muhammad Hammad"
    },
    "repository": "https://github.com/hammadallauddin/splitsmart",
    "license": "MIT"
}
```

### 4.3 Validate

```bash
claude plugin validate .claude-plugin/plugin.json --strict --json
```

A passing report has empty `errors`, `warnings`, and `notes` arrays. Keep `plugin.json` and `package.json` versions in sync; also keep the version string passed to the MCP `Server` constructor in sync so the handshake reports the same identity.

---

## 5. Marketplace manifest

A marketplace is an index of one or more plugins. A repository can be both a marketplace and a plugin, which is how the reference repository is structured.

### 5.1 Fields

| Field | Required | Purpose |
| --- | --- | --- |
| `$schema` | Recommended | Editor validation and tooling hints. |
| `name` | Yes | Marketplace ID used in `plugin@marketplace`. |
| `description` | Recommended | Marketplace summary. |
| `owner` | Recommended | `{ "name": "...", "email": "..." }`. |
| `plugins` | Yes | Array of plugin entries. |
| `plugins[].name` | Yes | Plugin ID; must match the plugin's manifest. |
| `plugins[].source` | Yes | Path to the plugin, relative to the marketplace root. |
| `plugins[].description` | Recommended | Marketplace-facing summary. |
| `plugins[].category` | Optional | For example `productivity`, `developer-tools`. |
| `plugins[].version` | Optional | Marketplace override; normally omit and let the manifest define it. |

### 5.2 Reference manifest

```json
{
    "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
    "name": "splitsmart",
    "description": "Shared expense tracking and bill splitting for Claude Code.",
    "owner": {
        "name": "Muhammad Hammad"
    },
    "plugins": [
        {
            "name": "splitsmart",
            "description": "Tracks shared expenses in a local ledger and settles group balances.",
            "source": "./",
            "category": "productivity"
        }
    ]
}
```

`"source": "./"` means the plugin is at the marketplace root. For a monorepo:

```json
"plugins": [
    { "name": "plugin-a", "source": "./plugins/a" },
    { "name": "plugin-b", "source": "./plugins/b" }
]
```

Each plugin directory needs its own `.claude-plugin/plugin.json`.

### 5.3 Install flow

```bash
claude plugin marketplace add hammadallauddin/splitsmart
claude plugin install splitsmart@splitsmart
```

In the interactive client:

```text
/plugin install splitsmart --marketplace hammadallauddin/splitsmart
```

The marketplace is fetched once and cached. Restart Claude Code after installation so new components are loaded.

### 5.4 Validation caveat

When a repository contains both manifests, `claude plugin validate .` validates the **marketplace** manifest. Validate the plugin manifest explicitly:

```bash
claude plugin validate . --strict --json
claude plugin validate .claude-plugin/plugin.json --strict --json
```

Do not pass an individual skill, command, or agent path to `claude plugin validate`; it treats the path as a plugin root and reports misleading manifest errors. Component discovery is verified by installation and `claude plugin details`.

---

## 6. MCP servers

MCP (Model Context Protocol) is how Claude calls external tools. The reference uses a **stdio server**: Claude starts the process, speaks newline-delimited JSON-RPC over stdin/stdout, and keeps it alive for the session.

### 6.1 Registration: `.mcp.json`

```json
{
    "mcpServers": {
        "splitsmart": {
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js"],
            "env": {
                "CLAUDE_PLUGIN_DATA": "${CLAUDE_PLUGIN_DATA}"
            }
        }
    }
}
```

| Key | Meaning |
| --- | --- |
| `mcpServers.<key>` | Server name. Becomes part of every tool name. |
| `command` | Executable to spawn. Use `node` for portable JavaScript. |
| `args` | Arguments. `${CLAUDE_PLUGIN_ROOT}` resolves to the installed plugin directory. |
| `env` | Extra environment variables. Forward `CLAUDE_PLUGIN_DATA` so the server can persist data. |

`${CLAUDE_PLUGIN_ROOT}` is resolved only in the plugin context. If you open the plugin repository as a normal project, Claude also reads the root `.mcp.json` and reports missing plugin variables; that is expected and does not affect installed usage.

### 6.2 Minimal server

The reference uses the low-level SDK API because it is explicit and stable:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
    { name: "splitsmart", version: "1.2.0" },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "add_expense",
            description: "Records one shared expense in the local ledger.",
            inputSchema: {
                type: "object",
                properties: {
                    payer: { type: "string" },
                    amount: { type: "number" },
                    category: { type: "string" },
                    description: { type: "string" }
                },
                required: ["payer", "amount", "category"]
            }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "add_expense") {
        throw new Error(`Unknown tool: ${req.params.name}`);
    }

    try {
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;

        const payer = typeof args.payer === "string" ? args.payer.trim() : "";
        if (!payer) throw new Error("payer is required");

        const amount = args.amount;
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
            throw new Error("amount must be greater than 0");
        }

        return { content: [{ type: "text", text: JSON.stringify({ success: true, payer, amount }) }] };
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }]
        };
    }
});

await server.connect(new StdioServerTransport());
```

Key rules:

- **Never write to stdout** except protocol messages. `console.log` in a stdio server corrupts the JSON-RPC stream. Log to `stderr` or a file.
- Validate every argument server-side. The model can send anything; JSON Schema is a hint, not enforcement.
- Return user-visible failures as `{ isError: true, content: [...] }`. Throw only for protocol-level problems such as an unknown tool.
- Keep the process alive. The transport owns the event loop after `connect`.

### 6.3 Tool schema and naming

The tool's `name` is local to the server. Claude exposes it with the plugin prefix:

```text
mcp__plugin_<plugin>_<server>__<tool>
```

| Plugin | Server | Tool | Exposed name |
| --- | --- | --- | --- |
| `splitsmart` | `splitsmart` | `add_expense` | `mcp__plugin_splitsmart_splitsmart__add_expense` |
| `splitsmart` | `splitsmart` | `get_ledger` | `mcp__plugin_splitsmart_splitsmart__get_ledger` |

A non-plugin project MCP server uses `mcp__<server>__<tool>`. Server names are normalized by replacing characters outside `[a-zA-Z0-9_-]` with `_`.

### 6.4 Data storage

Do not write to the user's project unless the plugin is explicitly project-scoped. Resolve a data directory with a precedence chain and create it lazily:

```ts
export function dataDir(): string {
    const candidates = [process.env.SPLITSMART_DATA_DIR, process.env.CLAUDE_PLUGIN_DATA];
    const dir = candidates.find((d) => d && !d.includes("${")) ?? join(homedir(), ".splitsmart");
    mkdirSync(dir, { recursive: true });
    return dir;
}
```

The `${` check protects against an unexpanded literal such as `${CLAUDE_PLUGIN_DATA}`. Without it, the server may create a directory literally named `${CLAUDE_PLUGIN_DATA}`.

Recommended precedence:

1. A plugin-specific override such as `SPLITSMART_DATA_DIR`.
2. `CLAUDE_PLUGIN_DATA`, set by Claude Code for installed plugins.
3. A stable home-directory fallback such as `~/.splitsmart`.

### 6.5 Testing the server

```bash
node dist/mcp-server.js
```

Then use Claude's health check:

```bash
claude mcp list
claude mcp get plugin:splitsmart:splitsmart
```

The display name is `plugin:<plugin>:<server>`. A healthy plugin server reports `✔ Connected`. `claude mcp get` also shows the resolved `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` values.

### 6.6 Native dependencies

esbuild can bundle pure JavaScript but not native `.node` binaries. If you depend on `sqlite3`, `better-sqlite3`, or `sharp`:

```js
await build({
    // ...
    external: ["sqlite3"]
});
```

The bundle then resolves the module from `node_modules` at runtime, which means users must run `npm install`. Document this clearly. For a zero-install plugin, prefer a pure-JS or WASM storage layer, or use a built-in module available in your Node target.

---

## 7. Skills

A skill is a prompt asset that teaches Claude a procedure. Claude selects skills by matching the request against the skill's description.

### 7.1 File layout

```text
skills/<skill-name>/SKILL.md
```

### 7.2 Frontmatter

```yaml
---
name: splitsmart-parser
description: Categorizes and structures receipt text into standardized bill entries.
---
```

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | Yes | Skill identifier; should match the directory name. |
| `description` | Yes | The trigger. State **what** the skill does and **when** to use it. |

Keep optional fields to the minimum supported by your Claude Code version. The required pair is portable.

### 7.3 Body

The body is loaded when the skill is invoked. Write a procedure, not an essay:

```markdown
# Bill Parsing Rules

- Food & Drinks -> `Dining`
- Utilities -> `Utilities`
- Fuel/Rides -> `Travel`
- Anything else -> `Other`

For every bill:

1. Extract the payer, total amount, category, and a short description.
2. Split the total evenly across the named participants unless the text says otherwise, rounding to 2 decimals.
3. Output the individual owed shares in a markdown table before the entry is stored.
```

Good skills have:

- A narrow, recognizable trigger.
- Deterministic rules where possible.
- An explicit output contract (table, JSON shape, required sections).
- A short example when the format is easy to get wrong.

### 7.4 Token economics

Skill metadata is always in context, especially the description; the body is paid only when the skill fires. `claude plugin details` reports an estimate:

```text
Component inventory
  Skills (2)  split-bill, splitsmart-parser
  Agents (1)  ledger-auditor
  Hooks (1)  PreToolUse
  MCP servers (1)  splitsmart
```

Keep descriptions specific and short. A vague description causes false triggers and wasted tokens.

### 7.5 Testing

```bash
claude plugin details splitsmart@splitsmart
```

Then invoke the skill naturally in a session and confirm the expected procedure and output format.

---

## 8. Slash commands

Commands are user-invoked entry points. In current Claude Code builds the inventory may group commands with skills, but the invocation contract is unchanged: the user types `/name`.

### 8.1 File layout

```text
commands/<command-name>.md
```

The filename is the command name.

### 8.2 Frontmatter

```yaml
---
description: Split a bill quickly among friends. Usage: /split-bill <amount> paid by <name> for <details>
argument-hint: <amount> paid by <name> for <details>
---
```

| Field | Required | Purpose |
| --- | --- | --- |
| `description` | Recommended | Shown in the command list and help. Include usage. |
| `argument-hint` | Optional | Placeholder shown while typing. |

Do not duplicate `name` unless your Claude Code version documents it; the filename is authoritative.

### 8.3 Body and arguments

```markdown
Split the bill described here: $ARGUMENTS

1. Parse the request with the `splitsmart-parser` skill rules to get the payer, amount, category and description.
2. Calculate each participant's owed share and show a markdown table before storing anything.
3. Call the `add_expense` tool from the splitsmart MCP server with `payer`, `amount`, `category` and `description`.
4. Report the stored entry id and the settlement summary.
```

| Token | Meaning |
| --- | --- |
| `$ARGUMENTS` | The full argument string. |
| `$1`, `$2`, ... | Positional arguments. |
| `@path` | File reference, expanded by Claude Code. |
| `!command` | Execute a shell command and inject its output. Use sparingly and review for injection risk. |

### 8.4 Best practices

- One command, one job.
- Name every tool the model should call.
- State the output contract and the order of operations.
- Avoid embedding large reference material; point to a skill instead.
- Test with representative inputs, including missing and malformed arguments.

---

## 9. Subagents

A subagent runs in an isolated context window. Use one when a task would flood the main conversation with intermediate work or when you want a narrower tool set.

### 9.1 File layout

```text
agents/<agent-name>.md
```

### 9.2 Frontmatter

```yaml
---
name: ledger-auditor
description: Audits spending by payer in a clean context window. Use when asked who owes what or for a settlement summary.
tools: mcp__plugin_splitsmart_splitsmart__get_ledger
model: sonnet
---
```

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | Yes | Agent identifier. |
| `description` | Yes | When Claude should delegate to this agent. |
| `tools` | Recommended | Comma-separated allowlist. Omit to inherit all tools. |
| `model` | Optional | Model alias such as `sonnet`, `opus`, or `haiku`. |

For plugin MCP tools, use the fully qualified name from [section 6.3](#63-tool-schema-and-naming). Do not use the display form `plugin:splitsmart:splitsmart`.

### 9.3 Prompt

The agent does not see the main conversation. Make the prompt self-contained:

```markdown
Fetch the ledger with `get_ledger`, then summarize spending by payer in a settlement table. For each payer show the number of entries, their total paid, and their share of the grand total. Flag the largest expense.
```

State the tool to call, the computation, and the required output. Keep the final response concise; the main agent pays for it.

### 9.4 Testing

```bash
claude plugin details splitsmart@splitsmart
```

The inventory should list the agent and the MCP server. Then ask a question that matches the description and confirm delegation occurs and the tool is available.

---

## 10. Hooks

Hooks run commands at lifecycle events. They are powerful and easy to misuse. A hook receives JSON on stdin and communicates through its exit code, stderr, and optionally structured stdout.

### 10.1 File layout

```text
hooks/
├── hooks.json
└── scripts/
    └── guard.mjs
```

### 10.2 Configuration

```json
{
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "mcp__.*__add_expense",
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/guard.mjs\""
                    }
                ]
            }
        ]
    }
}
```

| Field | Meaning |
| --- | --- |
| `hooks` | Top-level wrapper required for plugin hook files. |
| Event name | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd`. |
| `matcher` | Regular expression matched against the tool name. Use `.*` to match all tools. |
| `hooks[].type` | `command` for executable hooks. |
| `hooks[].command` | Shell command. `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory. |

Matchers see the **fully qualified** tool name. To catch a plugin tool, include the plugin prefix:

```text
mcp__plugin_splitsmart_splitsmart__add_expense
```

A broad matcher such as `mcp__.*__add_expense` works across servers and is useful for defensive checks.

### 10.3 Input payload

For `PreToolUse`, stdin looks like:

```json
{
    "session_id": "...",
    "transcript_path": "...",
    "cwd": "...",
    "hook_event_name": "PreToolUse",
    "tool_name": "mcp__plugin_splitsmart_splitsmart__add_expense",
    "tool_input": {
        "payer": "Ali",
        "amount": 25.5,
        "category": "Dining",
        "description": "Pizza for four"
    }
}
```

`PostToolUse` adds the tool response. Event-specific fields are documented in the hooks reference; always code defensively because payloads evolve.

### 10.4 Exit codes

| Exit code | Effect |
| --- | --- |
| `0` | Success; continue. |
| `2` | Blocking error. For `PreToolUse`, the tool call is blocked and stderr is fed back to Claude. |
| Other non-zero | Non-blocking error; the action continues and stderr is shown to the user. |

Exit code 2 is the simplest portable way to deny a tool call. Structured JSON on stdout supports richer decisions such as `permissionDecision: "allow" | "deny" | "ask"`; use the event-specific schema from the hooks reference and test it against your Claude Code version.

### 10.5 Reference guard

```js
// PreToolUse hook: blocks add_expense calls with a zero or negative amount.
let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
    const { tool_input } = JSON.parse(input);
    const raw = tool_input?.amount;
    const amount =
        typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : undefined;

    if (amount !== undefined && Number.isFinite(amount) && amount <= 0) {
        console.error("Blocked: expense amount must be greater than 0.");
        process.exit(2);
    }
} catch {
    // A guard that cannot parse its input must never block the tool call.
}

process.exit(0);
```

Design notes:

- **Fail open on parse errors.** A malformed audit payload must not break unrelated tool calls.
- **Fail closed on known invalid values.** A non-positive amount is a definitive violation.
- **Use Node, not bash.** `jq`, `bc`, and GNU tools are not portable to Windows.
- **Do not write to stdout.** Hook stdout can be interpreted as structured control output.
- **Keep hooks fast.** They run inline; avoid network calls and heavy work.

### 10.6 Testing a hook

```powershell
'{"tool_input":{"amount":-5}}' | node hooks/scripts/guard.mjs
"exit=$LASTEXITCODE"   # 2

'{"tool_input":{"amount":5}}' | node hooks/scripts/guard.mjs
"exit=$LASTEXITCODE"   # 0

'not json' | node hooks/scripts/guard.mjs
"exit=$LASTEXITCODE"   # 0 (fails open)
```

```bash
echo '{"tool_input":{"amount":-5}}' | node hooks/scripts/guard.mjs; echo "exit=$?"
```

After changing hooks, restart Claude Code. Plugin hooks merge with user and project hooks; a broad matcher can fire more often than expected.

---

## 11. Build and distribution

### 11.1 Why bundle

Claude Code runs `node dist/mcp-server.js` directly from the plugin directory. It does not run `npm install` for installed plugins. Bundling with esbuild produces a self-contained file that works from a fresh checkout.

### 11.2 Build script

`scripts/build.mjs`:

```js
import { build } from "esbuild";

await build({
    entryPoints: ["src/mcp-server.ts", "src/cli.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outdir: "dist",
    banner: { js: "#!/usr/bin/env node" },
});
```

| Option | Reason |
| --- | --- |
| `bundle: true` | Inline pure-JS dependencies. |
| `platform: "node"` | Use Node built-ins and resolution rules. |
| `format: "esm"` | Match `"type": "module"`. |
| `target: "node18"` | Match `engines.node`. |
| `banner` | Make the CLI executable when installed as a bin. |

### 11.3 Distribution contract

- Commit `dist/` whenever `src/` changes.
- Keep `dist/` out of `.gitignore`.
- Commit `package-lock.json` for reproducible builds.
- Verify `npm run build` before every release.
- Do not commit `node_modules/`.

### 11.4 Tests

The reference tests the CLI parser with Node's built-in runner:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAddArgs } from "../src/args.js";

test("parses add flags", () => {
    assert.deepEqual(
        parseAddArgs(["--payer", "Ali", "--amount", "25.5", "--category", "Dining"]),
        { payer: "Ali", amount: 25.5, category: "Dining", description: "" }
    );
});
```

```bash
npm test
```

Test the pure logic (parsers, validation, storage helpers) rather than the MCP transport. Transport health is covered by `claude mcp list`.

### 11.5 Versioning

Keep these in sync:

1. `.claude-plugin/plugin.json` → `version`
2. `package.json` → `version`
3. MCP `Server` constructor → `version`

Claude Code provides a release helper:

```bash
claude plugin tag .                     # creates <name>--v<version>
```

The command validates that `plugin.json` and any enclosing marketplace entry agree before creating the git tag.

---

## 12. Validation and end-to-end testing

### 12.1 Static validation

```bash
claude plugin validate . --strict --json
claude plugin validate .claude-plugin/plugin.json --strict --json
```

Both should return `"success": true` with empty error and warning arrays.

### 12.2 Isolated installation

Never test in your real Claude configuration. Use a temporary config directory.

**PowerShell**

```powershell
$test = Join-Path $env:TEMP "claude-plugin-test"
Remove-Item -Recurse -Force $test -ErrorAction SilentlyContinue
New-Item -ItemType Directory $test | Out-Null
$env:CLAUDE_CONFIG_DIR = $test

claude plugin marketplace add "D:\path\to\splitsmart"
claude plugin install splitsmart@splitsmart
claude plugin list
claude plugin details splitsmart@splitsmart
claude mcp list
```

**Bash**

```bash
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
claude plugin marketplace add /absolute/path/to/splitsmart
claude plugin install splitsmart@splitsmart
claude plugin list
claude plugin details splitsmart@splitsmart
claude mcp list
```

### 12.3 What success looks like

```text
Installed plugins:

  ❯ splitsmart@splitsmart
    Version: 1.2.0
    Status: ✔ enabled
```

```text
Component inventory
  Skills (2)  split-bill, splitsmart-parser
  Agents (1)  ledger-auditor
  Hooks (1)  PreToolUse
  MCP servers (1)  splitsmart
```

```text
plugin:splitsmart:splitsmart: node .../dist/mcp-server.js - ✔ Connected
```

If the server is missing or disconnected, run it directly, then check `dist/`, stdout pollution, and native dependencies.

### 12.4 Troubleshooting matrix

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Plugin not listed | Wrong marketplace or plugin name | Check `marketplace.json` and use `<plugin>@<marketplace>` |
| MCP server shown as pending | You opened the plugin repo as a project; project `.mcp.json` has no plugin variables | Ignore for development, or approve the project server manually; installed plugins resolve variables |
| Warning: missing `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` | Same as above | Expected outside plugin context |
| Server not connected | Missing `dist/`, bad entry path, crash on startup | Run `node dist/mcp-server.js` and inspect stderr |
| Server connects but tools are absent | `tools/list` handler missing or wrong schema | Check the capability and the request handler |
| Agent cannot use a tool | Wrong tool prefix | Use `mcp__plugin_<plugin>_<server>__<tool>` |
| Hook never fires | Matcher does not match the prefixed tool name | Use `mcp__.*__<tool>` or the exact qualified name |
| Hook blocks unexpectedly | Exit code 2 path or unhandled error | Log to stderr, fail open on parse errors |
| Changes not visible | Bundled `dist/` not rebuilt, version not bumped, session not restarted | Rebuild, bump, update plugin, restart |
| `validate` errors on a component path | The CLI treats the path as a plugin root | Validate manifests only; verify components via install/details |
| Hook fails on Windows | bash/jq/bc unavailable | Implement hooks in Node |
| Data appears in the project | Storage path not overridden | Use the plugin data directory precedence chain |

### 12.5 Removing the test environment

```powershell
Remove-Item -Recurse -Force $env:CLAUDE_CONFIG_DIR
```

This does not touch your normal Claude configuration.

---

## 13. Publishing and updating

### 13.1 Publish

```bash
git init -b main
git add .
git commit -m "feat: initial plugin"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Then:

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin>@<marketplace>
```

Restart Claude Code.

### 13.2 Update

1. Change `src/` and any prompt assets.
2. Run `npm run build`.
3. Run `npm test`.
4. Bump the version in `plugin.json`, `package.json`, and the MCP server.
5. Run `claude plugin validate . --strict`.
6. Re-run the isolated install test.
7. Commit `src/`, `dist/`, and manifest changes.
8. Push and tag if desired.
9. Update the installed plugin:

```bash
claude plugin marketplace update
claude plugin update splitsmart@splitsmart
```

10. Restart Claude Code.

### 13.3 Uninstall

```bash
claude plugin uninstall splitsmart
```

Use `--keep-data` to preserve the plugin data directory (`~/.claude/plugins/data/{id}/`). Relevant scopes are `user`, `project`, and `local`.

---

## 14. Reference

### 14.1 Frontmatter at a glance

| Asset | Path | Required frontmatter |
| --- | --- | --- |
| Skill | `skills/<name>/SKILL.md` | `name`, `description` |
| Command | `commands/<name>.md` | Filename defines the command; `description` recommended |
| Agent | `agents/<name>.md` | `name`, `description`; `tools`, `model` recommended |
| Plugin | `.claude-plugin/plugin.json` | `name` |
| Marketplace | `.claude-plugin/marketplace.json` | `name`, `plugins[].name`, `plugins[].source` |

### 14.2 Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `CLAUDE_PLUGIN_ROOT` | Plugin MCP and hooks | Absolute plugin directory |
| `CLAUDE_PLUGIN_DATA` | Plugin MCP | Persistent plugin data directory |
| `CLAUDE_CONFIG_DIR` | CLI | Isolate Claude configuration for testing |
| `SPLITSMART_DATA_DIR` | Reference plugin | Application-specific data override |

### 14.3 Tool naming

```text
Plugin tool:   mcp__plugin_<plugin>_<server>__<tool>
Project tool:  mcp__<server>__<tool>
Display form:  plugin:<plugin>:<server>
```

Normalization: characters outside `[a-zA-Z0-9_-]` become `_`.

### 14.4 Security checklist

- [ ] Install plugins only from sources you trust and review.
- [ ] Keep agent `tools` allowlists as narrow as possible.
- [ ] Validate every MCP tool argument server-side.
- [ ] Never log secrets or full tool payloads by default.
- [ ] Make hooks fast, offline, and fail-open on malformed input unless the check is security-critical.
- [ ] Write plugin data outside the user's project.
- [ ] Review hook commands and MCP entry points before publishing.
- [ ] Pin dependency versions and commit the lockfile.

### 14.5 Release checklist

- [ ] `plugin.json` and `package.json` versions match.
- [ ] MCP server version matches.
- [ ] `npm run build` succeeds and `dist/` is current.
- [ ] `npm test` passes.
- [ ] `claude plugin validate . --strict` passes.
- [ ] Plugin manifest validation passes.
- [ ] Isolated install succeeds.
- [ ] `claude plugin details` shows every component.
- [ ] `claude mcp list` shows the server connected.
- [ ] README install commands use the final repo and marketplace names.
- [ ] `dist/` and `package-lock.json` are committed.
- [ ] Working tree is clean.

### 14.6 Further reading

- Claude Code plugins: <https://code.claude.com/docs/en/plugins>
- MCP: <https://code.claude.com/docs/en/mcp>
- Hooks: <https://code.claude.com/docs/en/hooks>
- Skills: <https://code.claude.com/docs/en/skills>
- Subagents: <https://code.claude.com/docs/en/sub-agents>
- Slash commands: <https://code.claude.com/docs/en/slash-commands>

Documentation paths and schemas evolve. When a detail matters, verify it against your installed CLI:

```bash
claude plugin --help
claude plugin validate --help
claude mcp --help
```

---

## 15. Appendix: the reference plugin end to end

### 15.1 Request flow

```text
/split-bill 96.40 paid by Sara for groceries for Sara, Ali and Hina
          │
          ├── commands/split-bill.md
          │     reads $ARGUMENTS, names the workflow
          │
          ├── skills/splitsmart-parser/SKILL.md
          │     maps the text to a category, computes shares,
          │     prints the owed-share table
          │
          ├── add_expense (MCP)
          │     ├── hooks/hooks.json → hooks/scripts/guard.mjs
          │     │     rejects amount <= 0 with exit 2
          │     └── src/ledger.ts
          │           validates input, assigns id, appends JSONL
          │
          └── returns { success, id, payer, amount, category, description, timestamp }
```

Later, a question such as "Who has paid the most?" can be delegated to `agents/ledger-auditor.md`, which calls `get_ledger` in an isolated context and returns a settlement table.

### 15.2 File responsibilities

| File | Responsibility |
| --- | --- |
| `.claude-plugin/plugin.json` | Plugin identity, version, repository, license |
| `.claude-plugin/marketplace.json` | Marketplace index and install source |
| `.mcp.json` | Spawns the MCP server and forwards plugin data env |
| `src/mcp-server.ts` | Tool declarations, argument validation, error shaping |
| `src/ledger.ts` | Domain validation, data directory resolution, JSONL persistence |
| `src/args.ts` | CLI parser with explicit errors |
| `src/cli.ts` | CLI entry point for add/list/config |
| `commands/split-bill.md` | User entry point and workflow orchestration |
| `skills/splitsmart-parser/SKILL.md` | Category mapping and share-table procedure |
| `agents/ledger-auditor.md` | Isolated settlement analysis with a narrow tool allowlist |
| `hooks/hooks.json` | Registers the amount guard on `PreToolUse` |
| `hooks/scripts/guard.mjs` | Cross-platform, fail-open amount validation |
| `scripts/build.mjs` | Type-check, then bundle ESM entry points into `dist/` |
| `test/args.test.ts` | Parser regression tests |
| `dist/` | Self-contained runnable bundles |

### 15.3 Adapting this template

1. Rename the plugin, marketplace, and MCP server consistently.
2. Replace `src/ledger.ts` with your domain logic.
3. Update tool names, schemas, and handlers in `src/mcp-server.ts`.
4. Update the command, skill, and agent prompts.
5. Update the hook matcher and validation rule.
6. Rebuild `dist/`, run tests, validate strictly, and install in an isolated config.
7. Update `README.md`, this guide's examples, and the repository URL.
8. Publish and verify with `claude plugin details` and `claude mcp list`.

---

**Maintained as part of the `splitsmart` reference implementation.** If you change the plugin's structure, update this guide in the same commit so the documentation and the working code stay aligned.
