import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Expense {
    id: number;
    payer: string;
    amount: number;
    category: string;
    description: string;
    timestamp: string;
}

export interface ExpenseInput {
    payer?: unknown;
    amount?: unknown;
    category?: unknown;
    description?: unknown;
}

/** Where the ledger lives: SPLITSMART_DATA_DIR, then the plugin's data dir, then ~/.splitsmart. */
export function dataDir(): string {
    const candidates = [process.env.SPLITSMART_DATA_DIR, process.env.CLAUDE_PLUGIN_DATA];
    const dir = candidates.find((d) => d && !d.includes("${")) ?? join(homedir(), ".splitsmart");
    mkdirSync(dir, { recursive: true });
    return dir;
}

export const ledgerFile = () => join(dataDir(), "expense-log.jsonl");

function requiredText(value: unknown, field: string): string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
    return value.trim();
}

function optionalText(value: unknown, field: string): string {
    if (value === undefined) return "";
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    return value.trim();
}

function nextId(): number {
    const file = ledgerFile();
    if (!existsSync(file)) return 1;

    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const { id } = JSON.parse(lines[i]) as Partial<Expense>;
            if (typeof id === "number" && Number.isFinite(id)) return id + 1;
        } catch {
            // Skip malformed lines instead of failing the next insert.
        }
    }
    return lines.length + 1;
}

export function addExpense(input: ExpenseInput): Expense {
    const payer = requiredText(input.payer, "payer");
    const category = requiredText(input.category, "category");
    const description = optionalText(input.description, "description");

    const amount = input.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount)) throw new Error("amount must be a number");
    if (amount <= 0) throw new Error("amount must be greater than 0");

    const expense: Expense = {
        id: nextId(),
        payer,
        amount,
        category,
        description,
        timestamp: new Date().toISOString(),
    };
    appendFileSync(ledgerFile(), JSON.stringify(expense) + "\n");
    return expense;
}

export function listExpenses(limit?: number): Expense[] {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new Error("limit must be a positive integer");
    }

    const file = ledgerFile();
    if (!existsSync(file)) return [];

    const expenses = readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
            try {
                const entry = JSON.parse(line) as Expense;
                return typeof entry.id === "number" && typeof entry.amount === "number" ? [entry] : [];
            } catch {
                return [];
            }
        });

    const stamp = (entry: Expense) => (typeof entry.timestamp === "string" ? entry.timestamp : "");
    expenses.sort((a, b) => stamp(b).localeCompare(stamp(a)) || b.id - a.id);
    return limit === undefined ? expenses : expenses.slice(0, limit);
}
