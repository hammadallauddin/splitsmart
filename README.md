# SplitSmart Ledger

A Claude Code plugin that records shared expenses in a local ledger and audits who owes what. It ships `add_expense` and `get_ledger` MCP tools, a `/split-bill` command, a `splitsmart-parser` skill, a `ledger-auditor` subagent, and a guard hook.

## Install in Claude Code

```
claude plugin marketplace add hammadallauddin/splitsmart-ledger
claude plugin install splitsmart-ledger@splitsmart
```

Or in one step on Claude Code 2.1.275 or later:

```
/plugin install splitsmart-ledger --marketplace hammadallauddin/splitsmart-ledger
```

Restart Claude Code, then run:

```
/split-bill 40 paid by Ali for pizza
```

Requires Node.js 18 or later. The server is shipped prebuilt in `dist/`, so no `npm install` is needed. Entries are appended to a JSONL file in the plugin's data directory; there is no database server.

To remove it: `claude plugin uninstall splitsmart-ledger`.

## What's included

| Component | Name | What it does |
| --- | --- | --- |
| MCP tool | `add_expense` | Validates and records one expense in `expense-log.jsonl` |
| MCP tool | `get_ledger` | Returns recorded expenses newest first, optionally limited |
| Command | `/split-bill <amount> paid by <name> for <details>` | Parses the request, shows shares, then calls `add_expense` |
| Skill | `splitsmart-parser` | Maps receipt text to categories and builds the owed-share table |
| Agent | `ledger-auditor` | Audits spending by payer in its own context |
| Hook | `PreToolUse` on `add_expense` | Blocks calls whose amount is zero or negative |

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

## Rules

| Condition | Result |
| --- | --- |
| Amount is 0 or negative | Blocked by the `PreToolUse` hook before the tool runs |
| Payer or category is empty | Rejected by `add_expense` |
| Category unknown | Allowed, but the skill maps text to `Dining`, `Utilities`, `Travel` and `Other` |

The hook fails open: if it cannot parse the tool input it exits 0, so a malformed payload never blocks the call. Validation still happens inside the server.

## Data storage

Every expense is appended as one JSON line to `expense-log.jsonl` in the first of these directories that is set:

1. `SPLITSMART_DATA_DIR`

2. `CLAUDE_PLUGIN_DATA` (set by Claude Code for installed plugins)

3. `~/.splitsmart`

Nothing is written to the project you're working in.

| Variable | Default | Description |
| --- | --- | --- |
| `SPLITSMART_DATA_DIR` | see above | Where the ledger is stored |

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

## Development

```
npm install
npm run build    # type-checks, then bundles src/ into dist/ with scripts/build.mjs
npm run dev      # runs the MCP server from source
npm test         # runs the CLI argument-parser tests
claude plugin validate .
```

`dist/` is committed because Claude Code runs the plugin straight from the repository without installing dependencies. Run `npm run build` and commit `dist/` whenever you change `src/`.

## License

MIT
