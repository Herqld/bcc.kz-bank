'use strict';
// Builds CODDY-2.2.apk. Run it with  mobile\2-BUILD-APK.bat  (or: node tools/build.js)
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..'); process.chdir(root);
const win = process.platform === 'win32', mac = process.platform === 'darwin';
const die = (m) => { console.error('\n❌ ' + m + '\n'); process.exit(1); };
const step = (n, t) => console.log(`\n=== ${n}. ${t} ===`);
const run = (cmd, args, opt = {}) => { const r = spawnSync(cmd, args, Object.assign({ stdio: 'inherit', shell: true, env: process.env }, opt)); if (r.status !== 0) die(`This step failed: ${cmd} ${args.join(' ')}`); };
const quiet = (cmd, args) => spawnSync(cmd, args, { shell: true, encoding: 'utf8' });

step(1, 'Checking your computer');
const major = +process.versions.node.split('.')[0]; if (major < 20) die(`Node.js ${process.versions.node} is too old for the Android build. Install Node.js 20 or newer (https://nodejs.org) and run this again.`);
console.log('Node.js ' + process.versions.node + ' OK');
const sdkGuess = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, win && path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'), mac && path.join(os.homedir(), 'Library', 'Android', 'sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
const sdk = sdkGuess.find(p => fs.existsSync(path.join(p, 'platform-tools')) || fs.existsSync(path.join(p, 'platforms')));
if (!sdk) die('The Android SDK was not found.\n   1) Install Android Studio: https://developer.android.com/studio\n   2) Open it once and finish the first-start wizard (it downloads the Android SDK).\n   3) Run this again.');
console.log('Android SDK: ' + sdk); process.env.ANDROID_HOME = process.env.ANDROID_SDK_ROOT = sdk;
const jv = quiet('java', ['-version']);
if (jv.status !== 0) {
    const jbr = [win && 'C:\\Program Files\\Android\\Android Studio\\jbr', mac && '/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr'].filter(Boolean).find(p => fs.existsSync(p));
    if (!jbr) die('Java was not found. Android Studio brings its own Java: install Android Studio (https://developer.android.com/studio) and run this again.');
    process.env.JAVA_HOME = jbr; process.env.PATH = path.join(jbr, 'bin') + path.delimiter + process.env.PATH; console.log('Java (from Android Studio): ' + jbr);
} else console.log('Java OK');

async function main() {
    step(2, 'Server address');
    console.log('Native Android app - server URL is hardcoded in Config.kt (Cloudflare tunnel + LAN fallbacks).');

    step(3, 'Installing the build tools (first time: a few minutes)');
    if (!fs.existsSync('node_modules')) run('npm', ['install']); else console.log('already installed');

    step(4, 'Preparing the Android project');
    const patch = require('./patch-android'); patch.writeLocalProps(sdk); patch.patchManifest();
    // Native Kotlin app - no web assets to copy, no Capacitor sync needed

    step(5, 'Building the APK (first time: 10-20 minutes, it downloads Gradle)');
    // On Windows, cmd.exe cannot run a .bat whose full path contains a space
    // (folders like "CODDY 2.2") when Node spawns it with shell:true - it fails
    // with a garbled "is not recognized" message. Bypass cmd.exe entirely and
    // start Gradle with java + gradle-wrapper.jar, which handles any path.
    const androidDir = path.join(root, 'android');
    const wrapperJar = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
    if (!fs.existsSync(wrapperJar)) die('Gradle wrapper jar not found: ' + wrapperJar);
    const javaBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', win ? 'java.exe' : 'java') : 'java';
    const gw = spawnSync(javaBin, ['-cp', wrapperJar, 'org.gradle.wrapper.GradleWrapperMain', 'assembleDebug'], { stdio: 'inherit', cwd: androidDir, env: process.env, shell: false });
    if (gw.status !== 0) die('Gradle build failed. Scroll up for the red Gradle error and send it to the author.');
    const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!fs.existsSync(apk)) die('The build finished but the APK file was not found: ' + apk);
    const out = path.join(root, 'CODDY-2.2.apk');
    // copyFileSync() silently fails on Windows when the destination is open in
    // another process or is read-only - it leaves the OLD apk in place and the
    // user ships a stale build thinking it is fresh. Remove first, then copy.
    try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch (e) { /* continue */ }
    fs.copyFileSync(apk, out);
    if (fs.statSync(out).size !== fs.statSync(apk).size) die('Copying the APK failed: ' + out);
    console.log('\n✅ Done!  Your Android app:  ' + out + '\n\nNext:\n  - copy CODDY-2.2.apk to your phone (USB cable, Telegram, Google Drive...), open it and allow "install unknown apps"\n  - or plug the phone in with USB debugging on and run 3-INSTALL-ON-PHONE.bat\n  - keep START.bat running on the PC, with the phone on the same Wi-Fi\n');
}
main();
