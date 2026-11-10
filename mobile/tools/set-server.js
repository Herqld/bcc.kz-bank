'use strict';
// Writes the address of your PC into capacitor.config.json.
//   node tools/set-server.js                          -> finds the PC's Wi-Fi address and asks you to confirm
//   node tools/set-server.js http://192.168.0.7:3000  -> uses exactly this address
const fs = require('fs'), os = require('os'), path = require('path'), readline = require('readline');
const cfgPath = path.join(__dirname, '..', 'capacitor.config.json');

function candidates() {
    const out = [];
    Object.entries(os.networkInterfaces()).forEach(([name, list]) => (list || []).forEach(i => {
        if (i.family !== 'IPv4' || i.internal) return;
        const a = i.address, priv = /^192\.168\./.test(a) || /^10\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
        if (priv) out.push({ address: a, name, wifi: /wi-?fi|wlan|wireless/i.test(name), lan: /^192\.168\./.test(a) });
    }));
    return out.sort((x, y) => (y.wifi - x.wifi) || (y.lan - x.lan));
}
function validUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !!x.hostname; } catch (e) { return false; } }
function save(url) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); cfg.server = Object.assign({}, cfg.server, { url: url.replace(/\/+$/, ''), cleartext: true, errorPath: 'error.html' });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n'); console.log('\nSaved. The app will open:  ' + cfg.server.url + '\n');
}
function ask(q) { return new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim()); }); }); }

async function main(argUrl) {
    if (argUrl) { if (!validUrl(argUrl)) { console.error('That is not a valid address. Example: http://192.168.0.7:3000'); process.exit(1); } return save(argUrl); }
    const c = candidates();
    console.log('\nCODDY 2.2 - which address should the phone use to reach this PC?\n');
    if (!c.length) console.log('No Wi-Fi / network address found. Connect this PC to Wi-Fi, or type the address by hand.\n');
    c.forEach((x, i) => console.log(`  ${i + 1}) http://${x.address}:3000   [${x.name}]`));
    const def = c.length ? `http://${c[0].address}:3000` : '';
    const a = await ask(`\nPress Enter to use ${def || '(type an address)'} , or type another address: `);
    const url = a || def; if (!validUrl(url)) { console.error('\nNo valid address. Example: http://192.168.0.7:3000'); process.exit(1); }
    save(url);
}
module.exports = { main, candidates };
if (require.main === module) main(process.argv[2]);
