'use strict';
// Talks to the bank server: is it up? can we start it from the project folder? (needs Node.js on this computer)
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');

function health(url, timeoutMs) {
    return new Promise((resolve) => {
        try {
            const u = new URL('/api/check-auth', url), lib = u.protocol === 'https:' ? https : http;
            const req = lib.get(u, { timeout: timeoutMs || 1500 }, (r) => { r.resume(); resolve(r.statusCode === 200); });
            req.on('timeout', () => { req.destroy(); resolve(false); }); req.on('error', () => resolve(false));
        } catch (e) { resolve(false); }
    });
}
async function waitHealthy(url, totalMs, stepMs) {
    const end = Date.now() + totalMs;
    while (Date.now() < end) { if (await health(url, 1000)) return true; await new Promise(r => setTimeout(r, stepMs || 400)); }
    return false;
}
function isLocal(url) {
    try {
        const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (h === 'localhost' || h === '0.0.0.0' || h === '::' || h === '::1' || /^127\./.test(h)) return true;
        // An address that belongs to THIS machine is still local: a server started here binds 0.0.0.0 and
        // will answer on it. An address of another PC / a tunnel is not, so we must never spawn a server for it.
        return ownAddresses().includes(h);
    } catch (e) { return false; }
}
function ownAddresses() {
    try {
        const out = [];
        for (const list of Object.values(require('os').networkInterfaces())) for (const i of (list || [])) if (i && i.address) out.push(i.address.toLowerCase());
        return out;
    } catch (e) { return []; }
}
function findServerDir(candidates) {
    for (const c of (candidates || []).filter(Boolean)) { try { if (fs.existsSync(path.join(c, 'server-sqlite.js'))) return c; } catch (e) { /* next */ } }
    return null;
}
function startServer(opts) {
    const child = spawn(opts.nodePath || 'node', ['server-sqlite.js'], { cwd: opts.dir, env: Object.assign({}, process.env, { PORT: String(opts.port || 3000) }), stdio: 'ignore', windowsHide: true });
    child.on('error', () => { /* Node.js is not installed: the offline page explains it */ });
    return child;
}
function nodeAvailable(nodePath) {
    try { const r = require('child_process').spawnSync(nodePath || 'node', ['--version'], { stdio: 'ignore', timeout: 3000, windowsHide: true }); return r.status === 0; } catch (e) { return false; }
}
module.exports = { health, waitHealthy, isLocal, findServerDir, startServer, nodeAvailable };
