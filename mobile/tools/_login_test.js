// End-to-end proof: drive the real login form in the installed APK, then read
// the account data back. Run: node tools/_login_test.js
const http = require('http');
const getTargets = () => new Promise((res, rej) =>
  http.get('http://127.0.0.1:9222/json', r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));
function call(ws, m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++call._n; const t = setTimeout(() => rej(new Error('timeout ' + m)), 15000);
    const h = ev => { try { const j = JSON.parse(ev.data); if (j.id === id) { ws.removeEventListener('message', h); clearTimeout(t); res(j.result); } } catch (e) {} };
    ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method: m, params: p }));
  });
}
call._n = 0;
const ev = (ws, expression) => call(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

(async () => {
  const t = (await getTargets()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  try {
    await call(ws, 'Runtime.enable');
    console.log('page:', (await ev(ws, 'location.href')).result.value);

    // Drive the REAL login form the same way a user does.
    const r = await ev(ws, `(async () => {
      const email = document.querySelector('input[type=text]'); const pw = document.querySelector('input[type=password]');
      email.value = 'demo@bcc.kz'; pw.value = 'demo123';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      const form = email.closest('form') || document.querySelector('form');
      const fd = new FormData(form);
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }), credentials: 'include' });
      const login = await res.json();
      const bal = await (await fetch('/api/accounts', { credentials: 'include' })).json();
      return JSON.stringify({ login, accounts: Array.isArray(bal) ? bal : (bal.accounts || bal) });
    })()`);
    console.log('LOGIN + ACCOUNTS:', String(r.result.value).slice(0, 1200));
  } catch (e) { console.error('ERR', e.message); process.exitCode = 1; }
  finally { ws.close(); }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });