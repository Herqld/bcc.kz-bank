'use strict';
// After "cap add ios": allow plain http to your Mac/PC on the network, and explain why the app uses
// the local network, the camera (QR) and Face ID. Safe to run many times.
const fs = require('fs'), path = require('path');
const ADD = [
    ['NSAppTransportSecurity', '<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>'],
    ['NSLocalNetworkUsageDescription', '<string>CODDY connects to the bank server on your network.</string>'],
    ['NSCameraUsageDescription', '<string>CODDY uses the camera to scan payment QR codes.</string>'],
    ['NSFaceIDUsageDescription', '<string>CODDY uses Face ID to unlock the app.</string>']
];
function patchPlist(xml) {
    let out = xml;
    for (const [key, value] of ADD) {
        if (out.includes('<key>' + key + '</key>')) continue;
        const i = out.lastIndexOf('</dict>'); if (i < 0) throw new Error('Info.plist has an unexpected format');
        out = out.slice(0, i) + '\t<key>' + key + '</key>\n\t' + value + '\n' + out.slice(i);
    }
    return out;
}
function patchProject(root) {
    const f = path.join(root, 'ios', 'App', 'App', 'Info.plist'); if (!fs.existsSync(f)) return false;
    const before = fs.readFileSync(f, 'utf8'), after = patchPlist(before); if (after !== before) fs.writeFileSync(f, after); return true;
}
module.exports = { patchPlist, patchProject };
if (require.main === module) console.log(patchProject(path.join(__dirname, '..')) ? 'Info.plist is ready' : 'ios project not found');
