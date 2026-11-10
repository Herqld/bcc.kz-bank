'use strict';
// CODDY desktop app (Windows, macOS, Linux): a window that shows the bank app from the server.
// If the server is on this computer and not running, it is started from the project folder (needs Node.js installed).
const { app, BrowserWindow, ipcMain, Menu, shell, session } = require('electron');
const path = require('path');
const cfgLib = require('./lib/config'), runner = require('./lib/server-runner'), nav = require('./lib/navigation');

let win = null, child = null, cfg = null;
// Connect attempts are queued, never dropped: an attempt can take up to 15 s (waiting for a local server
// to boot), and an address the user saves during that window must still be tried, not swallowed.
let inflight = Promise.resolve();
const dataDir = () => app.getPath('userData');
const offlinePage = () => path.join(__dirname, 'pages', 'offline.html');

function connect() {
    const run = inflight.then(async () => {
        if (!win || !cfg) return { ok: false, message: 'No window' };
        try {
            const url = cfg.serverUrl; let ok = await runner.health(url, runner.isLocal(url) ? 1500 : 4000);
            // Auto-start only on a genuinely local address, only if the server binary is present on THIS machine,
            // and only if Node.js is actually available. Never silently spawn a server for a remote address.
            if (!ok && cfg.autoStartServer && runner.isLocal(url) && !child && runner.nodeAvailable()) {
                const dir = runner.findServerDir([cfg.serverDir, path.join(process.resourcesPath || '', 'banking-app'), path.join(__dirname, '..', 'banking-app'), path.join(path.dirname(app.getPath('exe') || ''), 'banking-app')]);
                if (dir) { child = runner.startServer({ dir, port: new URL(url).port || 3000 }); ok = await runner.waitHealthy(url, 15000); }
            }
            // Reload the settings page only if we are not already on it: reloading would wipe the status line
            // that tells the user why the address they just typed did not work.
            if (ok) await win.loadURL(url);
            else if (!isOnOfflinePage()) await win.loadFile(offlinePage());
            return ok ? { ok: true, url } : { ok: false, url, message: 'Cannot reach ' + url };
        } catch (err) { return { ok: false, message: String(err && err.message || err) }; }
    });
    // Always resolve so a failed attempt never poisons the queue for the next one.
    inflight = run.then(() => undefined, () => undefined);
    return run;
}
function isOnOfflinePage() { try { const u = win.webContents.getURL(); return u.startsWith('file://') && /offline\.html$/.test(u); } catch (e) { return false; } }
function createWindow() {
    win = new BrowserWindow({ width: 430, height: 900, minWidth: 360, minHeight: 620, title: 'CODDY', backgroundColor: '#0e0f12', autoHideMenuBar: true,
        icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (nav.isSafeExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (!nav.isInternal(url, cfg.serverUrl)) { e.preventDefault(); if (nav.isSafeExternal(url)) shell.openExternal(url); } });
    win.on('closed', () => { win = null; });
}
function buildMenu() {
    const mac = process.platform === 'darwin';
    Menu.setApplicationMenu(Menu.buildFromTemplate([].concat(mac ? [{ role: 'appMenu' }] : [], [
        { label: 'CODDY', submenu: [
            { label: 'Server address…', click: () => win && win.loadFile(offlinePage()) }, { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => connect() }, { type: 'separator' },
            { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' } ].concat(mac ? [] : [{ type: 'separator' }, { role: 'quit' }]) },
        { role: 'editMenu' }])));
}
function setup() {
    cfg = cfgLib.load(dataDir());
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'clipboard-sanitized-write'].includes(permission)));   // camera for QR, copy
    ipcMain.handle('cfg:get', () => cfg);
    ipcMain.handle('cfg:set', async (e, raw) => {
        let saved;
        try { saved = cfgLib.normalizeUrl(raw); } catch (err) { return { ok: false, message: err.message }; }
        cfg.serverUrl = saved;
        // Auto-start follows the address: a remote address must never make this app spawn a local server.
        // An explicit "autoStartServer": false in config.json is always respected.
        if (cfg.autoStartServer !== false) cfg.autoStartServer = runner.isLocal(saved);
        try { cfgLib.save(dataDir(), cfg); } catch (err) { return { ok: false, message: 'Could not save the settings: ' + err.message }; }
        const r = await connect();
        return r.ok ? { ok: true, url: saved } : { ok: false, url: saved, message: 'Saved, but cannot reach ' + saved + '. Check that the server is running and that this PC can open it in a browser.' };
    });
    ipcMain.handle('retry', async () => await connect());
    ipcMain.handle('server:check', async () => await runner.health(cfg.serverUrl, 4000));   // for the settings page status line; takes no input
    buildMenu(); createWindow(); connect();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
    app.whenReady().then(() => { setup(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) { createWindow(); connect(); } }); });
    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
    app.on('before-quit', () => { if (child) { try { child.kill(); } catch (e) { /* already gone */ } } });
}
