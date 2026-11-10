'use strict';
// iPhone / iPad app. Needs a Mac with Xcode (Apple's rule, nothing can change that). Run:  5-IOS-SETUP.command
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); process.chdir(root);
const die = (m) => { console.error('\n❌ ' + m + '\n'); process.exit(1); };
const run = (c, a) => { const r = spawnSync(c, a, { stdio: 'inherit', shell: true }); if (r.status !== 0) die('This step failed: ' + c + ' ' + a.join(' ')); };
const has = (c, a) => spawnSync(c, a, { shell: true, encoding: 'utf8' }).status === 0;
if (process.platform !== 'darwin') die('The iPhone app can only be built on a Mac with Xcode (an Apple rule).\n   On Windows or Linux use the Android app, the desktop app, or open the web app in the phone browser.');
if (!has('xcodebuild', ['-version'])) die('Xcode was not found. Install Xcode from the Mac App Store, open it once, accept the licence, then run this again.');
if (!has('pod', ['--version'])) die('CocoaPods was not found. Install it:   brew install cocoapods   (or: sudo gem install cocoapods)   then run this again.');
async function main() {
    const cfg = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
    if (/YOUR-PC-IP/.test(cfg.server.url)) { console.log('The address of your server is not set yet.'); await require('./set-server').main(); }
    if (!fs.existsSync('node_modules')) run('npm', ['install']);
    if (!fs.existsSync('ios')) run('npx', ['cap', 'add', 'ios']);
    require('./patch-ios').patchProject(root);
    if (fs.existsSync('assets')) spawnSync('npx', ['capacitor-assets', 'generate', '--ios'], { stdio: 'inherit', shell: true });
    run('npx', ['cap', 'sync', 'ios']); require('./patch-ios').patchProject(root);
    console.log('\n✅ The Xcode project is ready. Xcode opens now. Then:\n  1. Click "App" (left) > Signing & Capabilities > Team: choose your Apple ID (a free one is fine)\n  2. Plug in the iPhone (or pick a Simulator at the top) and press the Run button\n  3. On the iPhone: Settings > General > VPN & Device Management > trust your Apple ID\n  4. Keep the server running and the phone on the same Wi-Fi\n  (with a free Apple ID the app works for 7 days, then press Run again)\n');
    run('npx', ['cap', 'open', 'ios']);
}
main();
