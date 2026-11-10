'use strict';
// ============================================================
// features-ui.js : screens added in version 3
// (extends the objects views / forms / actions / loaders / live from app.js)
// ============================================================

// ---------- small helpers ----------
const fld = (label, inner, extra = '') => `<div class="field"><label>${label}</label>${inner}${extra}</div>`;
const selectHtml = (name, pairs, selected) => `<select name="${name}">${pairs.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
const accSel = (name, filter, selected) => `<select name="${name}">${accOptions(filter, selected)}</select>`;
const numInp = (name, ph = '0', extra = '') => `<input name="${name}" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="${ph}" required ${extra}>`;
const kzt = (n) => money(n, 'KZT');
const hasCard = () => S.accounts.some(a => a.account_type === 'card');
const gauge = (score, level) => `<div class="gauge"><div class="gauge-bar"><span class="lv-${level}" style="width:${Math.max(4, score)}%"></span></div><b class="lv-t-${level}">${score}/100 · ${level === 'high' ? 'HIGH RISK' : level === 'medium' ? 'CAUTION' : 'LOW RISK'}</b></div>`;
const reasonList = (rs) => `<ul class="reasons">${(rs || []).map(r => `<li>${esc(r.text)}${r.points ? ` <em>+${r.points}</em>` : ''}</li>`).join('')}</ul>`;
const empty = (t) => `<div class="empty">${esc(t)}</div>`;
const when = (s) => { const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z')); return `${fmtDay(d)}, ${fmtTime(d)}`; };
const statusTag = (s) => `<span class="tag ${['paid', 'approved', 'active', 'ok', 'booked', 'released'].includes(s) ? '' : (['declined', 'cancelled', 'closed', 'failed', 'expired'].includes(s) ? 'off' : 'wait')}">${esc(s)}</span>`;
let CITY = 'Almaty';
try { CITY = localStorage.getItem('bcc_city') || 'Almaty'; } catch (e) { /* storage blocked: ignore */ }
const CITIES = { Almaty: ['Head office, 38 Al-Farabi Ave', 'Example branch: city centre'], Astana: ['Example branch: Left Bank', 'Example branch: city centre'], Shymkent: ['Example branch: city centre'], Taraz: ['Example branch: city centre'], Karaganda: ['Example branch: city centre'], Aktobe: ['Example branch: city centre'], Atyrau: ['Example branch: city centre'] };

function downloadFile(name, mime, content) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copied', 'success'); } catch (e) { toast('Copy is not available here. Select the text manually.'); } }

// ---------- Shield warning dialog (before the SMS code) ----------
function shieldWarning(risk, proceed) {
    S.shieldProceed = proceed;
    openSheet(`<h2>${ic('shield')} Shield check</h2>${gauge(risk.score, risk.level)}
        <p class="muted" style="margin:10px 0 6px">Please read before you send ${esc(risk.display || '')} to ${esc(risk.label || '')}:</p>
        ${reasonList(risk.reasons)}
        <div class="note warn">${esc(risk.advice)}</div>
        <label class="check"><input type="checkbox" id="coachedBox"> Someone is on the phone or in a chat telling me what to do</label>
        <button class="btn" data-act="shieldContinue">I understand, continue</button>
        <button class="btn ghost" data-act="closeOverlay" style="margin-top:10px">Cancel transfer</button>`);
}
actions.shieldContinue = () => { const c = $('#coachedBox').checked, p = S.shieldProceed; closeOverlay(); p(c); };

// ============================================================
// HOME (with big cards)
// ============================================================
const cardTheme = (a) => (!a.card_number ? 'savings' : a.currency === 'USD' ? 'gold' : a.card_type === 'mastercard' ? 'graphite' : 'green');
function bigCard(a, i) {
    const logo = !a.card_number ? '' : (a.card_type === 'mastercard' ? '<span class="mc-logo"><i></i><i></i></span>' : '<span class="visa-logo">VISA</span>');
    return `<div class="bigcard th-${cardTheme(a)} ${a.frozen ? 'frozen' : ''}" data-i="${i}" data-act="accSheet" data-acc="${esc(a.account_number)}">
        <div class="bc-top"><span class="bc-brand">bcc<i>.kz</i></span><span class="bc-cur">${a.card_number ? 'DEBIT' : 'ACCOUNT'} · ${a.currency}</span></div>
        <div class="bc-chip"><span></span></div>
        <div class="bc-bal">${esc(bal(a.balance, a.currency))}</div>
        <div class="bc-num">${a.card_number ? '•••• •••• •••• ' + esc(last4(a)) : esc(a.account_number.replace(/(.{4})/g, '$1 ').trim())}</div>
        <div class="bc-bot"><div><small>${a.card_number ? 'CARD HOLDER' : 'OWNER'}</small><b>${esc(String(S.user.full_name).toUpperCase().slice(0, 22))}</b></div>
            ${a.expiry ? `<div><small>VALID THRU</small><b>${esc(a.expiry)}</b></div>` : ''}<div class="bc-logo">${logo}</div></div>
        ${a.frozen ? `<div class="bc-frozen">${ic('snow')} Frozen</div>` : ''}</div>`;
}
function cardActions() {
    const a = S.accounts[S.cardIdx || 0]; if (!a) return '';
    const btn = (icn, label, act) => `<button class="qa" ${act}><span>${ic(icn)}</span>${label}</button>`;
    return btn('transfers', 'Transfer', 'data-tab="transfers"') + btn('plus', 'Top up', 'data-tab="payments"')
        + (a.card_number ? btn('card', 'Details', `data-act="cardDetails" data-acc="${esc(a.account_number)}"`) + btn(a.frozen ? 'check' : 'snow', a.frozen ? 'Unfreeze' : 'Freeze', `data-act="${a.frozen ? 'unfreezeCard' : 'freezeCard'}" data-acc="${esc(a.account_number)}"`)
            : btn('doc', 'Statement', `data-go="documents"`) + btn('safe', 'Deposits', 'data-go="deposits"'));
}
function bindCardScroll() {
    const sc = $('#cardScroll'); if (!sc) return;
    sc.scrollLeft = (S.cardIdx || 0) * (sc.clientWidth * 0.9 + 12);
    sc.addEventListener('scroll', () => {
        const w = sc.firstElementChild ? sc.firstElementChild.getBoundingClientRect().width + 12 : 1;
        const i = Math.max(0, Math.min(S.accounts.length - 1, Math.round(sc.scrollLeft / w)));
        if (i !== S.cardIdx) { S.cardIdx = i; $$('.dots i').forEach((d, k) => d.classList.toggle('on', k === i)); $('#cardActions').innerHTML = cardActions(); }
    }, { passive: true });
}

views.home = {
    html: () => {
        S.cardIdx = Math.min(S.cardIdx || 0, Math.max(0, S.accounts.length - 1));
        return `
    <div class="screen">
        <div class="brandbar"><div class="wordmark">bcc<i>.kz</i></div>
            <div class="bb-right">${I18N.switcher('sm')}<button class="msg-btn" data-go="notifications" aria-label="Messages">${ic('msg')}${S.unread ? `<em>${S.unread}</em>` : ''}</button></div></div>
        <div class="greet">
            <button class="avatar" data-act="profile" aria-label="Profile">${esc(firstName().slice(0, 1).toUpperCase())}</button>
            <div><h1>${esc(window.Feel ? Feel.greeting(firstName()) : 'Hello, ' + firstName())}</h1>
                <button class="plus-pill" data-go="plus"><b>plus</b> ${S.plus ? 'bcc Plus is active' : 'Subscription is not connected'}</button></div>
        </div>
        <div class="cards-wrap">
            <div class="cards-scroll" id="cardScroll">${S.accounts.map(bigCard).join('')}<button class="addcard" data-act="openCardSheet"><span class="plus">${ic('plus')}</span><b>Open a card</b><small>Visa or Mastercard, KZT or USD</small></button></div>
            <div class="dots-row"><div class="dots">${S.accounts.map((a, i) => `<i class="${i === S.cardIdx ? 'on' : ''}"></i>`).join('')}</div><button class="eye-btn" data-act="toggleHide" aria-label="Hide balance">${ic(S.hide ? 'eyeoff' : 'eye')}<span>${S.hide ? 'Show balance' : 'Hide balance'}</span></button></div>
            <div class="qactions" id="cardActions">${cardActions()}</div>
        </div>
        ${finStrip()}${window.Feel ? Feel.bannerHtml() : ''}
        <div class="stories">
            <button class="story s1" data-act="openCardSheet">New USD cards${ic('card')}</button>
            <button class="story s2" data-go="shield">bcc Shield: scam protection${ic('shield')}</button>
            <button class="story s3" data-go="intl">Send money abroad${ic('globe')}</button>
            <button class="story s4" data-go="crypto">Crypto wallets${ic('crypto')}</button>
        </div>
        <div class="duo">
            <button class="tile" data-go="analytics"><div><h3>My analytics</h3><p>Income and expenses</p></div>
                <div class="bars"><span style="flex:40;background:#7aa7ff"></span><span style="flex:26;background:#45d19a"></span><span style="flex:20;background:#f2b01e"></span><span style="flex:8;background:#ff7a90"></span></div></button>
            <button class="tile" data-go="cashback"><div><h3>${S.cb != null ? esc(String(S.cb)) : '0'} <span class="kbadge">b</span></h3><p>Cashback and discounts</p></div>
                <div class="go"><span>Choose monthly categories</span>${ic('right')}</div></button>
        </div>
        <div class="chips quick">
            <button class="chip" data-go="qr">${ic('qr')}QR</button><button class="chip" data-go="chat">${ic('chat')}Chat</button>
            <button class="chip" data-go="gov">${ic('star')}Public Services</button><button class="chip" data-go="shield">${ic('shield')}Shield</button>
            <button class="chip" data-go="offers">${ic('star')}Offers</button><button class="chip" data-go="documents">${ic('doc')}Documents</button>
        </div>
        <div class="panels">
            <div class="pcard">
                <h2 style="margin-bottom:10px">You may be interested in</h2>
                <button class="row" data-go="loans"><span class="round-ic">${ic('loan')}</span><span class="grow"><div class="t">Get a loan</div><div class="s">Get a decision in a few minutes</div></span></button>
                <button class="row" data-go="deposits"><span class="round-ic">${ic('safe')}</span><span class="grow"><div class="t">Open a deposit account</div><div class="s">Grow your savings</div></span></button>
                <button class="row" data-go="invest"><span class="round-ic">${ic('bars')}</span><span class="grow"><div class="t">Brokerage account</div><div class="s">Earn from your investments</div></span></button>
                <button class="row" data-go="shield"><span class="round-ic">${ic('shield')}</span><span class="grow"><div class="t">bcc Shield</div><div class="s">Scam protection with a trusted guardian</div></span></button>
            </div>
        </div>
    </div>`;
    },
    after: () => { bindCardScroll(); maybeSubPrompt(); }
};
actions.toggleCol = (el) => { S.collapse = S.collapse || {}; S.collapse[el.dataset.k] = !S.collapse[el.dataset.k]; render(true); };

// ============================================================
// TRANSFERS / PAYMENTS / SERVICES
// ============================================================
views.transfers = {
    html: () => {
        const seen = new Set(), freq = [];
        S.tx.filter(t => t.transaction_type === 'transfer_out' && t.details && t.details.method === 'phone').forEach(t => { if (!seen.has(t.to_account) && freq.length < 5) { seen.add(t.to_account); freq.push(t); } });
        const first = S.accounts.find(a => a.account_type === 'card');
        const item = (icon, t, s, attrs) => `<button class="row" ${attrs}><span class="ic-wrap">${ic(icon)}</span><span class="grow"><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</span></button>`;
        return `
    <div class="screen">
        <div class="top"><h1>Transfers</h1></div>
        <div class="sec-head" style="padding:0 20px"><h2 style="font-size:24px">Frequent</h2><button class="green-link" data-tab="history">All</button></div>
        <div class="frequent">
            ${first ? `<button class="freq" data-go="own"><span class="circle">${ic('client')}</span><span>${esc(brand(first))} card</span></button>` : ''}
            ${freq.map(t => `<button class="freq" data-go="client" data-p="${esc(JSON.stringify({ mode: 'phone', phone: t.to_account }))}"><span class="circle">${ic('client')}</span><span>${esc((t.details && t.details.counterparty) || t.to_account)}</span></button>`).join('')}
        </div>
        <div class="panel">
            <h2 style="margin-bottom:8px">All transfers</h2>
            ${item('own', 'To Own Accounts', 'To your card or account (KZT ⇄ USD)', 'data-go="own"')}
            ${item('client', 'To bcc.kz client', 'by phone number or card', 'data-go="client"')}
            ${item('bank', 'To other banks in Kazakhstan', 'by card number', 'data-go="domestic"')}
            ${item('globe', 'International Money Transfers', 'Globally, in USD', 'data-go="intl"')}
            ${item('crypto', 'To crypto wallet', 'USDT, Bitcoin, Ethereum', 'data-go="crypto"')}
            ${item('safe', 'From deposit', 'To your card or account', 'data-go="depWithdraw"')}
            ${item('request', 'Money requests', 'from one or several people', 'data-go="requests"')}
            ${item('repeat', 'Autotransfers', 'Scheduled transfers', 'data-go="autos"')}
            <div class="more-title">More</div>
            ${item('support', 'Bank contact', 'Customer Support and Social Media', 'data-go="contact"')}
            ${item('refund', 'Refund requests', 'Dispute an operation', 'data-go="refunds"')}
        </div>
    </div>`;
    }
};

views.payments = {
    html: () => `
    <div class="screen">
        <div class="top"><h1>Payments</h1></div>
        <div class="panels">
            <div class="pcard"><h2 style="margin-bottom:6px">Pay for services</h2><p class="muted sm">Earn cashback on every payment.</p>
                <div class="grid4">
                    ${(S.billers || []).map(b => `<button class="svc" data-go="bill" data-p="${esc(JSON.stringify({ cat: b.id }))}"><span class="box">${ic({ mobile: 'phone', utilities: 'doc', internet: 'globe', transport: 'transfers', entertainment: 'star' }[b.id] || 'doc')}</span>${esc(b.name)}</button>`).join('')}
                    <button class="svc" data-go="gov"><span class="box">${ic('bank')}</span>Taxes &amp; fines</button>
                    <button class="svc" data-go="insurance"><span class="box">${ic('shield')}</span>Insurance</button>
                    <button class="svc" data-go="cashback"><span class="box">${ic('star')}</span>Cashback</button>
                </div></div>
            <div class="pcard">
                <h2 style="margin-bottom:6px">Top up</h2>
                <p class="muted sm" style="margin-bottom:16px">Demo: top-ups are simulated, no real money moves.</p>
                <form data-form="topup">
                    <div class="field"><label>Account</label><select name="acc">${accOptions()}</select></div>
                    <div class="field"><label>Amount</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required></div>
                    <button class="btn" type="submit">Top up</button>
                </form>
            </div>
        </div>
    </div>`
};

actions.cityPick = () => openSheet(`<h2>Your city</h2>${Object.keys(CITIES).map(c => `<button class="opt ${c === CITY ? 'on' : ''}" data-act="setCity" data-c="${c}">${c}${c === CITY ? ic('check') : ''}</button>`).join('')}`);
actions.setCity = (el) => { CITY = el.dataset.c; try { localStorage.setItem('bcc_city', CITY); } catch (e) { /* ignore */ } closeOverlay(); render(true); };

views.services = {
    html: () => {
        const tile = (i, n, attrs, isNew) => `<button class="svc" ${attrs}><span class="box">${ic(i)}${isNew ? '<span class="new">new</span>' : ''}</span>${n}</button>`;
        const go = (v, p) => `data-go="${v}"${p ? ` data-p="${esc(JSON.stringify(p))}"` : ''}`;
        const sec = (id, title, tiles) => `<div class="pcard" id="sec-${id}"><div class="sec-head"><h2>${title}</h2></div><div class="grid4">${tiles}</div></div>`;
        const chips = ['New', 'Finance', 'Government Services', 'Insurance', 'Lifestyle', 'Other services'];
        return `
    <div class="screen">
        <div class="top toprow"><h1>Services</h1><button class="green-link" style="display:flex;align-items:center;gap:6px" data-act="cityPick">${ic('globe')} ${esc(CITY)}</button></div>
        <button class="banner" data-go="shield"><h3>bcc Shield: stop scammers before they get your money</h3><p>Smart checks, a trusted guardian and a panic button</p>${ic('shield')}</button>
        <div class="chips wrap svc-chips">${chips.map(c => `<button class="chip ${S.svcTab === c ? 'on' : ''}" data-act="svcChip" data-sec="${esc(c)}">${c}</button>`).join('')}</div>
        <div class="panels">
            ${sec('New', 'New', tile('shield', 'bcc Shield', go('shield'), true) + tile('qr', 'My QR', go('qr'), true) + tile('crypto', 'Crypto wallets', go('crypto'), true) + tile('chat', 'Chat assistant', go('chat'), true) + tile('bars', 'Finance & AI', go('finance'), true) + tile('repeat', 'Subscriptions', go('finance', { tab: 'subs' }), true) + tile('star', 'Savings goals', go('finance', { tab: 'goals' }), true))}
            ${sec('Finance', 'Finance', tile('safe', 'Deposits', go('deposits')) + tile('bars', 'Investments', go('invest')) + tile('loan', 'Loans', go('loans')) + tile('exchange', 'Exchange KZT ⇄ USD', go('own')) + tile('star', 'bcc Plus', go('plus')) + tile('safe', 'Safe deposit boxes', go('safebox')) + tile('request', 'Money requests', go('requests')) + tile('repeat', 'Autotransfers', go('autos')))}
            ${sec('Government Services', 'Government Services', tile('bank', 'Taxes &amp; fines', go('gov', { tab: 'taxes' })) + tile('doc', 'Pension info', go('gov', { tab: 'pension' })) + tile('card', 'Vehicle check', go('gov', { tab: 'vehicle' })) + tile('shield', 'Health insurance info', go('gov', { tab: 'osms' })))}
            ${sec('Insurance', 'Insurance', tile('plane', 'Travel', go('insurance', { product: 'travel' })) + tile('car', 'Car (OSAGO)', go('insurance', { product: 'car' })) + tile('home', 'Property', go('insurance', { product: 'home' })))}
            ${sec('Lifestyle', 'Lifestyle', tile('star', 'Offers', go('offers')) + tile('star', 'Cashback', go('cashback')) + tile('phone', 'Mobile top-up', go('bill', { cat: 'mobile' })) + tile('bars', 'Analytics', go('analytics')))}
            ${sec('Other services', 'Other services', tile('support', 'Bank contact', go('contact')) + tile('refund', 'Refund requests', go('refunds')) + tile('doc', 'My documents', go('documents')) + (S.isAdmin ? tile('bars', 'Bank team', go('admin')) : ''))}
        </div>
    </div>`;
    }
};

// ============================================================
// QR: my code + scan
// ============================================================
function qrPayload(amount, cur) {
    const digits = String(S.user.phone).replace(/\D/g, '');
    return `bcckz://pay?p=${digits}` + (amount ? `&a=${amount}&c=${cur}` : '');
}
views.qr = {
    html: (p) => {
        const tabn = p.tab || 'mine';
        return flow('QR', `
        <div class="seg"><button class="${tabn === 'mine' ? 'on' : ''}" data-act="qrTab" data-t="mine">My QR</button><button class="${tabn === 'scan' ? 'on' : ''}" data-act="qrTab" data-t="scan">Scan</button></div>
        ${tabn === 'mine' ? `
            <div class="qr-box" id="qrBox">${QR.svg(qrPayload(), 240)}</div>
            <p class="muted" style="text-align:center;margin:10px 0 18px">Show this code: anyone with bcc.kz can scan it and pay you.</p>
            <form data-form="qrAmount" data-live="qr"><div class="phone-row" style="grid-template-columns:1fr 36%">
                <div class="field"><label>Amount (optional)</label><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Any amount"></div>
                ${fld('Currency', selectHtml('cur', [['KZT', 'KZT ₸'], ['USD', 'USD $']], 'KZT'))}</div></form>
            <button class="btn ghost" data-act="qrCopy">${ic('copy')} Copy payment link</button>`
        : `
            <div id="scanArea"><video id="scanVideo" playsinline muted style="display:none"></video><div class="note" id="scanNote">Starting the camera…</div></div>
            <form data-form="qrPaste"><div class="field"><label>No camera? Paste the QR text here</label><input name="text" placeholder="bcckz://pay?p=…" autocomplete="off"></div>
            <button class="btn" type="submit">Continue</button></form>
            <div class="field" style="margin-top:18px" id="scanFileBox" hidden><label>Or choose a photo of a QR code</label><input type="file" accept="image/*" id="scanFile"></div>`}
        `);
    },
    after: (p) => { if (p.tab === 'scan') startScan(); }
};
actions.qrTab = (el) => { go('qr', { tab: el.dataset.t }); };
live.qr = (f) => { const a = parseFloat(f.amount.value); $('#qrBox').innerHTML = QR.svg(qrPayload(a > 0 ? a : '', f.cur.value), 240); S.qrCur = { a, c: f.cur.value }; };
actions.qrCopy = () => { const a = S.qrCur && S.qrCur.a > 0 ? S.qrCur : null; copyText(qrPayload(a ? a.a : '', a ? a.c : 'KZT')); };
forms.qrAmount = () => {};
async function resolveQr(text) {
    const r = await api('/api/qr/resolve', { text });
    if (!r.success) return toast(r.message, 'error');
    S.stack = S.stack.filter(x => x.view !== 'qr'); stopScan();
    toast(`Paying ${r.name}`, 'success');
    push('client', { mode: 'phone', phone: r.phone, amount: r.amount || '' });
}
forms.qrPaste = (f) => resolveQr(val(f, 'text'));
let scanStream = null, scanTimer = null;
window.stopScan = () => { if (scanTimer) clearInterval(scanTimer); scanTimer = null; if (scanStream) scanStream.getTracks().forEach(t => t.stop()); scanStream = null; };
async function startScan() {
    const note = $('#scanNote'), supported = ('BarcodeDetector' in window);
    if (supported) { const fb = $('#scanFileBox'); if (fb) { fb.hidden = false; $('#scanFile').onchange = async (e) => { try { const bmp = await createImageBitmap(e.target.files[0]); const res = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp); res.length ? resolveQr(res[0].rawValue) : toast('No QR code found in the photo', 'error'); } catch (err) { toast('Could not read the photo', 'error'); } }; } }
    if (!supported || !navigator.mediaDevices || !window.isSecureContext) {
        note.textContent = !window.isSecureContext ? 'The camera only works on https:// or localhost (browser rule). Paste the QR text below instead.' : 'Camera scanning is not supported by this browser. Paste the QR text below instead.';
        return;
    }
    try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = $('#scanVideo'); v.srcObject = scanStream; v.style.display = 'block'; await v.play(); note.textContent = 'Point the camera at a bcc.kz QR code';
        const det = new BarcodeDetector({ formats: ['qr_code'] });
        scanTimer = setInterval(async () => { try { const r = await det.detect(v); if (r.length) { stopScan(); resolveQr(r[0].rawValue); } } catch (e) { /* frame not ready */ } }, 400);
    } catch (e) { note.textContent = 'Camera permission denied. Paste the QR text below instead.'; }
}

// ============================================================
// CHAT assistant
// ============================================================
S.chat = [];
views.chat = {
    html: () => {
        if (!S.chat.length) S.chat.push({ from: 'bot', text: `Hello, ${firstName()}! I can answer questions about your accounts, transfers, cards, loans and security. What do you need?`, chips: ['My balance', 'Send money abroad', 'I think it is a scam', 'Talk to a person'] });
        const last = S.chat[S.chat.length - 1];
        return flow('Chat assistant', `
        <div class="chat" id="chatBox">${S.chat.map(m => `<div class="bubble ${m.from}">${esc(m.text).replace(/\n/g, '<br>')}
            ${m.open ? `<button class="link" data-go="${esc(m.open)}">Open →</button>` : ''}${m.panic ? `<button class="btn danger" style="margin-top:8px" data-act="panicNow">${ic('snow')} Freeze all my cards now</button>` : ''}</div>`).join('')}</div>
        <div class="chips wrap" style="padding:0;margin:0 0 12px">${(last.chips || []).map(c => `<button class="chip" data-act="chatSend" data-m="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <form data-form="chat" class="chat-form"><input name="m" placeholder="Type a message" autocomplete="off" required><button class="btn" type="submit">Send</button></form>`);
    },
    after: () => { const b = $('#chatBox'); if (b) b.lastElementChild && b.lastElementChild.scrollIntoView({ block: 'end' }); }
};
async function sendChat(text) {
    S.chat.push({ from: 'me', text }); S.chat[S.chat.length - 1].chips = [];
    const r = await api('/api/chat', { message: text });
    S.chat.push({ from: 'bot', text: r.success ? r.reply : r.message, open: r.open, panic: r.panic, chips: r.chips });
    render(true); window.scrollTo(0, document.body.scrollHeight);
}
forms.chat = (f) => { const t = val(f, 'm').trim(); if (t) sendChat(t); };
actions.chatSend = (el) => sendChat(el.dataset.m);
actions.panicNow = async () => { const r = await api('/api/shield/panic', {}); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); S.chat.push({ from: 'bot', text: r.message + '. To unfreeze, open the card and confirm with an SMS code.', chips: ['My balance'] }); render(true); };

// ============================================================
// DATA LOADERS
// ============================================================
const _refreshAll = refreshAll;
refreshAll = async function () {
    await _refreshAll();
    const [c, bl, br] = await Promise.all([api('/api/cashback'), S.billers ? Promise.resolve(null) : api('/api/billers'), api('/api/pfm/brief')]);
    if (c.success) { S.cb = c.balance; S.cbInfo = c; }
    if (bl && bl.success) S.billers = bl.billers;
    S.brief = br && br.success ? br : null;
};
loaders.notifications = async () => { S.notes = (await api('/api/notifications')).notifications || []; };
loaders.requests = async () => { S.reqs = await api('/api/requests'); };
loaders.autos = async () => { S.autos = (await api('/api/autotransfers')).items || []; };
loaders.refunds = async () => { S.refunds = await api('/api/refunds'); };
loaders.shield = async () => { S.shield = await api('/api/shield'); S.scen = await api('/api/shield/scenarios'); };
loaders.admin = async () => { S.ov = await api('/api/admin/overview'); if (!S.ov.success) toast(S.ov.message, 'error'); };
loaders.analytics = async (p) => { S.an = await api('/api/analytics' + (p && p.month ? '?month=' + p.month : '')); };
loaders.cashback = async () => { S.cbInfo = await api('/api/cashback'); S.cb = S.cbInfo.balance; };
loaders.plus = async () => { S.plusInfo = await api('/api/plus'); };
loaders.safebox = async () => { S.sreq = await api('/api/service-requests'); };
loaders.loans = async () => { S.loans = await api('/api/loans'); };
loaders.invest = async () => { S.inv = await api('/api/invest'); };
loaders.insurance = async () => { S.pol = (await api('/api/insurance')).policies || []; };
loaders.offers = async () => { S.offers = (await api('/api/offers')).offers || []; };

// ============================================================
// NOTIFICATIONS
// ============================================================
const NOTE_ICON = { transfer_in: 'client', money_request: 'request', guardian_invite: 'shield', guardian_request: 'shield', shield: 'shield', security: 'shield', loan: 'loan', refund: 'refund', plus: 'star', autotransfer: 'repeat', service: 'safe', subscription: 'repeat', goal: 'star' };
views.notifications = {
    html: () => flow('Messages', (S.notes || []).length ? (S.notes || []).map(n => `
        <div class="note-item ${n.is_read ? '' : 'unread'}"><span class="round-ic">${ic(NOTE_ICON[n.kind] || 'msg')}</span>
            <div class="grow"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.body)}</div><div class="s sm">${esc(when(n.created_at))}</div>
            ${n.kind === 'guardian_invite' && n.data ? `<div class="acts2"><button class="btn" data-act="guardianRespond" data-id="${n.data.guardianLinkId}" data-a="1">Accept</button><button class="btn ghost" data-act="guardianRespond" data-id="${n.data.guardianLinkId}" data-a="0">Decline</button></div>` : ''}
            ${n.kind === 'guardian_request' ? '<button class="link" data-go="shield">Review in Shield →</button>' : ''}
            ${n.kind === 'subscription' ? '<button class="link" data-go="finance" data-p="{&quot;tab&quot;:&quot;subs&quot;}">Open subscriptions →</button>' : ''}
            ${n.kind === 'money_request' ? '<button class="link" data-go="requests">Open money requests →</button>' : ''}</div></div>`).join('') : empty('No messages yet')),
    after: async () => { if (S.unread) { await api('/api/notifications/read', {}); S.unread = 0; } }
};
actions.guardianRespond = async (el) => { const r = await api('/api/shield/guardian/respond', { id: el.dataset.id, accept: el.dataset.a === '1' }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { await loaders.notifications(); render(true); } };

// ============================================================
// SHIELD hub
// ============================================================
const REASON_NAMES = { new_recipient: 'New recipient', drain: 'Most of the balance', big_share: 'Big share of balance', unusual_amount: 'Unusual amount', big_absolute: 'Very large amount', night: 'Night-time', velocity: 'Many transfers fast', intl: 'International', crypto: 'Crypto', new_account: 'Brand-new customer', recipient_new: 'Brand-new recipient account', mule_pattern: '"Mule" account pattern', coached: 'Someone guiding by phone' };
const SCAMS = [
    ['Phone call from "the bank", "police" or "National Bank"', 'They say your money is in danger and ask you to move it to a "safe account" or to read out an SMS code. Real staff never do this. Hang up and call the number on your card.'],
    ['Fake investment', 'Promises of guaranteed profit, often in crypto, through a chat or a "trading platform". You can pay in, you cannot get out. Never transfer to wallets you do not control.'],
    ['Messenger / social-media scams', 'A "friend" or "relative" writes from a new account asking for urgent money, or a buyer/seller asks you to pay in advance. Call the person on a number you already know.'],
    ['Loans in your name', 'Scammers ask for your IIN, photo of ID or SMS codes to take a loan. Never share them, and never install apps they send.']
];
function heldCard(h) {
    const guard = h.guardian_id ? `Waiting for your guardian ${esc(h.guardianName || '')}` : '';
    const left = Math.max(0, Math.ceil((h.release_at - Date.now()) / 1000));
    return `<div class="dep"><div class="h"><span>${esc(h.display)} → ${esc(h.label)}</span>${statusTag(h.status)}</div>
        ${gauge(h.score, h.score >= S.cfg.shield.high ? 'high' : 'medium')}${reasonList(h.reasons)}
        ${h.status === 'held' ? `<div class="meta">${guard || `<span>Can be sent in <b class="cd" data-at="${h.release_at}">${left}</b> s</span>`}</div>
        <div class="acts"><button class="btn danger" data-act="heldCancel" data-id="${h.id}">Cancel: do not send</button>
        ${h.guardian_id ? '' : `<button class="btn ghost cd-btn" data-act="heldRelease" data-id="${h.id}" data-at="${h.release_at}" ${left > 0 ? 'disabled' : ''}>Send now</button>`}</div>` : ''}</div>`;
}
views.shield = {
    html: () => {
        const s = S.shield || {}, st = s.stats || {};
        if (s.success === false) return flow('bcc Shield', empty(s.message || 'Could not load'));
        const g = s.guardian;
        return flow('bcc Shield', `
        <div class="shield-hero"><span class="big-ic">${ic('shield')}</span><div><h2>Shield is on</h2><p class="muted">Every transfer to another person, bank, country or wallet is checked first, and explained in plain words.</p></div></div>
        <div class="kpis"><div><b>${st.checked || 0}</b><span>transfers checked</span></div><div><b>${st.held || 0}</b><span>held for you</span></div><div><b>${esc(kzt(st.stoppedKzt || 0))}</b><span>kept safe</span></div></div>
        <button class="btn danger" data-act="panicAsk">${ic('snow')} Panic: freeze all my cards</button>
        <p class="muted sm" style="margin:8px 0 22px;text-align:center">Freezes every card and pauses automatic transfers. Unfreezing needs an SMS code.${s.frozenCards ? ` Currently frozen: ${s.frozenCards}.` : ''}</p>

        ${(s.toApprove || []).length ? `<h3 class="h3">Waiting for YOUR approval</h3>${s.toApprove.map(h => `<div class="dep"><div class="h"><span>${esc(h.owner)} → ${esc(h.display)} to ${esc(h.label)}</span></div>${gauge(h.score, 'high')}${reasonList(h.reasons)}
            <p class="muted sm">Call ${esc(h.owner)} first. Is this really them, and are they free to decide?</p>
            <div class="acts"><button class="btn ghost" data-act="guardApprove" data-id="${h.id}">Approve</button><button class="btn danger" data-act="guardDecline" data-id="${h.id}">Decline</button></div></div>`).join('')}` : ''}

        <h3 class="h3">Held transfers</h3>
        ${(s.held || []).length ? s.held.map(heldCard).join('') : empty('Nothing on hold. Risky transfers wait here for ' + s.holdMinutes + ' min (demo) so you can still cancel.')}

        <h3 class="h3">Trusted guardian</h3>
        <div class="dep">${g ? `<div class="h"><span>${esc(g.name)}</span>${statusTag(g.status)}</div>
            <p class="muted sm" style="margin-top:8px">${g.status === 'active' ? 'Your risky transfers need this person’s approval, so a scammer on the phone cannot rush you.' : 'Waiting for them to accept in their app.'}</p>
            <div class="acts"><button class="btn danger" data-act="guardRemove">Remove guardian</button></div>`
            : `<p class="muted sm" style="margin-bottom:12px">Pick a family member or friend with bcc.kz. They approve your risky transfers: ideal for parents and grandparents.</p>
            <form data-form="guardInvite">${phoneField('gp', 'Guardian phone number')}<button class="btn" type="submit">Invite guardian</button></form>`}
            ${(s.wards || []).length ? `<p class="muted sm" style="margin-top:12px">You are guardian for: ${s.wards.map(w => esc(w.name) + ' (' + esc(w.status) + ')').join(', ')}</p>` : ''}</div>

        <h3 class="h3">Check before you send</h3>
        <div class="dep"><form data-form="shieldCheck">
            ${fld('Recipient', selectHtml('kind', [['phone', 'Phone number'], ['card', 'Card number']], 'phone'))}
            ${fld('Phone or card', '<input name="to" placeholder="+7 700 123 45 67 or card number" autocomplete="off" required>')}
            ${fld('Amount', numInp('amount'))}
            <label class="check"><input type="checkbox" name="coached"> Someone is on the phone telling me what to do</label>
            <button class="btn" type="submit">Check</button></form><div id="checkOut"></div></div>

        <h3 class="h3">Most common scams in Kazakhstan</h3>
        <p class="muted sm" style="margin-bottom:10px">The National Bank’s Anti-Fraud Center reports that phone fraud, fake investments and messenger / social-media fraud are the three most common types.</p>
        ${SCAMS.map(([t, d]) => `<details class="scam"><summary>${esc(t)}</summary><p>${esc(d)}</p></details>`).join('')}

        <h3 class="h3">See Shield in action</h3>
        ${((S.scen || {}).scenarios || []).map(x => `<div class="dep"><div class="h"><span>${esc(x.title)}</span></div>${gauge(x.score, x.level)}<div class="meta"><span>${x.level === 'high' ? 'Held, SMS code + guardian approval' : x.level === 'medium' ? 'Warning, then SMS code' : 'Sent normally'}</span></div></div>`).join('')}
        ${S.isAdmin ? '<button class="btn ghost" data-go="admin" style="margin-top:12px">Open bank team dashboard</button>' : ''}`);
    },
    after: () => {
        if (S.cdTimer) clearInterval(S.cdTimer);
        S.cdTimer = setInterval(() => {
            if (S.view !== 'shield') { clearInterval(S.cdTimer); return; }
            $$('.cd').forEach(e => { const left = Math.max(0, Math.ceil((Number(e.dataset.at) - Date.now()) / 1000)); e.textContent = left; });
            $$('.cd-btn').forEach(b => { b.disabled = Number(b.dataset.at) > Date.now(); });
        }, 1000);
    }
};
actions.panicAsk = () => openSheet(`<h2>Freeze everything?</h2><p class="muted" style="margin-bottom:16px">All your cards are frozen right now and automatic transfers are paused. You can unfreeze each card with an SMS code.</p>
    <button class="btn danger" data-act="panicDo">Yes, freeze all cards</button><button class="btn ghost" data-act="closeOverlay" style="margin-top:10px">No, go back</button>`);
actions.panicDo = async () => { closeOverlay(); const r = await api('/api/shield/panic', {}); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); await loaders.shield(); render(true); };
const shieldAct = (path) => async (el) => { const r = await api(path, { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); await loaders.shield(); render(true); };
actions.heldCancel = shieldAct('/api/shield/held/cancel');
actions.heldRelease = async (el) => { const r = await api('/api/shield/held/release', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); await loaders.shield(); render(true); };
actions.guardApprove = shieldAct('/api/shield/held/approve');
actions.guardDecline = shieldAct('/api/shield/held/decline');
actions.guardRemove = async () => { await runOp('/api/shield/guardian/remove', {}, async (r) => { toast(r.message, 'success'); await loaders.shield(); render(true); }); };
forms.guardInvite = (f) => busy(f, async () => { const r = await api('/api/shield/guardian/invite', { phone: buildPhone(val(f, 'gpCode'), val(f, 'gpNum')) }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { await loaders.shield(); render(true); } });
forms.shieldCheck = (f) => busy(f, async () => {
    const kind = val(f, 'kind'), to = val(f, 'to');
    const r = await api('/api/shield/check', { kind, to: kind === 'phone' ? (to.trim().startsWith('+') ? to : buildPhone('7', to)) : to, amount: val(f, 'amount'), coached: f.elements.coached.checked });
    if (!r.success) return toast(r.message, 'error');
    $('#checkOut').innerHTML = `<div style="margin-top:14px">${r.recipient ? `<p class="muted sm">Recipient: <b style="color:#fff">${esc(r.recipient)}</b></p>` : ''}${gauge(r.score, r.level)}${reasonList(r.reasons)}<div class="note warn">${esc(r.advice)}</div></div>`;
});

// ============================================================
// BANK TEAM dashboard (admin only)
// ============================================================
const barRows = (rows, fmt) => { const max = Math.max(1, ...rows.map(r => r[1])); return rows.length ? rows.map(([n, v]) => `<div class="barrow"><span>${esc(n)}</span><div><i style="width:${Math.max(3, v / max * 100)}%"></i></div><b>${fmt ? fmt(v) : v}</b></div>`).join('') : empty('No data yet'); };
views.admin = {
    html: () => {
        const o = S.ov || {};
        if (!o.success) return flow('Bank team', empty(o.message || 'Not available'));
        const sh = o.shield;
        return flow('Bank team dashboard', `
        <div class="note">Live numbers from this app’s database. Demo: the bank team login is set in <b>bank-config.js</b> (ADMIN_EMAILS).</div>
        <div class="kpis k2"><div><b>${o.users}</b><span>customers (+${o.newUsers7d} this week)</span></div><div><b>${sh.checked}</b><span>transfers scored by Shield</span></div>
            <div><b>${esc(kzt(sh.stoppedKzt))}</b><span>stopped by customers &amp; guardians</span></div><div><b>${sh.held}</b><span>transfers held (${esc(kzt(sh.heldKzt))})</span></div>
            <div><b>${sh.guardians}</b><span>active guardians</span></div><div><b>${sh.panic + sh.cardsFrozen}</b><span>freezes (panic / card)</span></div>
            <div><b>${o.plusSubscribers}</b><span>bcc Plus subscribers</span></div><div><b>${o.activeLoans}</b><span>active loans (${esc(kzt(o.loansOutstandingKzt))})</span></div></div>
        <h3 class="h3">Why Shield fired</h3><div class="dep">${barRows(Object.entries(sh.reasons).map(([c, n]) => [REASON_NAMES[c] || c, n]).sort((a, b) => b[1] - a[1]))}</div>
        <h3 class="h3">Last 30 days: volume by type (₸)</h3><div class="dep">${barRows(o.volume30d.map(v => [v.name, v.kzt]), (v) => kzt(Math.round(v)))}</div>
        <h3 class="h3">Refund requests to review (${o.refundsOpen.length})</h3>
        ${o.refundsOpen.map(r => `<div class="dep"><div class="h"><span>${esc(r.full_name)}: ${esc(money(r.amount, r.currency))}</span></div><div class="meta"><span>${esc(r.description || '')}</span><span>${esc(r.reason)}</span></div>${r.comment ? `<p class="muted sm">“${esc(r.comment)}”</p>` : ''}
            <div class="acts"><button class="btn ghost" data-act="adminRefund" data-id="${r.id}" data-a="1">Approve</button><button class="btn danger" data-act="adminRefund" data-id="${r.id}" data-a="0">Decline</button></div></div>`).join('') || empty('Queue is empty')}
        <h3 class="h3">Callback requests from chat</h3>
        ${o.callbacks.map(c => `<div class="dep"><div class="h"><span>${esc(c.name)}</span></div><div class="meta"><span>${esc(c.details.phone || '')}</span><span>${esc(when(c.created_at))}</span></div></div>`).join('') || empty('No callbacks')}
        <h3 class="h3">The context</h3>
        <div class="note">Kazakhstan’s National Bank Anti-Fraud Center has registered over 130 000 incidents in its first 18 months and says 127 billion ₸ of fraudulent operations were prevented (as of 1 Sept 2026). Phone fraud, fake investments and messenger fraud lead. Shield adds the customer-facing layer: it explains each decision, holds only the riskiest transfers, and lets a family member approve them.</div>`);
    }
};
actions.adminRefund = async (el) => { const r = await api('/api/admin/refund', { id: el.dataset.id, approve: el.dataset.a === '1' }); toast(r.message, r.success ? 'success' : 'error'); await loaders.admin(); render(true); };

// ============================================================
// MONEY REQUESTS
// ============================================================
S.reqTab = 'in';
views.requests = {
    html: () => {
        const q = S.reqs || { incoming: [], outgoing: [] }, t = S.reqTab;
        const list = (arr, incoming) => arr.length ? arr.map(r => `<div class="dep"><div class="h"><span>${incoming ? 'From' : 'To'} ${esc(r.other)}</span>${statusTag(r.status)}</div><div class="big">${esc(money(r.amount, r.currency))}</div><div class="meta"><span>${esc(r.note || '')}</span><span>${esc(when(r.created_at))}</span></div>
            ${r.status === 'pending' ? `<div class="acts">${incoming ? `<button class="btn" data-act="reqPay" data-id="${r.id}">Pay</button><button class="btn ghost" data-act="reqDecline" data-id="${r.id}">Decline</button>` : `<button class="btn ghost" data-act="reqCancel" data-id="${r.id}">Cancel request</button>`}</div>` : ''}</div>`).join('') : empty(incoming ? 'No requests for you' : 'You have not requested money yet');
        return flow('Money requests', `<div class="seg n3"><button class="${t === 'in' ? 'on' : ''}" data-act="reqTab" data-t="in">For me${q.incoming.filter(r => r.status === 'pending').length ? ' (' + q.incoming.filter(r => r.status === 'pending').length + ')' : ''}</button><button class="${t === 'out' ? 'on' : ''}" data-act="reqTab" data-t="out">By me</button><button class="${t === 'new' ? 'on' : ''}" data-act="reqTab" data-t="new">New</button></div>
        ${t === 'in' ? list(q.incoming, true) : t === 'out' ? list(q.outgoing, false) : `
        <form data-form="reqNew">
            ${fld('Phone numbers (up to 5, separated by commas, with country code)', '<input name="phones" placeholder="+7 700 123 45 67, +44 7700 900123" required>')}
            <div class="phone-row" style="grid-template-columns:1fr 34%">${fld('Amount', numInp('amount'))}${fld('Currency', selectHtml('cur', [['KZT', 'KZT ₸'], ['USD', 'USD $']], 'KZT'))}</div>
            <label class="check"><input type="checkbox" name="split"> Split this amount equally between everyone</label>
            ${fld('Note (optional)', '<input name="note" maxlength="100" placeholder="Dinner">')}
            <button class="btn" type="submit">Send request</button></form>`}`);
    }
};
actions.reqTab = (el) => { S.reqTab = el.dataset.t; render(true); };
forms.reqNew = (f) => busy(f, async () => { const r = await api('/api/requests/create', { phones: val(f, 'phones'), amount: val(f, 'amount'), currency: val(f, 'cur'), split: f.elements.split.checked, note: val(f, 'note') }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { S.reqTab = 'out'; await reload(); } });
actions.reqDecline = async (el) => { const r = await api('/api/requests/decline', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await reload(); };
actions.reqCancel = async (el) => { const r = await api('/api/requests/cancel', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await reload(); };
actions.reqPay = (el) => openSheet(`<h2>Pay this request</h2><form data-form="reqPay" data-id="${el.dataset.id}">${fld('Pay from', accSel('from'))}<button class="btn" type="submit">Continue</button></form>`);
forms.reqPay = (f) => busy(f, () => runOp('/api/requests/pay', { id: f.dataset.id, fromAccount: val(f, 'from') }, async (r) => { await finishOp(r); }));

// ============================================================
// AUTOTRANSFERS
// ============================================================
const FREQS = [['minute', 'Every minute (demo)'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']];
views.autos = {
    html: () => flow('Autotransfers', `<div class="note">Scheduled transfers run by themselves. Ones to another person are approved once with an SMS code.</div>
        ${(S.autos || []).map(a => `<div class="dep"><div class="h"><span>${esc(money(a.amount, (S.accounts.find(x => x.account_number === a.from_account) || { currency: 'KZT' }).currency))} · ${esc((FREQS.find(f => f[0] === a.freq) || [0, a.freq])[1])}</span>${statusTag(a.active ? 'active' : 'paused')}</div>
            <div class="meta"><span>${a.kind === 'own' ? 'To your own account' : 'To ' + esc(a.to_value)}</span><span>Done ${a.runs}×</span>${a.last_status && a.last_status !== 'ok' ? `<span style="color:var(--red)">${esc(a.last_status)}</span>` : ''}</div>
            <div class="acts"><button class="btn ghost" data-act="autoRun" data-id="${a.id}">Run now</button><button class="btn ghost" data-act="autoToggle" data-id="${a.id}">${a.active ? 'Pause' : 'Resume'}</button><button class="btn danger" data-act="autoDel" data-id="${a.id}">${ic('trash')}</button></div></div>`).join('') || empty('No autotransfers yet')}
        <button class="btn" data-act="autoNew">${ic('plus')} New autotransfer</button>`)
};
actions.autoNew = () => openSheet(`<h2>New autotransfer</h2><form data-form="autoNew">
    ${fld('Type', selectHtml('kind', [['own', 'To my own account'], ['phone', 'To a bcc.kz client']], 'own'))}
    ${fld('From', accSel('from'))}
    ${fld('To (own account)', accSel('toOwn', () => true, (S.accounts[1] || {}).account_number))}
    ${phoneField('ap', 'Recipient phone (only for "To a bcc.kz client")', '7', false)}
    ${fld('Amount', numInp('amount'))}${fld('How often', selectHtml('freq', FREQS, 'daily'))}<button class="btn" type="submit">Create</button></form>`);
forms.autoNew = (f) => busy(f, async () => {
    const kind = val(f, 'kind'), to = kind === 'own' ? val(f, 'toOwn') : buildPhone(val(f, 'apCode'), val(f, 'apNum'));
    await runOp('/api/autotransfers/create', { kind, fromAccount: val(f, 'from'), to, amount: val(f, 'amount'), freq: val(f, 'freq') }, async (r) => { closeOverlay(); toast(r.message, 'success'); await reload(); });
    if (kind === 'own') { closeOverlay(); await reload(); }
});
const autoCall = (path) => async (el) => { const r = await api(path, { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); await reload(); };
actions.autoRun = autoCall('/api/autotransfers/run'); actions.autoToggle = autoCall('/api/autotransfers/toggle'); actions.autoDel = autoCall('/api/autotransfers/delete');

// ============================================================
// REFUNDS
// ============================================================
views.refunds = {
    html: () => {
        const r = S.refunds || { items: [] };
        return flow('Refund requests', `<p class="muted" style="margin-bottom:14px">Something wrong with an operation? Tell us and we will review it.</p>
        ${r.items.map(i => `<div class="dep"><div class="h"><span>${esc(money(i.amount, i.currency))}: ${esc(i.description || 'Operation')}</span>${statusTag(i.status)}</div><div class="meta"><span>${esc((r.reasons || {})[i.reason] || i.reason)}</span><span>${esc(when(i.created_at))}</span></div>${i.status === 'review' ? `<div class="acts"><button class="btn ghost" data-act="refundCancel" data-id="${i.id}">Cancel request</button></div>` : ''}</div>`).join('') || empty('No requests')}
        <button class="btn" data-act="refundNew">${ic('plus')} New request</button>`);
    }
};
actions.refundNew = () => {
    const outs = S.tx.filter(t => !isIncome(t) && t.transaction_type !== 'refund').slice(0, 20);
    if (!outs.length) return toast('You have no outgoing operations yet');
    openSheet(`<h2>Dispute an operation</h2><form data-form="refundNew">
        ${fld('Operation', selectHtml('tx', outs.map(t => [t.id, `${fmtDay(parseDate(t))}: ${txTitle(t)} (${money(t.amount, t.currency)})`])))}
        ${fld('What happened?', selectHtml('reason', Object.entries((S.refunds || {}).reasons || {})))}
        ${fld('Details (optional)', '<input name="comment" maxlength="300">')}<button class="btn" type="submit">Send request</button></form>`);
};
forms.refundNew = (f) => busy(f, async () => { const r = await api('/api/refunds/create', { txId: val(f, 'tx'), reason: val(f, 'reason'), comment: val(f, 'comment') }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await loaders.refunds(); render(true); } });
actions.refundCancel = async (el) => { const r = await api('/api/refunds/cancel', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await reload(); };

// ============================================================
// BANK CONTACT
// ============================================================
views.contact = {
    html: () => { const b = S.cfg.bank; return flow('Bank contact', `
        <div class="dep"><div class="h"><span>${esc(b.name)}</span></div>
            <div class="kv" style="margin:12px 0 0;background:none;padding:0"><div><span>Head office</span><span>${esc(b.address)}</span></div><div><span>E-mail</span><span><a class="link" style="padding:0" href="mailto:${esc(b.email)}">${esc(b.email)}</a></span></div>
            <div><span>Website</span><span><a class="link" style="padding:0" href="${esc(b.website)}" target="_blank" rel="noopener">${esc(b.website.replace('https://', ''))}</a></span></div><div><span>SWIFT / BIC</span><span>${esc(b.swift)}</span></div></div></div>
        <button class="btn" data-go="chat" style="margin-bottom:10px">${ic('chat')} Chat with the assistant</button>
        <button class="btn ghost" data-act="callback">${ic('phone')} Request a call back</button>
        <h3 class="h3" style="margin-top:22px">Branches in ${esc(CITY)}</h3>
        ${(CITIES[CITY] || []).map(x => `<div class="dep"><div class="h"><span>${esc(x)}</span></div></div>`).join('')}
        <button class="link" data-act="cityPick">Change city</button><p class="muted sm">Only the head office address is a verified real address. Other branches are examples in this demo.</p>`); }
};
actions.callback = async () => { const r = await api('/api/chat', { message: 'I want to talk to a human operator' }); toast(r.success ? 'A specialist will call you (demo)' : r.message, r.success ? 'success' : 'error'); };

// ============================================================
// BILL PAYMENTS
// ============================================================
views.bill = {
    html: (p) => {
        const b = (S.billers || []).find(x => x.id === p.cat); if (!b) return flow('Payment', empty('Unknown category'));
        const rate = (S.cbInfo && S.cbInfo.categories.find(c => c.id === b.id) || {}).rate;
        return flow(b.name, `${rate ? `<div class="note">Cashback for this category: <b>${rate}%</b></div>` : ''}
        <form data-form="bill">${fld('Provider', selectHtml('provider', b.providers.map(x => [x, x])))}${fld(esc(b.label), `<input name="ident" ${b.id === 'mobile' ? 'type="tel" inputmode="tel"' : ''} placeholder="${esc(b.label)}" autocomplete="off" required>`)}
            ${fld('Amount (₸)', '<input name="amount" type="number" inputmode="decimal" min="100" max="1000000" step="1" placeholder="1000" required>')}${fld('Pay from', accSel('from'))}
            <button class="btn" type="submit">Pay</button></form>`);
    }
};
forms.bill = (f) => busy(f, () => runOp('/api/bills/pay', { category: S.params.cat, provider: val(f, 'provider'), identifier: val(f, 'ident'), amount: val(f, 'amount'), fromAccount: val(f, 'from') }, finishOp));

// ============================================================
// PUBLIC SERVICES (demo data from the IIN)
// ============================================================
function randomIin() {
    for (;;) {
        const base = String(60 + Math.floor(Math.random() * 40)) + String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') + String(1 + Math.floor(Math.random() * 28)).padStart(2, '0') + String(Math.floor(Math.random() * 1e5)).padStart(5, '0');
        const d = base.split('').map(Number); let s = 0; d.forEach((x, i) => { s += x * (i + 1); }); let c = s % 11;
        if (c === 10) { const w = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]; s = 0; d.forEach((x, i) => { s += x * w[i]; }); c = s % 11; }
        if (c !== 10) return base + c;
    }
}
views.gov = {
    html: (p) => {
        const t = p.tab || 'taxes', tabs = [['taxes', 'Taxes & fines'], ['pension', 'Pension'], ['osms', 'Health ins.'], ['vehicle', 'Vehicle']];
        return flow('Public Services', `<div class="note warn">Demo: results are generated from the number you type. No real government system is contacted.</div>
        <div class="seg n4">${tabs.map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-act="govTab" data-t="${k}">${n}</button>`).join('')}</div>
        <form data-form="gov" data-gtab="${t}">
            ${t === 'vehicle' ? fld('Plate number', '<input name="id" placeholder="123ABC02" maxlength="8" style="text-transform:uppercase" required>')
            : fld('IIN (12 digits)', '<input name="id" inputmode="numeric" maxlength="12" placeholder="000000000000" required>', '<button type="button" class="link" data-act="govSample">Generate a test IIN</button>')}
            <button class="btn" type="submit">Check</button></form><div id="govOut" style="margin-top:18px"></div>`);
    }
};
actions.govTab = (el) => go('gov', { tab: el.dataset.t });
actions.govSample = () => { const f = $('form[data-form=gov]'); f.id.value = randomIin(); };
function govResult(r, id) {
    if (r.kind === 'taxes') return r.items.length ? `<h3 class="h3">Payable for ${esc(r.iin)}</h3>` + r.items.map(i => `<div class="dep"><div class="h"><span>${esc(i.title)}</span><span>${esc(kzt(i.amount))}</span></div><div class="acts"><button class="btn" data-act="govPay" data-key="${esc(i.key)}" data-iin="${esc(id)}" data-amount="${i.amount}">Pay</button></div></div>`).join('') : '<div class="note">Nothing to pay for this IIN. 🎉</div>';
    if (r.kind === 'pension') return `<div class="dep"><div class="h"><span>Pension savings</span></div><div class="big">${esc(kzt(r.totalKzt))}</div><div class="meta"><span>This year: ${esc(kzt(r.thisYearKzt))}</span><span>Last contribution: ${esc(r.lastContribution)}</span></div></div>`;
    if (r.kind === 'osms') return `<div class="dep"><div class="h"><span>Health insurance</span>${statusTag(r.insured ? 'active' : 'declined')}</div><div class="meta"><span>${r.insured ? 'Insured, paid until ' + esc(r.paidUntil) : 'No active insurance. Contributions are not paid.'}</span></div></div>`;
    return `<div class="dep"><div class="h"><span>${esc(r.plate)}</span></div><div class="meta"><span>Pledge: <b>${r.pledge ? 'FOUND' : 'none'}</b></span><span>Arrest: <b>${r.arrest ? 'FOUND' : 'none'}</b></span><span>Inspection until ${esc(r.inspectionUntil)}</span></div></div>`;
}
forms.gov = (f) => busy(f, async () => {
    const tab = f.dataset.gtab, id = val(f, 'id').trim();
    const r = await api('/api/gov/lookup', tab === 'vehicle' ? { kind: tab, plate: id } : { kind: tab, iin: id });
    if (!r.success) return toast(r.message, 'error');
    $('#govOut').innerHTML = govResult(r, id);
});
actions.govPay = (el) => openSheet(`<h2>Pay ${esc(kzt(Number(el.dataset.amount)))}</h2><form data-form="govPay" data-key="${esc(el.dataset.key)}" data-iin="${esc(el.dataset.iin)}">${fld('Pay from', accSel('from'))}<button class="btn" type="submit">Pay</button></form>`);
forms.govPay = (f) => busy(f, async () => { const r = await api('/api/gov/pay', { iin: f.dataset.iin, itemKey: f.dataset.key, fromAccount: val(f, 'from') }); if (!r.success) return toast(r.message, 'error'); closeOverlay(); await finishOp(r); });

// ============================================================
// bcc PLUS, ANALYTICS, CASHBACK
// ============================================================
views.plus = {
    html: () => {
        const p = S.plusInfo || {};
        return flow('bcc Plus', `<div class="shield-hero"><span class="big-ic">${ic('star')}</span><div><h2>${p.plus ? 'Plus is active' : 'Get more from your bank'}</h2><p class="muted">${p.plus ? 'Until ' + esc(String(p.activeUntil).slice(0, 10)) : esc(kzt(p.priceKzt || 990)) + ' per month'}</p></div></div>
        <ul class="reasons good"><li>International transfer fees at half price</li><li>+2% extra cashback on every payment</li><li>Priority in the chat assistant</li></ul>
        <form data-form="plusBuy">${fld('Pay from', accSel('from'))}${fld('Months', selectHtml('months', [[1, '1 month'], [3, '3 months'], [12, '12 months']], 1))}<button class="btn" type="submit">${p.plus ? 'Extend' : 'Subscribe'}</button></form>
        ${p.plus ? '<button class="btn danger" data-act="plusCancel" style="margin-top:10px">Cancel subscription</button>' : ''}`);
    }
};
forms.plusBuy = (f) => busy(f, async () => { const r = await api('/api/plus/subscribe', { fromAccount: val(f, 'from'), months: val(f, 'months') }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { await refreshAll(); await reload(); } });
actions.plusCancel = async () => { const r = await api('/api/plus/cancel', {}); toast(r.message, 'success'); await refreshAll(); await reload(); };

const PAL = ['#7aa7ff', '#45d19a', '#f2b01e', '#ff7a90', '#b08cff', '#5fd0e6', '#ff9f5a', '#9aa0aa'];
views.analytics = {
    html: () => {
        const a = S.an || {}; if (!a.success) return flow('Analytics', empty('Could not load'));
        const total = a.expenseKzt || 1;
        return flow('My analytics', `<select class="input" data-act="anMonth" style="margin-bottom:16px">${(a.months.length ? a.months : [a.month]).map(m => `<option ${m === a.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <div class="kpis k2"><div><b style="color:var(--green)">${esc(kzt(a.incomeKzt))}</b><span>Income</span></div><div><b>${esc(kzt(a.expenseKzt))}</b><span>Expenses</span></div></div>
        <div class="stack">${a.categories.map((c, i) => `<span style="flex:${c.kzt};background:${PAL[i % PAL.length]}"></span>`).join('') || '<span style="flex:1;background:#2b2d34"></span>'}</div>
        ${a.categories.map((c, i) => `<div class="legend"><i style="background:${PAL[i % PAL.length]}"></i><span>${esc(c.name)}</span><b>${esc(kzt(c.kzt))}</b><em>${Math.round(c.kzt / total * 100)}%</em></div>`).join('') || empty('No expenses this month')}
        <p class="muted sm" style="margin-top:14px">Transfers between your own accounts are not counted. USD is converted at the demo rate.</p>`);
    }
};
actions.anMonth = () => {};
document.addEventListener('change', async (e) => { if (e.target.dataset && e.target.dataset.act === 'anMonth') { await loaders.analytics({ month: e.target.value }); S.params = { month: e.target.value }; render(true); } });

views.cashback = {
    html: () => {
        const c = S.cbInfo || {}; if (!c.success) return flow('Cashback', empty('Could not load'));
        const chosen = S.cbPick || c.chosen;
        return flow('Cashback', `<div class="shield-hero"><span class="big-ic">${ic('star')}</span><div><h2>${esc(kzt(c.balance))}</h2><p class="muted">Cashback balance${c.plus ? ' · Plus +2% active' : ''}</p></div></div>
        <h3 class="h3">Choose up to 3 categories for ${esc(c.month)}: 5%</h3><p class="muted sm" style="margin-bottom:10px">Everything else earns 1%.</p>
        <div class="chips wrap" style="padding:0;margin:0 0 14px">${c.categories.map(k => `<button class="chip ${chosen.includes(k.id) ? 'on' : ''}" data-act="cbToggle" data-id="${k.id}">${esc(k.name)} · ${k.rate}%</button>`).join('')}</div>
        <button class="btn" data-act="cbSave">Save categories</button>
        <h3 class="h3" style="margin-top:22px">Withdraw to a card</h3>
        <form data-form="cbWithdraw">${fld('To (KZT account)', accSel('to', a => a.currency === 'KZT'))}<button class="btn ghost" type="submit">Withdraw ${esc(kzt(c.balance))}</button></form>
        <h3 class="h3" style="margin-top:22px">History</h3>
        ${c.history.map(h => `<div class="legend"><span>${esc(h.note || h.kind)}</span><b style="color:${h.amount < 0 ? '#fff' : 'var(--green)'}">${h.amount > 0 ? '+' : ''}${esc(kzt(h.amount))}</b></div>`).join('') || empty('Pay for services to earn cashback')}`);
    }
};
actions.cbToggle = (el) => { const c = S.cbPick || [...S.cbInfo.chosen], i = c.indexOf(el.dataset.id); if (i >= 0) c.splice(i, 1); else if (c.length < 3) c.push(el.dataset.id); else toast('Up to 3 categories'); S.cbPick = c; render(true); };
actions.cbSave = async () => { const r = await api('/api/cashback/choose', { cats: S.cbPick || S.cbInfo.chosen }); toast(r.message, r.success ? 'success' : 'error'); S.cbPick = null; await reload(); };
forms.cbWithdraw = (f) => busy(f, async () => { const r = await api('/api/cashback/withdraw', { toAccount: val(f, 'to') }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) { await refreshAll(); await reload(); } });

// ============================================================
// LOANS
// ============================================================
const annuityC = (p, apr, n) => { const r = apr / 1200; return Math.round(p * r / (1 - Math.pow(1 + r, -n)) * 100) / 100; };
views.loans = {
    html: (p) => {
        const t = p.tab || 'mine', L = S.loans || { loans: [], config: S.cfg.loan }, c = S.cfg.loan;
        const mine = L.loans.length ? L.loans.map(l => `<div class="dep"><div class="h"><span>Loan #${l.id}: ${esc(kzt(l.principal))}</span>${statusTag(l.status)}</div>
            <div class="big">${esc(kzt(l.remaining))}</div><div class="meta"><span>left (principal)</span><span>${l.months} months at ${l.apr}%</span><span>Payments made: ${l.paid_count}</span></div>
            ${l.status === 'active' ? `<div class="acts"><button class="btn ghost" data-act="loanPay" data-id="${l.id}" data-full="0">Pay ${esc(kzt(l.nextPayment))}</button><button class="btn ghost" data-act="loanPay" data-id="${l.id}" data-full="1">Repay all ${esc(kzt(l.fullRepay))}</button></div>` : ''}</div>`).join('') : empty('You have no loans');
        return flow('Loans', `<div class="seg"><button class="${t === 'mine' ? 'on' : ''}" data-act="loanTab" data-t="mine">My loans</button><button class="${t === 'apply' ? 'on' : ''}" data-act="loanTab" data-t="apply">Get a loan</button></div>
        ${t === 'mine' ? mine : `<div class="note">Demo loan: ${c.aprPercent}% per year, ${esc(kzt(c.minAmount))} to ${esc(kzt(c.maxAmount))}. The monthly payment must stay under 40% of your income. Decision in seconds.</div>
        <form data-form="loanApply" data-live="loan">
            ${fld('Amount (₸)', `<input name="amount" type="number" inputmode="numeric" min="${c.minAmount}" max="${c.maxAmount}" step="1000" placeholder="1000000" required>`)}
            ${fld('Term', selectHtml('months', c.months.map(m => [m, m + ' months']), 12))}
            <div class="quote" id="loanQuote"><div><span>Monthly payment</span><span>-</span></div><div><span>Total to repay</span><span>-</span></div><div><span>Overpayment</span><span>-</span></div></div>
            ${fld('Your monthly income (₸)', '<input name="income" type="number" inputmode="numeric" min="1" placeholder="400000" required>')}
            ${fld('Send the money to', accSel('to', a => a.currency === 'KZT'))}
            <button class="btn" type="submit">Apply</button></form><div id="loanOut"></div>`}`);
    }
};
actions.loanTab = (el) => go('loans', { tab: el.dataset.t });
live.loan = (f) => { const a = parseFloat(f.amount.value), n = parseInt(f.months.value, 10), c = S.cfg.loan; if (!(a >= c.minAmount && a <= c.maxAmount)) { $('#loanQuote').innerHTML = '<div><span>Monthly payment</span><span>-</span></div><div><span>Total to repay</span><span>-</span></div><div><span>Overpayment</span><span>-</span></div>'; return; } const m = annuityC(a, c.aprPercent, n); $('#loanQuote').innerHTML = `<div><span>Monthly payment</span><span>${esc(kzt(m))}</span></div><div><span>Total to repay</span><span>${esc(kzt(m * n))}</span></div><div><span>Overpayment</span><span>${esc(kzt(m * n - a))}</span></div>`; };
forms.loanApply = (f) => busy(f, async () => {
    const r = await api('/api/loans/apply', { amount: val(f, 'amount'), months: val(f, 'months'), income: val(f, 'income'), toAccount: val(f, 'to') });
    if (!r.success) return toast(r.message, 'error');
    if (!r.approved) { $('#loanOut').innerHTML = `<div class="note warn" style="margin-top:14px">${esc(r.message)}</div>`; return; }
    await finishOp(r);
});
actions.loanPay = (el) => openSheet(`<h2>${el.dataset.full === '1' ? 'Repay the whole loan' : 'Pay the installment'}</h2><form data-form="loanPay" data-id="${el.dataset.id}" data-full="${el.dataset.full}">${fld('Pay from (KZT)', accSel('from', a => a.currency === 'KZT'))}<button class="btn" type="submit">Pay</button></form>`);
forms.loanPay = (f) => busy(f, async () => { const r = await api('/api/loans/pay', { loanId: f.dataset.id, fromAccount: val(f, 'from'), full: f.dataset.full === '1' }); if (!r.success) return toast(r.message, 'error'); closeOverlay(); await finishOp(r); });

// ============================================================
// INVESTMENTS
// ============================================================
views.invest = {
    html: () => {
        const v = S.inv || { instruments: [], positions: [] };
        return flow('Investments', `<div class="note warn">Demo market: prices are simulated and move with time. No real securities.</div>
        ${v.positions.length ? `<h3 class="h3">My portfolio</h3>${v.positions.map(p => `<div class="dep"><div class="h"><span>${esc(p.name)}</span><span>${p.qty} pcs</span></div><div class="big">${esc(money(p.valueUsd, 'USD'))}</div><div class="meta"><span style="color:${p.pnlUsd >= 0 ? 'var(--green)' : 'var(--red)'}">${p.pnlUsd >= 0 ? '+' : ''}${esc(money(p.pnlUsd, 'USD'))} P&amp;L</span><span>cost ${esc(money(p.costUsd, 'USD'))}</span></div>
            <div class="acts"><button class="btn ghost" data-act="tradeSheet" data-sym="${esc(p.symbol)}" data-side="sell">Sell</button></div></div>`).join('')}` : ''}
        <h3 class="h3">Market</h3>${v.instruments.map(i => `<div class="dep"><div class="h"><span>${esc(i.name)}</span><span>${esc(money(i.priceUsd, 'USD'))}</span></div>
            <div class="meta"><span>${esc(i.symbol)}</span><span style="color:${i.change24h >= 0 ? 'var(--green)' : 'var(--red)'}">${i.change24h >= 0 ? '▲' : '▼'} ${Math.abs(i.change24h)}% / 24h</span></div>
            <div class="acts"><button class="btn" data-act="tradeSheet" data-sym="${esc(i.symbol)}" data-side="buy">Buy</button></div></div>`).join('')}`);
    }
};
actions.tradeSheet = (el) => { const buy = el.dataset.side === 'buy', i = S.inv.instruments.find(x => x.symbol === el.dataset.sym); openSheet(`<h2>${buy ? 'Buy' : 'Sell'} ${esc(i.symbol)}</h2><p class="muted sm" style="margin-bottom:12px">Price now: ${esc(money(i.priceUsd, 'USD'))} each</p>
    <form data-form="trade" data-sym="${esc(i.symbol)}" data-side="${el.dataset.side}">${fld('Quantity (whole units)', '<input name="qty" type="number" inputmode="numeric" min="1" step="1" value="1" required>')}${fld(buy ? 'Pay from' : 'Money goes to', accSel('acc'))}<button class="btn" type="submit">${buy ? 'Buy' : 'Sell'}</button></form>`); };
forms.trade = (f) => busy(f, async () => { const r = await api('/api/invest/trade', { symbol: f.dataset.sym, side: f.dataset.side, qty: val(f, 'qty'), account: val(f, 'acc') }); if (!r.success) return toast(r.message, 'error'); closeOverlay(); await finishOp(r); });

// ============================================================
// INSURANCE
// ============================================================
const INS_FORM = {
    travel: () => fld('Days', '<input name="days" type="number" min="1" max="365" value="7" required>') + fld('Travelers', '<input name="travelers" type="number" min="1" max="6" value="1" required>') + fld('Where', selectHtml('zone', [['asia', 'Asia / CIS'], ['europe', 'Europe'], ['world', 'Worldwide']], 'europe')),
    car: () => fld('Engine volume', selectHtml('engine', [['1.6', 'up to 1.6 L'], ['2.0', '1.6 to 2.0 L'], ['2.5', '2.0 to 2.5 L'], ['over', 'over 2.5 L']], '1.6')) + fld('Youngest driver', selectHtml('age', [['young', 'under 25'], ['adult', '25 to 60'], ['senior', 'over 60']], 'adult')) + fld('Region', selectHtml('region', [['almaty', 'Almaty'], ['astana', 'Astana'], ['other', 'Other']], 'other')),
    home: () => fld('Area (m²)', '<input name="area" type="number" min="20" max="500" value="60" required>') + fld('Property value (₸)', '<input name="value" type="number" min="1000000" max="200000000" step="100000" value="20000000" required>')
};
const INS_NAMES = { travel: 'Travel', car: 'Car (OSAGO)', home: 'Property' };
function insParams(f, product) { const o = {}; [...f.elements].forEach(e => { if (e.name && e.name !== 'from') o[e.name] = e.type === 'number' ? Number(e.value) : e.value; }); return o; }
let insTimer;
live.ins = (f) => { clearTimeout(insTimer); insTimer = setTimeout(async () => { if (S.view !== 'insurance') return; const r = await api('/api/insurance/quote', { product: S.params.product || 'travel', params: insParams(f) }); const q = $('#insQuote'); if (q) q.textContent = r.success ? kzt(r.premiumKzt) : r.message; }, 300); };
views.insurance = {
    html: (p) => {
        const prod = p.product || 'travel';
        return flow('Insurance', `<div class="seg n3">${Object.keys(INS_NAMES).map(k => `<button class="${prod === k ? 'on' : ''}" data-act="insTab" data-p="${k}">${INS_NAMES[k]}</button>`).join('')}</div>
        <form data-form="insBuy" data-live="ins">${INS_FORM[prod]()}<div class="quote"><div><span>Premium</span><span id="insQuote">-</span></div></div>${fld('Pay from', accSel('from'))}<button class="btn" type="submit">Buy policy</button></form>
        <h3 class="h3" style="margin-top:24px">My policies</h3>
        ${(S.pol || []).map(x => `<div class="dep"><div class="h"><span>${esc(INS_NAMES[x.product] || x.product)}</span>${statusTag(x.active ? 'active' : 'closed')}</div><div class="meta"><span>${esc(x.number)}</span><span>${esc(x.valid_from)} → ${esc(x.valid_to)}</span><span>${esc(kzt(x.premium_kzt))}</span></div>
            <div class="acts"><button class="btn ghost" data-act="polCert" data-id="${x.id}">Download certificate</button></div></div>`).join('') || empty('No policies yet')}`);
    },
    after: (p) => live.ins($('form[data-form=insBuy]'))
};
actions.insTab = (el) => go('insurance', { product: el.dataset.p });
forms.insBuy = (f) => busy(f, async () => { const r = await api('/api/insurance/buy', { product: S.params.product || 'travel', params: insParams(f), fromAccount: val(f, 'from') }); if (!r.success) return toast(r.message, 'error'); await finishOp(r); });
actions.polCert = (el) => {
    const x = S.pol.find(p => String(p.id) === el.dataset.id); if (!x) return;
    downloadFile(`policy-${x.number}.html`, 'text/html', `<!doctype html><meta charset="utf-8"><title>${esc(x.number)}</title><body style="font-family:Arial;max-width:560px;margin:40px auto"><h1>bcc.kz</h1><h2>Insurance certificate (DEMO)</h2>
        <p><b>Policy:</b> ${esc(x.number)}<br><b>Product:</b> ${esc(INS_NAMES[x.product] || x.product)}<br><b>Holder:</b> ${esc(S.user.full_name)}<br><b>Valid:</b> ${esc(x.valid_from)} to ${esc(x.valid_to)}<br><b>Premium:</b> ${esc(kzt(x.premium_kzt))}<br><b>Details:</b> ${esc(JSON.stringify(x.params))}</p><p style="color:#888">Demo document. Not a real insurance contract.</p></body>`);
};

// ============================================================
// OFFERS
// ============================================================
views.offers = {
    html: () => flow('Offers', `<div class="note warn">Demo partner offers.</div>${(S.offers || []).map(o => `<div class="dep"><div class="h"><span>${esc(o.title)}</span>${o.active ? statusTag('active') : ''}</div><div class="meta"><span>${esc(o.partner)}</span></div><p class="muted sm" style="margin-top:6px">${esc(o.text)}</p>
        ${o.active ? `<div class="kv" style="margin:10px 0 0"><div><span>Your code</span><span><b>${esc(o.code)}</b></span></div></div><div class="acts"><button class="btn ghost" data-act="copyCode" data-code="${esc(o.code)}">${ic('copy')} Copy code</button></div>` : `<div class="acts"><button class="btn" data-act="offerGo" data-id="${esc(o.id)}">Activate</button></div>`}</div>`).join('')}`)
};
actions.offerGo = async (el) => { const r = await api('/api/offers/activate', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await reload(); };
actions.copyCode = (el) => copyText(el.dataset.code);

// ============================================================
// DOCUMENTS (statement, bank details)
// ============================================================
function statementRows(accNo, days) {
    const a = S.accounts.find(x => x.account_number === accNo), cut = days ? Date.now() - days * 864e5 : 0;
    return { a, rows: S.tx.filter(t => (!a || matchAcc(t, a)) && (!cut || parseDate(t) >= cut)) };
}
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
views.documents = {
    html: () => { const b = S.cfg.bank; const first = S.accounts[0] || {}; return flow('My documents', `
        <h3 class="h3" style="margin-top:0">Account statement</h3>
        <form data-form="statement" data-live="stmt">${fld('Account', accSel('acc'))}${fld('Period', selectHtml('days', [[30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last year'], [0, 'All time']], 30))}
        <div class="note" id="stmtInfo"></div><div class="acts2"><button class="btn" type="button" data-act="stmtCsv">Download CSV</button><button class="btn ghost" type="button" data-act="stmtHtml">Printable page</button></div></form>
        <h3 class="h3">Bank details</h3>
        <form data-form="details" data-live="det">${fld('Account', accSel('acc'))}<div class="kv" id="detBox"></div><div class="acts2"><button class="btn ghost" type="button" data-act="detCopy">${ic('copy')} Copy</button><button class="btn ghost" type="button" data-act="detShare">Share</button></div></form>`); },
    after: () => { live.stmt($('form[data-form=statement]')); live.det($('form[data-form=details]')); }
};
live.stmt = (f) => { if (!f) return; const { rows } = statementRows(val(f, 'acc'), Number(val(f, 'days'))); $('#stmtInfo').textContent = `${rows.length} operation${rows.length === 1 ? '' : 's'} in this period`; };
function detailsText(a) { const b = S.cfg.bank; return `Beneficiary: ${S.user.full_name}\nAccount: ${a.account_number}\nCurrency: ${a.currency}\nBank: ${b.name}\nSWIFT/BIC: ${b.swift}\nAddress: ${b.address}`; }
live.det = (f) => { if (!f) return; const a = S.accounts.find(x => x.account_number === val(f, 'acc')); if (!a) return; S.det = detailsText(a); $('#detBox').innerHTML = S.det.split('\n').map(l => { const [k, ...v] = l.split(': '); return `<div><span>${esc(k)}</span><span>${esc(v.join(': '))}</span></div>`; }).join(''); };
actions.detCopy = () => copyText(S.det);
actions.detShare = async () => { if (navigator.share) { try { await navigator.share({ title: 'My bank details', text: S.det }); } catch (e) { /* cancelled */ } } else copyText(S.det); };
actions.stmtCsv = () => {
    const f = $('form[data-form=statement]'), { a, rows } = statementRows(val(f, 'acc'), Number(val(f, 'days')));
    const head = ['Date', 'Time', 'Type', 'Description', 'From', 'To', 'Amount', 'Currency', 'Status'];
    const lines = rows.map(t => { const d = parseDate(t); return [d.toISOString().slice(0, 10), fmtTime(d), t.transaction_type, txTitle(t), t.from_account, t.to_account].map(csvCell).concat([(isIncome(t) ? '' : '-') + t.amount, t.currency, t.status].map(x => '"' + x + '"')).join(','); });
    downloadFile(`statement-${a ? last4(a) : 'all'}.csv`, 'text/csv', '\ufeff' + head.map(csvCell).join(',') + '\n' + lines.join('\n'));
    toast('Statement downloaded', 'success');
};
actions.stmtHtml = () => {
    const f = $('form[data-form=statement]'), { a, rows } = statementRows(val(f, 'acc'), Number(val(f, 'days')));
    const tr = rows.map(t => `<tr><td>${esc(fmtDay(parseDate(t)))} ${esc(fmtTime(parseDate(t)))}</td><td>${esc(txTitle(t))}</td><td style="text-align:right;color:${isIncome(t) ? '#0a7d4f' : '#000'}">${esc(money(isIncome(t) ? t.amount : -t.amount, t.currency, isIncome(t)))}</td></tr>`).join('');
    downloadFile('statement.html', 'text/html', `<!doctype html><meta charset="utf-8"><title>Statement</title><body style="font-family:Arial;max-width:720px;margin:30px auto"><h1>bcc.kz: account statement (DEMO)</h1><p>${esc(S.user.full_name)}<br>${a ? esc(accName(a)) + ' · ' + esc(a.account_number) : 'All accounts'}<br>Generated ${esc(new Date().toLocaleString())}</p>
        <table width="100%" cellpadding="6" style="border-collapse:collapse" border="1"><tr><th align="left">Date</th><th align="left">Operation</th><th align="right">Amount</th></tr>${tr}</table><p style="color:#888">Open this file and use Print → Save as PDF.</p></body>`);
    toast('Printable statement downloaded', 'success');
};

// ============================================================
// SAFE DEPOSIT BOXES
// ============================================================
views.safebox = {
    html: () => {
        const s = S.sreq || { boxes: {}, items: [] }, today = new Date().toISOString().slice(0, 10), mine = s.items.filter(i => i.kind === 'safe_box');
        return flow('Safe deposit boxes', `<p class="muted" style="margin-bottom:14px">Reserve a box in a branch. Pay now, visit with your ID on the chosen date.</p>
        ${mine.map(i => `<div class="dep"><div class="h"><span>${esc((s.boxes[i.details.size] || {}).name || '')} box · ${esc(i.code)}</span>${statusTag(i.status)}</div><div class="meta"><span>${esc(i.details.branch)}</span><span>${esc(i.details.date)}</span><span>${i.details.months} mo</span><span>${esc(kzt(i.fee_kzt))}</span></div>${i.status === 'booked' ? `<div class="acts"><button class="btn danger" data-act="boxCancel" data-id="${i.id}">Cancel and refund</button></div>` : ''}</div>`).join('')}
        <h3 class="h3">New reservation</h3>
        <form data-form="boxBook">${fld('Size', selectHtml('size', Object.entries(s.boxes).map(([k, b]) => [k, `${b.name}: ${kzt(b.priceKzt)} / month`]), 'M'))}${fld('Term', selectHtml('months', [[1, '1 month'], [3, '3 months'], [6, '6 months'], [12, '12 months']], 3))}
        ${fld('Branch in ' + esc(CITY), selectHtml('branch', (CITIES[CITY] || []).map(x => [x, x])))}${fld('Visit date', `<input name="date" type="date" min="${today}" value="${today}" required>`)}${fld('Pay from', accSel('from'))}<button class="btn" type="submit">Reserve</button></form>`);
    }
};
forms.boxBook = (f) => busy(f, async () => { const r = await api('/api/safebox/book', { size: val(f, 'size'), months: val(f, 'months'), branch: val(f, 'branch'), date: val(f, 'date'), fromAccount: val(f, 'from') }); if (!r.success) return toast(r.message, 'error'); await finishOp(r); });
actions.boxCancel = async (el) => { const r = await api('/api/service-requests/cancel', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); await reload(); };

// ============================================================
// CARD ACTIONS + account sheet + profile
// ============================================================
actions.freezeCard = async (el) => { const r = await api('/api/cards/freeze', { accountNumber: el.dataset.acc }); toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); render(true); };
actions.unfreezeCard = (el) => runOp('/api/cards/unfreeze', { accountNumber: el.dataset.acc }, async (r) => { toast(r.message, 'success'); await refreshAll(); render(true); });
actions.cardDetails = (el) => runOp('/api/cards/reveal', { accountNumber: el.dataset.acc }, async (r) => {
    const c = r.card; let left = 30;
    openSheet(`<h2>Card details</h2><div class="bigcard th-${cardTheme(S.accounts.find(a => a.account_number === el.dataset.acc) || {})}" style="margin:10px 0 14px"><div class="bc-top"><span class="bc-brand">bcc<i>.kz</i></span></div><div class="bc-num" style="font-size:22px;margin-top:34px">${esc(c.number)}</div><div class="bc-bot"><div><small>HOLDER</small><b>${esc(c.holder)}</b></div><div><small>VALID THRU</small><b>${esc(c.expiry)}</b></div><div><small>CVV</small><b>${esc(c.cvv)}</b></div></div></div>
        <div class="acts2"><button class="btn ghost" data-act="copyCode" data-code="${esc(c.number.replace(/\s/g, ''))}">${ic('copy')} Copy number</button><button class="btn" data-act="closeOverlay">Hide</button></div>
        <p class="muted sm" style="margin-top:12px;text-align:center" id="revealLeft">Hidden automatically in ${left} s</p>`);
    const t = setInterval(() => { const e = $('#revealLeft'); if (!e) return clearInterval(t); left--; if (left <= 0) { clearInterval(t); closeOverlay(); } else e.textContent = `Hidden automatically in ${left} s`; }, 1000);
});
actions.accSheet = (el) => {
    const a = S.accounts.find(x => x.account_number === el.dataset.acc); if (!a) return;
    openSheet(`<h2>${esc(accName(a))}${a.frozen ? ' ❄' : ''}</h2><div class="acc-bal" style="margin:6px 0 16px">${esc(money(a.balance, a.currency))}</div>
        ${sheetKV([['Card number', a.card_number ? '•••• •••• •••• ' + last4(a) : ''], ['Valid thru', a.expiry], ['Account number', a.account_number], ['Currency', a.currency], ['Status', a.frozen ? 'Frozen' : 'Active']])}
        <div class="acts2"><button class="btn" data-act="goTopup">Top up</button><button class="btn ghost" data-act="sheetStatement">Statement</button></div>
        ${a.card_number ? `<div class="acts2" style="margin-top:10px"><button class="btn ghost" data-act="cardDetailsClose" data-acc="${esc(a.account_number)}">Show details</button><button class="btn ghost" data-act="${a.frozen ? 'unfreezeClose' : 'freezeClose'}" data-acc="${esc(a.account_number)}">${a.frozen ? 'Unfreeze' : 'Freeze'}</button></div>` : ''}`);
};
actions.sheetStatement = () => { closeOverlay(); openView('documents'); };
actions.cardDetailsClose = (el) => { closeOverlay(); actions.cardDetails(el); };
actions.freezeClose = (el) => { closeOverlay(); actions.freezeCard(el); };
actions.unfreezeClose = (el) => { closeOverlay(); actions.unfreezeCard(el); };
actions.profile = () => openSheet(`<h2>${esc(S.user.full_name)}</h2><p class="muted" style="margin-bottom:16px">${esc(S.user.email)}<br>${esc(S.user.phone)}</p>
    <button class="opt" data-act="security">Security${ic('shield')}</button>
    <button class="opt" data-act="profGo" data-v="plus">bcc Plus${S.plus ? ' (active)' : ''}${ic('right')}</button><button class="opt" data-act="profGo" data-v="shield">bcc Shield${ic('right')}</button>
    <button class="opt" data-act="profGo" data-v="documents">My documents${ic('right')}</button><button class="opt" data-act="profGo" data-v="analytics">My analytics${ic('right')}</button>
    ${S.isAdmin ? `<button class="opt" data-act="profGo" data-v="admin">Bank team dashboard${ic('right')}</button>` : ''}
    <button class="opt" data-act="toggleHide">${S.hide ? 'Show balances' : 'Hide balances'}</button>
    <div class="lang-row"><span>Language</span>${I18N.switcher('')}</div>
    <button class="btn danger" data-act="logout" style="margin-top:16px">Log out</button>`);
actions.profGo = (el) => { closeOverlay(); openView(el.dataset.v); };
