// server.js — zero-dependency (Node stdlib only). Serves agent API + dashboard.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { runTask, getAudit, getTickets } = require('./agent-core');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  if (Buffer.isBuffer(body)) return res.end(body);
  if (typeof body === 'string') return res.end(body);
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/run') {
    let body = '';
    for await (const c of req) body += c;
    let task = '';
    try { task = JSON.parse(body).task || ''; } catch {}
    if (!task.trim()) return send(res, 400, { error: 'no task' });
    const r = await runTask(task.trim());
    return send(res, 200, { skill: r.skill, log: r.log, result: r.result, effects: r.effects });
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return send(res, 200, { audit: getAudit(), tickets: getTickets() });
  }
  // static
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const fp = path.join(PUBLIC, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    return send(res, 200, fs.readFileSync(fp), MIME[path.extname(fp)] || 'text/plain');
  }
  return send(res, 404, { error: 'not found' });
});

const PORT = 8092;
server.listen(PORT, '0.0.0.0', () => console.log('AI Agent on ' + PORT));
