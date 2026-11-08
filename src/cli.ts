import { parseAddArgs, parseListArgs } from "./args.js";
import { addExpense, ledgerFile, listExpenses } from "./ledger.js";

const USAGE = `SplitSmart CLI

Usage:
  splitsmart add --payer <name> --amount <amount> --category <category> [--description <text>]
  splitsmart list [--limit <count> | --all]
  splitsmart config                                  Show where the ledger is stored`;

function cmdAdd(args: string[]): void {
    const expense = addExpense(parseAddArgs(args));
    console.log(JSON.stringify(expense, null, 2));
}

function cmdList(args: string[]): void {
    const parsed = parseListArgs(args);
    const expenses = listExpenses(parsed.all ? undefined : parsed.limit ?? 20);

    if (expenses.length === 0) {
        console.log("No expenses logged yet.");
        return;
    }

    for (const entry of expenses) {
        console.log(
            `#${String(entry.id).padEnd(4)} ${entry.payer.padEnd(12)} ` +
            `${entry.amount.toFixed(2).padStart(9)}  ${entry.category.padEnd(10)} ` +
            `${entry.description} (${entry.timestamp})`
        );
    }
}

function cmdConfig(): void {
    console.log(
        `Expenses are stored in ${ledgerFile()}\n` +
        `Override with SPLITSMART_DATA_DIR.`
    );
}

const [cmd, ...rest] = process.argv.slice(2);
try {
    if (cmd === "add") cmdAdd(rest);
    else if (cmd === "list" || cmd === "l") cmdList(rest);
    else if (cmd === "config") cmdConfig();
    else console.log(USAGE);
} catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
}
