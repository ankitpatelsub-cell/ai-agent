// agent-core.js — agentic loop with reflection + real tool-calling.
// Loop: THINK -> choose tool -> ACT -> OBSERVE -> REFLECT -> repeat until done.
const { chat, chatWithTools } = require('./llm');
const { complete } = require('/root/shared/llm_bridge');
const { TOOL_SCHEMAS, dispatch } = require('./tools');
const mem = require('./memory');

const SYS = `You are a Back-Office AI Employee for a Japanese SME. You autonomously handle back-office work.
Given a task, decide tools to call in order. Reply with ONE tool call as JSON: {"tool":"<name>","args":{...}}.
When done, reply {"tool":"done","args":{}}. Think with the 'think' tool. Always communicate in Japanese.
If the task asks to WRITE CODE, GENERATE CODE, or explicitly says "use claude" / "claude_task", you MUST call the claude_task tool (it delegates to the local Claude CLI worker).
Tools: ${TOOL_SCHEMAS.map(t => t.name).join(', ')}.`;

// ---- Offline planner (no LLM key): deterministic decomposition ----
function planMock(task) {
  const t = task.toLowerCase();
  const steps = [{ tool: 'think', args: { note: 'タスク分析中: ' + task.slice(0, 24) } }];
  const compound = t.includes('と') || t.includes('して') || t.includes('and');
  if (t.includes('返信') || t.includes('reply') || t.includes('返答') || t.includes('メール')) {
    steps.push({ tool: 'draft_reply', args: {} });
    steps.push({ tool: 'send_email', args: { to: 'client@example.jp', subject: 'Re: お問い合わせ', body: task } });
    if (compound && t.includes('フォロー')) steps.push({ tool: 'schedule_followup', args: { ticket_id: 'T-101', minutes: 1 } });
  } else if (t.includes('電話') || t.includes('call') || t.includes('発信')) {
    steps.push({ tool: 'make_call', args: { phone: '+810000000000', message: task } });
    if (compound) steps.push({ tool: 'schedule_followup', args: { ticket_id: 'T-101', minutes: 1 } });
  } else if (t.includes('フォロー') || t.includes('follow') || t.includes('リマインド')) {
    steps.push({ tool: 'schedule_followup', args: { ticket_id: 'T-101', minutes: 1 } });
  } else if (t.includes('優先') || t.includes('分類') || t.includes('classif')) {
    steps.push({ tool: 'classify_priority', args: {} });
  } else if (t.includes('専門') || t.includes('委任') || t.includes('delegate') || t.includes('担当')) {
    steps.push({ tool: 'delegate_specialist', args: { role: 'Japanese support specialist', task } });
  } else if (t.includes('レポート') || t.includes('report') || t.includes('資料')) {
    steps.push({ tool: 'summarize_tickets', args: {} });
    steps.push({ tool: 'create_report', args: { title: '月次バックオフィスレポート', body: 'チケット要約と対応状況を記載。' } });
  } else if (t.includes('検索') || t.includes('search') || t.includes('調べ')) {
    steps.push({ tool: 'web_search', args: { query: task } });
  } else if (t.includes('チケット') || t.includes('登録') || t.includes('ticket')) {
    if (t.includes('要約') || t.includes('summary') || t.includes('まとめ')) steps.push({ tool: 'summarize_tickets', args: {} });
    else steps.push({ tool: 'log_ticket', args: { description: task } });
  } else {
    steps.push({ tool: 'summarize_tickets', args: {} });
  }
  steps.push({ tool: 'done', args: {} });
  return steps;
}

// ---- Reflection: judge if the last action's result looks broken ----
function reflect(toolName, result) {
  if (!result) return '結果が空です。再試行を検討してください。';
  if (String(result).includes('unknown tool')) return 'ツール名が不正でした。修正してください。';
  if (String(result).includes('エラー') || String(result).includes('Error')) return 'エラーが発生しました。別の手段を試してください。';
  return 'OK';
}

async function runTask(task, { maxSteps = 12 } = {}) {
  const trace = [];
  mem.pushTrace({ type: 'task', task });
  const steps = await planSteps(task);
  let i = 0;
  for (const step of steps) {
    if (step.tool === 'done') { trace.push({ tool: 'done', result: '完了' }); break; }
    if (++i > maxSteps) { trace.push({ tool: 'done', result: 'ステップ上限に達しました' }); break; }
    mem.pushTrace({ type: 'act', tool: step.tool, args: step.args });
    let r;
    try { r = await dispatch(step.tool, step.args || {}, mem); }
    catch (e) { r = { result: 'エラー: ' + e.message, effects: [] }; }
    const verdict = reflect(step.tool, r.result);
    trace.push({ tool: step.tool, result: r.result, effects: r.effects, reflection: verdict });
    mem.pushTrace({ type: 'observe', tool: step.tool, result: String(r.result).slice(0, 80), verdict });
    // self-correct on failure
    if (verdict !== 'OK' && step.tool !== 'think') {
      trace.push({ tool: 'think', result: '(reflect) ' + verdict + ' → 代替手段を検討' });
    }
  }
  return { trace, memory: mem.getState() };
}

// Plan the tool sequence using the local Claude CLI (free, authenticated).
// Falls back to mock planner if Claude is unavailable.
async function planWithClaude(task) {
  const toolList = TOOL_SCHEMAS.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const prompt = `You are a back-office AI employee. Given the task, pick a sequence of tool calls (max 4).
Available tools:\n${toolList}
Respond as a JSON array of objects {tool, args:{...}} ending with {tool:"done",args:{}}.
Only use the tool names above. Task: ${task}`;
  try {
    const r = await complete(prompt, { model: 'sonnet' });
    if (r.ok) {
      const m = r.text.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr) && arr.length) return arr.map(s => ({ tool: s.tool, args: s.args || {} }));
      }
    }
  } catch {}
  return planMock(task);
}

async function planSteps(task) {
  const key = process.env.OPENROUTER_API_KEY;
  const provider = (process.env.MODEL_PROVIDER || 'auto').toLowerCase();
  // Deterministic Claude-worker routing (uses local authenticated claude CLI, free).
  const lc = task.toLowerCase();
  if (lc.includes('claude_task') || lc.includes('use claude') || lc.includes('write code') || lc.includes('generate code') || lc.includes('コード') || lc.includes('コーディング')) {
    return [{ tool: 'think', args: { note: 'Claude worker に委任: ' + task.slice(0, 40) } }, { tool: 'claude_task', args: { task } }, { tool: 'done', args: {} }];
  }
  // Provider selection
  if (provider === 'claude') return planWithClaude(task);
  if (provider === 'openrouter') {
    if (!key) return planMock(task);
  } else if (provider === 'auto') {
    // if OpenRouter key + model set, use it; else Claude CLI
    if (!(key && process.env.OPENROUTER_MODEL)) return planWithClaude(task);
  }
  if (!key) return planMock(task);
  // Live multi-step tool-calling loop driven by the LLM
  const messages = [
    { role: 'system', content: SYS },
    { role: 'user', content: 'タスク: ' + task },
  ];
  const steps = [];
  for (let turn = 0; turn < 12; turn++) {
    let resp;
    try { resp = await chatWithTools(messages, TOOL_SCHEMAS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))); }
    catch { return planMock(task); }
    if (!resp) return planMock(task);
    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      if (resp.message) steps.push({ tool: 'think', args: { note: resp.message.slice(0, 60) } });
      steps.push({ tool: 'done', args: {} });
      break;
    }
    for (const tc of resp.toolCalls) {
      if (tc.name === 'done') { steps.push({ tool: 'done', args: {} }); break; }
      steps.push({ tool: tc.name, args: tc.args });
      // execute now to feed result back (true ReAct)
      const ex = await dispatch(tc.name, tc.args, mem);
      messages.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: tc.name, arguments: JSON.stringify(tc.args) } }] });
      messages.push({ role: 'tool', name: tc.name, content: String(ex.result) });
    }
    if (steps.some(s => s.tool === 'done')) break;
  }
  if (!steps.length) return planMock(task);
  return steps;
}

// Autonomous: pull next inbox item, run it, repeat.
async function runAutonomous(max = 5) {
  const done = [];
  for (let i = 0; i < max; i++) {
    const item = mem.nextInbox();
    if (!item) break;
    await runTask(item.task);
    mem.completeInbox(item.task);
    done.push(item.task);
  }
  return done;
}

// Scheduler: process due follow-ups (called by server timer).
function processDueFollowups() {
  const due = mem.dueFollowups();
  const fired = [];
  for (const f of due) {
    f.done = true; mem.pushTrace({ type: 'followup-fired', ticketId: f.ticketId, note: f.note });
    fired.push(f.ticketId);
  }
  if (due.length) require('fs').writeFileSync(require('path').join(__dirname, 'memory.json'), JSON.stringify(mem.getState(), null, 2));
  return fired;
}

module.exports = { runTask, runAutonomous, processDueFollowups, getMemory: mem.getState, TOOL_SCHEMAS };
