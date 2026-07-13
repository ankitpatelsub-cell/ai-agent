// dashauth.js — shared dashboard auth for hospital/hotel/manager/back-office.
const crypto = require('crypto');
const SECRET = process.env.ADMIN_SECRET || 'dev-only-change-me';
function makeToken() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', SECRET).update(ts).digest('hex');
  return Buffer.from(ts).toString('base64url') + '.' + sig;
}
function checkToken(tok) {
  if (!tok) return false;
  const [tsB64, sig] = tok.split('.');
  if (!tsB64 || !sig) return false;
  const ts = Buffer.from(tsB64, 'base64url').toString();
  const expect = crypto.createHmac('sha256', SECRET).update(ts).digest('hex');
  if (sig !== expect) return false;
  if (Date.now() - (+ts) > 12 * 3600 * 1000) return false;
  return true;
}
function checkPass(p) { return typeof p === 'string' && p === (process.env.ADMIN_PASS || 'admin123'); }
// Login page served when a protected page is requested without a token.
const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-store"><title>Login</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800&display=swap" rel="stylesheet">
<style>body{font-family:Inter,system-ui,sans-serif;background:linear-gradient(135deg,#0f1f33,#1f5fae);display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#fff;padding:28px;border-radius:16px;width:320px} h3{margin:0 0 12px;color:#0f1f33}
input{width:100%;height:42px;border:1px solid #e6ecf3;border-radius:10px;padding:0 12px;font-size:14px;margin-bottom:10px}
button{width:100%;height:42px;background:#1f5fae;color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer}
#e{color:#c0392b;font-size:12px;min-height:14px;margin-top:6px}</style></head>
<body><div class="box"><h3>🔐 Staff login</h3>
<input id="p" type="password" placeholder="admin password"><button onclick="go()">Login</button><div id="e"></div></div>
<script>async function go(){const r=await fetch('/api/dash-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p.value})});
if(r.ok){const d=await r.json();document.cookie='dash='+d.token+';path=/;max-age=43200;samesite=lax';localStorage.setItem('dash_token',d.token);location.href=location.pathname;}
else e.textContent='wrong password';}
p.addEventListener('keydown',function(ev){if(ev.key==='Enter')go();});</script></body></html>`;
module.exports = { makeToken, checkToken, checkPass, LOGIN_HTML };
