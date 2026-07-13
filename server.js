// server.js — zero-dependency server for the agentic Back-Office AI Agent.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runTask, runAutonomous, processDueFollowups, getMemory } = require('./agent-core');
const mem = require('./memory');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  if (Buffer.isBuffer(body)) return res.end(body);
  if (typeof body === 'string') return res.end(body);
  res.end(JSON.stringify(body));
}

// Autonomous scheduler: every 30s, fire due follow-ups + drain a bit of the inbox.
let schedulerOn = false;
function startScheduler() {
  if (schedulerOn) return;
  schedulerOn = true;
  setInterval(async () => {
    try {
      const fired = processDueFollowups();
      if (fired.length) console.log('[scheduler] follow-ups fired:', fired.join(','));
      // drain up to 2 inbox items per tick so the agent self-works
      const item = mem.nextInbox();
      if (item) { await runTask(item.task); mem.completeInbox(item.task); console.log('[scheduler] processed:', item.task.slice(0, 30)); }
    } catch (e) { console.log('[scheduler] err', e.message); }
  }, 30000);
  console.log('[scheduler] started (30s)');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/run') {
    let b = ''; for await (const c of req) b += c;
    const task = (JSON.parse(b).task || '').trim();
    if (!task) return send(res, 400, { error: 'no task' });
    const r = await runTask(task);
    return send(res, 200, { trace: r.trace });
  }
  if (req.method === 'POST' && url.pathname === '/api/inbox') {
    let b = ''; for await (const c of req) b += c;
    const task = (JSON.parse(b).task || '').trim();
    if (!task) return send(res, 400, { error: 'no task' });
    mem.addInbox(task);
    return send(res, 200, { ok: true, inbox: getMemory().inbox.length });
  }
  if (req.method === 'POST' && url.pathname === '/api/autonomous') {
    let b = ''; for await (const c of req) b += c;
    const max = (JSON.parse(b).max || 5);
    const done = await runAutonomous(max);
    return send(res, 200, { done });
  }
  if (req.method === 'GET' && url.pathname === '/api/recall') {
    const q = url.searchParams.get('q') || '';
    return send(res, 200, { hits: mem.recall(q) });
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return send(res, 200, getMemory());
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const fp = path.join(PUBLIC, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
  }
  return send(res, 404, { error: 'not found' });
});

const PORT = 8092;
server.listen(PORT, '0.0.0.0', () => { console.log('AI Agent on ' + PORT); startScheduler(); });
