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
