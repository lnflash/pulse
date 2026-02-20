# Bill Splitting — Group Payment Feature

Feature flag: `billSplittingEnabled`

Pulse can split a bill among a group of contacts, track who has paid, and send reminders to those who haven't.

---

## Overview

Bill splitting is designed for real Caribbean scenarios:
- Splitting a restaurant tab after a family dinner
- Collecting contributions for a group gift
- Sharing the cost of a fete or party
- A sou-sou turn (group savings pot) — basic version

---

## Starting a Split

### Trigger Phrases
Users can initiate a split with natural language:

| What they say | Intent |
|--------------|--------|
| "Split $8,000 JMD among me, Marcus, and Kezia" | Split 3-way evenly |
| "We need to collect $20,000 — 4 of us" | Group collection, 4 people |
| "Marcus, Kezia, and Mum owe me for dinner" | Collect from 3 contacts |
| "Split the bill from last night" | Needs clarification (amount) |

### Required Information
Before creating a split, confirm:
1. **Total amount** (and currency)
2. **Participants** — the user plus who else
3. **Split type** — even split or custom amounts
4. **The user's share** — do they owe anything, or are they just collecting?

### Clarification Flow
If any of the above is missing, ask one question at a time:

```
How much is the total bill?
```

Then:
```
Who's splitting it with you? (You can give me names or Flash usernames)
```

Then (if needed):
```
Split evenly, or does someone owe more?
```

---

## Confirmation Screen

Before creating the split, always confirm:

```
Here's the split for **$8,000 JMD**:

👤 You — $2,667 JMD (your share: already paid)
👤 Marcus — $2,667 JMD (owes you)
👤 Kezia — $2,666 JMD (owes you)

I'll send Marcus and Kezia a payment request. Confirm?
```

Note: When the split is uneven due to rounding, the smallest amount goes to the last person listed (or the user, if they're collecting).

---

## Payment Requests

Once confirmed, Pulse sends each participant a payment request via Flash. The message to each participant:

```
Hey! [User's display name] is collecting **$2,667 JMD** for [purpose if known, e.g. "dinner on Friday"].

Send to [user's Flash username] — or reply here if you have questions.
```

The user sees a confirmation:
```
Done ✅ Payment requests sent to Marcus and Kezia.

I'll let you know when they pay.
```

---

## Tracking Who Has Paid

The split state is stored in `session.flowState` under the split ID. Pulse can report status at any time:

**User asks:** "Who's paid me back for dinner?"

```
Here's where things stand:

✅ Kezia — paid $2,666 JMD (this morning)
⏳ Marcus — still owes $2,667 JMD (requested yesterday)

Want me to send Marcus a reminder?
```

Display:
- ✅ for settled
- ⏳ for pending
- ❌ for declined/cancelled

---

## Sending Reminders

If a participant hasn't paid after 24 hours, Pulse can send a reminder:

**User initiates:** "Remind Marcus about the dinner money"
**Or Pulse proactively:** "Marcus hasn't paid back his $2,667 JMD from the dinner split (2 days ago). Want me to send a reminder?"

Reminder message to Marcus:
```
Hey Marcus! Just a reminder about the $2,667 JMD for dinner — you can send it to [Flash username] whenever you're ready. No rush 🙏
```

**Reminder rules:**
- Max 2 automated reminders per split (don't spam contacts)
- User can always send a manual reminder regardless of count
- 48 hours minimum between automated reminders
- Never send a reminder if the user is the debtor (only to debtors)

---

## Split Types

### Even Split (Default)
Total ÷ number of participants, rounded to nearest dollar. Smallest rounding error goes to last participant.

### Custom Amounts
If the user specifies different amounts:
```
"Marcus owes $4,000, Kezia owes $2,000, and I'm covering the rest of the $10,000"
```

Pulse confirms the math:
```
Let me check:
Marcus: $4,000
Kezia: $2,000
You: $4,000 (remaining)
Total: $10,000 ✅

That adds up. Confirm?
```

If it doesn't add up:
```
Hmm — those amounts come to $9,500, but the total is $10,000. There's $500 unaccounted for. Want to adjust?
```

### Collect From Group (No User Share)
When the user is collecting from others and doesn't owe anything:
```
You're collecting $15,000 JMD total:
Marcus — $5,000
Kezia — $5,000
Dad — $5,000

Confirmed — I'll send payment requests to all three.
```

---

## Closing a Split

Once all participants have paid, close the split automatically and notify the user:

```
All paid up! 🎉 The $8,000 JMD split for dinner is settled:

✅ Marcus — $2,667 JMD
✅ Kezia — $2,666 JMD

Total collected: $5,333 JMD
```

User can also manually close a split if someone paid outside of Flash:
```
"Marcus paid me cash — mark him as done"
```

```
Got it — marking Marcus as paid. The split is now settled.
```

---

## Limitations and Edge Cases

### Non-Flash Participants
If a participant doesn't have a Flash account:
```
I don't see a Flash account for "Devon". Do you have his phone number or another way to reach him?

If not, I can still track his share — you'd just need to collect from him separately.
```

### Large Groups (> 10 people)
Supported, but suggest creating a group collection instead of individual requests:
```
That's 12 people — want me to create a shared payment link everyone can use instead? Might be easier.
```

### User Is the Debtor
If the user owes someone else (e.g., "I need to pay my share of $10,000 to Marcus"):
→ This is just a regular payment, not a split. Route to the standard send-payment flow.

### Disputed Amounts
If someone contests what they owe:
```
No problem — I can adjust Marcus's amount. How much should he owe?
```

The user controls the split. Pulse adjusts without drama.

---

## Technical Notes

- Split state stored in user's `session.flowState` under key `activeSplit`
- Split ID generated as `split_[timestamp]_[phoneHash]`
- Flash API handles payment request delivery to participants
- Settled status determined by incoming payment matching the split ID reference
- Splits expire after 30 days if unclosed
