// llm.js — OpenRouter chat with tool-calling support + mock fallback.
// Real: when OPENROUTER_API_KEY set (from .env), supports multi-turn tool-calling.
// Mock: deterministic planner so the agent runs with zero cost/keys.
const fs = require('fs');
const path = require('path');

// Minimal .env loader (zero dependency).
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

async function chat(messages, { json = false } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://nihon-offshore.local' },
      body: JSON.stringify({ model: 'tencent/hy3:free', messages, temperature: 0.4 }),
    });
    const j = await res.json();
    return j.choices?.[0]?.message?.content || '';
  }
  return mockLLM(messages, json);
}

// Tool-calling round. Returns { message, toolCalls } where toolCalls is an array
// of {name, args}. If none, toolCalls is empty and message holds the final text.
async function chatWithTools(messages, tools) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null; // signal caller to use mock planner
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://nihon-offshore.local' },
    body: JSON.stringify({ model: 'tencent/hy3:free', messages, tools, tool_choice: 'auto', temperature: 0.3 }),
  });
  const j = await res.json();
  const msg = j.choices?.[0]?.message || {};
  const calls = (msg.tool_calls || []).map(tc => {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
    return { name: tc.function.name, args };
  });
  return { message: msg.content || '', toolCalls: calls };
}

function mockLLM(messages, json) {
  const last = messages[messages.length - 1].content || '';
  const t = last.toLowerCase();
  if (json) {
    if (t.includes('分類') || t.includes('classif') || t.includes('優先')) return JSON.stringify({ action: 'classify', result: 'high: T-101, medium: T-103, low: T-102' });
    if (t.includes('返信') || t.includes('reply') || t.includes('返答')) return JSON.stringify({ action: 'draft_reply', result: 'いつもお世話になっております。ご申告の件、本日中に担当よりご案内いたします。' });
    if (t.includes('要約') || t.includes('summary')) return JSON.stringify({ action: 'summarize', result: '• T-101 プリンターオフライン(high)\n• T-102 月次レポート(low)\n• T-103 VPN遅延(medium)' });
    return JSON.stringify({ action: 'note', result: '対応を確認しました。' });
  }
  return '[mock] ' + last.slice(0, 80);
}

module.exports = { chat, chatWithTools };
