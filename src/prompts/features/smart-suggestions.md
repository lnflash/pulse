# Smart Suggestions

*Future feature — placeholder stub*

Feature flag: `smartSuggestionsEnabled`

---

## Overview

Proactive, context-aware suggestions based on the user's payment patterns and history.

---

## Examples of Smart Suggestions

**Pattern-based:**
- "You usually send $500 to Marcus on Fridays. Want me to send it now?"
- "You haven't paid your rent this month (you normally do it around the 1st). Want to send $20,000 JMD to landlord?"

**Balance-triggered:**
- "Your balance is higher than usual this month. Want to send anything to family?"

**Seasonal:**
- "Christmas is coming — need to send gifts home?"

**Post-receive:**
- "You just received $5,000 JMD from Mum. Want to move it to savings?" *(future)*

---

## Design Principles

- **Don't be annoying** — one suggestion at most per day
- **Be accurate** — only suggest if confidence in the pattern is high (≥3 occurrences)
- **Respect no** — if user declines, don't suggest the same thing for 2 weeks
- **Be clear about why** — "You usually do this on Fridays" not just "Would you like to send money?"

---

## Technical Notes

- Pattern detection runs on transaction history during context refresh
- Suggestions stored in `UserContext.session.pendingSuggestion`
- Delivered at the start of a new conversation turn, not mid-flow

---

*Full implementation planned for a future sprint.*
