#!/usr/bin/env node

// src/args.ts
function parseAddArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--payer" || arg === "--amount" || arg === "--category" || arg === "--description") {
      const value = args[i + 1];
      if (value === void 0) {
        throw new Error(`${arg} requires a value`);
      }
      i++;
      if (arg === "--payer") {
        if (!value.trim()) throw new Error("--payer must not be empty");
        parsed.payer = value.trim();
      } else if (arg === "--amount") {
        const amount = Number(value);
        if (!Number.isFinite(amount)) {
          throw new Error(`--amount must be a number, got "${value}"`);
        }
        parsed.amount = amount;
      } else if (arg === "--category") {
        if (!value.trim()) throw new Error("--category must not be empty");
        parsed.category = value.trim();
      } else {
        parsed.description = value.trim();
      }
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (parsed.payer === void 0) throw new Error("--payer is required");
  if (parsed.amount === void 0) throw new Error("--amount is required");
  if (parsed.amount <= 0) throw new Error("--amount must be greater than 0");
  if (parsed.category === void 0) throw new Error("--category is required");
  return {
    payer: parsed.payer,
    amount: parsed.amount,
    category: parsed.category,
    description: parsed.description ?? ""
  };
}
function parseListArgs(args) {
  const parsed = { all: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") {
      parsed.all = true;
      continue;
    }
    if (arg === "--limit") {
      const value = args[i + 1];
      if (value === void 0) {
        throw new Error("--limit requires a value");
      }
      i++;
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`--limit must be a positive integer, got "${value}"`);
      }
      parsed.limit = limit;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  if (parsed.all && parsed.limit !== void 0) {
    throw new Error("--all cannot be combined with --limit");
  }
  return parsed;
}

// src/ledger.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function dataDir() {
  const candidates = [process.env.SPLITSMART_DATA_DIR, process.env.CLAUDE_PLUGIN_DATA];
  const dir = candidates.find((d) => d && !d.includes("${")) ?? join(homedir(), ".splitsmart");
  mkdirSync(dir, { recursive: true });
  return dir;
}
var ledgerFile = () => join(dataDir(), "expense-log.jsonl");
function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
function optionalText(value, field) {
  if (value === void 0) return "";
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.trim();
}
function nextId() {
  const file = ledgerFile();
  if (!existsSync(file)) return 1;
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const { id } = JSON.parse(lines[i]);
      if (typeof id === "number" && Number.isFinite(id)) return id + 1;
    } catch {
    }
  }
  return lines.length + 1;
}
function addExpense(input) {
  const payer = requiredText(input.payer, "payer");
  const category = requiredText(input.category, "category");
  const description = optionalText(input.description, "description");
  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) throw new Error("amount must be a number");
  if (amount <= 0) throw new Error("amount must be greater than 0");
  const expense = {
    id: nextId(),
    payer,
    amount,
    category,
    description,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  appendFileSync(ledgerFile(), JSON.stringify(expense) + "\n");
  return expense;
}
function listExpenses(limit) {
  if (limit !== void 0 && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer");
  }
  const file = ledgerFile();
  if (!existsSync(file)) return [];
  const expenses = readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return typeof entry.id === "number" && typeof entry.amount === "number" ? [entry] : [];
    } catch {
      return [];
    }
  });
  const stamp = (entry) => typeof entry.timestamp === "string" ? entry.timestamp : "";
  expenses.sort((a, b) => stamp(b).localeCompare(stamp(a)) || b.id - a.id);
  return limit === void 0 ? expenses : expenses.slice(0, limit);
}

// src/cli.ts
var USAGE = `SplitSmart Ledger CLI

Usage:
  splitsmart add --payer <name> --amount <amount> --category <category> [--description <text>]
  splitsmart list [--limit <count> | --all]
  splitsmart config                                  Show where the ledger is stored`;
function cmdAdd(args) {
  const expense = addExpense(parseAddArgs(args));
  console.log(JSON.stringify(expense, null, 2));
}
function cmdList(args) {
  const parsed = parseListArgs(args);
  const expenses = listExpenses(parsed.all ? void 0 : parsed.limit ?? 20);
  if (expenses.length === 0) {
    console.log("No expenses logged yet.");
    return;
  }
  for (const entry of expenses) {
    console.log(
      `#${String(entry.id).padEnd(4)} ${entry.payer.padEnd(12)} ${entry.amount.toFixed(2).padStart(9)}  ${entry.category.padEnd(10)} ${entry.description} (${entry.timestamp})`
    );
  }
}
function cmdConfig() {
  console.log(
    `Expenses are stored in ${ledgerFile()}
Override with SPLITSMART_DATA_DIR.`
  );
}
var [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "add") cmdAdd(rest);
  else if (cmd === "list" || cmd === "l") cmdList(rest);
  else if (cmd === "config") cmdConfig();
  else console.log(USAGE);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
