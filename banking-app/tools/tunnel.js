'use strict';
// CODDY 2.2 - open your server to the whole internet (DEMO app, no real money).
//
//   node tools/tunnel.js            -> tries cloudflared, then ngrok, then ssh (localhost.run)
//   node tools/tunnel.js cloudflared
//   node tools/tunnel.js ngrok
//   node tools/tunnel.js ssh
//
// What it does:
//   1. checks the bank server is running on http://localhost:3000
//   2. starts a free tunnel to it
//   3. waits until the public https URL really answers (checks it with a real request)
//   4. writes it to logs/public-url.txt so START.bat / the QR page / the desktop app pick it up
//   5. keeps running - close this window (or Ctrl+C) and the public address stops working
const fs = require('fs'), http = require('http'), https = require('https'), path = require('path'), { spawn, spawnSync } = require('child_process');
const tunnels = require('../lib/tunnels');

const TARGET = process.env.TUNNEL_TARGET || 'http://localhost:3000';
const PORT = Number(new URL(TARGET).port || 3000);
const which = (cmd) => { try { return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0; } catch (e) { return false; } };

// spawn() uses process.env.PATH. In some setups (a launched .bat, a service, a
// non-interactive shell) Node's PATH does not include the directory that holds
// npx/cloudflared/ngrok, so spawn('npx') throws ENOENT and kills the whole
// script. Resolve the real path with `where`/`which` first, and fall back to
// letting the OS find it. Returns null only when the command truly is absent.
function resolveCmd(cmd) {
    if (!which(cmd)) return null;
    try {
        const out = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
        const lines = String(out.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length) {
            // On Windows `where npx` prints both `npx` and `npx.cmd`; spawn() needs
            // the executable, so prefer the one with a real extension.
            const ext = lines.find(l => /\.[a-z]+$/i.test(l));
            return ext || lines[0];
        }
    } catch (e) { /* fall through */ }
    return cmd;
}

function probe(url, timeoutMs) {
    return new Promise((resolve) => {
        try {
            const lib = /^https:/i.test(url) ? https : http;
            const req = lib.get(url + '/api/server-info', { timeout: timeoutMs || 6000, rejectUnauthorized: false }, (r) => { r.resume(); resolve(r.statusCode === 200); });
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.on('error', () => resolve(false));
        } catch (e) { resolve(false); }
    });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Each runner: start() returns the child, findUrl(line) returns the public URL or null.
// Returns null when the tool is not installed. A spawn failure is caught and
// reported, so the caller can move on to the next runner instead of crashing.
function cloudflared() {
    // Prefer the installed binary; fall back to npx (it downloads cloudflared
    // on first run). On Windows a bare command name needs shell: true, otherwise
    // spawn() throws EINVAL - so use shell for names without an extension.
    const cmd = resolveCmd('cloudflared') || resolveCmd('npx');
    if (!cmd) return null;
    const args = ['tunnel', '--url', TARGET];
    const full = cmd.endsWith('cloudflared') || cmd.endsWith('cloudflared.exe') ? args : ['--yes', 'cloudflared@latest', ...args];
    // .cmd/.bat wrappers are not directly exec-able: spawn() throws EINVAL
    // without shell: true. Bare names and .exe files run fine either way.
    // When shell is used, quote the command path: npx lives in "Program Files".
    const shell = !/\.(exe|com)$/i.test(cmd);
    const cmdArg = shell ? ('"' + cmd + '"') : cmd;
    let child;
    try { child = spawn(cmdArg, full, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell }); }
    catch (e) { console.log('- cloudflared could not start: ' + e.message); return null; }
    return { name: 'cloudflared (Cloudflare quick tunnel - free, no account)', child, findUrl: (s) => (s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i) || [])[0] || null };
}
function ngrok() {
    const cmd = resolveCmd('ngrok');
    if (!cmd) return null;
    let child;
    try { child = spawn(cmd, ['http', String(PORT), '--log', 'stdout', '--log-format', 'logfmt'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch (e) { console.log('- ngrok could not start: ' + e.message); return null; }
    return { name: 'ngrok', child, findUrl: (s) => (s.match(/https:\/\/[a-z0-9-]+\.ngrok(-\w+)?\.(io|dev)/i) || [])[0] || null };
}
function sshTunnel() {
    const cmd = resolveCmd('ssh');
    if (!cmd) return null;
    // localhost.run: free, needs nothing but the OpenSSH client that Windows 10/11 already has.
    const a = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-R', '80:localhost:' + PORT, 'nokey@localhost.run'];
    let child;
    try { child = spawn(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch (e) { console.log('- ssh tunnel could not start: ' + e.message); return null; }
    return { name: 'ssh to localhost.run (free relay, no install)', child, findUrl: (s) => (s.match(/https?:\/\/[a-z0-9-]+\.lhr\.\w+/i) || [])[0] || null };
}
const RUNNERS = { cloudflared, ngrok, ssh: sshTunnel };
// Order matters: a quick tunnel (cloudflared via npx, or localhost.run via ssh)
// can take 30-60s to become reachable after it prints its URL. Try the option
// most likely to work first, and give each one its own deadline.
// cloudflared first because npx can install it on any machine with Node.js
// (which this project already requires); ssh next because OpenSSH ships with
// Windows 10/11 and needs no download; ngrok last (must be installed by the user).
const ORDER = ['cloudflared', 'ssh', 'ngrok'];

function banner(url) {
    const line = '='.repeat(64);
    console.log('\n' + line);
    console.log('🌍 YOUR SERVER IS OPEN TO THE INTERNET (demo):');
    console.log('');
    console.log('        ' + url);
    console.log('');
    console.log('   Type that address into the phone browser, the desktop app,');
    console.log('   or:  node ..\\mobile\\tools\\set-server.js ' + url);
    console.log('   Leave this window open. Close it and the address stops working.');
    console.log(line + '\n');
}

async function main() {
    const want = process.argv[2];
    if (want && !RUNNERS[want]) { console.error('Use: node tools/tunnel.js [cloudflared|ngrok|ssh]'); process.exit(1); }
    if (!(await probe(TARGET, 2000))) {
        console.error(`\nThe bank server is not answering on ${TARGET}.\nStart it first (double-click START.bat), then run this again.\n`);
        process.exit(1);
    }
    const order = want ? [want] : ORDER;
    for (const key of order) {
        let t = null;
        try { t = RUNNERS[key](); } catch (e) { t = null; }
        if (!t) { console.log(`- ${key}: not available on this PC, trying the next one...`); continue; }
        console.log(`\nStarting ${t.name}...\n`);
        let candidate = null, announced = null, dead = false;
        const onData = (buf) => {
            const s = String(buf);
            process.stdout.write(s);
            const m = t.findUrl(s);
            if (m && !candidate) candidate = m;
        };
        t.child.stdout.on('data', onData);
        t.child.stderr.on('data', onData);
        t.child.on('exit', () => { dead = true; });
        // A spawn that succeeds but whose binary is missing (e.g. npx not on
        // PATH) fires 'error' instead of 'exit'. Treat it the same as a dead
        // child so the loop stops waiting on stdout that will never come.
        t.child.on('error', (e) => { dead = true; console.log('- ' + t.name + ' failed to start: ' + (e && e.message ? e.message : e)); });
        const cleanup = () => { try { t.child.kill(); } catch (e) { /* gone */ } try { if (fs.existsSync(tunnels.URL_FILE)) fs.unlinkSync(tunnels.URL_FILE); } catch (e) { /* gone */ } };
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(0); });

        // The tunnel prints its URL, but a URL is only useful once it really answers,
        // so check it with a real request before telling anyone to use it.
        // A cold quick tunnel (cloudflared/localhost.run) can take 30-60s to
        // become reachable AFTER it prints its URL, so keep polling the same
        // candidate until it answers or the deadline expires - do not give up
        // on the first failed probe and jump to the next runner.
        const deadline = Date.now() + 150000;
        while (Date.now() < deadline) {
            if (dead) break;
            if (candidate && !announced) {
                if (await probe(candidate)) {
                    announced = candidate;
                    banner(candidate);
                    try { tunnels.writeUrlFile(candidate); console.log('Saved to ' + tunnels.URL_FILE + ' - START.bat and the QR page show it too.\n'); } catch (e) { /* not important */ }
                }
            }
            if (announced) {
                if (dead) { console.log('\nTunnel closed - the public address no longer works.'); break; }
                await new Promise((r) => { const done = () => { console.log('\nTunnel closed - the public address no longer works.'); r(); }; t.child.on('exit', done); if (dead) done(); });
                break;
            }
            await wait(1000);
        }
        if (announced) { cleanup(); process.exit(0); }
        cleanup();
        try { t.child.kill('SIGKILL'); } catch (e) { /* gone */ }
        if (!dead) console.log(`\n${t.name} gave no working public address within 90 seconds. Trying the next option...\n`);
    }
    console.error('\nNo tunnel worked. Easiest manual option: install ngrok (https://ngrok.com/download),\nrun "ngrok http 3000" in a new window, and type the https address it shows into the phone.\n');
    process.exit(1);
}
main();
