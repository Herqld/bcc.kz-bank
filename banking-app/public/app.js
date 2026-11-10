'use strict';
// ============================================================
// bcc.kz mobile web app (single page). No frameworks: plain JS.
// Everything typed by users is escaped with esc() before it is put into HTML.
// ============================================================

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const TABS = ['home', 'transfers', 'payments', 'history', 'services'];

const S = {
    cfg: null, user: null, accounts: [], totals: {}, deposits: [], wallets: [], tx: [],
    hide: false, view: 'login', params: {}, stack: [],
    clientMode: 'phone', svcTab: 'New',
    hist: { period: 'all', cat: 'all', acc: 'all', q: '', search: false }
};

// ---------- formatting ----------
function money(n, cur = 'KZT', sign = false) {
    const v = Math.abs(Number(n) || 0);
    const d = Math.round(v * 100) % 100 === 0 ? 0 : 2;
    const str = v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, '\u00a0');
    const s = n < 0 ? '-' : (sign ? '+' : '');
    return cur === 'USD' ? `${s}$${str}` : `${s}${str}\u00a0₸`;
}
const bal = (n, cur) => (S.hide ? (cur === 'USD' ? '$••••' : '••••\u00a0₸') : money(n, cur));
const brand = (a) => (a.card_type === 'mastercard' ? 'Mastercard' : 'Visa');
const last4 = (a) => String(a.card_number || a.account_number).replace(/\D/g, '').slice(-4);
const accName = (a) => (a.card_number ? `${brand(a)} •• ${last4(a)}` : `Account •• ${last4(a)}`);
const accOptions = (filter = () => true, selected) => {
    const list = S.accounts.filter(filter);
    if (!list.length) return '<option value="">No suitable account</option>';
    return list.map(a => `<option value="${esc(a.account_number)}" data-cur="${a.currency}" ${a.account_number === selected ? 'selected' : ''}>${esc(accName(a))} - ${esc(money(a.balance, a.currency))}</option>`).join('');
};
const firstName = () => String((S.user && S.user.full_name) || '').split(' ')[0] || 'there';
const toKzt = (a, c) => a * ((S.cfg.rates || {})[c] || 1);
const rate = (from, to) => (S.cfg.rates[from] / S.cfg.rates[to]);

function parseDate(t) { return new Date(String(t.transaction_date).replace(' ', 'T') + 'Z'); }
const fmtDay = (d) => I18N.date(d, true);
const fmtTime = (d) => d.toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------- API ----------
async function api(path, body) {
    const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    try {
        const r = await fetch(path, opt);
        if (r.status === 401 && S.user) {
            S.user = null; closeOverlay(); S.stack = []; go('login');
            return { success: false, message: 'Session expired. Please log in again.' };
        }
        return await r.json();
    } catch (e) {
        return { success: false, message: 'No connection to the server' };
    }
}

async function refreshAll() {
    const [d, tx, dep, w, nt, ad] = await Promise.all([api('/api/dashboard'), api('/api/transactions'), api('/api/deposits'), api('/api/crypto/wallets'), api('/api/notifications'), api('/api/admin/me')]);
    if (d.success) { S.user = d.user; S.accounts = d.accounts; S.totals = d.totals; S.plus = !!d.plus; }
    if (nt.success) S.unread = nt.unread;
    S.isAdmin = !!(ad && ad.admin);
    if (tx.success) S.tx = tx.transactions;
    if (dep.success) S.deposits = dep.deposits;
    if (w.success) S.wallets = w.wallets;
}

// ---------- toast ----------
const loaders = {}; // screens that need data loaded first (filled in features-ui.js)
async function openView(view, params = {}) { if (loaders[view]) await loaders[view](params); push(view, params); }
async function reload() { if (loaders[S.view]) await loaders[S.view](S.params); render(true); }

let toastTimer;
function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3400);
}
const soon = () => toast('Coming soon');

// ---------- navigation ----------
function render(keepScroll) {
    if (window.stopScan) window.stopScan();
    const y = window.scrollY;
    if (!views[S.view]) { S.view = S.user ? 'home' : 'login'; S.params = {}; }
    const v = views[S.view];
    $('#screen').innerHTML = v.html(S.params);
    $('#nav').hidden = !TABS.includes(S.view);
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.view));
    if (v.after) v.after(S.params);
    if (!keepScroll) { const first = $('#screen').firstElementChild; if (first) first.classList.add('enter-' + (S.dir || 'tab')); }
    S.dir = null;
    window.scrollTo(0, keepScroll ? y : 0);
}
function go(view, params = {}) { S.view = view; S.params = params; render(); }
function tab(view) { S.stack = []; S.dir = 'tab'; go(view); }
function push(view, params = {}) { S.stack.push({ view: S.view, params: S.params }); S.dir = 'fwd'; go(view, params); }
function back() { const p = S.stack.pop(); S.dir = 'back'; if (p) go(p.view, p.params); else tab('home'); }

// ---------- sheets + SMS code dialog ----------
function openSheet(html) {
    const o = $('#overlay');
    o.hidden = false;
    o.innerHTML = `<div class="sheet"><button class="icon-btn x" data-act="closeOverlay" aria-label="Close">${ic('close')}</button>${html}</div>`;
}
function closeOverlay() {
    const o = $('#overlay');
    if (!o.hidden && window.Anim) window.Anim.sheetOut(o);
    o.hidden = true; o.innerHTML = '';
    if (S.otp && S.otp.timer) clearInterval(S.otp.timer);
    S.otp = null;
}

function otpHtml(otp, shield) {
    const sh = shield && shield.level !== 'low' ? `<div class="note warn"><b>${ic('shield')} Shield:</b> ${shield.level === 'high' ? `this transfer looks risky (${shield.score}/100). After you confirm, it will be <b>held ${S.cfg.shield.holdMinutes} min</b> (or until your guardian approves) so you can still cancel it.` : `this transfer was flagged (${shield.score}/100). Continue only if you know the recipient.`}</div>` : '';
    return `
        <h2>Confirm with SMS code</h2>${sh}
        <p class="muted">We sent a 6-digit code to <b>${esc(otp.phoneMasked)}</b></p>
        ${otp.demoCode ? `<div class="demo-box"><b>DEMO MODE:</b> no real SMS is sent. Your code is
            <span class="demo-code">${esc(otp.demoCode)}</span>
            <button class="link" data-act="otpFill" style="padding:6px 0 0">Fill it in</button></div>` : ''}
        <form data-form="otp" style="margin-top:14px">
            <div class="field"><input id="otpInput" class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" required></div>
            <div class="err" id="otpErr"></div>
            <button class="btn" type="submit">Confirm</button>
        </form>
        <div style="text-align:center;margin-top:8px"><button class="link" id="otpResend" data-act="otpResend" disabled></button></div>`;
}

function askOtp(otp, onDone, shield) {
    openSheet(otpHtml(otp, shield));
    S.otp = { otp, onDone, left: otp.resendInSec, timer: null, shield };
    startOtpTimer();
    setTimeout(() => { const i = $('#otpInput'); if (i) i.focus(); }, 250);
}
function startOtpTimer() {
    if (S.otp.timer) clearInterval(S.otp.timer);
    const upd = () => {
        const b = $('#otpResend'); if (!b || !S.otp) return;
        if (S.otp.left > 0) { b.disabled = true; b.textContent = `Resend code in ${S.otp.left} s`; S.otp.left--; }
        else { b.disabled = false; b.textContent = 'Send a new code'; clearInterval(S.otp.timer); }
    };
    upd();
    S.otp.timer = setInterval(upd, 1000);
}

// Starts any operation that needs the SMS code, then shows the receipt
async function runOp(path, body, onDone) {
    const r = await api(path, body);
    if (!r.success) { toast(r.message, 'error'); return false; }
    if (r.needsAck) { shieldWarning(r.shield, (coached) => runOp(path, { ...body, shieldAck: true, coached }, onDone)); return true; }
    if (r.otpRequired) askOtp(r.otp, onDone, r.shield);
    else await onDone(r);
    return true;
}

async function finishOp(r) {
    await refreshAll();
    if (r.registered) return;
    if (r.receipt && r.receipt.amount) { S.stack = []; go('receipt', { receipt: r.receipt, held: !!r.held }); }
    else { toast(r.message, 'success'); render(true); }
}

// ============================================================
// SCREENS
// ============================================================
const views = {};
const flow = (title, inner, extraTop = '') => `
    <div class="screen">
        <div class="flow-top"><button class="icon-btn" data-act="back" aria-label="Back">${ic('back')}</button><h1>${esc(title)}</h1>${extraTop}</div>
        <div class="panel">${inner}</div>
    </div>`;

// ---- phone field with country code ----
const phoneField = (p, label = 'Phone number', def = '7', req = true) => `
    <div class="field"><label>${label}</label>
        <div class="phone-row">
            <select name="${p}Code" aria-label="Country code">${S.cfg.phoneCodes.map(([c, n]) => `<option value="${c}" ${c === def ? 'selected' : ''}>+${c} ${esc(n)}</option>`).join('')}</select>
            <input name="${p}Num" type="tel" inputmode="tel" placeholder="700 123 45 67" autocomplete="tel-national" ${req ? 'required' : ''}>
        </div></div>`;
function buildPhone(code, national) {
    let n = String(national).replace(/\D/g, '');
    if (code === '7' && n.length === 11 && (n[0] === '8' || n[0] === '7')) n = n.slice(1);
    return '+' + code + n.replace(/^0+/, '');
}
function splitPhone(full) {
    const d = String(full).replace(/\D/g, '');
    const codes = S.cfg.phoneCodes.map(x => x[0]).sort((a, b) => b.length - a.length);
    const code = codes.find(c => d.startsWith(c)) || '7';
    return { code, num: d.slice(code.length) };
}

// ---- auth ----
views.login = {
    html: () => `
    <div class="screen auth">
        <div class="top">${I18N.switcher('auth')}<div class="wordmark">bcc<i>.kz</i></div><p class="muted">Log in to your account</p></div>
        <div class="panel">
            <h2 style="margin-bottom:20px">Log in</h2>
            <form data-form="login">
                <div class="field"><label>Email</label><input name="email" type="email" autocomplete="username" placeholder="name@example.com" value="${esc(S.params.email || (window.Feel ? Feel.remember.email() : ''))}" required></div>
                <div class="field"><label>Password</label><div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" placeholder="••••••" required><button type="button" class="pw-eye" data-act="togglePw" aria-label="Show password">${ic('eye')}</button></div></div>
                <label class="check"><input type="checkbox" name="remember" checked><span>Remember my email</span></label>
                <button class="btn" type="submit">Log in</button>
            </form>
            <div class="auth-tag">${ic('shield')}<span>Protected by bcc Shield</span></div>
            <div style="text-align:center;margin-top:14px"><button class="link" data-go="register">Create an account</button></div>
            <div class="demo-hint"><span>Demo account:<br><b style="color:#fff">demo@bcc.kz</b> / <b style="color:#fff">demo123</b></span><button class="link" data-act="fillDemo">Fill in</button></div>
        </div>
    </div>`
};

views.register = {
    html: () => `
    <div class="screen auth">
        <div class="top">${I18N.switcher('auth')}<div class="wordmark">bcc<i>.kz</i></div><p class="muted">Create your account</p></div>
        <div class="panel">
            <form data-form="register">
                <div class="field"><label>Full name</label><input name="fullName" autocomplete="name" placeholder="Name Surname" required></div>
                <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" placeholder="name@example.com" required></div>
                ${phoneField('ph')}
                <div class="field"><label>Password (min. 6 characters)</label><input name="password" type="password" autocomplete="new-password" minlength="6" required></div>
                <div class="note">We will send an SMS code to this number to confirm that it is yours.</div>
                <button class="btn" type="submit">Continue</button>
            </form>
            <div style="text-align:center;margin-top:14px"><button class="link" data-go="login">I already have an account</button></div>
        </div>
    </div>`
};

// ---- HISTORY ----
const INCOME = ['transfer_in', 'top_up', 'deposit_withdraw', 'loan_disbursement', 'invest_sell', 'cashback_withdraw', 'refund', 'goal_withdraw'];
const isIncome = (t) => INCOME.includes(t.transaction_type);
function txCategory(t) {
    const k = t.transaction_type;
    if (['transfer_in', 'transfer_out', 'domestic_out'].includes(k)) return 'transfers';
    if (k === 'top_up') return 'topups';
    if (k.startsWith('deposit')) return 'deposits';
    if (k === 'bill_payment' || k === 'tax_payment' || k === 'purchase' || k === 'subscription_payment') return 'payments';
    if (k === 'goal_deposit' || k === 'goal_withdraw') return 'deposits';
    if (k.startsWith('loan')) return 'loans';
    if (k.startsWith('invest')) return 'investments';
    if (k === 'insurance_purchase') return 'insurance';
    if (k === 'service_fee') return 'services';
    if (k === 'cashback_withdraw' || k === 'refund') return 'topups';
    if (k === 'international_out') return 'international';
    if (k === 'crypto_out') return 'crypto';
    return 'other';
}
function txTitle(t) {
    const d = t.details || {};
    switch (t.transaction_type) {
        case 'transfer_in': return d.counterparty || 'Incoming transfer';
        case 'transfer_out': return d.method === 'own' ? 'To own account' : (d.counterparty || t.to_account || 'Transfer');
        case 'domestic_out': return d.bank || 'Other bank';
        case 'international_out': return d.beneficiary || 'International transfer';
        case 'crypto_out': return `Crypto: ${d.asset || ''} ${d.address || ''}`.trim();
        case 'top_up': return 'Top-up';
        case 'bill_payment': return d.provider || 'Payment';
        case 'tax_payment': return d.service || 'State payment';
        case 'cashback_withdraw': return 'Cashback paid out';
        case 'purchase': return d.merchant || 'Card purchase';
        case 'subscription_payment': return d.provider || 'Subscription';
        case 'goal_deposit': return d.roundUp ? `Round-up → ${d.goal}` : `To goal: ${d.goal || ''}`;
        case 'goal_withdraw': return `From goal: ${d.goal || ''}`;
        default: return t.description || 'Operation';
    }
}
function txIcon(t) {
    switch (t.transaction_type) {
        case 'transfer_in': return ['client', 'g'];
        case 'transfer_out': return ((t.details && t.details.method === 'own') ? ['exchange', ''] : ['client', 'g']);
        case 'domestic_out': return ['bank', 'r'];
        case 'international_out': return ['globe', ''];
        case 'crypto_out': return ['crypto', 'o'];
        case 'top_up': return ['plus', ''];
        case 'bill_payment': return ['phone', ''];
        case 'tax_payment': return ['bank', ''];
        case 'loan_disbursement': case 'loan_payment': return ['loan', ''];
        case 'invest_buy': case 'invest_sell': return ['bars', ''];
        case 'insurance_purchase': return ['shield', ''];
        case 'cashback_withdraw': return ['star', 'g'];
        case 'purchase': return ['card', ''];
        case 'subscription_payment': return ['repeat', ''];
        case 'goal_deposit': case 'goal_withdraw': return ['star', 'g'];
        case 'refund': return ['refund', 'g'];
        default: return ['safe', ''];
    }
}
function matchAcc(t, a) {
    return [t.from_account, t.to_account].some(x => x && (x === accName(a) || x === a.card_number || x === a.account_number));
}
function filteredTx() {
    const f = S.hist, cut = f.period === 'all' ? 0 : Date.now() - Number(f.period) * 864e5;
    const acc = S.accounts.find(a => a.account_number === f.acc);
    return S.tx.filter(t => (!cut || parseDate(t) >= cut)
        && (f.cat === 'all' || txCategory(t) === f.cat)
        && (!acc || matchAcc(t, acc))
        && (!f.q || (txTitle(t) + ' ' + (t.description || '') + ' ' + t.amount).toLowerCase().includes(f.q.toLowerCase())));
}
function historyList() {
    const list = filteredTx();
    if (!list.length) return '<div class="empty">No operations found</div>';
    let day = '', out = '';
    list.forEach(t => {
        const d = parseDate(t), dl = fmtDay(d);
        if (dl !== day) { day = dl; out += `<div class="date-h">${dl}</div>`; }
        const [icn, cls] = txIcon(t), inc = isIncome(t);
        const bad = t.status === 'rejected', wait = t.status === 'processing';
        out += `<button class="tx" data-act="txSheet" data-id="${t.id}">
            <span class="circle ${cls}">${ic(icn)}</span>
            <span class="grow"><div class="t">${esc(txTitle(t))}</div><div class="s">${fmtTime(d)}</div></span>
            <span><div class="amt ${bad ? 'bad' : inc ? 'in' : ''}">${esc(money(inc ? t.amount : -t.amount, t.currency, inc))}</div>
            ${bad ? '<div class="st bad">Rejected</div>' : wait ? '<div class="st wait">Processing</div>' : ''}</span></button>`;
    });
    return out;
}
const CAT_NAMES = { all: 'All categories', transfers: 'Transfers', payments: 'Payments', topups: 'Top-ups & refunds', deposits: 'Deposits', loans: 'Loans', investments: 'Investments', insurance: 'Insurance', international: 'International', crypto: 'Crypto', services: 'Services' };
views.history = {
    html: () => {
        const f = S.hist, acc = S.accounts.find(a => a.account_number === f.acc);
        return `
    <div class="screen">
        <div class="top toprow"><h1>History</h1><button class="green-link" style="display:flex;align-items:center;gap:8px" data-act="toggleSearch">${ic('search')}Search</button></div>
        <div class="chips" style="padding-bottom:20px">
            <button class="chip ${f.period !== 'all' ? 'on' : ''}" data-act="filterPeriod">${f.period === 'all' ? 'Period' : 'Last ' + f.period + ' days'}${ic('down')}</button>
            <button class="chip ${f.cat !== 'all' ? 'on' : ''}" data-act="filterCat">${f.cat === 'all' ? 'Categories' : CAT_NAMES[f.cat]}${ic('down')}</button>
            <button class="chip ${acc ? 'on' : ''}" data-act="filterAcc">${acc ? esc(accName(acc)) : 'Cards and Accounts'}${ic('down')}</button>
        </div>
        <div class="panel">
            ${f.search ? `<div class="field searchbox"><input id="histQ" placeholder="Search operations" value="${esc(f.q)}"></div>` : ''}
            <div id="histList">${historyList()}</div>
        </div>
    </div>`;
    },
    after: () => { const q = $('#histQ'); if (q && !q.dataset.f) { q.dataset.f = 1; } }
};

// ---- FLOW: own accounts ----
views.own = {
    html: () => flow('To Own Accounts', `
        <form data-form="own" data-live="own">
            <div class="field"><label>From</label><select name="from">${accOptions()}</select></div>
            <div class="field"><label>To</label><select name="to">${accOptions(() => true, (S.accounts[1] || {}).account_number)}</select></div>
            <div class="field"><label>Amount (in the currency of the "From" account)</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required></div>
            <div class="note" id="ownNote">Between accounts in different currencies the money is converted at the demo rate: 1 USD = ${S.cfg.rates.USD} ₸.</div>
            <button class="btn" type="submit">Transfer</button>
        </form>`),
    after: () => live.own($('form[data-form=own]'))
};

// ---- FLOW: bcc.kz client ----
views.client = {
    html: (p) => {
        const mode = p.mode || S.clientMode; S.clientMode = mode;
        const sp = p.phone ? splitPhone(p.phone) : null;
        return flow('To bcc.kz client', `
        <div class="seg"><button data-act="clientMode" data-mode="phone" class="${mode === 'phone' ? 'on' : ''}">Phone number</button><button data-act="clientMode" data-mode="card" class="${mode === 'card' ? 'on' : ''}">Card number</button></div>
        <form data-form="client" data-live="client">
            <div class="field"><label>From</label><select name="from">${accOptions()}</select></div>
            ${mode === 'phone'
                ? phoneField('to', 'Recipient phone (any country)', sp ? sp.code : '7')
                : `<div class="field"><label>Recipient card number</label><input name="card" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" data-fmt="card" required></div>`}
            <div class="hint" id="rcpHint"></div>
            <div class="field"><label>Amount</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required></div>
            <div class="field"><label>Comment (optional)</label><input name="comment" maxlength="140" placeholder="For lunch"></div>
            <div class="note">You can only send to people who already have a bcc.kz account. An SMS code will confirm the transfer.</div>
            <button class="btn" type="submit">Continue</button>
        </form>`);
    },
    after: (p) => {
        if (p.phone) {
            const sp = splitPhone(p.phone), f = $('form[data-form=client]');
            f.toCode.value = sp.code; f.toNum.value = sp.num; if (p.amount) f.amount.value = p.amount; live.client(f);
        }
    }
};

// ---- FLOW: other banks in Kazakhstan ----
views.domestic = {
    html: () => flow('Other banks in Kazakhstan', `
        <form data-form="domestic">
            <div class="field"><label>From (KZT accounts)</label><select name="from">${accOptions(a => a.currency === 'KZT')}</select></div>
            <div class="field"><label>Bank</label><select name="bank">${S.cfg.kzBanks.map(b => `<option>${esc(b)}</option>`).join('')}</select></div>
            <div class="field"><label>Recipient card number</label><input name="card" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" data-fmt="card" required></div>
            <div class="field"><label>Amount (₸)</label><input name="amount" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0" required></div>
            <div class="field"><label>Comment (optional)</label><input name="comment" maxlength="140"></div>
            <div class="note warn">Demo: other banks are simulated, so the money only leaves your account.</div>
            <button class="btn" type="submit">Continue</button>
        </form>`)
};

// ---- FLOW: international ----
views.intl = {
    html: () => {
        const c = S.cfg.international;
        return flow('International transfer', `
        <form data-form="intl" data-live="intl">
            <div class="field"><label>Pay from</label><select name="from">${accOptions()}</select></div>
            <div class="field"><label>Amount to send (USD)</label><input name="amount" type="number" inputmode="decimal" min="${c.minUsd}" max="${c.maxUsd}" step="0.01" placeholder="${c.minUsd} - ${c.maxUsd}" required></div>
            <div class="quote" id="intlQuote"><div><span>Amount</span><span>$0</span></div><div><span>Fee</span><span>-</span></div><div><span>You pay</span><span>-</span></div></div>
            <div class="field"><label>Beneficiary full name</label><input name="beneficiary" placeholder="As in the passport" required></div>
            <div class="field"><label>Country</label><select name="country">${S.cfg.countries.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
            <div class="field"><label>Beneficiary bank</label><input name="bank" placeholder="Bank name" required></div>
            <div class="field"><label>SWIFT / BIC</label><input name="swift" placeholder="DEUTDEFF" maxlength="11" style="text-transform:uppercase" required></div>
            <div class="field"><label>IBAN / account number</label><input name="account" placeholder="DE89 3704 0044 0532 0130 00" required></div>
            <div class="field"><label>Purpose (optional)</label><input name="purpose" maxlength="100" placeholder="Family support"></div>
            <div class="note warn">Demo: this simulates a SWIFT payment. The IBAN check digits and SWIFT format are really validated, but no money leaves the bank.</div>
            <button class="btn" type="submit">Continue</button>
        </form>`);
    },
    after: () => live.intl($('form[data-form=intl]'))
};

// ---- FLOW: crypto ----
views.crypto = {
    html: () => {
        const A = S.cfg.crypto.assets;
        const wallets = S.wallets.map(w => `
            <div class="dep"><div class="h"><span>${esc(w.label)}</span><span class="tag">${esc(A[w.network] ? A[w.network].name : w.network)}</span></div>
                <div class="meta" style="margin-top:8px;word-break:break-all">${esc(w.address)}</div>
                <div class="acts"><button class="btn danger" data-act="removeWallet" data-id="${w.id}">${ic('trash')} Remove</button></div></div>`).join('');
        return flow('Crypto wallets', `
        <div class="note warn">Demo: wallets and transfers are simulated. Rates are fixed demo prices, and no real blockchain transaction is made.</div>
        ${wallets || '<div class="empty" style="padding:16px">No wallets linked yet</div>'}
        <button class="btn ghost" data-act="linkWalletSheet" style="margin-bottom:24px">${ic('plus')} Link a wallet</button>
        ${S.wallets.length ? `
        <h2 style="font-size:22px;margin-bottom:14px">Send to wallet</h2>
        <form data-form="cryptoSend" data-live="crypto">
            <div class="field"><label>Wallet</label><select name="wallet">${S.wallets.map(w => `<option value="${w.id}">${esc(w.label)} - ${esc(w.address.slice(0, 6) + '…' + w.address.slice(-4))}</option>`).join('')}</select></div>
            <div class="field"><label>Pay from</label><select name="from">${accOptions()}</select></div>
            <div class="field"><label>Amount (in the account currency)</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required></div>
            <div class="quote" id="cryptoQuote"><div><span>You send</span><span>-</span></div><div><span>Network fee</span><span>-</span></div><div><span>Wallet receives</span><span>-</span></div></div>
            <button class="btn" type="submit">Continue</button>
        </form>` : ''}`);
    },
    after: () => { const f = $('form[data-form=cryptoSend]'); if (f) live.crypto(f); }
};

// ---- FLOW: deposits ----
views.deposits = {
    html: () => {
        const list = S.deposits.map(d => {
            const total = Number(d.principal_amount) + Number(d.accumulated_interest), active = d.status === 'active';
            return `<div class="dep"><div class="h"><span>${esc(d.deposit_name)}</span><span class="tag ${active ? '' : 'off'}">${active ? 'Active' : 'Closed'}</span></div>
                <div class="big">${esc(money(total, 'KZT'))}</div>
                <div class="meta"><span>${d.interest_rate}% per year</span><span>${d.term_months} months</span><span>until ${esc(d.end_date)}</span></div>
                ${active ? `<div class="acts"><button class="btn ghost" data-go="depWithdraw" data-p="${esc(JSON.stringify({ id: d.id }))}">Transfer to card</button></div>` : ''}</div>`;
        }).join('');
        return flow('Deposits', `${list || '<div class="empty">You have no deposits yet</div>'}
            <button class="btn" data-act="openDepositSheet">${ic('plus')} Open a deposit</button>`);
    }
};

views.depWithdraw = {
    html: (p) => {
        const act = S.deposits.filter(d => d.status === 'active');
        if (!act.length) return flow('From deposit', '<div class="empty">You have no active deposits</div>');
        return flow('From deposit', `
        <form data-form="depWithdraw" data-live="depw">
            <div class="field"><label>Deposit</label><select name="dep">${act.map(d => `<option value="${d.id}" ${String(p.id) === String(d.id) ? 'selected' : ''}>${esc(d.deposit_name)} - ${esc(money(Number(d.principal_amount) + Number(d.accumulated_interest), 'KZT'))}</option>`).join('')}</select></div>
            <div class="field"><label>To (KZT accounts)</label><select name="to">${accOptions(a => a.currency === 'KZT')}</select></div>
            <div class="field"><label>Amount (₸)</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0" required>
                <div class="hint ok" id="depHint"></div><button type="button" class="link" data-act="depAll">Transfer the whole balance</button></div>
            <div class="note">Interest is paid out first, then the principal. If nothing is left, the deposit is closed.</div>
            <button class="btn" type="submit">Transfer</button>
        </form>`);
    },
    after: () => live.depw($('form[data-form=depWithdraw]'))
};

// ---- RECEIPT ----
views.receipt = {
    html: (p) => {
        const r = p.receipt;
        return `<div class="screen"><div class="panel receipt" style="border-radius:0;padding-top:70px">
            <div class="ok">${ic('check')}</div><h2>${esc(r.title)}</h2><div class="amount">${esc(r.amount)}</div>
            <div class="kv">${r.lines.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
            ${p.held ? `<button class="btn ghost" data-go="shield" style="margin-bottom:10px">Open Shield: cancel or track</button>` : ''}<button class="btn ghost" data-act="shareReceipt" style="margin-bottom:10px">${ic('share')} Share receipt</button><button class="btn" data-tab="home">Done</button></div></div>`;
    }
};

// ============================================================
// LIVE HELPERS (quotes, previews)
// ============================================================
let rcpTimer, rcpSeq = 0;
const live = {
    own(f) {
        if (!f) return;
        const a = f.from.selectedOptions[0], b = f.to.selectedOptions[0], note = $('#ownNote');
        if (!a || !b || !a.dataset.cur || !note) return;
        const amt = parseFloat(f.amount.value);
        if (a.dataset.cur === b.dataset.cur) note.textContent = 'Same currency: no conversion.';
        else if (!amt) note.textContent = `Converted at the demo rate: 1 USD = ${S.cfg.rates.USD} ₸.`;
        else note.textContent = `You will receive ≈ ${money(amt * rate(a.dataset.cur, b.dataset.cur), b.dataset.cur)} (1 USD = ${S.cfg.rates.USD} ₸, demo rate).`;
    },
    intl(f) {
        if (!f) return;
        const c = S.cfg.international, amt = parseFloat(f.amount.value) || 0;
        const cur = (f.from.selectedOptions[0] || {}).dataset ? f.from.selectedOptions[0].dataset.cur : 'KZT';
        const k = S.plus ? 0.5 : 1, fee = amt ? Math.max(Math.round(c.feeMinUsd * k * 100) / 100, Math.round(amt * c.feePercent * k) / 100) : 0;
        const total = amt + fee, debit = Math.round(total * S.cfg.rates.USD / S.cfg.rates[cur] * 100) / 100;
        $('#intlQuote').innerHTML = `<div><span>Amount</span><span>${money(amt, 'USD')}</span></div>
            <div><span>Fee (${c.feePercent}%, min $${c.feeMinUsd})</span><span>${amt ? money(fee, 'USD') : '-'}</span></div>
            <div><span>You pay</span><span>${amt ? money(debit, cur) : '-'}</span></div>`;
    },
    crypto(f) {
        if (!f) return;
        const w = S.wallets.find(x => String(x.id) === f.wallet.value); if (!w) return;
        const asset = S.cfg.crypto.assets[w.network], cur = (f.from.selectedOptions[0] || { dataset: { cur: 'KZT' } }).dataset.cur;
        const amt = parseFloat(f.amount.value) || 0, R = S.cfg.rates;
        const usd = amt * R[cur] / R.USD, fee = S.cfg.crypto.feeUsd * R.USD / R[cur];
        const got = usd / asset.priceUsd;
        $('#cryptoQuote').innerHTML = `<div><span>You send</span><span>${amt ? money(amt, cur) : '-'}</span></div>
            <div><span>Network fee ($${S.cfg.crypto.feeUsd})</span><span>${money(fee, cur)}</span></div>
            <div><span>Wallet receives ≈</span><span>${amt ? got.toFixed(asset.asset === 'USDT' ? 2 : 6) + ' ' + asset.asset : '-'}</span></div>`;
    },
    depw(f) {
        if (!f) return;
        const d = S.deposits.find(x => String(x.id) === f.dep.value), h = $('#depHint');
        if (d && h) h.textContent = `Available: ${money(Number(d.principal_amount) + Number(d.accumulated_interest), 'KZT')}`;
    },
    client(f) {
        if (!f) return;
        const hint = $('#rcpHint'); if (!hint) return;
        const mode = S.clientMode;
        const value = mode === 'phone' ? (f.toNum ? buildPhone(f.toCode.value, f.toNum.value) : '') : (f.card ? f.card.value : '');
        const digits = value.replace(/\D/g, '');
        const enough = mode === 'card' ? digits.length === 16 : digits.length >= 9;
        clearTimeout(rcpTimer);
        if (!enough) { hint.textContent = ''; hint.className = 'hint'; return; }
        const seq = ++rcpSeq;
        rcpTimer = setTimeout(async () => {
            const r = await api(`/api/recipient?type=${mode}&value=${encodeURIComponent(value)}`);
            if (seq !== rcpSeq || !r.success) return;
            if (!r.found) { hint.textContent = 'No bcc.kz client found: transfer is not possible'; hint.className = 'hint bad'; }
            else if (r.self) { hint.textContent = 'This is you. Use "To Own Accounts" instead'; hint.className = 'hint bad'; }
            else { hint.textContent = `Recipient: ${r.name}`; hint.className = 'hint ok'; }
        }, 350);
    }
};

// ============================================================
// FORMS
// ============================================================
async function busy(f, fn) {
    const b = $('button[type=submit]', f); if (b) { b.disabled = true; b.classList.add('loading'); }
    try { await fn(); } finally { if (b) { b.disabled = false; b.classList.remove('loading'); } }
}
const val = (f, n) => (f.elements[n] ? f.elements[n].value : '');

const forms = {
    login: (f) => busy(f, async () => {
        const r = await api('/api/login', { email: val(f, 'email'), password: val(f, 'password') });
        if (!r.success) { if (window.Feel) Feel.shakeForm(f); return toast(r.message, 'error'); }
        if (window.Feel) Feel.remember.save(val(f, 'email'), !!f.elements.remember && f.elements.remember.checked);
        await refreshAll(); tab('home'); if (window.Feel) Feel.resetIdle();
    }),
    register: (f) => busy(f, async () => {
        const body = { fullName: val(f, 'fullName'), email: val(f, 'email'), phone: buildPhone(val(f, 'phCode'), val(f, 'phNum')), password: val(f, 'password') };
        await runOp('/api/register/start', body, async (r) => { toast(r.message, 'success'); go('login', { email: r.email }); });
    }),
    otp: async (f) => {
        if (!S.otp) return;
        const code = $('#otpInput').value.trim(), btn = $('button[type=submit]', f); btn.disabled = true;
        const r = await api('/api/otp/confirm', { opId: S.otp.otp.opId, code });
        btn.disabled = false;
        if (r.success) { const done = S.otp.onDone; closeOverlay(); await done(r); return; }
        $('#otpErr').textContent = r.message;
        if (/start again|expired|Too many/i.test(r.message)) { toast(r.message, 'error'); setTimeout(closeOverlay, 1500); }
        else { $('#otpInput').value = ''; $('#otpInput').focus(); }
    },
    own: (f) => busy(f, () => runOp('/api/transfer', { transferType: 'own', fromAccount: val(f, 'from'), toAccount: val(f, 'to'), amount: val(f, 'amount') }, finishOp)),
    client: (f) => busy(f, () => {
        const mode = S.clientMode;
        return runOp('/api/transfer', {
            transferType: mode, fromAccount: val(f, 'from'),
            toAccount: mode === 'phone' ? buildPhone(val(f, 'toCode'), val(f, 'toNum')) : val(f, 'card'),
            amount: val(f, 'amount'), description: val(f, 'comment')
        }, finishOp);
    }),
    domestic: (f) => busy(f, () => runOp('/api/transfer/domestic', { fromAccount: val(f, 'from'), bank: val(f, 'bank'), card: val(f, 'card'), amount: val(f, 'amount'), description: val(f, 'comment') }, finishOp)),
    intl: (f) => busy(f, () => runOp('/api/transfer/international', {
        fromAccount: val(f, 'from'), amount: val(f, 'amount'), beneficiary: val(f, 'beneficiary'), country: val(f, 'country'),
        bank: val(f, 'bank'), swift: val(f, 'swift'), account: val(f, 'account'), purpose: val(f, 'purpose')
    }, finishOp)),
    cryptoSend: (f) => busy(f, () => runOp('/api/crypto/send', { walletId: val(f, 'wallet'), fromAccount: val(f, 'from'), amount: val(f, 'amount') }, finishOp)),
    walletLink: (f) => busy(f, () => runOp('/api/crypto/wallets/link', { network: val(f, 'network'), address: val(f, 'address'), label: val(f, 'label') }, async (r) => { await finishOp(r); })),
    topup: (f) => busy(f, async () => {
        const r = await api('/api/topup', { accountNumber: val(f, 'acc'), amount: val(f, 'amount') });
        if (!r.success) return toast(r.message, 'error');
        toast(r.message, 'success'); await refreshAll(); render(true);
    }),
    openCard: (f) => busy(f, async () => {
        const r = await api('/api/cards/create', { cardType: val(f, 'type'), currency: val(f, 'cur') });
        if (!r.success) return toast(r.message, 'error');
        closeOverlay(); toast(r.message, 'success'); await refreshAll(); render(true);
    }),
    openDeposit: (f) => busy(f, async () => {
        const r = await api('/api/deposits/open', { depositName: 'Savings deposit', amount: val(f, 'amount'), termMonths: val(f, 'term'), fromAccount: val(f, 'from') });
        if (!r.success) return toast(r.message, 'error');
        closeOverlay(); toast(r.message, 'success'); await refreshAll(); render(true);
    }),
    depWithdraw: (f) => busy(f, async () => {
        const amount = val(f, 'amount'), to = S.accounts.find(a => a.account_number === val(f, 'to'));
        const dep = S.deposits.find(d => String(d.id) === val(f, 'dep'));
        const r = await api('/api/deposits/withdraw', { depositId: val(f, 'dep'), toAccount: val(f, 'to'), amount });
        if (!r.success) return toast(r.message, 'error');
        await refreshAll(); S.stack = [];
        go('receipt', { receipt: { title: r.closed ? 'Deposit closed' : 'Transfer completed', amount: money(Number(amount), 'KZT'), lines: [['From', dep ? dep.deposit_name : 'Deposit'], ['To', to ? accName(to) : '']] } });
    })
};

// ============================================================
// ACTIONS (buttons)
// ============================================================
const sheetKV = (rows) => `<div class="kv">${rows.filter(r => r[1] !== '' && r[1] != null).map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`;
const DETAIL_LABELS = { merchant: 'Shop', goal: 'Goal', counterparty: 'Counterparty', method: 'Method', bank: 'Bank', card: 'Card', beneficiary: 'Beneficiary', country: 'Country', swift: 'SWIFT/BIC', account: 'Account', purpose: 'Purpose', network: 'Network', address: 'Wallet', cryptoAmount: 'Crypto amount', rate: 'Rate (demo)', provider: 'Provider', category: 'Category', identifier: 'Reference', service: 'Service', iin: 'IIN', policy: 'Policy', symbol: 'Instrument', qty: 'Quantity', cashback: 'Cashback (₸)', code: 'Code', interest: 'Interest', principal: 'Principal' };

const actions = {
    back, soon,
    closeOverlay: () => closeOverlay(),
    fillDemo: () => { const f = $('form[data-form=login]'); f.email.value = 'demo@bcc.kz'; f.password.value = 'demo123'; },
    toggleHide: () => { S.hide = !S.hide; render(true); },
    lang: (el) => { I18N.setLang(el.dataset.l); render(true); },
    profile: () => openSheet(`<h2>${esc(S.user.full_name)}</h2><p class="muted" style="margin-bottom:16px">${esc(S.user.email)}<br>${esc(S.user.phone)}</p>
        <button class="btn ghost" data-act="toggleHide" style="margin-bottom:10px">${S.hide ? 'Show balances' : 'Hide balances'}</button>
        <button class="btn danger" data-act="logout">Log out</button>`),
    logout: async () => { await api('/api/logout', {}); S.user = null; S.accounts = []; S.tx = []; closeOverlay(); S.stack = []; go('login'); },
    openCardSheet: () => openSheet(`<h2>Open a card</h2><p class="muted sm" style="margin-bottom:16px">Up to ${S.cfg.maxCards} cards. New cards start with zero balance.</p>
        <form data-form="openCard">
            <div class="field"><label>Card type</label><select name="type"><option value="visa">Visa</option><option value="mastercard">Mastercard</option></select></div>
            <div class="field"><label>Currency</label><select name="cur">${S.cfg.currencies.map(c => `<option value="${c}">${c === 'KZT' ? 'Tenge (KZT)' : 'US dollar (USD)'}</option>`).join('')}</select></div>
            <button class="btn" type="submit">Open card</button></form>`),
    accSheet: (el) => {
        const a = S.accounts.find(x => x.account_number === el.dataset.acc); if (!a) return;
        openSheet(`<h2>${esc(accName(a))}</h2><div class="acc-bal" style="margin:6px 0 16px">${esc(money(a.balance, a.currency))}</div>
            ${sheetKV([['Card number', a.card_number], ['Account number', a.account_number], ['Currency', a.currency], ['Type', a.account_type === 'card' ? 'Card' : 'Savings account']])}
            <button class="btn" data-act="goTopup">Top up</button>`);
    },
    goTopup: () => { closeOverlay(); tab('payments'); },
    txSheet: (el) => {
        const t = S.tx.find(x => String(x.id) === el.dataset.id); if (!t) return;
        const inc = isIncome(t), d = t.details || {};
        const rows = [['Date', `${fmtDay(parseDate(t))}, ${fmtTime(parseDate(t))}`], ['Status', t.status], ['From', t.from_account], ['To', t.to_account], ['Description', t.description]];
        Object.entries(d).forEach(([k, v]) => {
            if (v == null || ['creditedCurrency', 'sentCurrency', 'asset', 'fee', 'feeUsd', 'amountUsd', 'demoPriceUsd', 'credited', 'sent', 'sk', 'refundOf', 'loanId', 'amountKzt', 'cat', 'demo', 'sub', 'goalId', 'roundUp', 'salary', 'period', 'priceUsd', 'pnlUsd'].includes(k)) return;
            rows.push([DETAIL_LABELS[k] || k, k === 'method' ? ({ phone: 'By phone', card: 'By card', own: 'Own accounts' }[v] || v) : v]);
        });
        if (d.credited != null) rows.push(['Credited', money(d.credited, d.creditedCurrency)]);
        if (d.sent != null) rows.push(['Sent', money(d.sent, d.sentCurrency)]);
        if (d.amountUsd != null) rows.push(['Amount', money(d.amountUsd, 'USD')], ['Fee', money(d.feeUsd, 'USD')]);
        if (d.asset && d.fee != null) rows.push(['Network fee', money(d.fee, t.currency)]);
        openSheet(`<h2>${esc(txTitle(t))}</h2><div class="acc-bal" style="margin:4px 0 16px;color:${inc ? 'var(--green)' : '#fff'}">${esc(money(inc ? t.amount : -t.amount, t.currency, inc))}</div>${sheetKV(rows)}`);
    },
    filterPeriod: () => openSheet(`<h2>Period</h2>${[['all', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days']].map(([v, n]) => `<button class="opt ${S.hist.period === v ? 'on' : ''}" data-act="setFilter" data-k="period" data-v="${v}">${n}${S.hist.period === v ? ic('check') : ''}</button>`).join('')}`),
    filterCat: () => openSheet(`<h2>Categories</h2>${Object.entries(CAT_NAMES).map(([v, n]) => `<button class="opt ${S.hist.cat === v ? 'on' : ''}" data-act="setFilter" data-k="cat" data-v="${v}">${n}${S.hist.cat === v ? ic('check') : ''}</button>`).join('')}`),
    filterAcc: () => openSheet(`<h2>Cards and Accounts</h2><button class="opt ${S.hist.acc === 'all' ? 'on' : ''}" data-act="setFilter" data-k="acc" data-v="all">All${S.hist.acc === 'all' ? ic('check') : ''}</button>
        ${S.accounts.map(a => `<button class="opt ${S.hist.acc === a.account_number ? 'on' : ''}" data-act="setFilter" data-k="acc" data-v="${esc(a.account_number)}">${esc(accName(a))}${S.hist.acc === a.account_number ? ic('check') : ''}</button>`).join('')}`),
    setFilter: (el) => { S.hist[el.dataset.k] = el.dataset.v; closeOverlay(); render(true); },
    toggleSearch: () => { S.hist.search = !S.hist.search; if (!S.hist.search) S.hist.q = ''; render(true); if (S.hist.search) setTimeout(() => { const q = $('#histQ'); if (q) q.focus(); }, 50); },
    svcChip: (el) => { S.svcTab = el.dataset.sec; $$('.svc-chips .chip').forEach(c => c.classList.toggle('on', c.dataset.sec === S.svcTab)); const s = $('#sec-' + CSS.escape(S.svcTab)); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    clientMode: (el) => { const f = $('form[data-form=client]'); S.clientMode = el.dataset.mode; go('client', { mode: el.dataset.mode }); },
    otpFill: () => { const i = $('#otpInput'); if (i && S.otp) i.value = S.otp.otp.demoCode || ''; },
    otpResend: async () => {
        if (!S.otp) return;
        const r = await api('/api/otp/resend', { opId: S.otp.otp.opId });
        if (!r.success) return toast(r.message, 'error');
        const keep = S.otp.onDone, sh = S.otp.shield; openSheet(otpHtml(r.otp, sh)); S.otp = { otp: r.otp, onDone: keep, left: r.otp.resendInSec, timer: null, shield: sh }; startOtpTimer();
        toast('A new code was sent', 'success');
    },
    linkWalletSheet: () => openSheet(`<h2>Link a crypto wallet</h2><p class="muted sm" style="margin-bottom:14px">Paste the public address of your wallet. We never ask for seed phrases or private keys.</p>
        <form data-form="walletLink">
            <div class="field"><label>Network</label><select name="network">${Object.entries(S.cfg.crypto.assets).map(([k, a]) => `<option value="${k}">${esc(a.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Wallet address</label><input name="address" placeholder="Public address" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
            <div class="field"><label>Name (optional)</label><input name="label" maxlength="30" placeholder="My wallet"></div>
            <button class="btn" type="submit">Continue</button></form>`),
    removeWallet: async (el) => {
        const r = await api('/api/crypto/wallets/remove', { walletId: el.dataset.id });
        toast(r.message, r.success ? 'success' : 'error'); await refreshAll(); render(true);
    },
    openDepositSheet: () => openSheet(`<h2>Open a deposit</h2><p class="muted sm" style="margin-bottom:14px">Deposits are opened in KZT. The bank sets the interest rate by term.</p>
        <form data-form="openDeposit">
            <div class="field"><label>Term</label><select name="term">${Object.entries(S.cfg.depositRates).map(([m, r]) => `<option value="${m}">${m} months - ${r}% per year</option>`).join('')}</select></div>
            <div class="field"><label>From (KZT accounts)</label><select name="from">${accOptions(a => a.currency === 'KZT')}</select></div>
            <div class="field"><label>Amount (₸)</label><input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required></div>
            <button class="btn" type="submit">Open deposit</button></form>`),
    depAll: () => {
        const f = $('form[data-form=depWithdraw]'), d = S.deposits.find(x => String(x.id) === f.dep.value);
        if (d) f.amount.value = Math.round((Number(d.principal_amount) + Number(d.accumulated_interest)) * 100) / 100;
    }
};

// ============================================================
// EVENTS
// ============================================================
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tab],[data-go],[data-act]');
    if (!el) { if (e.target.id === 'overlay' && !S.otp) closeOverlay(); return; }
    if (el.dataset.tab) { closeOverlay(); return tab(el.dataset.tab); }
    if (el.dataset.go) {
        const p = el.dataset.p ? JSON.parse(el.dataset.p) : {};
        return ['login', 'register'].includes(el.dataset.go) ? go(el.dataset.go, p) : openView(el.dataset.go, p);
    }
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
});

document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    if (forms[f.dataset.form]) forms[f.dataset.form](f);
});

function onFormChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.fmt === 'card') t.value = t.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    if (t.id === 'histQ') { S.hist.q = t.value; $('#histList').innerHTML = historyList(); return; }
    const f = t.closest && t.closest('form[data-live]');
    if (f && live[f.dataset.live]) live[f.dataset.live](f);
}
document.addEventListener('input', onFormChange);
document.addEventListener('change', onFormChange);

// ============================================================
// START
// ============================================================
async function boot() {
    $('#screen').innerHTML = '<div class="loading">Loading…</div>';
    S.cfg = await api('/api/config');
    if (!S.cfg || !S.cfg.success) { $('#screen').innerHTML = '<div class="loading">Cannot reach the server. Is it running?</div>'; return; }
    const a = await api('/api/check-auth');
    if (a.authenticated) { await refreshAll(); if (window.Feel) Feel.onBoot(); tab('home'); } else go('login');
    // The offline helper only works on https:// or localhost (browser rule)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}
// start only after ALL script files (qr.js, features-ui.js) have loaded
if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
