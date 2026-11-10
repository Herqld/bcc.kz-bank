'use strict';
// ============================================================
// bankfeel.js : what makes it behave like a real bank app
//   splash screen, PIN lock (+ fingerprint / Face ID where the device allows it), auto-lock when the app goes to
//   the background, privacy cover in the app switcher, "are you still there?" timeout, pull-to-refresh,
//   skeleton loaders, "no internet" banner, vibration feedback, share receipt, time-of-day greeting.
// The PIN is a lock on THIS device (like in banking apps). It is never sent to the server. Only a salted hash is stored.
// ============================================================
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* */ } } };

    // ---------- vibration feedback ----------
    const PATTERN = { tick: 8, success: [16, 50, 16], error: [45, 60, 45], warn: [30, 40, 30] };
    function haptic(kind) { try { if (navigator.vibrate) navigator.vibrate(PATTERN[kind] || 8); } catch (e) { /* not allowed */ } }

    // ---------- SHA-256 (works on http:// too, where crypto.subtle does not exist) ----------
    const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    function sha256(str) {
        const msg = new TextEncoder().encode(str), l = msg.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n); b.set(msg); b[l] = 0x80;
        const dv = new DataView(b.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l * 8 / 4294967296));
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19; const w = new Uint32Array(64);
        for (let o = 0; o < n; o += 64) {
            for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
            for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; w[i] = (((a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ (a >>> 3)) + w[i - 7] + ((c >>> 17 | c << 15) ^ (c >>> 19 | c << 13) ^ (c >>> 10)) + w[i - 16]) >>> 0; }
            let a = h0, bb = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (let i = 0; i < 64; i++) {
                const t1 = (h + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0, t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
            }
            h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
        }
        return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => x.toString(16).padStart(8, '0')).join('');
    }
    function stretch(pin, salt) { let h = sha256(salt + ':' + pin); for (let i = 0; i < 4000; i++) h = sha256(h + salt + pin); return h; }
    const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), x => x.toString(16).padStart(2, '0')).join('');

    // ---------- per-user storage ----------
    const uid = () => String((S.user && (S.user.email || S.user.phone)) || 'x').toLowerCase().replace(/[^a-z0-9@.+_-]/g, '');   // one PIN per person on this device
    const K_PIN = () => 'coddy_pin_' + uid(), K_FAIL = () => 'coddy_pinfail_' + uid(), K_BIO = () => 'coddy_bio_' + uid(), K_BAN = () => 'coddy_pinban_' + uid();
    const hasPin = () => !!ls.get(K_PIN());
    const autoLockSec = () => { const v = ls.get('coddy_autolock'); return v === null ? 30 : parseInt(v, 10); };
    const tr = (s) => (window.I18N ? I18N.tx(s) : s);
    const SEC = () => (window.I18N && I18N.lang !== 'en' ? 'с' : 's');
    function checkPin(pin) { try { const r = JSON.parse(ls.get(K_PIN())); return stretch(pin, r.s) === r.h; } catch (e) { return false; } }
    function savePin(pin) { const s = randHex(16); ls.set(K_PIN(), JSON.stringify({ s, h: stretch(pin, s) })); ls.del(K_FAIL()); }
    function fails() { try { return JSON.parse(ls.get(K_FAIL())) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }

    // ---------- the keypad (used full-screen for unlocking, and inside a sheet for set-up / change / turn off) ----------
    function padHtml(o) {
        const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('');
        return `<div class="pad">
            <div class="pad-head">${o.avatar ? `<span class="pad-av" data-no-i18n>${o.avatar}</span>` : `<span class="pad-ic">${ic('shield')}</span>`}<h2>${esc(o.title)}</h2><p class="muted">${esc(o.sub || '')}</p></div>
            <div class="pad-dots" aria-label="PIN">${'<i></i>'.repeat(4)}</div><div class="pad-msg" role="status"></div>
            <div class="pad-keys">${keys}<button type="button" class="pad-aux ${o.bio ? '' : 'off'}" data-k="bio" ${o.bio ? '' : 'tabindex="-1" aria-hidden="true"'} aria-label="Fingerprint / Face ID">${ic('fingerprint')}</button><button type="button" data-k="0">0</button><button type="button" class="pad-aux" data-k="del" aria-label="Delete">${ic('backspace')}</button></div>
            ${o.foot || ''}</div>`;
    }
    function mountPad(root, o) {
        root.innerHTML = padHtml(o); let pin = ''; const dots = [...root.querySelectorAll('.pad-dots i')], msg = $('.pad-msg', root), pad = $('.pad', root); let busy = false;
        const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
        const say = (t, bad) => { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); };
        const shake = () => { pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake'); haptic('error'); };
        async function full() {
            if (busy) return; busy = true;
            let res; try { res = await o.onPin(pin); } catch (e) { res = { ok: false, msg: 'Something went wrong' }; }
            if (res && res.ok) { dots.forEach(d => d.classList.add('ok')); haptic('success'); busy = false; return; }
            shake(); dots.forEach(d => d.classList.add('bad')); say((res && res.msg) || 'Wrong PIN', true);
            setTimeout(() => { dots.forEach(d => d.classList.remove('bad')); pin = ''; paint(); busy = false; }, 420);
        }
        root.onclick = (e) => {
            const b = e.target.closest('[data-k]'); if (!b || b.classList.contains('off')) return; const k = b.dataset.k;
            if (busy && k !== 'bio') return;
            if (k === 'del') { pin = pin.slice(0, -1); paint(); haptic('tick'); return; }
            if (k === 'bio') { if (o.onBio) o.onBio(); return; }
            if (pin.length >= 4) return; pin += k; paint(); haptic('tick'); say('');
            if (pin.length === 4) setTimeout(full, 140);
        };
        return { say, reset: () => { pin = ''; paint(); }, root };
    }

    // ---------- fingerprint / Face ID: WebAuthn "platform authenticator" (browsers and desktop apps on https or localhost) ----------
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    async function bioAvailable() { try { return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; } }
    async function bioEnroll() {
        const cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'CODDY' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.user.email, displayName: S.user.full_name },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
        ls.set(K_BIO(), b64(cred.rawId)); return true;
    }
    async function bioCheck() {
        const id = ls.get(K_BIO()); if (!id) return false;
        try { await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } }); return true; } catch (e) { return false; }
    }
    const bioOn = () => !!ls.get(K_BIO());

    // ---------- the lock screen ----------
    let lockEl = null, locked = false, hiddenAt = 0;
    function ensureLock() { if (!lockEl) { lockEl = document.createElement('div'); lockEl.id = 'lock'; lockEl.setAttribute('role', 'dialog'); lockEl.setAttribute('aria-modal', 'true'); document.body.appendChild(lockEl); } return lockEl; }
    function lockNow(why) {
        if (!S.user || !hasPin() || locked) return; locked = true; const el = ensureLock(); closeOverlay(); document.body.classList.add('is-locked');
        const name = (S.user.full_name || '').split(' ')[0] || '', initial = esc(name.slice(0, 1).toUpperCase() || 'C');
        const pad = mountPad(el, { title: 'Enter your PIN', sub: name ? 'Welcome back, ' + name : '', avatar: initial, bio: bioOn(),
            foot: '<button type="button" class="link pad-forgot" data-forgot>Forgot PIN?</button>',
            onBio: async () => { if (await bioCheck()) { unlock(); } else pad.say(tr('Fingerprint / Face ID was not recognised'), true); },
            onPin: async (pin) => {
                const f = fails(), left = f.until - Date.now();
                if (left > 0) return { ok: false, msg: tr('Too many attempts. Try again in') + ' ' + Math.ceil(left / 1000) + ' ' + SEC() };
                if (checkPin(pin)) { ls.del(K_FAIL()); setTimeout(unlock, 260); return { ok: true }; }
                f.n++; if (f.n % 5 === 0) f.until = Date.now() + 30000; ls.set(K_FAIL(), JSON.stringify(f));
                if (f.n >= 10) { setTimeout(() => forget('For your safety you were signed out'), 700); return { ok: false, msg: tr('Too many wrong PINs') }; }
                return { ok: false, msg: f.n % 5 === 0 ? tr('Too many attempts. Try again in') + ' 30 ' + SEC() : tr('Wrong PIN. Attempts left:') + ' ' + (5 - f.n % 5) };
            } });
        el.querySelector('[data-forgot]').onclick = () => forget('PIN removed. Log in with your password.');
        requestAnimationFrame(() => el.classList.add('on'));
        if (bioOn() && why !== 'manual') setTimeout(() => { if (locked && lockEl.querySelector('[data-k=bio]:not(.off)')) lockEl.querySelector('[data-k=bio]:not(.off)').click(); }, 450);
    }
    function unlock() { if (!locked) return; locked = false; lockEl.classList.remove('on'); document.body.classList.remove('is-locked'); setTimeout(() => { if (!locked && lockEl) lockEl.innerHTML = ''; }, 320); resetIdle(); }
    async function forget(message) {
        ls.del(K_PIN()); ls.del(K_FAIL()); ls.del(K_BIO()); locked = false; if (lockEl) { lockEl.classList.remove('on'); lockEl.innerHTML = ''; } document.body.classList.remove('is-locked');
        await actions.logout(); toast(message, 'success');
    }

    // ---------- set up / change / turn off the PIN (inside a sheet) ----------
    function sheetPad(o) { openSheet('<div id="padHost"></div>'); return mountPad($('#padHost'), o); }
    function setupPin(after) {
        let first = null;
        sheetPad({ title: 'Create a PIN', sub: 'Choose 4 digits. You will use it to open the app.', onPin: (pin) => {
            if (/^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321') return { ok: false, msg: tr('Too easy to guess. Choose another PIN.') };
            first = pin; setTimeout(() => sheetPad({ title: 'Repeat the PIN', sub: 'Enter the same 4 digits again', onPin: (p2) => {
                if (p2 !== first) { setTimeout(() => setupPin(after), 500); return { ok: false, msg: tr('The PINs do not match. Start again.') }; }
                savePin(p2); setTimeout(async () => { closeOverlay(); toast('PIN is on', 'success'); if (await bioAvailable() && !bioOn()) offerBio(after); else if (after) after(); }, 300); return { ok: true };
            } }), 260); return { ok: true };
        } });
    }
    function offerBio(after) {
        openSheet(`<div class="sub-prompt"><span class="pad-ic big">${ic('fingerprint')}</span><h2>Use fingerprint or Face ID?</h2><p class="muted">Open the app with one touch. The PIN always stays as a back-up.</p>
            <button class="btn" data-bio-yes>Turn on</button><button class="link center" data-bio-no>Not now</button></div>`);
        $('[data-bio-yes]').onclick = async () => { try { await bioEnroll(); closeOverlay(); toast('Fingerprint / Face ID is on', 'success'); } catch (e) { closeOverlay(); toast('Fingerprint / Face ID could not be turned on', 'error'); } if (after) after(); };
        $('[data-bio-no]').onclick = () => { closeOverlay(); if (after) after(); };
    }
    function verifyThen(title, then) {
        sheetPad({ title, sub: 'Enter your current PIN', onPin: (pin) => {
            const f = fails(), left = f.until - Date.now(); if (left > 0) return { ok: false, msg: tr('Too many attempts. Try again in') + ' ' + Math.ceil(left / 1000) + ' ' + SEC() };
            if (!checkPin(pin)) { f.n++; if (f.n % 5 === 0) f.until = Date.now() + 30000; ls.set(K_FAIL(), JSON.stringify(f)); return { ok: false, msg: tr('Wrong PIN') }; }
            ls.del(K_FAIL()); setTimeout(then, 260); return { ok: true };
        } });
    }

    // ---------- Security settings sheet ----------
    const LOCK_OPTS = [[0, 'Immediately'], [30, 'After 30 seconds'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [-1, 'Never']];
    async function securitySheet() {
        const pin = hasPin(), canBio = pin && await bioAvailable(), sec = autoLockSec();
        openSheet(`<h2>Security</h2>
            <button class="toggle ${pin ? 'on' : ''}" data-sec="pin"><span><b>PIN code</b><small>${pin ? 'The app asks for your PIN' : 'Lock the app with 4 digits'}</small></span><i></i></button>
            ${pin ? `<button class="opt" data-sec="change">Change PIN${ic('right')}</button>` : ''}
            ${canBio ? `<button class="toggle ${bioOn() ? 'on' : ''}" data-sec="bio"><span><b>Fingerprint / Face ID</b><small>Open the app with one touch</small></span><i></i></button>` : ''}
            ${pin ? `<h3 class="sh">Lock the app</h3><div class="mchips lockopts">${LOCK_OPTS.map(([v, l]) => `<button type="button" class="mchip ${sec === v ? 'on' : ''}" data-sec="al" data-v="${v}"><b>${l}</b></button>`).join('')}</div>
            <button class="btn ghost" data-sec="lock">${ic('shield')} Lock now</button>` : '<p class="muted sm" style="margin-top:12px">Banks lock the app when you leave it. Set a PIN to do the same.</p>'}`);
        $('.sheet').onclick = async (e) => {
            const b = e.target.closest('[data-sec]'); if (!b) return; const k = b.dataset.sec;
            if (k === 'pin') { if (!pin) setupPin(() => securitySheet()); else verifyThen('Turn off the PIN', () => { ls.del(K_PIN()); ls.del(K_BIO()); closeOverlay(); toast('PIN is off', 'success'); render(true); }); }
            if (k === 'change') verifyThen('Change PIN', () => setupPin());
            if (k === 'bio') { if (bioOn()) { ls.del(K_BIO()); securitySheet(); } else { try { await bioEnroll(); toast('Fingerprint / Face ID is on', 'success'); } catch (x) { toast('Fingerprint / Face ID could not be turned on', 'error'); } securitySheet(); } }
            if (k === 'al') { ls.set('coddy_autolock', b.dataset.v); securitySheet(); }
            if (k === 'lock') { closeOverlay(); setTimeout(() => lockNow('manual'), 60); }
        };
    }
    actions.security = () => securitySheet();
    actions.pinBannerSet = () => setupPin(() => render(true));
    actions.pinBannerLater = () => { ls.set(K_BAN(), '1'); render(true); };
    function bannerHtml() {
        if (!S.user || hasPin() || ls.get(K_BAN())) return '';
        return `<div class="pin-banner"><span class="pb-ic">${ic('shield')}</span><div class="grow"><b>Protect your money with a PIN</b><small>Lock the app with 4 digits, like in a bank.</small></div>
            <div class="pb-acts"><button class="btn sm" data-act="pinBannerSet">Set up PIN</button><button class="link" data-act="pinBannerLater">Later</button></div></div>`;
    }

    // ---------- auto-lock, privacy cover, idle time-out ----------
    function cover(on) { let c = $('#privacy'); if (!c) { c = document.createElement('div'); c.id = 'privacy'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<div class="pv-logo" data-no-i18n>bcc<i>.kz</i></div>'; document.body.appendChild(c); } c.classList.toggle('on', on); }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if (S.user) cover(true); return; }
        cover(false); if (!S.user || !hiddenAt) return; const away = (Date.now() - hiddenAt) / 1000, al = autoLockSec(); hiddenAt = 0;
        if (hasPin() && al >= 0 && away >= al) lockNow('background'); else resetIdle();
    });
    const IDLE_MS = () => parseInt(ls.get('coddy_idle_ms') || '300000', 10), WARN_MS = () => parseInt(ls.get('coddy_idle_warn_ms') || '60000', 10);
    let tWarn = 0, tTick = 0;
    function resetIdle() { clearTimeout(tWarn); clearInterval(tTick); if (!S.user || locked) return; tWarn = setTimeout(warnIdle, Math.max(500, IDLE_MS() - WARN_MS())); }
    function warnIdle() {
        if (!S.user || locked || $('#idleBox')) return; let left = Math.round(WARN_MS() / 1000);
        const box = document.createElement('div'); box.id = 'idleBox'; box.className = 'idle-box';
        box.innerHTML = `<div class="idle-card"><span class="pad-ic">${ic('shield')}</span><h2>Are you still there?</h2><p class="muted">${hasPin() ? 'For your safety the app will lock in' : 'For your safety you will be signed out in'} <b id="idleLeft" data-no-i18n>${left}</b> <span>s</span></p><button class="btn" data-stay>I am here</button></div>`;
        document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on'));
        const done = () => { clearInterval(tTick); box.classList.remove('on'); setTimeout(() => box.remove(), 250); };
        box.querySelector('[data-stay]').onclick = () => { done(); resetIdle(); haptic('tick'); };
        tTick = setInterval(() => { left--; const e = $('#idleLeft'); if (e) e.textContent = String(Math.max(0, left)); if (left <= 0) { done(); if (hasPin()) lockNow('idle'); else actions.logout().then(() => toast('You were signed out because of inactivity', 'error')); } }, 1000);
    }
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, () => { if (S.user && !locked && !$('#idleBox')) resetIdle(); }, { passive: true, capture: true }));

    // ---------- boot hook ----------
    function onBoot() { if (S.user && hasPin()) lockNow('boot'); else resetIdle(); }

    // ---------- splash ----------
    function hideSplash() { const s = $('#splash'); if (!s || s.classList.contains('hide')) return; s.classList.add('hide'); setTimeout(() => s.remove(), 500); }
    window.addEventListener('load', () => setTimeout(hideSplash, 650)); setTimeout(hideSplash, 3500);

    // ---------- greeting by time of day ----------
    function greeting(name) { const h = new Date().getHours(); return h >= 5 && h < 12 ? `Good morning, ${name}` : h >= 12 && h < 18 ? `Good afternoon, ${name}` : h >= 18 && h < 23 ? `Good evening, ${name}` : `Hello, ${name}`; }

    // ---------- pull to refresh ----------
    let ptr = null, py0 = 0, pdy = 0, pOn = false, pBusy = false;
    function ptrEl() { if (!ptr) { ptr = document.createElement('div'); ptr.id = 'ptr'; ptr.innerHTML = `<span>${ic('refresh')}</span>`; document.body.appendChild(ptr); } return ptr; }
    document.addEventListener('touchstart', (e) => {
        if (!S.user || pBusy || locked || window.scrollY > 0 || !$('#overlay').hidden || e.touches.length !== 1 || e.target.closest('#cardScroll, input, textarea, select, .sheet, #lock')) { pOn = false; return; }
        pOn = true; py0 = e.touches[0].clientY; pdy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!pOn) return; pdy = e.touches[0].clientY - py0; if (pdy <= 0) { ptrEl().classList.remove('pull'); return; }
        const d = Math.min(pdy * 0.5, 84), el = ptrEl(); el.classList.add('pull'); el.style.transform = `translate(-50%, ${d - 46}px)`; el.firstChild.style.transform = `rotate(${d * 4}deg)`; el.classList.toggle('ready', d >= 56);
    }, { passive: true });
    document.addEventListener('touchend', async () => {
        if (!pOn) return; pOn = false; const el = ptrEl(), ready = Math.min(pdy * 0.5, 84) >= 56;
        if (!ready) { el.classList.remove('pull', 'ready'); el.style.transform = ''; return; }
        pBusy = true; el.classList.add('spin'); el.style.transform = 'translate(-50%, 18px)'; haptic('tick');
        try { await refreshAll(); if (loaders[S.view]) await loaders[S.view](S.params); render(true); } finally { setTimeout(() => { el.classList.remove('pull', 'ready', 'spin'); el.style.transform = ''; pBusy = false; }, 350); }
    }, { passive: true });

    // ---------- skeleton while a screen loads ----------
    const skel = () => `<div class="screen skel-screen" aria-busy="true"><div class="skel skel-title"></div><div class="skel skel-card"></div><div class="skel skel-line"></div><div class="skel skel-line short"></div><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>`;
    if (typeof openView === 'function') {
        const _ov = openView;
        openView = async function (...a) {
            let shown = false; const t = setTimeout(() => { shown = true; $('#screen').innerHTML = skel(); }, 160);
            try { return await _ov.apply(this, a); } finally { clearTimeout(t); if (shown && $('#screen .skel-screen')) render(true); }
        };
    }

    // ---------- "no internet" banner ----------
    function offline(on) {
        let b = $('#offline'); if (!b && !on) return;
        if (!b) { b = document.createElement('div'); b.id = 'offline'; b.setAttribute('role', 'alert'); b.innerHTML = `<span>${ic('wifioff')}</span><b>No internet connection</b><button type="button" data-retry>Retry</button>`; document.body.appendChild(b); b.querySelector('[data-retry]').onclick = async () => { const r = await api('/api/check-auth'); if (r && r.success !== false) offline(false); }; }
        b.classList.toggle('on', on); document.body.classList.toggle('is-offline', on);
    }
    window.addEventListener('offline', () => offline(true)); window.addEventListener('online', () => offline(false));
    if (typeof api === 'function') {
        const _a = api;
        api = async function (...args) { const r = await _a.apply(this, args); if (r && r.message === 'No connection to the server') offline(true); else if ($('#offline.on') && r && r.success !== false) offline(false); return r; };
    }

    // ---------- error vibration, share receipt, login helpers ----------
    if (typeof toast === 'function') { const _t = toast; toast = function (m, k) { if (k === 'error') haptic('error'); return _t.apply(this, arguments); }; }
    actions.shareReceipt = async () => {
        const r = (S.params && S.params.receipt) || null; if (!r) return;
        const text = `CODDY · ${r.title}\n${r.amount}\n` + r.lines.map(([k, v]) => `${k}: ${v}`).join('\n');
        try { if (navigator.share) { await navigator.share({ title: 'CODDY', text }); return; } } catch (e) { return; }
        try { await navigator.clipboard.writeText(text); toast('Receipt copied', 'success'); } catch (e) { toast('Receipt: ' + r.amount, 'success'); }
    };
    actions.togglePw = (el) => { const i = el.closest('.pw-wrap').querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.classList.toggle('on', show); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.innerHTML = ic(show ? 'eyeoff' : 'eye'); haptic('tick'); };
    const shakeForm = (f) => { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); };
    const remember = { email: () => ls.get('coddy_lastemail') || '', save: (e, on) => { if (on) ls.set('coddy_lastemail', e); else ls.del('coddy_lastemail'); } };

    window.Feel = { haptic, greeting, bannerHtml, onBoot, lockNow, hasPin, remember, shakeForm, resetIdle, security: securitySheet, _sha256: sha256, _state: () => ({ locked, hasPin: hasPin(), bio: bioOn(), autolock: autoLockSec() }) };
})();
