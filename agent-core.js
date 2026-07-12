// agent-core.js — orchestrator. Interprets a task, dispatches a skill,
// writes an audit log. Runs autonomously when started, or on-demand via API.
const fs = require('fs');
const path = require('path');
const S = require('./skills');
const { chat } = require('./llm');

const AUDIT = path.join(__dirname, 'audit.json');
function loadAudit() { try { return JSON.parse(fs.readFileSync(AUDIT, 'utf8')); } catch { return []; } }
function saveAudit(a) { fs.writeFileSync(AUDIT, JSON.stringify(a, null, 2)); }
let audit = loadAudit();

function record(entry) {
  audit.unshift({ ts: new Date().toISOString(), ...entry });
  if (audit.length > 200) audit = audit.slice(0, 200);
  saveAudit(audit);
}

// Decide which skill a task maps to.
async function decideSkill(task) {
  const t = task.toLowerCase();
  if (t.includes('要約') || t.includes('summary') || t.includes('まとめ')) return 'summarize';
  if (t.includes('返信') || t.includes('reply') || t.includes('返答') || t.includes('メール')) return 'sendEmail';
  if (t.includes('電話') || t.includes('call') || t.includes('発信')) return 'makeCall';
  if (t.includes('フォロー') || t.includes('follow') || t.includes('リマインド')) return 'followUp';
  if (t.includes('優先') || t.includes('分類') || t.includes('classif')) return 'classify';
  if (t.includes('claude') || t.includes('コード') || t.includes('設計') || t.includes('コーディング')) return 'delegateToClaude';
  if (t.includes('チケット') || t.includes('登録') || t.includes('ticket') || t.includes('log')) return 'addTicket';
  return 'classify'; // safe default
}

async function runTask(task) {
  const skill = await decideSkill(task);
  record({ type: 'task', task, skill });
  let res;
  try {
    switch (skill) {
      case 'summarize': res = await S.summarize(); break;
      case 'classify': res = await S.classify(); break;
      case 'draftReply': res = await S.draftReply(); break;
      case 'sendEmail': res = await S.sendEmail('client@example.jp', 'Re: お問い合わせ', task); break;
      case 'makeCall': res = await S.makeCall('+810000000000', task); break;
      case 'followUp': res = await S.followUp(); break;
      case 'delegateToClaude': res = await S.delegateToClaude(task); break;
      case 'addTicket': { const id = S.addTicket(task.slice(0, 30), task); res = { log: ['🆕 チケット作成'], result: id, effects: [] }; break; }
      default: res = await S.classify();
    }
  } catch (e) { res = { log: ['❌ エラー: ' + e.message], result: '', effects: [] }; }
  record({ type: 'result', skill, result: res.result, effects: res.effects });
  return { skill, ...res };
}

module.exports = { runTask, decideSkill, getAudit: () => audit, getTickets: S.getTickets };
