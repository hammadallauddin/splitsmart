export interface ParsedAddArgs {
    payer: string;
    amount: number;
    category: string;
    description: string;
}

export interface ParsedListArgs {
    all: boolean;
    limit?: number;
}

export function parseAddArgs(args: string[]): ParsedAddArgs {
    const parsed: Partial<ParsedAddArgs> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--payer" || arg === "--amount" || arg === "--category" || arg === "--description") {
            const value = args[i + 1];
            if (value === undefined) {
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

    if (parsed.payer === undefined) throw new Error("--payer is required");
    if (parsed.amount === undefined) throw new Error("--amount is required");
    if (parsed.amount <= 0) throw new Error("--amount must be greater than 0");
    if (parsed.category === undefined) throw new Error("--category is required");

    return {
        payer: parsed.payer,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description ?? "",
    };
}

export function parseListArgs(args: string[]): ParsedListArgs {
    const parsed: ParsedListArgs = { all: false };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--all") {
            parsed.all = true;
            continue;
        }

        if (arg === "--limit") {
            const value = args[i + 1];
            if (value === undefined) {
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

    if (parsed.all && parsed.limit !== undefined) {
        throw new Error("--all cannot be combined with --limit");
    }

    return parsed;
}
