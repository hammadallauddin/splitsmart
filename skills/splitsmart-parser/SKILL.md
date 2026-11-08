---
name: splitsmart-parser
description: Categorizes and structures receipt text into standardized bill entries.
---

# Bill Parsing Rules
- Food & Drinks -> `Dining`
- Utilities -> `Utilities`
- Fuel/Rides -> `Travel`
- Anything else -> `Other`

For every bill:
1. Extract the payer, total amount, category and a short description.
2. Split the total evenly across the named participants unless the text says otherwise, rounding to 2 decimals.
3. Output the individual owed shares in a markdown table before the entry is stored.
