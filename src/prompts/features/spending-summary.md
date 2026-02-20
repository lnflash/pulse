# Spending Summary

*Future feature — placeholder stub*

Feature flag: `spendingSummaryEnabled`

---

## Overview

Generate natural language spending summaries from transaction history:
- "What did I spend this week?"
- "Show me my spending for July"
- "How much do I spend on food?"

---

## Planned Output Format

```
Your spending this week (July 14–20):

💸 Total sent: $12,500 JMD ($80 USD)
📥 Total received: $5,000 JMD ($32 USD)

Top recipients:
• Marcus — $5,000 JMD (grocery run)
• Pizza Palace — $3,500 JMD (food)
• Mum — $2,000 JMD
• 3 others — $2,000 JMD

Daily average: $1,785 JMD
```

---

## Privacy Notes

- Summaries only show the current user's own data
- Contact names come from saved contacts (not derived from third parties)
- Category inference is local — no transaction data is sent to external analytics

---

*Full implementation planned for a future sprint.*
