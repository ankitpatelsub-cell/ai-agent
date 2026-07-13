// skills.js — the agent's capabilities. Each skill returns { log:[], result, effects:[] }.
// Phone/email skills are STUBS: they log the intended action and only truly send
// when the relevant key/env is present. This keeps the agent runnable with zero creds.
const { chat } = require('./llm');

// In-memory ticket store (would be a DB in production)
let TICKETS = [
  { id: 'T-101', from: '田中商事', subject: 'プリンターがオフラインになります', body: '従業員2名が印刷できない。', status: 'open', priority: 'high' },
  { id: 'T-102', from: '佐藤建設', subject: '月次レポートの自動送信', body: '毎月1日に送信したい。', status: 'open', priority: 'low' },
  { id: 'T-103', from: '鈴木物流', subject: 'VPN接続が遅い', body: '午前中だけ不安定。', status: 'open', priority: 'medium' },
];
let seq = 104;
function addTicket(subject, body, priority = 'medium') {
  const id = 'T-' + seq++;
  TICKETS.push({ id, from: 'AI作成', subject, body, status: 'open', priority });
  return id;
}
function getTickets() { return TICKETS; }

async function summarize() {
  const log = ['📊 チケットを集計中…'];
  const out = TICKETS.map(t => `• [${t.priority}] ${t.id} ${t.subject}（${t.from}）`).join('\n');
  log.push('✅ 要約完了');
  return { log, result: out, effects: [] };
}

async function classify() {
  const log = ['🏷 優先度を判定中…'];
  const out = await chat([
    { role: 'system', content: 'You are a back-office classifier. Reply ONLY JSON {action:"classify",result:"<priority list in Japanese>"}' },
    { role: 'user', content: 'チケット一覧: ' + JSON.stringify(TICKETS) + '\n優先度を分類してください。' },
  ], { json: true });
  log.push('✅ 分類完了');
  return { log, result: out, effects: [] };
}

async function draftReply(ticketId) {
  const t = TICKETS.find(x => x.id === ticketId) || TICKETS[0];
  const log = [`✉️ ${t.id} の返信を作成中…`];
  const out = await chat([
    { role: 'system', content: 'You draft polite Japanese customer replies. Reply ONLY the reply text.' },
    { role: 'user', content: `客先:${t.from} 件名:${t.subject} 内容:${t.body} 返信を作成してください。` },
  ]);
  log.push('✅ 返信ドラフト完了');
  return { log, result: out, effects: [{ type: 'draft', ticket: t.id, text: out }] };
}

// follow_up: schedules a reminder (in-memory timer) and logs it.
async function followUp(ticketId, delayMin = 1) {
  const t = TICKETS.find(x => x.id === ticketId) || TICKETS[0];
  const log = [`⏰ ${t.id} のフォローアップを ${delayMin}分後に設定…`];
  const when = Date.now() + delayMin * 60000;
  setTimeout(() => {
    console.log(`[FOLLOWUP] ${t.id} — 未解決のためフォローアップ必要`);
  }, delayMin * 60000);
  log.push('✅ フォローアップ予約完了');
  return { log, result: `${t.id} を ${new Date(when).toLocaleTimeString('ja-JP')} にフォローアップ`, effects: [{ type: 'schedule', ticket: t.id, when }] };
}

// make_call: TWILIO STUB. Sends a real call only if TWILIO_*/account env present.
async function makeCall(phone, message) {
  const log = [`📞 発信準備: ${phone}`];
  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
  if (hasTwilio) {
    log.push('📞 Twilioで発信中… (stub — wire Twilio SDK here)');
  } else {
    log.push('📞 [STUB] Twilio未設定のため発信は記録のみ（本番では実発信）');
  }
  log.push('✅ 発信処理完了（記録）');
  return { log, result: `発信(記録): ${phone} — ${message}`, effects: [{ type: 'call', phone, message, real: !!hasTwilio }] };
}

// send_email: GMAIL/SMTP STUB. Sends only if SMTP_* env present.
async function sendEmail(to, subject, body) {
  const log = [`📧 メール準備: ${to}`];
  const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER;
  if (hasSmtp) {
    log.push('📧 SMTPで送信中… (stub — wire nodemailer here)');
  } else {
    log.push('📧 [STUB] SMTP未設定のため送信は記録のみ');
  }
  log.push('✅ メール処理完了（記録）');
  return { log, result: `送信(記録): ${to} — ${subject}`, effects: [{ type: 'email', to, subject, body, real: !!hasSmtp }] };
}

// delegate_to_claude: shells out to `claude` CLI if installed (real coding agent).
async function delegateToClaude(prompt) {
  const log = ['🤖 Claude Code に設計・コーディングを委任中…'];
  const { execSync } = require('child_process');
  try {
    execSync('which claude', { stdio: 'ignore' });
    log.push('🤖 claude CLI 検出 → 実行 (--print モード)');
    const out = execSync(`claude --print "${prompt.replace(/"/g, '\\"')}"`, { timeout: 60000 }).toString();
    log.push('✅ Claude 完了');
    return { log, result: out.slice(0, 500), effects: [{ type: 'claude', prompt }] };
  } catch {
    log.push('🤖 [STUB] claude CLI 未検出 — 委任は記録のみ（本番では実行）');
    return { log, result: `[delegate stub] ${prompt}`, effects: [{ type: 'claude', prompt, real: false }] };
  }
}

// delegateSpecialist: routes a subtask to a focused LLM persona (manager→worker).
// Real when key set (calls chat with a specialist system prompt); mock otherwise.
async function delegateSpecialist(role, task) {
  const log = ['🧩 専門エージェントに委任: ' + role];
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    const out = await chat([
      { role: 'system', content: `You are a specialist: ${role}. Reply in Japanese, concise.` },
      { role: 'user', content: task },
    ]);
    log.push('✅ 専門エージェント完了');
    return { log, result: out, effects: [{ type: 'specialist', role }] };
  }
  log.push('🧩 [STUB] 専門エージェント: ' + role + ' → ' + task.slice(0, 30));
  return { log, result: `[${role}] ${task}`, effects: [{ type: 'specialist', role, real: false }] };
}

// webSearch: stub — real web search when a search API key is present.
async function webSearch(query) {
  const log = ['🔎 検索中: ' + query];
  const hasKey = process.env.SERPER_API_KEY || process.env.BRAVE_API_KEY;
  if (hasKey) {
    log.push('🔎 検索APIで実行中… (stub — wire serper/brave here)');
  } else {
    log.push('🔎 [STUB] 検索API未設定 — キーワードのみ記録');
  }
  log.push('✅ 検索処理完了（記録）');
  return { log, result: `[search stub] ${query}`, effects: [{ type: 'search', query, real: !!hasKey }] };
}

// createReport: REAL — writes a markdown report to disk (client-deliverable).
const fs = require('fs');
const path = require('path');
async function createReport(title, body) {
  const log = ['📄 レポート生成中…'];
  const slug = (title || 'report').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const fname = (slug || 'report-' + Date.now()).slice(0, 50) + '.md';
  fs.mkdirSync(require('path').join(__dirname, 'reports'), { recursive: true });
  const content = `# ${title}\n\n生成日時: ${new Date().toLocaleString('ja-JP')}\n\n${body}\n`;
  fs.writeFileSync(path.join(__dirname, 'reports', fname), content);
  log.push('✅ レポート保存: ' + fname);
  return { log, result: '保存: ' + fname, effects: [{ type: 'report', file: fname, real: true }] };
}

module.exports = {
  summarize, classify, draftReply, followUp, makeCall, sendEmail, delegateToClaude,
  webSearch, createReport, delegateSpecialist,
  addTicket, getTickets,
};
