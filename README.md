# Back-Office AI Agent — runnable multi-skill agent

## What it is
A real, runnable AI agent for Japanese SME back-office work. It interprets a
task, picks a skill, executes it, logs everything to an audit trail, and updates
a ticket board. Built with zero external dependencies (Node stdlib + React CDN).

## Run
cd /root/ai-agent && node server.js
→ http://localhost:8092/

## Skills (all working now)
- summarize      — summarize open tickets (JP)
- classify       — assign priority (calls LLM if key set)
- draftReply     — draft a polite JP customer reply
- followUp       — schedule a follow-up reminder (timer)
- makeCall       — TWILIO STUB (real call when TWILIO_ACCOUNT_SID/AUTH_TOKEN set)
- sendEmail      — SMTP STUB (real send when SMTP_HOST/USER/PASS set)
- delegateToClaude — shells to `claude` CLI if installed (real coding agent)
- addTicket      — log a new ticket

## LLM
- Real: set OPENROUTER_API_KEY → uses tencent/hy3:free (free tier)
- Mock: no key → deterministic JP responses (always runnable, $0)

## Audit trail
All actions recorded in audit.json (timestamp, skill, result, effects).
Shown live on the dashboard — proves to a client exactly what the agent did.

## To make it truly autonomous (external actions)
- Phone: add Twilio creds, wire `twilio` SDK in skills.makeCall
- Email: add SMTP creds, wire `nodemailer` in skills.sendEmail
- Real LLM: add OPENROUTER_API_KEY
- Coding delegate: install Claude Code CLI (`npm i -g @anthropic-ai/claude-code`)

## Files
- agent-core.js  — orchestrator (decide skill → run → audit)
- skills.js      — the capabilities (stubs for external actions)
- llm.js         — OpenRouter call + mock fallback
- server.js      — zero-dep HTTP server + API
- public/index.html — React dashboard
- audit.json     — audit trail (generated at runtime)
