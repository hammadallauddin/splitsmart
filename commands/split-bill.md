---
description: Split a bill quickly among friends. Usage: /split-bill <amount> paid by <name> for <details>
argument-hint: <amount> paid by <name> for <details>
---

Split the bill described here: $ARGUMENTS

1. Parse the request with the `splitsmart-parser` skill rules to get the payer, amount, category and description.
2. Calculate each participant's owed share and show a markdown table before storing anything.
3. Call the `add_expense` tool from the splitsmart MCP server with `payer`, `amount`, `category` and `description`.
4. Report the stored entry id and the settlement summary.
