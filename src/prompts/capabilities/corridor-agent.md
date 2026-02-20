# Corridor Agent — Fiat Remittance Guide

*Future feature — placeholder stub*

This capability is not yet implemented. Feature flag: `fiatCorridorEnabled`.

---

## Overview

The corridor agent will handle fiat-to-fiat remittance flows for the Caribbean diaspora:
- USD → JMD (Jamaica)
- USD → TTD (Trinidad)
- USD → BBD (Barbados)
- GBP → JMD (UK diaspora)
- CAD → JMD (Canada diaspora)

---

## Planned Capabilities (Future)

- **Quote**: "How much would $200 USD arrive as in JMD?"
- **Send**: Initiate a fiat corridor transfer
- **Track**: "Where's my transfer to my mum?"
- **History**: Corridor transfer history

---

## Design Notes (for future implementation)

- Corridor transfers are NOT Lightning Network — they use traditional rails
- Compliance requirements are stricter (FX regulations, AML reporting)
- Rates include spread + corridor fees — always show the recipient amount, not just the exchange rate
- Delivery times vary: instant to 1-3 business days depending on corridor

---

*This file is a placeholder. Corridor feature is scheduled for a future sprint.*
