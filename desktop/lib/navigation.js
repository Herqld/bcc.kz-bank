'use strict';
// The window may only show the bank server and our own pages. Everything else opens in the normal browser.
function isInternal(target, serverUrl) {
    try { const t = new URL(target); if (t.protocol === 'file:') return true; return t.origin === new URL(serverUrl).origin; } catch (e) { return false; }
}
function isSafeExternal(target) { try { const t = new URL(target); return t.protocol === 'https:' || t.protocol === 'http:'; } catch (e) { return false; } }
module.exports = { isInternal, isSafeExternal };
