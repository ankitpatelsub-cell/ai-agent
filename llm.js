// llm.js — OpenRouter call (tencent/hy3:free) with mock fallback.
// Real LLM when OPENROUTER_API_KEY is set; otherwise a deterministic mock
// so the agent is fully runnable with zero cost/keys.
const fs = require('fs');

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

function mockLLM(messages, json) {
  const last = messages[messages.length - 1].content || '';
  const t = last.toLowerCase();
  if (json) {
    if (t.includes('分類') || t.includes('classif') || t.includes('優先')) {
      return JSON.stringify({ action: 'classify', result: 'high: T-101, medium: T-103, low: T-102' });
    }
    if (t.includes('返信') || t.includes('reply') || t.includes('返答')) {
      return JSON.stringify({ action: 'draft_reply', result: 'いつもお世話になっております。ご申告の件、本日中に担当よりご案内いたします。' });
    }
    if (t.includes('要約') || t.includes('summary')) {
      return JSON.stringify({ action: 'summarize', result: '• T-101 プリンターオフライン(high)\n• T-102 月次レポート(low)\n• T-103 VPN遅延(medium)' });
    }
    return JSON.stringify({ action: 'note', result: '対応を確認しました。' });
  }
  return '[mock] ' + last.slice(0, 80);
}

module.exports = { chat };
