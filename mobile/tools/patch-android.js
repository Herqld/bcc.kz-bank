'use strict';
// After "cap add android": allow plain http to your PC, allow vibration, and tell Gradle where the Android SDK is.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function patchManifest() {
    const f = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'); if (!fs.existsSync(f)) return false;
    let x = fs.readFileSync(f, 'utf8'), changed = false;
    if (!/usesCleartextTraffic/.test(x)) { x = x.replace(/<application\b/, '<application android:usesCleartextTraffic="true"'); changed = true; }
    if (!/permission\.VIBRATE/.test(x)) { x = x.replace(/<\/manifest>/, '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>'); changed = true; }
    if (changed) fs.writeFileSync(f, x); return true;
}
function writeLocalProps(sdk) {
    if (!sdk) return; const f = path.join(root, 'android', 'local.properties');
    if (fs.existsSync(path.join(root, 'android'))) fs.writeFileSync(f, 'sdk.dir=' + sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n');
}
module.exports = { patchManifest, writeLocalProps };
if (require.main === module) { console.log(patchManifest() ? 'AndroidManifest.xml is ready' : 'android project not found'); }
