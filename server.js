// server.js — zero-dependency server for the agentic Back-Office AI Agent.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runTask, runAutonomous, processDueFollowups, getMemory } = require('./agent-core');
const mem = require('./memory');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const { limited } = require('./ratelimit');
const dash = require('./dashauth');
try { const ep = path.join(__dirname, '.env'); if (fs.existsSync(ep)) for (const line of fs.readFileSync(ep, 'utf8').split('\n')) { const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {}

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
  if (req.method === 'POST' && limited(req.socket.remoteAddress)) return send(res, 429, { error: 'rate limit' });
  async function readBody() {
    let b = ''; for await (const c of req) b += c;
    try { return JSON.parse(b || '{}'); } catch { return {}; }
  }
  if (req.method === 'POST' && url.pathname === '/api/run') {
    const body = await readBody();
    const task = (body.task || '').trim();
    if (!task) return send(res, 400, { error: 'no task' });
    const r = await runTask(task);
    return send(res, 200, { trace: r.trace });
  }
  if (req.method === 'POST' && url.pathname === '/api/inbox') {
    const body = await readBody();
    const task = (body.task || '').trim();
    if (!task) return send(res, 400, { error: 'no task' });
    mem.addInbox(task);
    return send(res, 200, { ok: true, inbox: getMemory().inbox.length });
  }
  if (req.method === 'POST' && url.pathname === '/api/autonomous') {
    const body = await readBody();
    const max = (body.max || 5);
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
  if (req.method === 'POST' && url.pathname === '/api/dash-login') {
    const b = await readBody();
    if (dash.checkPass(b.password)) return send(res, 200, { token: dash.makeToken() });
    return send(res, 401, { error: 'unauthorized' });
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (p === '/index.html' && !dash.checkToken(req.headers['x-auth-token'] || (req.headers['cookie'] || '').match(/dash=([^;]+)/)?.[1] || '')) {
    return send(res, 200, dash.LOGIN_HTML, 'text/html');
  }
  const fp = path.join(PUBLIC, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
  }
  return send(res, 404, { error: 'not found' });
});

const PORT = 8092;
server.listen(PORT, '0.0.0.0', () => { console.log('AI Agent on ' + PORT); startScheduler(); });
