import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { addExpense, listExpenses } from "./ledger.js";

const server = new Server({ name: "splitsmart-ledger", version: "1.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "add_expense",
            description:
                "Records one shared expense in the local ledger. Amounts must be greater than 0. " +
                "Returns the stored entry with its id and timestamp.",
            inputSchema: {
                type: "object",
                properties: {
                    payer: { type: "string", description: "Name of the person who paid" },
                    amount: { type: "number", description: "Amount paid, greater than 0" },
                    category: { type: "string", description: "Category such as Dining, Utilities or Travel" },
                    description: { type: "string", description: "What the expense was for and who shared it" },
                },
                required: ["payer", "amount", "category"],
            },
        },
        {
            name: "get_ledger",
            description: "Returns recorded expenses, newest first. Omit limit to return the whole ledger.",
            inputSchema: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Maximum number of entries to return" },
                },
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "add_expense" && req.params.name !== "get_ledger") {
        throw new Error(`Unknown tool: ${req.params.name}`);
    }

    try {
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;

        if (req.params.name === "add_expense") {
            const expense = addExpense(args);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, ...expense }, null, 2) }] };
        }

        const limit = args.limit;
        if (limit !== undefined && typeof limit !== "number") {
            throw new Error("limit must be a number");
        }
        return { content: [{ type: "text", text: JSON.stringify(listExpenses(limit as number | undefined), null, 2) }] };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
    }
});

await server.connect(new StdioServerTransport());
