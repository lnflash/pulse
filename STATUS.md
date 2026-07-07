# STATUS: Parked (2026-07-06)

This repo is frozen and archived. Parked, not rejected.

## What Pulse was

A conversational WhatsApp bot for Flash: send/receive Lightning payments by
chatting, phone-number account linking via OTP, balance checks, voice notes
(STT + TTS), an admin dashboard, and a Telegram adapter. It reached v4.0.0 —
a full hexagonal (ports & adapters) rewrite on NestJS in January 2026.

## Why it's parked

- The v4 rewrite's production deploy failed (DI token mismatch) and prod was
  rolled back; a working v4 deployment was never confirmed. By July 2026 the
  production box behind pulse.getflash.io served nothing at all.
- The v5 "Agent-Native Renovation" (issue #12) was planned in Feb–Mar 2026 and
  stalled in late March; its May 22 launch date passed.
- Flash itself soft-launched v0.6.0 in July 2026 with a small prelaunch user
  base — a WhatsApp payments agent is premature until there are users and
  volume to serve.
- Agent tooling moved on. A revival would be rebuilt agent-native (LLM agent
  SDK + a thin Baileys/WhatsApp bridge) in far less code, not by continuing
  this NestJS codebase.

## What's preserved here

- `main` — the v4.0.0 hexagonal codebase as it stood.
- `v5` + `fix/eng-231-session-persistence`, `fix/eng-232-prompt-path-conflict`,
  `fix/eng-233-wallet-adapter-injection` — the unmerged v5 work.
- Closed issues #12, #38–41 — the v5 design plan and known defects. Read #12
  first if reviving; it is effectively a design doc for the agent-native version.

## What's reusable (the actual IP)

The durable value is domain knowledge, not the framework code:

- Conversational payment UX: intent phrasing, confirmation flows, error
  recovery in chat.
- OTP phone-number ↔ Flash account linking flow.
- Voice-note handling pipeline (transcribe → act → synthesized reply).
- Persona/prompt work and the knowledge-base pattern.
- Lessons: don't hand-roll intent parsing; deploy verification must be part of
  a rewrite's definition of done; WhatsApp Web sessions need operational care.

## If you're picking this back up

Talk to the Flash team first — the successor concepts (a WhatsApp/agent play
around Flash activation) were still live ideas when this was parked. Build
agent-native, reuse the flows above as specs, and check what the
flash-support-infra wa-bridge already provides before writing a new WhatsApp
transport.
