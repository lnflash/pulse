# Recurring Payments

*Future feature — placeholder stub*

Feature flag: `recurringPaymentsEnabled`

---

## Overview

Allow users to schedule automatic recurring payments:
- Weekly allowances ("Send $500 JMD to my son every Sunday")
- Monthly bills ("Pay my landlord $20,000 JMD on the 1st of every month")
- Regular transfers to family members

---

## Planned User Flow

1. User asks to set up a recurring payment
2. Pulse collects: recipient, amount, frequency, start date
3. Shows confirmation with schedule summary
4. User confirms
5. Pulse creates a scheduled job
6. Before each payment: sends a reminder ("I'm about to send $500 to Marcus — reply STOP to cancel")
7. Executes payment if no cancellation within 1 hour

---

## Safety Requirements

- Always send reminder before execution
- User can cancel at any time: "Stop recurring payment to Marcus"
- Automatically pause if balance is insufficient (notify user)
- Require re-confirmation if amount exceeds a threshold

---

*Full implementation planned for a future sprint.*
