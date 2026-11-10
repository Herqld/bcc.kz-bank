'use strict';
// Finds public URLs that currently point at this server (demo tunnels).
// Sources, in order: the PUBLIC_URL environment variable, the file written by
// tools/tunnel.js (logs/public-url.txt), and the local ngrok API (127.0.0.1:4040).
// The file is re-read on every call, so you can start the tunnel AFTER the server.
// A stale tunnel file is ignored after TUNNEL_FILE_MAX_AGE_MS (a dead cloudflare
// quick tunnel leaves its old URL in the file when you close its window).
const fs = require('fs'), http = require('http'), path = require('path');

const URL_FILE = path.join(__dirname, '..', 'logs', 'public-url.txt');
const TUNNEL_FILE_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // one working day

function readUrlFile() {
    try {
        const age = Date.now() - fs.statSync(URL_FILE).mtimeMs;
        if (age > TUNNEL_FILE_MAX_AGE_MS) return null;
        const u = fs.readFileSync(URL_FILE, 'utf8').trim().replace(/\/+$/, '');
        return /^https:\/\/.+/i.test(u) ? u : null;
    } catch (e) { return null; }
}

function writeUrlFile(url) {
    fs.mkdirSync(path.dirname(URL_FILE), { recursive: true });
    fs.writeFileSync(URL_FILE, String(url).trim() + '\n');
    return URL_FILE;
}

function ngrokUrl(timeoutMs) {
    return new Promise((resolve) => {
        try {
            const req = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: timeoutMs || 700 }, (res) => {
                let body = '';
                res.on('data', (c) => body += c);
                res.on('end', () => {
                    try {
                        const j = JSON.parse(body);
                        const t = (j.tunnels || []).filter(x => x.public_url && x.public_url.startsWith('https://')).pop();
                        resolve(t ? t.public_url : null);
                    } catch (e) { resolve(null); }
                });
            });
            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.on('error', () => resolve(null));
        } catch (e) { resolve(null); }
    });
}

async function publicUrls() {
    const out = [];
    const push = (u) => { if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u); };
    push(readUrlFile());
    push(String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, ''));
    push(await ngrokUrl());
    return out;
}

module.exports = { publicUrls, writeUrlFile, readUrlFile, URL_FILE };

