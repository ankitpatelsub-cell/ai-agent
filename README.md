# Back-Office AI Agent — agentic multi-tool system (v2)

## What it is
A real, runnable **agentic** AI employee for Japanese SME back-office work.
It runs a **Think → Act → Observe → Reflect** loop, calls tools, keeps
**persistent memory**, runs an **autonomous scheduler**, and can **delegate to
specialist sub-agents**. Built with zero external deps (Node stdlib + React CDN).

## Run
cd /root/ai-agent && node server.js
→ http://localhost:8092/

## Agent architecture
- **Tool-calling loop** (`agent-core.js` + `tools.js`): the agent picks tools
  via LLM tool-calling when OPENROUTER_API_KEY is set; a deterministic planner
  runs it offline (no key).
- **Reflection**: after each action it judges the result (OK / retry) and
  self-corrects on failure.
- **Persistent memory** (`memory.js`): follow-ups, inbox, and audit trace
  survive server restarts (memory.json). `recall(query)` searches it.
- **Autonomous scheduler**: a 30s timer fires due follow-ups and drains the
  inbox so the agent works by itself.
- **Specialist delegation**: `delegate_specialist` routes a subtask to a focused
  LLM persona (manager→worker multi-agent pattern).

## Tools (13)
summarize_tickets, classify_priority, draft_reply, send_email (SMTP stub),
make_call (Twilio stub), schedule_followup, log_ticket, recall, web_search
(stub), create_report (writes a real .md deliverable), delegate_specialist,
delegateToClaude (CLI stub), think (CoT).

## LLM
- Real: set OPENROUTER_API_KEY → uses tencent/hy3:free (free tier), full
  multi-step tool-calling loop.
- Mock: no key → deterministic JP planner (always runnable, $0).

## Audit trail
All actions recorded in memory.json (timestamp, tool, result, reflection).
Shown live on the dashboard — proves to a client exactly what the agent did.

## To make external actions real
- Phone: set TWILIO_ACCOUNT_SID/AUTH_TOKEN, wire twilio SDK in skills.makeCall
- Email: set SMTP_HOST/USER/PASS, wire nodemailer in skills.sendEmail
- Web: set SERPER_API_KEY/BRAVE_API_KEY, wire search in skills.webSearch
- Real LLM: set OPENROUTER_API_KEY
- Coding delegate: install Claude Code CLI

## Files
- agent-core.js  — agentic loop (think/act/observe/reflect) + scheduler
- tools.js       — tool schemas + dispatcher
- skills.js       — capabilities (stubs for external actions)
- llm.js         — OpenRouter tool-calling + mock fallback
- memory.js      — persistent memory (followups, inbox, trace, recall)
- server.js      — zero-dep HTTP server + API
- public/index.html — React dashboard
- memory.json     — runtime state (gitignored)
- reports/        — generated report files (gitignored)
