// ratelimit.js — minimal in-memory per-IP POST limiter (20 req / 60s).
const hits = new Map(); // ip -> [timestamps]
function limited(ip) {
  const now = Date.now();
  const w = hits.get(ip) || [];
  const recent = w.filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}
module.exports = { limited };
