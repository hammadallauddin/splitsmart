# SplitSmart

A local-first Claude Code plugin for splitting group expenses. Log a bill in plain language, see everyone's share, and keep an auditable ledger — without signing up for an expense app.

For a complete technical walkthrough of the architecture and a repeatable recipe for building your own Claude Code plugin, see [guide.md](guide.md).

## The problem

Splitting a bill across friends usually means one person pays, everyone promises to settle later, and the math lives in a chat thread. Receipts get lost, shares get recalculated differently each time, and nobody knows the running total. Cloud expense apps solve the arithmetic but demand accounts, sync, and access to your data.

## The solution

SplitSmart adds a small local ledger to Claude Code:

- You describe the bill in natural language or with `/split-bill`.
- The `splitsmart-parser` skill extracts the payer, amount, category, and participants, then shows each person's share.
- The `add_expense` tool stores the expense in a JSONL file on your machine.
- The `ledger-auditor` agent, or a follow-up question, summarizes spending by payer.

Everything is local: one append-only file under your home or plugin data directory. No server, no account, no network calls.

## Features

- Natural-language and slash-command bill entry
- Deterministic category mapping (`Dining`, `Utilities`, `Travel`, `Other`)
- Per-person share calculation shown before anything is stored
- Append-only JSONL ledger you can read, back up, or edit
- Guard hook that rejects zero or negative amounts before they reach the tool
- CLI for adding and listing expenses outside Claude Code
- Shipped prebuilt in `dist/`, so installing the plugin needs no build step

## Installation

### Requirements

- Claude Code
- Node.js 18 or later (`node -v`)

### Install from the marketplace

```
claude plugin marketplace add hammadallauddin/splitsmart
claude plugin install splitsmart@splitsmart
```

Or in one step on Claude Code 2.1.275 or later:

```
/plugin install splitsmart --marketplace hammadallauddin/splitsmart
```

Restart Claude Code after installing.

### Verify

```
/split-bill 40 paid by Ali for pizza
```

You should see the parsed bill, a share table, and a stored entry with an `id`.

To remove the plugin: `claude plugin uninstall splitsmart`.

## Usage

### Slash command

```
/split-bill 40 paid by Ali for pizza
/split-bill 96.40 paid by Sara for groceries for Sara, Ali and Hina
/split-bill 18.75 paid by Hina for a cab home
```

SplitSmart parses the request, prints a markdown table of owed shares, then records the expense.

### Natural language

The tools are also available to Claude directly:

- "Log 25.50 for dinner paid by Ali."
- "Add a 12 dollar Travel expense paid by Sara."
- "Show the last five expenses."
- "Who has paid the most so far?"

### What is stored

The ledger keeps one record per expense: `id`, `payer`, `amount`, `category`, `description`, and `timestamp`. Individual shares are calculated in the conversation and shown in the table; the ledger stores the expense itself, not per-person IOUs. Settlement views are derived from how much each payer has spent.

## What's included

| Component | Name | What it does |
| --- | --- | --- |
| MCP tool | `add_expense` | Validates and records one expense in `expense-log.jsonl` |
| MCP tool | `get_ledger` | Returns recorded expenses newest first, optionally limited |
| Command | `/split-bill <amount> paid by <name> for <details>` | Parses the request, shows shares, then calls `add_expense` |
| Skill | `splitsmart-parser` | Maps receipt text to categories and builds the owed-share table |
| Agent | `ledger-auditor` | Summarizes spending by payer in its own context |
| Hook | `PreToolUse` on `add_expense` | Blocks calls whose amount is zero or negative |

## Tools

### `add_expense`

Input:

```json
{ "payer": "Ali", "amount": 25.5, "category": "Dining", "description": "Pizza for four" }
```

`payer`, `amount` and `category` are required; `description` is optional. The amount must be greater than 0.

Output:

```json
{
  "success": true,
  "id": 1,
  "payer": "Ali",
  "amount": 25.5,
  "category": "Dining",
  "description": "Pizza for four",
  "timestamp": "2026-11-08T09:15:00.000Z"
}
```

### `get_ledger`

Input:

```json
{ "limit": 20 }
```

`limit` is optional; omit it to return every entry. Output is a JSON array of entries, newest first.

## Rules and safety

| Condition | Result |
| --- | --- |
| Amount is 0 or negative | Blocked by the `PreToolUse` hook before the tool runs |
| Payer or category is empty | Rejected by `add_expense` |
| Category unknown | Allowed, but the skill maps text to `Dining`, `Utilities`, `Travel` and `Other` |

The hook fails open: if it cannot parse the tool input it exits 0, so a malformed payload never blocks the call. Validation still happens inside the server.

## Data and privacy

Every expense is appended as one JSON line to `expense-log.jsonl` in the first of these directories that is set:

1. `SPLITSMART_DATA_DIR`
2. `CLAUDE_PLUGIN_DATA` (set by Claude Code for installed plugins)
3. `~/.splitsmart`

Nothing is written to the project you're working in, and the plugin makes no network requests. To back up or move the ledger, copy that single file.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SPLITSMART_DATA_DIR` | see precedence above | Override where the ledger is stored |
| `CLAUDE_PLUGIN_DATA` | set by Claude Code | Plugin data directory, used when `SPLITSMART_DATA_DIR` is unset |

## Command-line use

```
npm install
npm run build
npm run cli -- add --payer Ali --amount 25.5 --category Dining --description "Pizza"
npm run cli -- list
npm run cli -- list --all
npm run cli -- list --limit 5
npm run cli -- config
```

`npm run cli -- config` prints the exact ledger path in use.

## How it works

```
/split-bill or natural language
          │
          ▼
splitsmart-parser skill ── categories + share table
          │
          ▼
add_expense (MCP) ── guard hook ── src/ledger.ts ── expense-log.jsonl
          │
          ▼
get_ledger (MCP) ── ledger-auditor agent ── settlement summary
```

Project layout:

```
.claude-plugin/   plugin and marketplace manifests
.mcp.json         MCP server registration
src/ledger.ts     validation + JSONL storage
src/args.ts       CLI argument parser
src/cli.ts        CLI entry point
src/mcp-server.ts MCP entry point
test/             argument-parser tests
agents/           ledger-auditor
commands/         /split-bill
skills/           splitsmart-parser
hooks/            PreToolUse amount guard
dist/             committed esbuild bundles
```

## Development

```
npm install
npm run build    # type-checks, then bundles src/ into dist/ with scripts/build.mjs
npm run dev      # runs the MCP server from source
npm test         # runs the CLI argument-parser tests
claude plugin validate .
```

`dist/` is committed because Claude Code runs the plugin straight from the repository without installing dependencies. Run `npm run build` and commit `dist/` whenever you change `src/`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/split-bill` is not available | Restart Claude Code, then run `claude plugin validate .` in the repository |
| No expenses appear | Check the active path with `npm run cli -- config`; confirm `SPLITSMART_DATA_DIR` is not pointing somewhere unexpected |
| A call is blocked with "amount must be greater than 0" | Use a positive amount; the guard rejects zero and negative values |
| The ledger looks empty after changing machines | The file is local by design; copy `expense-log.jsonl` or point `SPLITSMART_DATA_DIR` at the old location |
| A malformed line appears in the file | The reader skips unparsable lines; fix or remove that line without touching the rest |
| `node: command not found` or an old Node version | Install Node.js 18 or later and restart Claude Code |

## License

MIT
