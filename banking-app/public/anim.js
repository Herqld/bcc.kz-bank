'use strict';
// ============================================================
// anim.js : the little motions that make the app feel alive
//   tap ripple + haptic tick, screen transitions, sheet slide-out, top loading bar,
//   success burst on receipts, card gallery depth, number "bump" on balance changes, language fade
// Everything is switched off for people who set "reduce motion" in their phone settings.
// ============================================================
(function () {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (s, r = document) => r.querySelector(s);

    // ---------- tap ripple + a short vibration tick (Android) ----------
    const RIPPLE = '.btn, .opt, .toggle, .dec, .mchip, .tile, .chip, .row, .addcard, .bigcard, .seg button, .langsw button, .tx, .sug, .sub-card, .goal-card, .qa span, .hint-btn';
    document.addEventListener('pointerdown', (e) => {
        const t = e.target.closest && e.target.closest('button, [data-act], [data-go], [data-tab], ' + RIPPLE);
        if (!t || t.disabled) return;
        if (navigator.vibrate && e.pointerType === 'touch') { try { navigator.vibrate(7); } catch (x) { /* not allowed */ } }
        if (reduce) return;
        const host = t.closest(RIPPLE); if (!host || host.classList.contains('sub-card') || host.classList.contains('goal-card')) return;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.classList.add('rip-host');
        const r = host.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.7, s = document.createElement('span');
        s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
        host.appendChild(s); s.addEventListener('animationend', () => s.remove());
    }, { passive: true });

    // ---------- top loading bar while the server works ----------
    let inflight = 0; const bar = () => $('#topbar');
    if (typeof api === 'function') {
        const _api = api;
        api = async function (...args) {
            inflight++; if (bar()) bar().classList.add('on');
            try { return await _api.apply(this, args); } finally { inflight--; if (!inflight && bar()) bar().classList.remove('on'); }
        };
    }

    // ---------- sheet closes with a slide-down (a blank panel, so no duplicate text is left in the page) ----------
    function sheetOut(o) {
        if (reduce) return; const sh = o.querySelector('.sheet'); if (!sh) return;
        const r = sh.getBoundingClientRect(), g = document.createElement('div'), dim = document.createElement('div');
        dim.className = 'ghost-dim'; g.className = 'ghost-sheet'; g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
        document.body.append(dim, g); setTimeout(() => { g.remove(); dim.remove(); }, 260);
    }

    // ---------- success burst ----------
    function confetti(x, y) {
        if (reduce) return; const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
        const cols = ['#16b97c', '#5df0b4', '#ffcf5c', '#ff6ba6', '#7aa7ff', '#b28dff'];
        for (let i = 0; i < 26; i++) {
            const p = document.createElement('i'), a = Math.random() * Math.PI * 2, v = 70 + Math.random() * 130;
            p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]};--dx:${Math.cos(a) * v}px;--dy:${Math.sin(a) * v - 60}px;--rot:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 90}ms`;
            box.appendChild(p);
        }
        document.body.appendChild(box); setTimeout(() => box.remove(), 1300);
    }

    // ---------- gallery depth: the centred card is full size, the others step back ----------
    function depth(sc) {
        if (reduce) return; const c = sc.getBoundingClientRect(), mid = c.left + c.width / 2;
        sc.querySelectorAll('.bigcard, .addcard').forEach(el => {
            const r = el.getBoundingClientRect(), dist = Math.abs(r.left + r.width / 2 - mid) / c.width, s = Math.max(0.92, 1 - dist * 0.16);
            el.style.transform = `scale(${s.toFixed(3)})`; el.style.opacity = String(Math.max(0.72, 1 - dist * 0.5).toFixed(2));
        });
    }
    let raf = 0;
    document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.id === 'cardScroll' && !raf) raf = requestAnimationFrame(() => { raf = 0; depth(t); }); }, true);

    // ---------- numbers that change get a short colour flash ----------
    const seen = new Map();
    function bump() {
        const sel = ['.bc-bal', '.fs-txt b', '.safe-ring .mid b', '.gnums b', '.subs-head b'];
        sel.forEach(s => document.querySelectorAll(s).forEach((el, i) => {
            const k = s + '#' + i, txt = el.textContent, prev = seen.get(k);
            if (prev !== undefined && prev !== txt && !/•/.test(txt)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
            seen.set(k, txt);
        }));
    }

    // ---------- watch the screen ----------
    let pend = false;
    const mo = new MutationObserver(() => {
        if (pend) return; pend = true;
        requestAnimationFrame(() => {
            pend = false;
            const sc = $('#cardScroll'); if (sc && !sc.__depth) { sc.__depth = true; depth(sc); }
            bump();
            const ok = $('#screen .receipt .ok'); if (ok && !ok.__burst) { ok.__burst = true; if (window.Feel) Feel.haptic('success'); const r = ok.getBoundingClientRect(); setTimeout(() => confetti(r.left + r.width / 2, r.top + r.height / 2), 260); }
        });
    });
    function start() { const s = $('#screen'); if (s) mo.observe(s, { childList: true, subtree: true, characterData: true }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    // ---------- language change: a quick fade ----------
    window.addEventListener('langchange', () => { const a = $('#app'); if (!a || reduce) return; a.classList.remove('lang-swap'); void a.offsetWidth; a.classList.add('lang-swap'); setTimeout(() => a.classList.remove('lang-swap'), 420); });

    window.Anim = { sheetOut, confetti, reduce };
})();
