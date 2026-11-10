// ============================================================
// pfm.js  -  "Finance": personal finance management with a rule-based AI helper
//   * subscription tracker with a "pay / don't pay" question BEFORE each charge
//     (don't pay -> freeze the subscription or stop paying for it)
//   * Safe-to-Spend (how much you can spend today without missing a payment)
//   * AI tips (pace by category, subscription cost, month-end forecast)
//   * predictive balance chart, 50/30/20 budget split
//   * Smart Goals: round-up, cashback-to-goal, savings calculator
//   * demo card purchases + a realistic demo history for demo@bcc.kz
// Everything is computed from the customer's real data in the database.
// ============================================================

module.exports = function install(k) {
    const { db, cfg, logger, R, tx: dbtx, fail, toKzt, round2, cents, convert, fmtMoney, insertTx, getOwnAccount, accLabel,
        notify, spendable, debit, credit, earnCashback, INCOME_TYPES, CATEGORY_OF, parseAmount, hooks } = k;

    const P = Object.assign({ remindHours: 24, roundUpStep: 100, maxSubs: 20, maxGoals: 5 }, cfg.PFM || {});
    const DAY = 864e5;

    // ---------- tables ----------
    db.exec(`
        CREATE TABLE IF NOT EXISTS sub_trackers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, brand TEXT, amount REAL NOT NULL, period TEXT DEFAULT 'month', next_date INTEGER NOT NULL, account_number TEXT, status TEXT DEFAULT 'active', paid_count INTEGER DEFAULT 0, last_paid_at INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sub_charges (id INTEGER PRIMARY KEY AUTOINCREMENT, sub_id INTEGER NOT NULL, user_id INTEGER NOT NULL, due_at INTEGER NOT NULL, amount REAL NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, decided_at DATETIME);
        CREATE TABLE IF NOT EXISTS pfm_goals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT DEFAULT 'other', target REAL NOT NULL, saved REAL DEFAULT 0, deadline INTEGER, roundup INTEGER DEFAULT 0, cb_to_goal INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS pfm_goal_log (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount REAL NOT NULL, kind TEXT, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS pfm_seeded (user_id INTEGER PRIMARY KEY);
    `);

    // new operation types: make them part of the existing money logic
    ['goal_withdraw'].forEach(t => { if (!INCOME_TYPES.includes(t)) INCOME_TYPES.push(t); });
    Object.assign(CATEGORY_OF, { purchase: 'Purchases', subscription_payment: 'Subscriptions', goal_deposit: 'Goals' });

    // ---------- time helpers ----------
    const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const dim = (y, m) => new Date(y, m + 1, 0).getDate();
    const tms = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
    const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    function addPeriod(ms, period, dir = 1) {
        const d = new Date(ms);
        if (period === 'week') { d.setDate(d.getDate() + 7 * dir); return d.getTime(); }
        const day = d.getDate(); d.setDate(1);
        if (period === 'year') d.setFullYear(d.getFullYear() + dir); else d.setMonth(d.getMonth() + dir);
        d.setDate(Math.min(day, dim(d.getFullYear(), d.getMonth())));
        return d.getTime();
    }
    const at10 = (ms) => { const d = new Date(ms); d.setHours(10, 0, 0, 0); return d.getTime(); };
    const clean = (s, n = 40) => String(s == null ? '' : s).replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    const kzt = (n) => fmtMoney(Math.round(n), 'KZT');

    // ---------- categories ----------
    const CAT_LABEL = { groceries: 'Groceries', bills: 'Bills & utilities', transport: 'Transport & taxi', health: 'Health', loans: 'Loans', insurance: 'Insurance', taxes: 'Taxes & fines',
        cafes: 'Cafes & restaurants', shopping: 'Shopping', fun: 'Entertainment', subscriptions: 'Subscriptions', other: 'Other', goals: 'Goals', deposits: 'Deposits', invest: 'Investments', transfers: 'Transfers' };
    const BUCKET = { needs: ['groceries', 'bills', 'transport', 'health', 'loans', 'insurance', 'taxes'], wants: ['cafes', 'shopping', 'fun', 'subscriptions', 'other'], savings: ['goals'] };
    const VARIABLE = new Set(['groceries', 'transport', 'cafes', 'shopping', 'fun', 'health', 'other']); // day-to-day spending
    function catOf(type, d) {
        switch (type) {
            case 'purchase': return CAT_LABEL[d.cat] ? d.cat : 'other';
            case 'subscription_payment': return 'subscriptions';
            case 'bill_payment': { const c = String(d.category || '').toLowerCase(); return c === 'subscription' ? 'subscriptions' : c === 'transport' ? 'transport' : c === 'entertainment' ? 'fun' : c === 'insurance' ? 'insurance' : 'bills'; }
            case 'loan_payment': return 'loans';
            case 'insurance_purchase': return 'insurance';
            case 'tax_payment': return 'taxes';
            case 'goal_deposit': return 'goals';
            case 'deposit_open': return 'deposits';
            case 'invest_buy': return 'invest';
            case 'transfer_out': case 'domestic_out': case 'international_out': case 'crypto_out': return 'transfers';
            default: return 'other';
        }
    }
    function readTx(uid, sinceMs) {
        return db.prepare("SELECT * FROM transactions WHERE user_id = ? AND status != 'rejected' AND transaction_date >= ? ORDER BY transaction_date").all(uid, iso(sinceMs)).map(t => {
            let d = {}; try { d = t.details ? JSON.parse(t.details) : {}; } catch (e) { d = {}; }
            const inc = INCOME_TYPES.includes(t.transaction_type), own = t.transaction_type === 'transfer_out' && d.method === 'own';
            return { id: t.id, type: t.transaction_type, ms: tms(t.transaction_date), kzt: toKzt(t.amount, t.currency), inc, own, d, desc: t.description, cat: inc || own ? null : catOf(t.transaction_type, d) };
        });
    }
    const monthStartMs = (off) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + off, 1).getTime(); };
    function catTotals(rows, fromMs, toMs) {
        const out = {}; rows.forEach(r => { if (r.cat && r.cat !== 'transfers' && r.ms >= fromMs && r.ms < toMs) out[r.cat] = (out[r.cat] || 0) + r.kzt; });
        return out;
    }

    // ---------- money helpers ----------
    const cardAccounts = (uid) => db.prepare("SELECT * FROM accounts WHERE user_id = ? AND account_type = 'card' AND is_active = 1 ORDER BY id").all(uid);
    const cardsTotalKzt = (uid) => cardAccounts(uid).reduce((s, a) => s + toKzt(a.balance, a.currency), 0);
    function paydayInfo(uid) {
        const rows = db.prepare("SELECT transaction_date, details FROM transactions WHERE user_id = ? AND transaction_type = 'transfer_in' AND details LIKE '%\"salary\":true%' ORDER BY transaction_date DESC LIMIT 1").all(uid);
        return rows.length ? new Date(tms(rows[0].transaction_date)).getDate() : 0;
    }
    function nextPaydayMs(uid, nowMs) {
        const day0 = startOfDay(nowMs), sd = paydayInfo(uid), d = new Date(day0);
        if (!sd) return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
        let c = new Date(d.getFullYear(), d.getMonth(), Math.min(sd, dim(d.getFullYear(), d.getMonth()))).getTime();
        if (c <= day0) c = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(sd, dim(d.getFullYear(), d.getMonth() + 1))).getTime();
        return c;
    }
    function typicalIncome(uid) {
        const rows = readTx(uid, Date.now() - 95 * DAY), sal = rows.filter(r => r.inc && r.d.salary), pool = sal.length ? sal : rows.filter(r => r.inc && ['transfer_in', 'top_up'].includes(r.type));
        const sum = pool.reduce((s, r) => s + r.kzt, 0); return sal.length ? sum / Math.max(1, Math.min(3, sal.length)) : sum / 3;
    }
    const brandOf = (name) => { const n = String(name).toLowerCase(); return /netflix/.test(n) ? 'netflix' : /yandex|яндекс/.test(n) ? 'yandex' : /spotify/.test(n) ? 'spotify' : /icloud|apple/.test(n) ? 'apple' : /youtube/.test(n) ? 'youtube' : 'other'; };

    // ============================================================
    // SUBSCRIPTIONS
    // ============================================================
    const subView = (s) => ({ id: s.id, name: s.name, brand: s.brand, amountKzt: s.amount, period: s.period, nextDate: s.next_date, status: s.status, paidCount: s.paid_count, accountNumber: s.account_number,
        daysLeft: Math.ceil((s.next_date - startOfDay(Date.now())) / DAY) });
    const whenWord = (due) => { const n = Math.round((startOfDay(due) - startOfDay(Date.now())) / DAY); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `on ${new Date(due).toISOString().slice(0, 10)}`; };

    // creates the "pay or not?" question for every active subscription that is due soon
    function subsTick(uid) {
        const rows = db.prepare("SELECT * FROM sub_trackers WHERE status = 'active' AND next_date <= ?" + (uid ? ' AND user_id = ?' : '')).all(...[Date.now() + P.remindHours * 3600e3].concat(uid ? [uid] : []));
        rows.forEach(s => {
            if (db.prepare("SELECT 1 FROM sub_charges WHERE sub_id = ? AND status = 'pending'").get(s.id)) return;
            const id = db.prepare('INSERT INTO sub_charges (sub_id, user_id, due_at, amount) VALUES (?, ?, ?, ?)').run(s.id, s.user_id, s.next_date, s.amount).lastInsertRowid;
            notify(s.user_id, 'subscription', `${s.name}: payment due ${whenWord(s.next_date)}`,
                `${kzt(s.amount)} would be charged for ${s.name}. Open the app to pay it or skip it. Nothing is charged without your answer.`, { open: 'finance', tab: 'subs', chargeId: id, subId: s.id });
            logger.info('SUBSCRIPTION REMINDER', { userId: s.user_id, subId: s.id, chargeId: id });
        });
    }
    setInterval(() => { try { subsTick(); } catch (e) { logger.error(`SUBS TICK ERROR: ${e.message}`); } }, 15000);

    function pendingFor(uid) {
        return db.prepare("SELECT c.id chargeId, c.due_at dueAt, c.amount amountKzt, s.id subId, s.name, s.brand, s.account_number accountNumber, s.period FROM sub_charges c JOIN sub_trackers s ON s.id = c.sub_id WHERE c.user_id = ? AND c.status = 'pending' AND s.status = 'active' ORDER BY c.due_at").all(uid)
            .map(p => { const a = getOwnAccount(uid, p.accountNumber); return { ...p, account: a ? { label: accLabel(a), balance: a.balance, currency: a.currency, frozen: !!a.frozen } : null }; });
    }
    const ownSub = (uid, id) => { const s = db.prepare('SELECT * FROM sub_trackers WHERE id = ? AND user_id = ?').get(parseInt(id, 10), uid); if (!s) fail('Subscription not found'); return s; };
    const closeOpenCharges = (subId, status) => db.prepare("UPDATE sub_charges SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE sub_id = ? AND status = 'pending'").run(status, subId);

    // recurring payments found in the history (same merchant, same amount, about a month apart)
    function suggestions(uid) {
        const tracked = new Set(db.prepare('SELECT name FROM sub_trackers WHERE user_id = ?').all(uid).map(r => r.name.toLowerCase()));
        const groups = {};
        readTx(uid, Date.now() - 400 * DAY).forEach(r => {
            if (!((r.type === 'purchase' && ['other', 'fun'].includes(r.cat)) || (r.type === 'bill_payment' && /entertainment|internet/i.test(r.d.category || '')))) return;
            const name = clean(r.d.merchant || r.d.provider || '', 40); if (!name) return;
            (groups[name.toLowerCase()] = groups[name.toLowerCase()] || { name, rows: [] }).rows.push(r);
        });
        const out = [];
        Object.entries(groups).forEach(([key, g]) => {
            if (tracked.has(key) || g.rows.length < 2) return;
            const amounts = g.rows.map(r => r.kzt).sort((a, b) => a - b), med = amounts[Math.floor(amounts.length / 2)];
            if (amounts.some(a => Math.abs(a - med) > med * 0.05)) return;
            const gaps = g.rows.slice(1).map((r, i) => (r.ms - g.rows[i].ms) / DAY), avg = gaps.reduce((s, x) => s + x, 0) / gaps.length;
            const period = avg >= 26 && avg <= 35 ? 'month' : avg >= 350 && avg <= 380 ? 'year' : null; if (!period) return;
            const last = g.rows[g.rows.length - 1].ms;
            out.push({ key: key.replace(/[^a-z0-9а-я]+/gi, '-'), name: g.name, amountKzt: Math.round(med), period, lastAt: last, nextDate: at10(addPeriod(last, period)), count: g.rows.length });
        });
        return out;
    }
    function createSub(uid, name, amount, period, nextMs, accountNumber) {
        if (db.prepare('SELECT COUNT(*) n FROM sub_trackers WHERE user_id = ? AND status != ?').get(uid, 'cancelled').n >= P.maxSubs) fail(`You can track up to ${P.maxSubs} subscriptions`);
        if (db.prepare("SELECT 1 FROM sub_trackers WHERE user_id = ? AND lower(name) = lower(?) AND status != 'cancelled'").get(uid, name)) fail(`${name} is already in your list`);
        const a = getOwnAccount(uid, accountNumber); if (!a || a.account_type !== 'card') fail('Choose a card to pay from');
        const id = db.prepare('INSERT INTO sub_trackers (user_id, name, brand, amount, period, next_date, account_number) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, name, brandOf(name), amount, period, nextMs, a.account_number).lastInsertRowid;
        subsTick(uid); return id;
    }

    R('get', '/api/pfm/subs', (req, uid) => { subsTick(uid); return subsPayload(uid); });
    function subsPayload(uid) {
        const rows = db.prepare('SELECT * FROM sub_trackers WHERE user_id = ? ORDER BY CASE status WHEN \'decision\' THEN 0 WHEN \'active\' THEN 1 WHEN \'frozen\' THEN 2 ELSE 3 END, next_date').all(uid);
        const active = rows.filter(s => s.status === 'active' || s.status === 'decision');
        const monthly = active.reduce((s, x) => s + (x.period === 'year' ? x.amount / 12 : x.period === 'week' ? x.amount * 4.345 : x.amount), 0);
        return { items: rows.map(subView), pending: pendingFor(uid), suggestions: suggestions(uid), monthlyKzt: Math.round(monthly), yearlyKzt: Math.round(monthly * 12), activeCount: active.length };
    }
    R('post', '/api/pfm/subs/add', (req, uid) => {
        const name = clean(req.body.name, 30); if (name.length < 2) fail('Enter the name of the subscription');
        const amount = parseAmount(req.body.amount); if (amount === null || amount < 100 || amount > 1000000) fail('Amount must be between 100 ₸ and 1 000 000 ₸');
        const period = ['month', 'week', 'year'].includes(req.body.period) ? req.body.period : 'month';
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body.nextDate || '')); if (!m) fail('Choose the next charge date');
        const next = at10(new Date(+m[1], +m[2] - 1, +m[3]).getTime());
        if (isNaN(next) || next < startOfDay(Date.now()) || next > Date.now() + 400 * DAY) fail('The next charge date must be within the next 13 months');
        createSub(uid, name, amount, period, next, req.body.fromAccount);
        return { message: `${name} added` };
    });
    R('post', '/api/pfm/subs/track', (req, uid) => {
        const sg = suggestions(uid).find(s => s.key === String(req.body.key)); if (!sg) fail('This suggestion is no longer available');
        let next = sg.nextDate; while (next < Date.now()) next = at10(addPeriod(next, sg.period));
        createSub(uid, sg.name, sg.amountKzt, sg.period, next, req.body.fromAccount);
        return { message: `${sg.name} is now tracked` };
    });
    R('post', '/api/pfm/subs/pay', (req, uid) => dbtx(() => {
        const ch = db.prepare('SELECT * FROM sub_charges WHERE id = ? AND user_id = ?').get(parseInt(req.body.chargeId, 10), uid);
        if (!ch || ch.status !== 'pending') fail('This payment is no longer waiting for your answer');
        const s = db.prepare('SELECT * FROM sub_trackers WHERE id = ?').get(ch.sub_id); if (!s || s.status !== 'active') fail('This subscription is not active');
        const a = spendable(uid, req.body.fromAccount || s.account_number); if (a.account_type !== 'card') fail('Choose a card to pay from');
        const cost = convert(ch.amount, 'KZT', a.currency); debit(a, cost);
        insertTx(uid, 'subscription_payment', cost, a.currency, accLabel(a), s.name, `Subscription: ${s.name}`, 'completed', { provider: s.name, sub: s.id, amountKzt: ch.amount, period: s.period });
        db.prepare("UPDATE sub_charges SET status = 'paid', decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(ch.id);
        const next = addPeriod(s.next_date, s.period);
        db.prepare('UPDATE sub_trackers SET next_date = ?, paid_count = paid_count + 1, last_paid_at = ?, account_number = ? WHERE id = ?').run(next, Date.now(), a.account_number, s.id);
        return { message: `${s.name}: ${kzt(ch.amount)} paid`, nextDate: next };
    })());
    R('post', '/api/pfm/subs/decline', (req, uid) => dbtx(() => {
        const ch = db.prepare('SELECT * FROM sub_charges WHERE id = ? AND user_id = ?').get(parseInt(req.body.chargeId, 10), uid);
        if (!ch || ch.status !== 'pending') fail('This payment is no longer waiting for your answer');
        db.prepare("UPDATE sub_charges SET status = 'declined', decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(ch.id);
        db.prepare("UPDATE sub_trackers SET status = 'decision' WHERE id = ? AND user_id = ?").run(ch.sub_id, uid);
        return { message: 'Nothing was charged', subId: ch.sub_id };
    })());
    R('post', '/api/pfm/subs/decide', (req, uid) => dbtx(() => {
        const s = ownSub(uid, req.body.id), choice = req.body.choice;
        if (choice === 'freeze') {
            if (!['active', 'decision'].includes(s.status)) fail('Only an active subscription can be frozen');
            db.prepare("UPDATE sub_trackers SET status = 'frozen' WHERE id = ?").run(s.id); closeOpenCharges(s.id, 'expired');
            notify(uid, 'subscription', `${s.name} is frozen`, 'We will not ask you to pay for it until you resume it.');
            return { message: `${s.name} frozen. You can resume it any time.` };
        }
        if (choice === 'stop') {
            if (s.status === 'cancelled') fail('Already stopped');
            db.prepare("UPDATE sub_trackers SET status = 'cancelled' WHERE id = ?").run(s.id); closeOpenCharges(s.id, 'expired');
            notify(uid, 'subscription', `${s.name}: payments stopped`, 'We will no longer ask you to pay for it. (In production the bank also blocks this merchant on your card.)');
            return { message: `You will not pay for ${s.name} any more` };
        }
        fail('Choose: freeze or stop');
    })());
    R('post', '/api/pfm/subs/resume', (req, uid) => {
        const s = ownSub(uid, req.body.id); if (s.status !== 'frozen') fail('Only a frozen subscription can be resumed');
        let next = s.next_date; while (next < Date.now()) next = addPeriod(next, s.period);
        db.prepare("UPDATE sub_trackers SET status = 'active', next_date = ? WHERE id = ?").run(next, s.id);
        return { message: `${s.name} resumed. We will ask you before the next payment.` };
    });
    R('post', '/api/pfm/subs/remove', (req, uid) => { const s = ownSub(uid, req.body.id); if (s.status !== 'cancelled') fail('Stop the subscription first'); db.prepare('DELETE FROM sub_trackers WHERE id = ?').run(s.id); return { message: 'Removed from the list' }; });
    R('post', '/api/pfm/subs/simulate', (req, uid) => {
        const s = ownSub(uid, req.body.id); if (s.status !== 'active') fail('Only an active subscription can send a reminder');
        const soon = Date.now() + 20 * 3600e3; if (s.next_date > soon) db.prepare('UPDATE sub_trackers SET next_date = ? WHERE id = ?').run(soon, s.id);
        subsTick(uid); return { message: 'Reminder sent. Check your messages.' };
    });

    // ============================================================
    // SAFE-TO-SPEND, FORECAST, SPLIT, INSIGHTS
    // ============================================================
    function safeToSpend(uid) {
        const now = Date.now(), day0 = startOfDay(now), end = nextPaydayMs(uid, now), daysLeft = Math.max(1, Math.round((end - day0) / DAY));
        const spendableKzt = cardsTotalKzt(uid);
        const subs = db.prepare("SELECT * FROM sub_trackers WHERE user_id = ? AND status = 'active' AND next_date < ?").all(uid, end).reduce((s, x) => s + x.amount, 0);
        const monthStart = monthStartMs(0), paidLoans = new Set(readTx(uid, monthStart).filter(r => r.type === 'loan_payment').map(r => r.d.loanId));
        const loans = db.prepare("SELECT id, monthly FROM loans WHERE user_id = ? AND status = 'active'").all(uid).filter(l => !paidLoans.has(l.id)).reduce((s, l) => s + l.monthly, 0);
        let goals = 0;
        db.prepare("SELECT * FROM pfm_goals WHERE user_id = ? AND status = 'active' AND deadline IS NOT NULL").all(uid).forEach(g => {
            const need = Math.max(0, g.target - g.saved) / Math.max(1, Math.ceil((g.deadline - now) / (30.44 * DAY)));
            const done = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM pfm_goal_log WHERE goal_id = ? AND amount > 0 AND created_at >= ?").get(g.id, iso(monthStart)).s;
            goals += Math.max(0, need - done);
        });
        const reservedTotal = subs + loans + goals;
        const todaySpent = readTx(uid, day0).filter(r => r.cat && VARIABLE.has(r.cat)).reduce((s, r) => s + r.kzt, 0);
        const perDayStart = Math.max(0, (spendableKzt + todaySpent - reservedTotal) / daysLeft);
        const leftToday = Math.max(0, perDayStart - todaySpent);
        const tomorrow = daysLeft > 1 ? Math.max(0, (spendableKzt - reservedTotal) / (daysLeft - 1)) : null;
        return { spendableKzt: Math.round(spendableKzt), reserved: { subs: Math.round(subs), loans: Math.round(loans), goals: Math.round(goals), total: Math.round(reservedTotal) }, daysLeft, paydayMs: end, usesSalary: paydayInfo(uid) > 0,
            perDayKzt: Math.round(perDayStart), todaySpentKzt: Math.round(todaySpent), leftTodayKzt: Math.round(leftToday), tomorrowKzt: tomorrow === null ? null : Math.round(tomorrow) };
    }

    function forecast(uid) {
        const now = new Date(), y = now.getFullYear(), m = now.getMonth(), day = now.getDate(), D = dim(y, m), day0 = startOfDay(now.getTime());
        const rows = readTx(uid, monthStartMs(-3)), cur = cardsTotalKzt(uid), mStart = monthStartMs(0);
        const inc = Array(D + 2).fill(0), exp = Array(D + 2).fill(0);
        rows.filter(r => r.ms >= mStart).forEach(r => { const d = new Date(r.ms).getDate(); if (r.inc) inc[d] += r.kzt; else if (!r.own) exp[d] += r.kzt; });
        const bal = Array(D + 1).fill(0); bal[day] = cur; for (let d = day; d >= 1; d--) bal[d - 1] = bal[d] - inc[d] + exp[d];
        const actual = []; for (let d = 0; d <= day; d++) actual.push({ d, v: Math.round(bal[d]) });
        const varPast = rows.filter(r => r.ms >= mStart && r.ms < day0 && r.cat && VARIABLE.has(r.cat)).reduce((s, r) => s + r.kzt, 0), paceNow = varPast / Math.max(1, day - 1);
        let prevVar = 0; for (let o = -3; o <= -1; o++) { const t = catTotals(rows, monthStartMs(o), monthStartMs(o + 1)); prevVar += Object.entries(t).filter(([c]) => VARIABLE.has(c)).reduce((s, [, v]) => s + v, 0); }
        const usual = prevVar / (3 * 30.44), basis = usual || paceNow;
        const pCrit = Math.max(paceNow, usual) || basis, pOpt = Math.min(paceNow || basis, basis) * 0.75;
        const events = [], subAt = Array(D + 2).fill(0);
        db.prepare("SELECT * FROM sub_trackers WHERE user_id = ? AND status = 'active'").all(uid).forEach(s => {
            const dt = new Date(s.next_date); if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() > day) { subAt[dt.getDate()] += s.amount; events.push({ d: dt.getDate(), kind: 'sub', label: s.name, brand: s.brand, kzt: Math.round(s.amount) }); }
        });
        const sd = paydayInfo(uid), income = typicalIncome(uid), salaryDay = sd ? Math.min(sd, D) : 0, salaryAt = salaryDay > day && income > 0 ? salaryDay : 0;
        if (salaryAt) events.push({ d: salaryAt, kind: 'salary', label: 'Salary', kzt: Math.round(income) });
        const run = (pace) => { const out = [{ d: day, v: Math.round(cur) }]; let v = cur; for (let d = day + 1; d <= D; d++) { v = v - pace - subAt[d] + (d === salaryAt ? income : 0); out.push({ d, v: Math.round(v) }); } return out; };
        const optimistic = run(pOpt), critical = run(pCrit), out0 = critical.find(p => p.v < 0);
        return { day, days: D, actual, optimistic, critical, events, endCritical: critical[critical.length - 1].v, endOptimistic: optimistic[optimistic.length - 1].v, runsOutDay: out0 ? out0.d : null,
            paceNowKzt: Math.round(paceNow), usualPaceKzt: Math.round(usual) };
    }

    function split(uid) {
        const rows = readTx(uid, Date.now() - 31 * DAY), cut = Date.now() - 30 * DAY, sums = { needs: 0, wants: 0, savings: 0 };
        rows.filter(r => r.cat && r.ms >= cut).forEach(r => { for (const b of Object.keys(BUCKET)) if (BUCKET[b].includes(r.cat)) sums[b] += r.kzt; });
        const income = typicalIncome(uid), base = income || (sums.needs + sums.wants + sums.savings) || 1;
        const pct = (v) => Math.round(v / base * 100);
        return { incomeKzt: Math.round(income), hasIncome: income > 0, actual: { needs: Math.round(sums.needs), wants: Math.round(sums.wants), savings: Math.round(sums.savings) },
            pct: { needs: pct(sums.needs), wants: pct(sums.wants), savings: pct(sums.savings) }, recommended: { needs: 50, wants: 30, savings: 20 },
            recommendedKzt: { needs: Math.round(base * 0.5), wants: Math.round(base * 0.3), savings: Math.round(base * 0.2) } };
    }

    function insights(uid, safe, fc, sp, subs) {
        const out = [], now = new Date(), day = now.getDate(), D = dim(now.getFullYear(), now.getMonth());
        const rows = readTx(uid, monthStartMs(-3)), cur = catTotals(rows, monthStartMs(0), Date.now() + 1);
        const prev = [-3, -2, -1].map(o => catTotals(rows, monthStartMs(o), monthStartMs(o + 1)));
        const CB_FOR = { transport: 'transport', fun: 'entertainment' };
        const paced = [];
        ['groceries', 'cafes', 'transport', 'shopping', 'fun'].forEach(c => {
            const usualMonth = prev.reduce((s, t) => s + (t[c] || 0), 0) / 3; if (usualMonth <= 0) return;
            const usualToDate = usualMonth * day / D, sofar = cur[c] || 0;
            if (day >= 4 && sofar >= 3000 && sofar > usualToDate * 1.15) paced.push({ c, pct: Math.round((sofar / usualToDate - 1) * 100), proj: sofar * D / day, usualMonth, over: sofar - usualToDate });
        });
        paced.sort((a, b) => b.over - a.over).slice(0, 2).forEach(p => out.push({ id: 'pace-' + p.c, tone: 'warn', icon: 'bars', title: `${CAT_LABEL[p.c]}: ${p.pct}% faster than usual`,
            text: `At this pace you will spend about ${kzt(p.proj)} on ${CAT_LABEL[p.c].toLowerCase()} this month; you usually spend ${kzt(p.usualMonth)}.${CB_FOR[p.c] ? ` Tip: choose ${{ transport: 'Transport', fun: 'Entertainment' }[p.c]} as a 5% cashback category.` : ` Today you can safely spend ${kzt(safe.leftTodayKzt)}.`}`,
            action: CB_FOR[p.c] ? { label: 'Choose cashback categories', go: 'cashback' } : null }));
        if (fc.runsOutDay) out.unshift({ id: 'runout', tone: 'warn', icon: 'shield', title: 'Your cards may run out before payday', text: `At the current pace your cards run out around day ${fc.runsOutDay} of the month, ${Math.max(0, safe.daysLeft - (fc.runsOutDay - fc.day))} days before the next payday. Safe amount per day: ${kzt(safe.perDayKzt)}.`, action: null });
        else if (fc.endOptimistic > 0) out.push({ id: 'ontrack', tone: 'good', icon: 'check', title: 'You are on track', text: `If you keep your usual pace you will have about ${kzt(fc.endOptimistic)} left at the end of the month.`, action: null });
        const pend = subs.pending[0];
        if (pend) out.unshift({ id: 'subdue', tone: 'info', icon: 'repeat', title: `${pend.name} charges ${whenWord(pend.dueAt)}`, text: `${kzt(pend.amountKzt)} will be charged only if you tap Pay. You can also skip it, freeze it or stop paying.`, action: { label: 'Decide now', go: 'finance', tab: 'subs' } });
        if (subs.activeCount) {
            const share = sp.incomeKzt ? Math.round(subs.monthlyKzt / sp.incomeKzt * 100) : 0;
            out.push({ id: 'subcost', tone: share >= 10 ? 'warn' : 'tip', icon: 'repeat', title: `Subscriptions: ${kzt(subs.monthlyKzt)} a month`, text: `That is ${kzt(subs.yearlyKzt)} a year${share ? `, about ${share}% of your usual income` : ''}. Freeze the ones you do not use.`, action: { label: 'Open subscriptions', go: 'finance', tab: 'subs' } });
        }
        if (subs.suggestions.length) out.push({ id: 'found', tone: 'tip', icon: 'search', title: `We found ${subs.suggestions.length === 1 ? 'a recurring payment' : subs.suggestions.length + ' recurring payments'}`, text: `${subs.suggestions.map(s => s.name).join(', ')} repeat every ${subs.suggestions[0].period}. Track ${subs.suggestions.length === 1 ? 'it' : 'them'} to get a reminder before each charge.`, action: { label: 'Review', go: 'finance', tab: 'subs' } });
        if (sp.hasIncome && sp.pct.savings < 15) out.push({ id: 'saverate', tone: 'tip', icon: 'bars', title: `You save ${sp.pct.savings}% of your income`, text: `The 50/30/20 rule suggests about 20% (${kzt(sp.recommendedKzt.savings)} a month). Even small regular amounts or round-up help.`, action: { label: 'Open goals', go: 'finance', tab: 'goals' } });
        const goals = db.prepare("SELECT * FROM pfm_goals WHERE user_id = ? AND status = 'active'").all(uid);
        if (!goals.length) out.push({ id: 'nogoal', tone: 'tip', icon: 'star', title: 'Start a savings goal', text: 'Round-up moves the change from every purchase into your goal, for example 1 150 ₸ becomes 1 200 ₸ and 50 ₸ is saved.', action: { label: 'Create a goal', go: 'finance', tab: 'goals' } });
        else if (!goals.some(g => g.roundup)) out.push({ id: 'roundup', tone: 'tip', icon: 'star', title: 'Turn on round-up', text: `Save the change from every purchase into “${goals[0].name}” without thinking about it.`, action: { label: 'Open goals', go: 'finance', tab: 'goals' } });
        const w = { warn: 0, info: 1, good: 2, tip: 3 }; return out.sort((a, b) => w[a.tone] - w[b.tone]).slice(0, 6);
    }

    // ============================================================
    // GOALS
    // ============================================================
    const GOAL_KINDS = ['trip', 'car', 'home', 'gadget', 'other'];
    function goalView(g) {
        const now = Date.now(), left = Math.max(0, g.target - g.saved), months = g.deadline ? Math.max(1, Math.ceil((g.deadline - now) / (30.44 * DAY))) : null;
        return { id: g.id, name: g.name, kind: g.kind, targetKzt: g.target, savedKzt: g.saved, pct: Math.min(100, Math.round(g.saved / g.target * 100)), deadline: g.deadline, monthsLeft: months, monthlyNeedKzt: months ? Math.ceil(left / months) : null,
            roundup: !!g.roundup, cbToGoal: !!g.cb_to_goal, status: g.status,
            log: db.prepare('SELECT amount, kind, note, created_at FROM pfm_goal_log WHERE goal_id = ? ORDER BY id DESC LIMIT 6').all(g.id) };
    }
    const ownGoal = (uid, id) => { const g = db.prepare('SELECT * FROM pfm_goals WHERE id = ? AND user_id = ?').get(parseInt(id, 10), uid); if (!g) fail('Goal not found'); return g; };
    function addToGoal(g, amount, kind, note) {
        db.prepare('UPDATE pfm_goals SET saved = ROUND(saved + ?, 2) WHERE id = ?').run(amount, g.id);
        db.prepare('INSERT INTO pfm_goal_log (goal_id, user_id, amount, kind, note) VALUES (?, ?, ?, ?, ?)').run(g.id, g.user_id, amount, kind, note);
        const now = db.prepare('SELECT * FROM pfm_goals WHERE id = ?').get(g.id);
        if (now.status === 'active' && now.saved >= now.target) {
            db.prepare("UPDATE pfm_goals SET status = 'done', roundup = 0, cb_to_goal = 0 WHERE id = ?").run(g.id);
            notify(g.user_id, 'goal', `Goal reached: ${g.name}`, `You saved ${kzt(now.target)}. Well done!`);
        }
    }
    R('get', '/api/pfm/goals', (req, uid) => ({ goals: db.prepare('SELECT * FROM pfm_goals WHERE user_id = ? ORDER BY status, id').all(uid).map(goalView) }));
    R('post', '/api/pfm/goals/create', (req, uid) => {
        const name = clean(req.body.name, 30); if (name.length < 2) fail('Name your goal');
        const kind = GOAL_KINDS.includes(req.body.kind) ? req.body.kind : 'other';
        const target = parseAmount(req.body.target); if (target === null || target < 1000 || target > 1e9) fail('The goal amount must be between 1 000 ₸ and 1 000 000 000 ₸');
        let deadline = null;
        if (req.body.deadline) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body.deadline)); if (!m) fail('Check the date'); deadline = new Date(+m[1], +m[2] - 1, +m[3]).getTime(); if (isNaN(deadline) || deadline <= Date.now() || deadline > Date.now() + 3650 * DAY) fail('The date must be in the future (up to 10 years)'); }
        if (db.prepare("SELECT COUNT(*) n FROM pfm_goals WHERE user_id = ? AND status = 'active'").get(uid).n >= P.maxGoals) fail(`You can have up to ${P.maxGoals} active goals`);
        db.prepare('INSERT INTO pfm_goals (user_id, name, kind, target, deadline) VALUES (?, ?, ?, ?, ?)').run(uid, name, kind, target, deadline);
        return { message: `Goal “${name}” created` };
    });
    R('post', '/api/pfm/goals/deposit', (req, uid) => dbtx(() => {
        const g = ownGoal(uid, req.body.id); if (g.status !== 'active') fail('This goal is completed');
        const amount = parseAmount(req.body.amount); if (amount === null || amount < 100 || amount > 1e8) fail('Amount must be at least 100 ₸');
        const a = spendable(uid, req.body.fromAccount); if (a.account_type !== 'card') fail('Choose a card'); const cost = convert(amount, 'KZT', a.currency); debit(a, cost);
        insertTx(uid, 'goal_deposit', cost, a.currency, accLabel(a), `Goal: ${g.name}`, `To goal: ${g.name}`, 'completed', { goalId: g.id, goal: g.name, amountKzt: amount });
        addToGoal(g, amount, 'deposit', `From ${accLabel(a)}`);
        return { message: `${kzt(amount)} added to “${g.name}”` };
    })());
    R('post', '/api/pfm/goals/withdraw', (req, uid) => dbtx(() => {
        const g = ownGoal(uid, req.body.id), amount = parseAmount(req.body.amount);
        if (amount === null || amount < 1) fail('Enter an amount'); if (amount > g.saved + 0.001) fail('You have less than that saved in this goal');
        const a = getOwnAccount(uid, req.body.toAccount); if (!a || a.account_type !== 'card') fail('Choose a card'); const back = convert(amount, 'KZT', a.currency); credit(a, back);
        insertTx(uid, 'goal_withdraw', back, a.currency, `Goal: ${g.name}`, accLabel(a), `From goal: ${g.name}`, 'completed', { goalId: g.id, goal: g.name, amountKzt: amount });
        db.prepare("UPDATE pfm_goals SET saved = ROUND(saved - ?, 2), status = 'active' WHERE id = ?").run(amount, g.id);
        db.prepare('INSERT INTO pfm_goal_log (goal_id, user_id, amount, kind, note) VALUES (?, ?, ?, ?, ?)').run(g.id, uid, -amount, 'withdraw', `To ${accLabel(a)}`);
        return { message: `${kzt(amount)} moved to ${accLabel(a)}` };
    })());
    R('post', '/api/pfm/goals/settings', (req, uid) => dbtx(() => {
        const g = ownGoal(uid, req.body.id); if (g.status !== 'active') fail('This goal is completed');
        if (req.body.roundup !== undefined) { if (req.body.roundup) db.prepare('UPDATE pfm_goals SET roundup = 0 WHERE user_id = ?').run(uid); db.prepare('UPDATE pfm_goals SET roundup = ? WHERE id = ?').run(req.body.roundup ? 1 : 0, g.id); }
        if (req.body.cbToGoal !== undefined) { if (req.body.cbToGoal) db.prepare('UPDATE pfm_goals SET cb_to_goal = 0 WHERE user_id = ?').run(uid); db.prepare('UPDATE pfm_goals SET cb_to_goal = ? WHERE id = ?').run(req.body.cbToGoal ? 1 : 0, g.id); }
        return { message: 'Saved' };
    })());
    R('post', '/api/pfm/goals/delete', (req, uid) => dbtx(() => {
        const g = ownGoal(uid, req.body.id);
        if (g.saved > 0.009) {
            const a = getOwnAccount(uid, req.body.toAccount); if (!a || a.account_type !== 'card') fail('Choose a card to receive your savings'); const back = convert(g.saved, 'KZT', a.currency); credit(a, back);
            insertTx(uid, 'goal_withdraw', back, a.currency, `Goal: ${g.name}`, accLabel(a), `Goal closed: ${g.name}`, 'completed', { goalId: g.id, goal: g.name, amountKzt: g.saved });
        }
        db.prepare('DELETE FROM pfm_goals WHERE id = ?').run(g.id); db.prepare('DELETE FROM pfm_goal_log WHERE goal_id = ?').run(g.id);
        return { message: 'Goal removed' };
    })());

    // called after every card spend (bill payments, demo purchases): round-up + cashback-to-goal
    hooks.afterSpend = (uid, a, amountKzt, cashbackKzt) => {
        const out = { roundUp: 0, cashbackToGoal: 0, goalName: null };
        const ru = db.prepare("SELECT * FROM pfm_goals WHERE user_id = ? AND status = 'active' AND roundup = 1").get(uid);
        if (ru && a.currency === 'KZT') {
            const step = P.roundUpStep, extra = round2(Math.ceil(amountKzt / step) * step - amountKzt), fresh = getOwnAccount(uid, a.account_number);
            if (extra >= 1 && extra < step && fresh && !fresh.frozen && cents(fresh.balance) >= cents(extra)) {
                debit(fresh, extra);
                insertTx(uid, 'goal_deposit', extra, 'KZT', accLabel(a), `Goal: ${ru.name}`, `Round-up → ${ru.name}`, 'completed', { goalId: ru.id, goal: ru.name, roundUp: true, amountKzt: extra });
                addToGoal(ru, extra, 'roundup', 'Round-up'); out.roundUp = extra; out.goalName = ru.name;
            }
        }
        const cg = db.prepare("SELECT * FROM pfm_goals WHERE user_id = ? AND status = 'active' AND cb_to_goal = 1").get(uid);
        if (cg && cashbackKzt > 0) {
            db.prepare("INSERT INTO cashback_ledger (user_id, amount, kind, note) VALUES (?, ?, 'withdraw', ?)").run(uid, -cashbackKzt, `To goal: ${cg.name}`);
            addToGoal(cg, cashbackKzt, 'cashback', 'Cashback'); out.cashbackToGoal = cashbackKzt; out.goalName = out.goalName || cg.name;
        }
        return out;
    };

    // ============================================================
    // DEMO PURCHASES
    // ============================================================
    const MERCHANTS = [
        { id: 'magnum', name: 'Magnum', cat: 'groceries' }, { id: 'small', name: 'Small', cat: 'groceries' }, { id: 'yandexgo', name: 'Yandex Go', cat: 'transport', cb: 'transport' },
        { id: 'coffeeboom', name: 'Coffee Boom', cat: 'cafes' }, { id: 'starbucks', name: 'Starbucks', cat: 'cafes' }, { id: 'technodom', name: 'Technodom', cat: 'shopping' },
        { id: 'europharma', name: 'Europharma', cat: 'health' }, { id: 'chaplin', name: 'Chaplin Cinemas', cat: 'fun', cb: 'entertainment' }
    ];
    R('post', '/api/pfm/purchase', (req, uid) => {
        const m = MERCHANTS.find(x => x.id === req.body.merchant); if (!m) fail('Choose a shop');
        const amount = parseAmount(req.body.amount); if (amount === null || amount < 100 || amount > 2000000) fail('Amount must be between 100 ₸ and 2 000 000 ₸');
        return dbtx(() => {
            const a = spendable(uid, req.body.fromAccount); if (a.account_type !== 'card') fail('Choose a card'); const cost = convert(amount, 'KZT', a.currency); debit(a, cost);
            const cb = earnCashback(uid, m.cb || m.cat, amount, `${m.name} purchase`);
            insertTx(uid, 'purchase', cost, a.currency, accLabel(a), m.name, `Card purchase: ${m.name}`, 'completed', { merchant: m.name, cat: m.cat, category: CAT_LABEL[m.cat], amountKzt: amount, cashback: cb.amount, demo: true });
            const x = hooks.afterSpend(uid, a, amount, cb.amount);
            const parts = [`${m.name}: ${kzt(amount)}`]; if (cb.amount) parts.push(`cashback ${kzt(cb.amount)}`);
            if (x.roundUp) parts.push(`${kzt(x.roundUp)} saved to “${x.goalName}”`); if (x.cashbackToGoal) parts.push(`cashback went to “${x.goalName}”`);
            return { message: parts.join(' · '), roundUp: x.roundUp, cashback: cb.amount };
        })();
    });

    // ============================================================
    // OVERVIEW / BRIEF
    // ============================================================
    R('get', '/api/pfm/brief', (req, uid) => { subsTick(uid); return { safe: safeToSpend(uid), pending: pendingFor(uid), decisions: db.prepare("SELECT id, name, brand FROM sub_trackers WHERE user_id = ? AND status = 'decision'").all(uid) }; });
    R('get', '/api/pfm/overview', (req, uid) => {
        subsTick(uid);
        const safe = safeToSpend(uid), fc = forecast(uid), sp = split(uid), subs = subsPayload(uid), goals = db.prepare('SELECT * FROM pfm_goals WHERE user_id = ? ORDER BY status, id').all(uid).map(goalView);
        return { safe, forecast: fc, split: sp, subs, goals, insights: insights(uid, safe, fc, sp, subs), merchants: MERCHANTS.map(m => ({ id: m.id, name: m.name, cat: CAT_LABEL[m.cat] })), step: P.roundUpStep };
    });

    // ============================================================
    // DEMO HISTORY for demo@bcc.kz (made once): salary, shops, taxi, cafes, bills, 3 tracked subscriptions + 1 untracked, 2 goals
    // ============================================================
    function seedDemo() {
        const u = db.prepare("SELECT id FROM users WHERE email = 'demo@bcc.kz'").get(); if (!u) return;
        if (db.prepare('SELECT 1 FROM pfm_seeded WHERE user_id = ?').get(u.id)) return;
        const acc = db.prepare("SELECT * FROM accounts WHERE user_id = ? AND account_type = 'card' AND currency = 'KZT' ORDER BY id").get(u.id); if (!acc) return;
        const label = accLabel(acc), now = Date.now(), day0 = startOfDay(now); let seed = 20261011;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const between = (a, b) => Math.round((a + rnd() * (b - a)) / 10) * 10;
        const ins = db.prepare('INSERT INTO transactions (user_id, transaction_type, amount, currency, from_account, to_account, description, status, details, transaction_date) VALUES (?, ?, ?, \'KZT\', ?, ?, ?, \'completed\', ?, ?)');
        const monthStart = monthStartMs(0);
        const put = (type, amount, to, desc, d, ms) => ins.run(u.id, type, amount, label, to, desc, JSON.stringify(d), iso(ms));
        // the very first batch of sample operations (all stamped with the same second when the database was created) is moved back in time
        db.prepare("SELECT id FROM transactions WHERE user_id = ? AND details IS NULL AND transaction_date = (SELECT MIN(transaction_date) FROM transactions WHERE user_id = ?) ORDER BY id LIMIT 4").all(u.id, u.id)
            .forEach((r, i) => db.prepare('UPDATE transactions SET transaction_date = ? WHERE id = ?').run(iso(day0 - (70 - i * 3) * DAY + 11 * 3600e3), r.id));
        const MER = { groceries: ['Magnum', 'Small', 'Galmart'], taxi: ['Yandex Go'], cafes: ['Coffee Boom', 'Starbucks', 'Line Brew'], shopping: ['Technodom', 'Sulpak', 'Wildberries'], health: ['Europharma'], fun: ['Chaplin Cinemas', 'Kinopark'] };
        const N = new Date(), D = dim(N.getFullYear(), N.getMonth()), dayNo = N.getDate();
        const makeBuys = (cat, key, every, amounts, hour, boost) => {
            const items = []; for (let ago = 1, i = 0; ago <= 125; ago++) if (ago % every === 0) { items.push({ ms: day0 - ago * DAY + (hour + (i % 3) * 0.7) * 3600e3, a: amounts[i % amounts.length], merchant: MER[key][i % MER[key].length] }); i++; }
            if (boost) {   // make the current month run `boost` times faster than the usual month-to-date, so the AI has something to say
                let prev = 0; for (let o = -3; o <= -1; o++) prev += items.filter(x => x.ms >= monthStartMs(o) && x.ms < monthStartMs(o + 1)).reduce((s, x) => s + x.a, 0);
                const cur = items.filter(x => x.ms >= monthStart), sum = cur.reduce((s, x) => s + x.a, 0), target = boost * (prev / 3) * dayNo / D;
                if (sum > 0) cur.forEach(x => { x.a = Math.round(x.a * target / sum / 10) * 10; });
            }
            items.forEach(x => put('purchase', x.a, x.merchant, `Card purchase: ${x.merchant}`, { merchant: x.merchant, cat, category: CAT_LABEL[cat], amountKzt: x.a, demo: true }, x.ms));
        };
        makeBuys('groceries', 'groceries', 3, [8200, 11800, 6400, 14300, 9100], 18, 1.25);
        makeBuys('transport', 'taxi', 4, [1800, 2600, 1500, 3100], 19, 1.35);
        makeBuys('cafes', 'cafes', 5, [2400, 3600, 1900, 4200], 13, 0);
        // a few bigger one-off purchases on fixed days of each month (all in the past)
        for (let o = -3; o <= 0; o++) {
            [[14, 'shopping', 'shopping', 22000], [26, 'shopping', 'shopping', 24500], [17, 'health', 'health', 6200], [15, 'fun', 'fun', 5500], [27, 'fun', 'fun', 6000]].forEach(([dd, cat, key, a], i) => {
                const ms = new Date(N.getFullYear(), N.getMonth() + o, dd, 15).getTime(); if (ms >= day0) return;
                const merchant = MER[key][(dd + o + 9) % MER[key].length];
                put('purchase', a, merchant, `Card purchase: ${merchant}`, { merchant, cat, category: CAT_LABEL[cat], amountKzt: a, demo: true }, ms);
            });
        }
        // fixed monthly bills
        for (let o = -3; o <= 0; o++) {
            [[3, 'Mobile', 'Beeline', 4000], [8, 'Utilities', 'Electricity', between(14000, 19000)], [10, 'Internet & TV', 'Kazakhtelecom', 6500]].forEach(([dd, category, provider, a]) => {
                const ms = new Date(new Date().getFullYear(), new Date().getMonth() + o, dd, 12).getTime(); if (ms >= day0) return;
                put('bill_payment', a, provider, `Payment: ${provider}`, { category, provider, amountKzt: a, demo: true }, ms);
            });
            const sal = new Date(new Date().getFullYear(), new Date().getMonth() + o, 25, 9).getTime();
            if (sal < day0) ins.run(u.id, 'transfer_in', 450000, 'Employer LLP', label, 'Salary', JSON.stringify({ counterparty: 'Employer LLP · Salary', salary: true }), iso(sal));
        }
        // subscriptions: next charge dates are relative to today so the demo always has a reminder to show
        const subs = [['Netflix', 3990, 1], ['Yandex Plus', 2499, 3], ['Spotify', 1790, 12]];
        subs.forEach(([name, amount, inDays]) => {
            const next = inDays === 1 ? now + 20 * 3600e3 : at10(day0 + inDays * DAY);
            for (let k = 1; k <= 3; k++) put('subscription_payment', amount, name, `Subscription: ${name}`, { provider: name, amountKzt: amount, period: 'month' }, addPeriod(next, 'month', -k));
            db.prepare('INSERT INTO sub_trackers (user_id, name, brand, amount, period, next_date, account_number, paid_count) VALUES (?, ?, ?, ?, \'month\', ?, ?, 3)').run(u.id, name, brandOf(name), amount, next, acc.account_number);
        });
        for (let k = 0; k < 3; k++) put('purchase', 1290, 'Apple iCloud+', 'Card purchase: Apple iCloud+', { merchant: 'Apple iCloud+', cat: 'other', category: CAT_LABEL.other, amountKzt: 1290, demo: true }, day0 - (8 + 30 * k) * DAY + 11 * 3600e3);
        // goals
        const g1 = db.prepare("INSERT INTO pfm_goals (user_id, name, kind, target, saved, deadline, roundup) VALUES (?, 'Vacation in Turkey', 'trip', 600000, 185000, ?, 1)").run(u.id, day0 + 150 * DAY).lastInsertRowid;
        const g2 = db.prepare("INSERT INTO pfm_goals (user_id, name, kind, target, saved, deadline) VALUES (?, 'New laptop', 'gadget', 900000, 90000, ?)").run(u.id, day0 + 270 * DAY).lastInsertRowid;
        const lg = db.prepare('INSERT INTO pfm_goal_log (goal_id, user_id, amount, kind, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        [[g1, 'Vacation in Turkey', 150000, 40], [g1, 'Vacation in Turkey', 35000, 9], [g2, 'New laptop', 90000, 20]].forEach(([gid, gname, amt, ago]) => {
            lg.run(gid, u.id, amt, 'deposit', 'From ' + label, iso(day0 - ago * DAY + 12 * 3600e3));
            put('goal_deposit', amt, `Goal: ${gname}`, `To goal: ${gname}`, { goalId: gid, goal: gname, amountKzt: amt }, day0 - ago * DAY + 12 * 3600e3);
        });
        db.prepare('INSERT INTO pfm_seeded (user_id) VALUES (?)').run(u.id);
        logger.info('PFM demo history created for the demo user');
    }
    seedDemo();

    logger.info('PFM READY');
    return { safeToSpend, subsPayload, forecast, kzt };
};
