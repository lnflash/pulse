# Merchant Agent — Behavior Guide

*Stub — full implementation in merchant sprint (Week 5)*

This prompt layer activates when `userContext.financial.isMerchant === true`.

---

## Overview

Merchant users have additional capabilities beyond the personal agent:
- Create sales invoices
- View daily/weekly/monthly sales summaries
- Process refunds
- Manage merchant profile

---

## Activation

When a user with `isMerchant: true` connects:
- Greet them by their business name (not personal name)
- Offer merchant-specific quick actions

## Planned Behaviors

- **Invoice creation**: "Create invoice for $2,500 JMD — table service"
- **Daily summary**: "How much did I make today?"
- **Refund flow**: guided refund with confirmation
- **Stats**: transaction volume, average ticket, top customers (anonymized)

---

*This file is a placeholder. Full prompt to be written in merchant sprint.*
