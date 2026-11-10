'use strict';
// Settings of the desktop app (saved in the user's profile folder). Only the server address and a few switches.
const fs = require('fs'), path = require('path');
const DEFAULTS = { serverUrl: 'http://localhost:3000', autoStartServer: true, serverDir: '' };

// "192.168.0.7:3000" -> "http://192.168.0.7:3000"; throws a readable message for anything that is not a web address
function normalizeUrl(input) {
    let s = String(input == null ? '' : input).trim();
    if (!s) throw new Error('Enter the server address');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
    let u; try { u = new URL(s); } catch (e) { throw new Error('This is not a valid address'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http:// or https:// addresses are allowed');
    if (!u.hostname) throw new Error('This is not a valid address');
    return u.origin;
}
function load(dir) {
    let cfg = Object.assign({}, DEFAULTS);
    try { Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))); } catch (e) { /* first start */ }
    try { cfg.serverUrl = normalizeUrl(cfg.serverUrl); } catch (e) { cfg.serverUrl = DEFAULTS.serverUrl; }
    cfg.autoStartServer = cfg.autoStartServer !== false; cfg.serverDir = typeof cfg.serverDir === 'string' ? cfg.serverDir : '';
    return cfg;
}
function save(dir, cfg) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2)); }
module.exports = { DEFAULTS, normalizeUrl, load, save };
