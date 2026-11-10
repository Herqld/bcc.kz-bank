'use strict';
// ============================================================
// finance-ui.js : Finance hub (PFM + AI tips), subscriptions with a
// "pay / don't pay" question before every charge, Smart Goals
// (uses helpers from app.js and features-ui.js)
// ============================================================

// ---------- brand badges (simple coloured letters, no real logos) ----------
const BRANDS = {
    netflix: { c1: '#e50914', c2: '#6e0a10', t: 'N' }, yandex: { c1: '#8a4dff', c2: '#ff4d94', t: 'Y+' }, spotify: { c1: '#1ed760', c2: '#0a6b32', t: 'S' },
    apple: { c1: '#a3a8b3', c2: '#3b3d44', t: 'i' }, youtube: { c1: '#ff3b3b', c2: '#8a1212', t: '▶' }
};
const OTHER_BRANDS = [['#4f8cff', '#1c3f99'], ['#ffb347', '#a35a00'], ['#ff6bd6', '#8a1e72'], ['#2fd4c0', '#0b6a60'], ['#b28dff', '#4a2a99']];
function brandStyle(name, brand) {
    if (BRANDS[brand]) return BRANDS[brand];
    const h = [...String(name)].reduce((s, ch) => s + ch.charCodeAt(0), 0), p = OTHER_BRANDS[h % OTHER_BRANDS.length];
    return { c1: p[0], c2: p[1], t: String(name).trim().slice(0, 1).toUpperCase() || '?' };
}
const brandBadge = (name, brand, size = '') => { const b = brandStyle(name, brand); return `<span class="brand ${size}" style="background:linear-gradient(135deg,${b.c1},${b.c2})">${esc(b.t)}</span>`; };

// ---------- small helpers ----------
const dShort = (ms) => I18N.date(new Date(ms), false);
const inDays = (ms) => { const a = new Date(ms), b = new Date(); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 864e5); };
const dueWord = (ms) => { const n = inDays(ms); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
const compact = (v) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + (a / 1e6).toFixed(1).replace('.0', '') + 'M' : a >= 1e3 ? s + Math.round(a / 1e3) + 'k' : s + Math.round(a); };
const cardsOnly = (a) => a.account_type === 'card';
const KIND_ICON = { trip: 'plane', car: 'car', home: 'home', gadget: 'phone', other: 'star' };
const KIND_NAME = { trip: 'Trip', car: 'Car', home: 'Property', gadget: 'Gadget', other: 'Other' };
async function finRefresh() { await refreshAll(); if (loaders[S.view]) await loaders[S.view](S.params); render(true); }
loaders.finance = async () => { const r = await api('/api/pfm/overview'); if (r.success) S.fin = r; };

// ============================================================
// HOME: "safe to spend" strip + the pay/don't pay question after login
// ============================================================
function finStrip() {
    const b = S.brief; if (!b) return '';
    const s = b.safe, n = (b.pending || []).length + (b.decisions || []).length, lim = Math.max(1, s.perDayKzt), frac = Math.max(0, Math.min(1, s.leftTodayKzt / lim)), C = 2 * Math.PI * 22;
    return `<button class="fin-strip" data-go="finance">
        <span class="fs-ring"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" class="trk"/><circle cx="26" cy="26" r="22" class="val" style="stroke-dasharray:${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><i>${ic('bars')}</i></span>
        <span class="fs-txt"><small>Safe to spend today</small><b>${esc(kzt(s.leftTodayKzt))}</b><em>${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} to payday</em></span>
        ${n ? `<span class="fs-badge">${n} subscription${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} you</span>` : ic('right')}</button>`;
}
function maybeSubPrompt() {
    S.promptSeen = S.promptSeen || {};
    const b = S.brief; if (!b || !$('#overlay').hidden) return;
    const p = (b.pending || []).find(x => !S.promptSeen['c' + x.chargeId]);
    if (p) { S.promptSeen['c' + p.chargeId] = true; return openSubPrompt(p); }
    const d = (b.decisions || []).find(x => !S.promptSeen['d' + x.id]);
    if (d) { S.promptSeen['d' + d.id] = true; openSubDecision(d.id, d.name, d.brand); }
}
function openSubPrompt(p) {
    const a = p.account;
    openSheet(`<div class="sub-prompt">${brandBadge(p.name, p.brand, 'lg')}
        <h2>${esc(p.name)} will charge ${esc(kzt(p.amountKzt))} ${esc(dueWord(p.dueAt))}</h2>
        <p class="muted">${a ? `From ${esc(a.label)} · balance ${esc(money(a.balance, a.currency))}` : ''}</p>
        <div class="note">No answer = no payment. Nothing is charged unless you tap Pay.</div>
        <button class="btn" data-act="subPay" data-id="${p.chargeId}">Pay ${esc(kzt(p.amountKzt))}</button>
        <button class="btn ghost" data-act="subDecline" data-id="${p.chargeId}">Don't pay</button>
        <button class="link center" data-act="closeOverlay">Decide later</button></div>`);
}
function openSubDecision(id, name, brand) {
    openSheet(`<div class="sub-prompt">${brandBadge(name, brand, 'lg')}
        <h2>${esc(name)}: what next?</h2><p class="muted">This payment was skipped and nothing was charged. Choose what happens with the subscription:</p>
        <button class="dec" data-act="subDecide" data-id="${id}" data-c="freeze"><span class="dec-ic">${ic('snow')}</span><span><b>Freeze subscription</b><small>Pause it. We will not ask about it again until you resume it.</small></span></button>
        <button class="dec stop" data-act="subDecide" data-id="${id}" data-c="stop"><span class="dec-ic">${ic('close')}</span><span><b>Stop paying</b><small>You will not pay for ${esc(name)} any more and we stop asking about it.</small></span></button>
        <button class="link center" data-act="closeOverlay">Decide later</button></div>`);
}
actions.subPay = async (el) => {
    const r = await api('/api/pfm/subs/pay', { chargeId: el.dataset.id });
    if (!r.success) return toast(r.message, 'error');
    closeOverlay(); toast(r.message, 'success'); await finRefresh();
};
actions.subDecline = async (el) => {
    const r = await api('/api/pfm/subs/decline', { chargeId: el.dataset.id });
    if (!r.success) return toast(r.message, 'error');
    await refreshAll(); const s = ((S.brief && S.brief.decisions) || []).find(x => x.id === r.subId);
    if (S.promptSeen) S.promptSeen['d' + r.subId] = true;
    openSubDecision(r.subId, s ? s.name : 'Subscription', s ? s.brand : 'other'); if (loaders[S.view]) await loaders[S.view](S.params); render(true);
};
actions.subDecide = async (el) => {
    const r = await api('/api/pfm/subs/decide', { id: el.dataset.id, choice: el.dataset.c });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
};
actions.subResume = async (el) => { const r = await api('/api/pfm/subs/resume', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) await finRefresh(); };
actions.subRemove = async (el) => { const r = await api('/api/pfm/subs/remove', { id: el.dataset.id }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) await finRefresh(); };
actions.subSim = async (el) => {
    const r = await api('/api/pfm/subs/simulate', { id: el.dataset.id }); if (!r.success) return toast(r.message, 'error');
    await refreshAll(); if (loaders[S.view]) await loaders[S.view](S.params); render(true);
    const p = ((S.brief && S.brief.pending) || []).find(x => String(x.subId) === String(el.dataset.id)); if (p) { S.promptSeen = S.promptSeen || {}; S.promptSeen['c' + p.chargeId] = true; openSubPrompt(p); }
};
actions.subAsk = (el) => { const p = ((S.fin && S.fin.subs.pending) || []).find(x => String(x.chargeId) === String(el.dataset.id)); if (p) openSubPrompt(p); };
actions.subStopAsk = (el) => openSheet(`<h2>Stop paying?</h2><p class="muted" style="margin-bottom:14px">You will not pay for ${esc(el.dataset.name)} any more and we stop asking about it. You can freeze it instead and resume later.</p>
    <button class="btn danger" data-act="subDecide" data-id="${el.dataset.id}" data-c="stop">Yes, stop paying</button><button class="btn ghost" style="margin-top:10px" data-act="subDecide" data-id="${el.dataset.id}" data-c="freeze">Freeze instead</button>`);
actions.subTrack = async (el) => {
    const card = S.accounts.find(cardsOnly); if (!card) return toast('You need a card first', 'error');
    const r = await api('/api/pfm/subs/track', { key: el.dataset.key, fromAccount: card.account_number }); toast(r.message, r.success ? 'success' : 'error'); if (r.success) await finRefresh();
};
actions.subAddOpen = () => {
    const d = new Date(Date.now() + 864e5), min = new Date().toISOString().slice(0, 10);
    openSheet(`<h2>Add a subscription</h2><form data-form="subAdd">
        ${fld('Name', '<input name="name" maxlength="30" placeholder="Netflix, gym, cloud storage..." required>')}
        ${fld('Amount (₸)', '<input name="amount" type="number" inputmode="decimal" min="100" step="1" placeholder="3990" required>')}
        ${fld('Repeats', selectHtml('period', [['month', 'Every month'], ['week', 'Every week'], ['year', 'Every year']], 'month'))}
        ${fld('Next charge date', `<input name="nextDate" type="date" min="${min}" value="${d.toISOString().slice(0, 10)}" required>`)}
        ${fld('Pay from', accSel('from', cardsOnly))}<button class="btn" type="submit">Add</button></form>`);
};
forms.subAdd = (f) => busy(f, async () => {
    const r = await api('/api/pfm/subs/add', { name: val(f, 'name'), amount: val(f, 'amount'), period: val(f, 'period'), nextDate: val(f, 'nextDate'), fromAccount: val(f, 'from') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});

// ============================================================
// FINANCE screen
// ============================================================
views.finance = {
    html: (p) => {
        const tabn = (p && p.tab) || S.finTab || 'overview'; S.finTab = tabn;
        const f = S.fin; if (!f) return flow('Finance', empty('Loading...'));
        const tb = (id, label) => `<button class="${tabn === id ? 'on' : ''}" data-act="finTab" data-t="${id}">${label}</button>`;
        const badge = (f.subs.pending.length + f.subs.items.filter(s => s.status === 'decision').length);
        const body = tabn === 'subs' ? subsTab(f) : tabn === 'goals' ? goalsTab(f) : overviewTab(f);
        return flow('Finance', `<div class="seg s3">${tb('overview', 'Overview')}<button class="${tabn === 'subs' ? 'on' : ''}" data-act="finTab" data-t="subs">Subscriptions${badge ? `<em class="dotb">${badge}</em>` : ''}</button>${tb('goals', 'Goals')}</div>${body}`);
    }
};
actions.finTab = (el) => { S.finTab = el.dataset.t; go('finance', { tab: el.dataset.t }); };

// ---------- overview ----------
function safeCard(s) {
    const lim = Math.max(1, s.perDayKzt), left = Math.max(0, s.leftTodayKzt), frac = Math.min(1, left / lim), r = 56, C = 2 * Math.PI * r;
    const pill = (l, v) => `<span class="rs"><small>${l}</small><b>${esc(kzt(v))}</b></span>`;
    return `<div class="safe-card"><div class="safe-ring"><svg viewBox="0 0 140 140"><defs><linearGradient id="sgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5df0b4"/><stop offset="1" stop-color="#16b97c"/></linearGradient></defs>
            <circle cx="70" cy="70" r="${r}" class="trk"/><circle cx="70" cy="70" r="${r}" class="val" style="stroke-dasharray:${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"/></svg>
            <div class="mid"><small>left today</small><b>${esc(kzt(left))}</b></div></div>
        <div class="safe-info"><h3>Safe to spend</h3><p>${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} to ${s.usesSalary ? 'payday' : 'the end of the month'} (${esc(dShort(s.paydayMs))})</p>
            <p class="sm">Per day: <b>${esc(kzt(s.perDayKzt))}</b>${s.tomorrowKzt != null ? ` · tomorrow about <b>${esc(kzt(s.tomorrowKzt))}</b>` : ''}</p></div>
        <div class="reserve">${pill('Subscriptions', s.reserved.subs)}${pill('Loans', s.reserved.loans)}${pill('Goals', s.reserved.goals)}</div>
        <button class="link" data-act="safeHow">How is it calculated?</button></div>`;
}
actions.safeHow = () => { const s = S.fin.safe; openSheet(`<h2>How Safe-to-Spend works</h2>
    <div class="quote"><div><span>Money on your cards</span><span>${esc(kzt(s.spendableKzt))}</span></div><div><span>− Subscriptions due before payday</span><span>${esc(kzt(s.reserved.subs))}</span></div><div><span>− Loan payments this month</span><span>${esc(kzt(s.reserved.loans))}</span></div><div><span>− Needed for your goals this month</span><span>${esc(kzt(s.reserved.goals))}</span></div><div><span>÷ ${s.daysLeft} days to payday</span><span>${esc(kzt(s.perDayKzt))} / day</span></div></div>
    <p class="muted">Spend more today and tomorrow's limit shrinks smoothly. Spend less and it grows. Payday is detected from your last salary${s.usesSalary ? '' : ' (none found, so the end of the month is used)'}.</p>`); };
const insightCard = (i) => `<div class="ins tone-${i.tone}"><span class="ins-ic">${ic(i.icon || 'bars')}</span><div><b>${esc(i.title)}</b><p>${esc(i.text)}</p>
    ${i.action ? `<button class="link" data-go="${esc(i.action.go)}"${i.action.tab ? ` data-p="${esc(JSON.stringify({ tab: i.action.tab }))}"` : ''}>${esc(i.action.label)} →</button>` : ''}</div></div>`;

function smoothPath(pts) {
    if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]), cl = (y) => Math.max(lo, Math.min(hi, y));
        d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${cl(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${cl(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
}
function forecastChart(f) {
    const W = 360, H = 232, L = 46, Rr = 12, T = 18, B = 28, iw = W - L - Rr, ih = H - T - B;
    const all = [...f.actual, ...f.optimistic, ...f.critical].map(p => p.v);
    let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi - lo < 1) hi = lo + 1; hi += (hi - lo) * 0.06;
    const X = (d) => L + (d / f.days) * iw, Y = (v) => T + (1 - (v - lo) / (hi - lo)) * ih, pts = (a) => a.map(p => [X(p.d), Y(p.v)]);
    const A = pts(f.actual), O = pts(f.optimistic), Cc = pts(f.critical), base = Y(Math.max(lo, 0));
    const grid = [0, 1, 2, 3, 4].map(i => { const v = lo + (hi - lo) * i / 4, y = Y(v); return `<line x1="${L}" x2="${W - Rr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="gl"/><text x="${L - 6}" y="${(y + 4).toFixed(1)}" class="ax" text-anchor="end">${compact(v)}</text>`; }).join('');
    const xt = [1, 5, 10, 15, 20, 25, f.days].filter((v, i, a) => a.indexOf(v) === i).map(d => `<text x="${X(d).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${d}</text>`).join('');
    const area = `${smoothPath(A)} L${A[A.length - 1][0].toFixed(1)} ${base.toFixed(1)} L${A[0][0].toFixed(1)} ${base.toFixed(1)} Z`;
    const ev = f.events.map(e => {
        const p = f.critical.find(q => q.d === e.d) || f.optimistic.find(q => q.d === e.d); if (!p) return '';
        if (e.kind === 'salary') return `<g class="evt"><line x1="${X(e.d).toFixed(1)}" x2="${X(e.d).toFixed(1)}" y1="${T}" y2="${H - B}" class="sal-l"/><circle cx="${X(e.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="5" fill="#16b97c" stroke="#15161a" stroke-width="2"/><text x="${X(e.d).toFixed(1)}" y="${T - 4}" class="ax sal" text-anchor="middle">Salary</text></g>`;
        return `<circle cx="${X(e.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4.5" fill="${brandStyle(e.label, e.brand).c1}" stroke="#15161a" stroke-width="2"/>`;
    }).join('');
    const tx = X(f.day).toFixed(1), ty = Y(f.actual[f.actual.length - 1].v).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" class="fchart" role="img" aria-label="Balance forecast until the end of the month">
        <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa7ff" stop-opacity=".38"/><stop offset="1" stop-color="#7aa7ff" stop-opacity="0"/></linearGradient></defs>
        ${grid}${lo < 0 ? `<rect x="${L}" y="${Y(0).toFixed(1)}" width="${iw}" height="${(H - B - Y(0)).toFixed(1)}" fill="#ec3b32" opacity=".12"/><line x1="${L}" x2="${W - Rr}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#ec3b32" stroke-dasharray="4 4"/>` : ''}
        <path d="${area}" fill="url(#ga)" class="area"/>
        <path d="${smoothPath(Cc)}" pathLength="1" class="ln c"/><path d="${smoothPath(O)}" pathLength="1" class="ln o"/><path d="${smoothPath(A)}" pathLength="1" class="ln a"/>
        <line x1="${tx}" x2="${tx}" y1="${T}" y2="${H - B}" class="today"/>${ev}
        <circle cx="${tx}" cy="${ty}" r="6" fill="#7aa7ff" stroke="#15161a" stroke-width="2.5" class="pulse"/><text x="${tx}" y="${T - 5}" class="ax today-t" text-anchor="middle">Today</text>${xt}</svg>`;
}
function donut(sp) {
    const tot = sp.actual.needs + sp.actual.wants + sp.actual.savings, share = (k) => tot ? sp.actual[k] / tot * 100 : 0;
    const cols = { needs: '#6ea8ff', wants: '#ffb86b', savings: '#ff6bd6' }, lab = { needs: 'Needs', wants: 'Wants', savings: 'Savings' };
    const ring = (r, w, vals, cls) => { const C = 2 * Math.PI * r; let off = 0; return `<g class="${cls}">` + Object.keys(cols).map(k => { const len = C * vals[k] / 100, s = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${tot || cls === 'rec' ? cols[k] : '#2b2d34'}" stroke-width="${w}" stroke-dasharray="${Math.max(0, len - 2).toFixed(1)} ${(C - Math.max(0, len - 2)).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 80 80)"/>`; off += len; return s; }).join('') + '</g>'; };
    const rows = Object.keys(cols).map(k => `<div class="lg"><i style="background:${cols[k]}"></i><span class="lg-n">${lab[k]}<small>${esc(kzt(sp.actual[k]))}</small></span><span class="lg-v"><b>${Math.round(share(k))}%</b><small>target ${sp.recommended[k]}%</small></span></div>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 160 160" class="donut">${ring(66, 16, { needs: share('needs'), wants: share('wants'), savings: share('savings') }, 'act')}${ring(44, 9, sp.recommended, 'rec')}
        <text x="80" y="76" text-anchor="middle" class="d-small">last 30 days</text><text x="80" y="95" text-anchor="middle" class="d-big">${esc(compact(tot))} ₸</text></svg><div class="legend">${rows}</div></div>
        <p class="muted sm">Outer ring: where your money went. Inner ring: the 50/30/20 rule (needs / wants / savings).${sp.hasIncome ? ` Typical income: ${esc(kzt(sp.incomeKzt))}.` : ''} Savings count money you put into goals.</p>`;
}
function overviewTab(f) {
    const fc = f.forecast, now = new Date(), evs = fc.events.slice().sort((a, b) => a.d - b.d).map(e => `<span class="ev"><i style="background:${e.kind === 'salary' ? '#16b97c' : brandStyle(e.label, e.brand).c1}"></i>${esc(dShort(new Date(now.getFullYear(), now.getMonth(), e.d).getTime()))} · ${esc(e.label)} ${e.kind === 'salary' ? '+' : '−'}${esc(kzt(e.kzt))}</span>`).join('');
    return `${safeCard(f.safe)}
        <div class="sec-title"><h2>AI tips</h2></div>${f.insights.map(insightCard).join('') || empty('No tips yet')}
        <div class="sec-title"><h2>Balance forecast</h2></div>
        <div class="chart-card">${forecastChart(fc)}
            <div class="chips-l"><span><i style="background:#7aa7ff"></i>Actual</span><span><i style="background:#ff6ba6"></i>At current pace</span><span><i style="background:#3ddc97"></i>If you follow the tips</span></div>
            <div class="duo2"><div class="stat bad"><small>Month end, current pace</small><b>${esc(kzt(fc.endCritical))}</b></div><div class="stat good"><small>Month end, with tips</small><b>${esc(kzt(fc.endOptimistic))}</b></div></div>
            ${evs ? `<div class="evs">${evs}</div>` : ''}<p class="muted sm">An estimate from your own history, known subscriptions and your usual salary day.</p></div>
        <div class="sec-title"><h2>Where your money goes</h2></div><div class="chart-card">${donut(f.split)}</div>
        <button class="btn ghost" data-act="merchOpen">${ic('card')} Make a demo card purchase</button>
        <p class="muted sm center" style="margin-top:8px">Demo purchases show how categories, round-up and cashback react.</p>`;
}
actions.merchOpen = () => {
    const f = S.fin; if (!f) return;
    openSheet(`<h2>Demo card purchase</h2><form data-form="merchBuy"><input type="hidden" name="merchant" value="${esc(f.merchants[0].id)}">
        <div class="mchips">${f.merchants.map((m, i) => `<button type="button" class="mchip ${i ? '' : 'on'}" data-act="merchPick" data-id="${esc(m.id)}"><b>${esc(m.name)}</b><small>${esc(m.cat)}</small></button>`).join('')}</div>
        ${fld('Amount (₸)', '<input name="amount" type="number" inputmode="decimal" min="100" step="1" placeholder="1150" required>')}${fld('Pay with', accSel('from', cardsOnly))}
        <button class="btn" type="submit">Pay</button><p class="muted sm" style="margin-top:10px">Not a real payment: it only changes your demo balance.</p></form>`);
};
actions.merchPick = (el) => { $$('.mchip').forEach(b => b.classList.toggle('on', b === el)); $('form[data-form=merchBuy] [name=merchant]').value = el.dataset.id; };
forms.merchBuy = (f) => busy(f, async () => {
    const r = await api('/api/pfm/purchase', { merchant: val(f, 'merchant'), amount: val(f, 'amount'), fromAccount: val(f, 'from') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});

// ---------- subscriptions ----------
function subsTab(f) {
    const sb = f.subs, live = sb.items.filter(s => s.status === 'active' || s.status === 'decision'), tot = Math.max(1, sb.monthlyKzt);
    const monthly = (s) => s.period === 'year' ? s.amountKzt / 12 : s.period === 'week' ? s.amountKzt * 4.345 : s.amountKzt;
    const bar = live.length ? `<div class="sbar">${live.map(s => `<span style="flex:${Math.max(1, monthly(s) / tot * 100).toFixed(0)};background:${brandStyle(s.name, s.brand).c1}" title="${esc(s.name)}"></span>`).join('')}</div>` : '';
    const per = { month: '/ month', week: '/ week', year: '/ year' };
    const alerts = sb.pending.map(p => `<div class="sub-alert">${brandBadge(p.name, p.brand)}<div class="grow"><b>${esc(p.name)} · ${esc(kzt(p.amountKzt))}</b><small>Charge ${esc(dueWord(p.dueAt))}. Pay it?</small></div>
        <div class="two"><button class="btn sm" data-act="subPay" data-id="${p.chargeId}">Pay</button><button class="btn ghost sm" data-act="subDecline" data-id="${p.chargeId}">Don't pay</button></div></div>`).join('');
    const card = (s) => {
        const st = { active: ['active', ''], decision: ['skipped', 'wait'], frozen: ['frozen', 'ice'], cancelled: ['stopped', 'off'] }[s.status];
        const acts = s.status === 'active' ? `<button class="btn ghost sm" data-act="subDecide" data-id="${s.id}" data-c="freeze">${ic('snow')} Freeze</button><button class="btn ghost sm" data-act="subStopAsk" data-id="${s.id}" data-name="${esc(s.name)}">Stop</button><button class="btn ghost sm" data-act="subSim" data-id="${s.id}">Remind me now</button>`
            : s.status === 'frozen' ? `<button class="btn sm" data-act="subResume" data-id="${s.id}">Resume</button><button class="btn ghost sm" data-act="subStopAsk" data-id="${s.id}" data-name="${esc(s.name)}">Stop paying</button>`
            : s.status === 'decision' ? `<button class="btn ghost sm" data-act="subDecide" data-id="${s.id}" data-c="freeze">${ic('snow')} Freeze</button><button class="btn danger sm" data-act="subDecide" data-id="${s.id}" data-c="stop">Stop paying</button>`
            : `<button class="btn ghost sm" data-act="subRemove" data-id="${s.id}">${ic('trash')} Remove</button>`;
        return `<div class="sub-card st-${s.status}">${brandBadge(s.name, s.brand)}<div class="grow"><div class="sc-top"><b>${esc(s.name)}</b><span class="tag ${st[1]}">${st[0]}</span></div>
            <div class="amt">${esc(kzt(s.amountKzt))} <small>${per[s.period] || ''}</small></div>
            <div class="sm muted">${s.status === 'active' ? `Next: ${esc(dShort(s.nextDate))} · ${esc(dueWord(s.nextDate))}` : s.status === 'decision' ? 'Payment skipped: freeze it or stop paying' : s.status === 'frozen' ? 'No payments until you resume' : 'You do not pay for it any more'}${s.paidCount ? ` · paid ${s.paidCount}×` : ''}</div></div>
            <div class="sub-acts">${acts}</div></div>`;
    };
    const sug = sb.suggestions.length ? `<div class="sec-title"><h2>We found recurring payments</h2></div>${sb.suggestions.map(s => `<div class="sug">${brandBadge(s.name, 'other')}<div class="grow"><b>${esc(s.name)}</b><small>${esc(kzt(s.amountKzt))} every ${s.period} · seen ${s.count}×</small></div><button class="btn sm" data-act="subTrack" data-key="${esc(s.key)}">Track</button></div>`).join('')}` : '';
    return `<div class="subs-head"><small>Subscriptions cost</small><b>${esc(kzt(sb.monthlyKzt))} <em>/ month</em></b><span>${esc(kzt(sb.yearlyKzt))} a year · ${sb.activeCount} active</span>${bar}</div>
        <div class="note">Before each payment we ask you: <b>Pay</b> or <b>Don't pay</b>. If you don't pay, you choose: <b>freeze</b> the subscription or <b>stop paying</b>. No answer = no payment.</div>
        ${alerts}${sb.items.map(card).join('') || empty('No subscriptions yet')}${sug}
        <button class="btn" data-act="subAddOpen">${ic('plus')} Add a subscription</button>`;
}

// ---------- goals ----------
function goalCard(g) {
    const done = g.status === 'done';
    return `<div class="goal-card ${done ? 'done' : ''}"><div class="gh"><b>${esc(g.name)}</b>${done ? '<span class="tag">reached</span>' : ''}</div>
        <div class="gtags">${g.roundup ? '<span class="gt">Round-up on</span>' : ''}${g.cbToGoal ? '<span class="gt">Cashback → goal</span>' : ''}</div>
        <div class="road"><div class="road-fill" style="--w:${g.pct}%"></div><span class="mile" style="left:25%"></span><span class="mile" style="left:50%"></span><span class="mile" style="left:75%"></span>
            <span class="road-car" style="--w:${g.pct}%">${ic(KIND_ICON[g.kind] || 'star')}</span><span class="road-end">${ic('star')}</span></div>
        <div class="gnums"><b>${esc(kzt(g.savedKzt))}</b><span>of ${esc(kzt(g.targetKzt))} · ${g.pct}%</span></div>
        ${!done && g.monthlyNeedKzt != null ? `<p class="sm muted">Save <b>${esc(kzt(g.monthlyNeedKzt))}</b> a month to reach it by ${esc(dShort(g.deadline))} (${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'}).</p>` : ''}
        <div class="sub-acts">${done ? '' : `<button class="btn sm" data-act="goalAdd" data-id="${g.id}">Add money</button>`}<button class="btn ghost sm" data-act="goalWithdraw" data-id="${g.id}">Withdraw</button><button class="btn ghost sm" data-act="goalSettings" data-id="${g.id}">Settings</button></div></div>`;
}
function goalsTab(f) {
    return `<div class="note"><b>Round-up:</b> a purchase of 1 150 ₸ is rounded to ${esc(String(f.step))} ₸ steps: 1 200 ₸ leaves your card and the 50 ₸ difference goes to your goal. <b>Cashback → goal</b> sends new cashback there too.</div>
        ${f.goals.map(goalCard).join('') || empty('No goals yet. Create the first one.')}
        <button class="btn" data-act="goalNew">${ic('plus')} New goal</button>`;
}
const goalById = (id) => ((S.fin && S.fin.goals) || []).find(g => String(g.id) === String(id));
actions.goalNew = () => openSheet(`<h2>New goal</h2><form data-form="goalNew">${fld('Name', '<input name="name" maxlength="30" placeholder="Vacation, new phone, car..." required>')}
    ${fld('What is it?', selectHtml('kind', Object.entries(KIND_NAME), 'trip'))}${fld('Goal amount (₸)', '<input name="target" type="number" inputmode="decimal" min="1000" step="1" placeholder="600000" required>')}
    ${fld('Target date (optional)', `<input name="deadline" type="date" min="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}">`)}<button class="btn" type="submit">Create goal</button></form>`);
forms.goalNew = (f) => busy(f, async () => {
    const r = await api('/api/pfm/goals/create', { name: val(f, 'name'), kind: val(f, 'kind'), target: val(f, 'target'), deadline: val(f, 'deadline') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});
actions.goalAdd = (el) => { const g = goalById(el.dataset.id); if (!g) return; openSheet(`<h2>Add to “${esc(g.name)}”</h2><form data-form="goalAdd" data-id="${g.id}">${fld('Amount (₸)', '<input name="amount" type="number" inputmode="decimal" min="100" step="1" placeholder="10000" required>')}${fld('From', accSel('from', cardsOnly))}<button class="btn" type="submit">Add</button></form>`); };
forms.goalAdd = (f) => busy(f, async () => {
    const r = await api('/api/pfm/goals/deposit', { id: f.dataset.id, amount: val(f, 'amount'), fromAccount: val(f, 'from') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});
actions.goalWithdraw = (el) => { const g = goalById(el.dataset.id); if (!g) return; openSheet(`<h2>Withdraw from “${esc(g.name)}”</h2><p class="muted" style="margin-bottom:12px">Saved: ${esc(kzt(g.savedKzt))}</p><form data-form="goalWithdraw" data-id="${g.id}">${fld('Amount (₸)', `<input name="amount" type="number" inputmode="decimal" min="1" max="${g.savedKzt}" step="1" placeholder="5000" required>`)}${fld('To', accSel('to', cardsOnly))}<button class="btn" type="submit">Withdraw</button></form>`); };
forms.goalWithdraw = (f) => busy(f, async () => {
    const r = await api('/api/pfm/goals/withdraw', { id: f.dataset.id, amount: val(f, 'amount'), toAccount: val(f, 'to') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});
actions.goalSettings = (el) => {
    const g = goalById(el.dataset.id); if (!g) return; const m = g.monthsLeft || 12, left = Math.max(0, g.targetKzt - g.savedKzt);
    openSheet(`<h2>${esc(g.name)}</h2>
        <button class="toggle ${g.roundup ? 'on' : ''}" data-act="goalToggle" data-id="${g.id}" data-k="roundup" ${g.status === 'done' ? 'disabled' : ''}><span><b>Round-up</b><small>Change from every purchase goes to this goal</small></span><i></i></button>
        <button class="toggle ${g.cbToGoal ? 'on' : ''}" data-act="goalToggle" data-id="${g.id}" data-k="cbToGoal" ${g.status === 'done' ? 'disabled' : ''}><span><b>Cashback to this goal</b><small>New cashback is added here automatically</small></span><i></i></button>
        <div class="calc"><label>How fast do you want to get there? <b id="calcM">${m}</b> month${m === 1 ? '' : 's'}</label><input type="range" min="1" max="36" value="${m}" data-calc data-left="${left}">
            <div class="calc-out">Save <b id="calcV">${esc(kzt(Math.ceil(left / m)))}</b> a month</div></div>
        ${g.log.length ? `<h3 class="sh">Recent activity</h3>${g.log.map(l => `<div class="lrow"><span>${esc(l.kind === 'roundup' ? 'Round-up' : l.kind === 'cashback' ? 'Cashback' : l.kind === 'withdraw' ? 'Withdrawal' : 'Deposit')}</span><b style="color:${l.amount < 0 ? 'var(--red)' : 'var(--green)'}">${l.amount < 0 ? '−' : '+'}${esc(kzt(Math.abs(l.amount)))}</b></div>`).join('')}` : ''}
        <button class="btn danger" style="margin-top:14px" data-act="goalDeleteAsk" data-id="${g.id}">Delete goal</button>`);
};
document.addEventListener('input', (e) => {
    const r = e.target; if (!r.matches || !r.matches('[data-calc]')) return;
    const m = Number(r.value), left = Number(r.dataset.left); $('#calcM').textContent = m; $('#calcV').textContent = kzt(Math.ceil(left / m));
});
actions.goalToggle = async (el) => {
    const g = goalById(el.dataset.id); if (!g) return; const k = el.dataset.k, on = !el.classList.contains('on');
    const r = await api('/api/pfm/goals/settings', { id: g.id, [k]: on }); toast(r.message, r.success ? 'success' : 'error');
    if (r.success) { await finRefresh(); actions.goalSettings({ dataset: { id: g.id } }); }
};
actions.goalDeleteAsk = (el) => { const g = goalById(el.dataset.id); if (!g) return; openSheet(`<h2>Delete “${esc(g.name)}”?</h2><form data-form="goalDelete" data-id="${g.id}">${g.savedKzt > 0 ? `<p class="muted" style="margin-bottom:12px">Your ${esc(kzt(g.savedKzt))} returns to the card you choose.</p>${fld('Return to', accSel('to', cardsOnly))}` : ''}<button class="btn danger" type="submit">Delete</button></form>`); };
forms.goalDelete = (f) => busy(f, async () => {
    const r = await api('/api/pfm/goals/delete', { id: f.dataset.id, toAccount: val(f, 'to') });
    toast(r.message, r.success ? 'success' : 'error'); if (r.success) { closeOverlay(); await finRefresh(); }
});
