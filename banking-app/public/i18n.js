'use strict';
// ============================================================
// i18n.js : English / Қазақша / Русский
// The English text in the app is the "key". A small translator watches the screen and swaps
// every piece of text for the chosen language (also toasts, sheets and messages from the server).
// Dictionaries live in i18n-ru.js and i18n-kk.js:   I18N.add('ru', { 'English text': 'Русский текст', ... })
//   * "{0}", "{1}" in a key match any text (numbers, names...) and can be moved around in the translation.
//   * a text that has no translation simply stays in English.
// ============================================================
(function () {
    const LANGS = {
        en: { name: 'English', short: 'EN', locale: 'en-GB' },
        kk: { name: 'Қазақша', short: 'ҚАЗ', locale: 'kk-KZ' },
        ru: { name: 'Русский', short: 'РУС', locale: 'ru-RU' }
    };
    const EXACT = { kk: {}, ru: {} }, TEMPL = { kk: [], ru: [] };
    const store = { get: () => { try { return localStorage.getItem('coddy_lang'); } catch (e) { return null; } }, set: (v) => { try { localStorage.setItem('coddy_lang', v); } catch (e) { /* private mode */ } } };
    const detect = () => { const n = (navigator.language || 'en').toLowerCase(); return n.startsWith('kk') ? 'kk' : n.startsWith('ru') ? 'ru' : 'en'; };
    let lang = store.get(); if (!LANGS[lang]) lang = detect();
    const cache = new Map();
    const norm = (s) => s.replace(/\s+/g, ' ').trim();

    function add(l, dict) {
        Object.keys(dict).forEach(k => {
            const key = norm(k);
            if (/\{\d+\}/.test(key)) {
                const raw = key.split(/\{\d+\}/), esc = raw.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
                // a placeholder that touches letters ("{0}months") may only be a number; any other placeholder takes any text
                let src = '^' + esc[0];
                for (let i = 1; i < raw.length; i++) {
                    const touches = /^[A-Za-z]/.test(raw[i]) || /[A-Za-z]$/.test(raw[i - 1]);
                    src += (touches ? '(\\d[\\d\\s.,]*)' : '([\\s\\S]+?)') + esc[i];
                }
                TEMPL[l].push({ re: new RegExp(src + '$'), to: dict[k], len: key.replace(/\{\d+\}/g, '').length });
            } else EXACT[l][key] = dict[k];
        });
        TEMPL[l].sort((a, b) => b.len - a.len); cache.clear();
    }
    function lookup(key) {
        const d = EXACT[lang]; if (!d) return null;
        if (d[key] !== undefined) return d[key];
        for (const t of TEMPL[lang]) {
            const m = t.re.exec(key); if (!m) continue;
            return t.to.replace(/\{(\d+)\}/g, (x, i) => { const c = (m[+i + 1] || '').trim(); const r = /[A-Za-z]{2}/.test(c) ? lookup(norm(c)) : null; return r === null ? c : r; });
        }
        return null;
    }
    // translate a piece of text (keeps the spaces around it)
    function tx(raw) {
        if (lang === 'en' || !raw) return raw;
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw); if (!m[2] || !/[A-Za-z]{2}/.test(m[2])) return raw;
        const k = norm(m[2]); let r = cache.get(k);
        if (r === undefined) { r = lookup(k); cache.set(k, r); }
        return r === null ? raw : m[1] + r + m[3];
    }

    // ---------- watching the page ----------
    const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1 };
    const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    const INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, SPAN: 1, A: 1, U: 1 };
    const skipEl = (e) => !e || SKIP[e.tagName] || (e.closest && e.closest('[data-no-i18n]'));
    function textNode(n) {
        if (n.__tr !== undefined && n.nodeValue === n.__tr) return;
        if (skipEl(n.parentElement)) return;
        n.__en = n.nodeValue;
        const t = tx(n.nodeValue); n.__tr = t !== n.nodeValue ? t : undefined;
        if (n.__tr !== undefined) n.nodeValue = t;
    }
    function attrs(e) {
        for (const a of ATTRS) if (e.hasAttribute && e.hasAttribute(a)) {
            e.__enA = e.__enA || {}; const cur = e.getAttribute(a);
            if (e.__enA[a] && e.__enA[a].tr === cur) continue;
            const t = tx(cur); e.__enA[a] = { en: cur, tr: t }; if (t !== cur) e.setAttribute(a, t);
        }
    }
    // a sentence with <b>..</b> inside: translate it as a whole, keep the tags' attributes
    const mixed = (e) => {
        if (!e.children.length || !e.childNodes.length) return false;
        let text = false; for (const c of e.childNodes) { if (c.nodeType === 3 && c.nodeValue.trim()) text = true; else if (c.nodeType === 1 && !INLINE[c.tagName]) return false; else if (c.nodeType === 1 && c.children.length) return false; }
        return text;
    };
    const htmlKey = (e) => norm(e.innerHTML.replace(/<(\w+)\s[^>]*>/g, '<$1>'));
    function elementHtml(e, html) {
        const tpl = document.createElement('template'); tpl.innerHTML = html; const olds = [...e.children], used = new Set();
        tpl.content.querySelectorAll('*').forEach(el => { const o = olds.find(x => !used.has(x) && x.tagName === el.tagName); if (o) { used.add(o); [...o.attributes].forEach(a => el.setAttribute(a.name, a.value)); } });
        e.__enHtml = e.__enHtml || e.innerHTML; e.__trHtml = tpl.innerHTML; e.innerHTML = tpl.innerHTML;
    }
    function element(e) {
        if (e.nodeType !== 1 || skipEl(e)) return;
        if (e.__trHtml !== undefined && e.innerHTML === e.__trHtml) return;
        attrs(e);
        if (lang !== 'en' && mixed(e)) {
            const k = htmlKey(e); let r = cache.get('h:' + k); if (r === undefined) { r = lookup(k); cache.set('h:' + k, r); }
            if (r !== null) { elementHtml(e, r); return; }
        }
        e.childNodes.forEach(c => { if (c.nodeType === 3) textNode(c); else if (c.nodeType === 1) element(c); });
    }
    let busy = false;
    const mo = new MutationObserver((list) => {
        if (busy) return; busy = true;
        try {
            for (const m of list) {
                if (m.type === 'childList') m.addedNodes.forEach(n => { if (n.nodeType === 3) textNode(n); else if (n.nodeType === 1) element(n); });
                else if (m.type === 'characterData') textNode(m.target);
                else if (m.type === 'attributes') attrs(m.target);
            }
        } finally { busy = false; mo.takeRecords(); }
    });
    function watch() { if (document.body) { mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS }); element(document.body); } }

    // ---------- switching ----------
    function redo() {
        busy = true;
        try {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) {
                if (skipEl(n.parentElement)) continue;
                if (n.__en === undefined) { n.__en = n.nodeValue; }
                else if (n.__tr !== undefined && n.nodeValue !== n.__tr) n.__en = n.nodeValue;   // the app changed the text
                const t = tx(n.__en); n.__tr = t !== n.__en ? t : undefined; n.nodeValue = n.__tr !== undefined ? t : n.__en;
            }
            document.querySelectorAll('*').forEach(e => {
                if (e.__enA) for (const a of Object.keys(e.__enA)) { const rec = e.__enA[a], t = tx(rec.en); rec.tr = t; e.setAttribute(a, t); }
                if (e.__enHtml !== undefined) { const orig = e.__enHtml; e.__trHtml = undefined; e.innerHTML = orig; e.__enHtml = undefined; element(e); }
                else attrs(e);
            });
            // elements that were never translated as a whole yet (language was English at that time)
            document.body.querySelectorAll('*').forEach(e => { if (e.__enHtml === undefined && lang !== 'en' && mixed(e)) element(e); });
        } finally { busy = false; mo.takeRecords(); }
    }
    function setLang(l) {
        if (!LANGS[l] || l === lang) return;
        lang = l; store.set(l); cache.clear(); document.documentElement.lang = l; redo();
        const keys = Object.keys(LANGS), idx = keys.indexOf(l);
        document.querySelectorAll('.langsw').forEach(el => { const pill = el.querySelector('.pill'); if (pill) pill.style.transform = `translateX(${idx * 100}%)`; el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === l)); });
        window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
    }
    // the three-way switch (EN | ҚАЗ | РУС) with a sliding highlight
    function switcher(cls) {
        const keys = Object.keys(LANGS), i = keys.indexOf(lang);
        return `<div class="langsw ${cls || ''}" data-cls="${cls || ''}" data-no-i18n role="group" aria-label="Language"><i class="pill" style="transform:translateX(${i * 100}%)"></i>${keys.map(k => `<button type="button" class="${k === lang ? 'on' : ''}" data-act="lang" data-l="${k}" aria-label="${LANGS[k].name}">${LANGS[k].short}</button>`).join('')}</div>`;
    }

    // dates in the chosen language (own Kazakh month names, so it works on every phone)
    const KK_MON = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];
    function date(d, withYear) {
        if (lang === 'kk') return `${d.getDate()} ${KK_MON[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
        if (lang === 'ru') return d.toLocaleDateString('ru-RU', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
        return withYear ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    const api = {
        LANGS, add, tx, setLang, switcher, redo, date,
        get lang() { return lang; },
        get locale() { return LANGS[lang].locale; },
        // text with a number: "{0} day(s)" style helper for code that builds sentences
        t: (s) => tx(s)
    };
    window.I18N = api;
    document.documentElement.lang = lang;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
