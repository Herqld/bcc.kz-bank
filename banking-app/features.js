// ============================================================
// features.js  -  everything added in version 3 (server side)
//   notifications, bcc Plus, analytics, card freeze/reveal,
//   bcc Shield (fraud protection), cashback, bill payments, public services,
//   loans, investments, money requests, autotransfers, refunds, insurance,
//   offers, safe boxes, chat assistant, QR, bank-team dashboard
// ============================================================
const crypto = require('crypto');

module.exports = function install(ctx) {
    const { app, db, cfg, logger, hooks, executors, BankError, fail, isAuthenticated, handleRouteError, parseAmount, cleanText,
        round2, cents, convert, fmtMoney, insertTx, getOwnAccount, accLabel, findUserByPhone, findAccountByCard, normalizePhone,
        normalizeCard, isValidPhoneDigits, maskName, runTransfer, runDomestic, runInternational, runCryptoSend, createPending,
        startOtpOperation, getUserPhoneDigits, randomDigits, cardExpiry, SECRET } = ctx;

    // ---------- tables ----------
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT, title TEXT, body TEXT, data TEXT, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY, active_until TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS guardians (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, guardian_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS held_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, score INTEGER, reasons TEXT, amount_kzt REAL, display TEXT, label TEXT, status TEXT DEFAULT 'held', release_at INTEGER, guardian_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, decided_at DATETIME);
        CREATE TABLE IF NOT EXISTS shield_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, score INTEGER, amount_kzt REAL, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS cashback_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, kind TEXT, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS cashback_choices (user_id INTEGER PRIMARY KEY, month TEXT, cats TEXT);
        CREATE TABLE IF NOT EXISTS gov_paid (user_id INTEGER NOT NULL, item_key TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, item_key));
        CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, principal REAL, apr REAL, months INTEGER, monthly REAL, remaining REAL, paid_count INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS positions (user_id INTEGER NOT NULL, symbol TEXT NOT NULL, qty INTEGER NOT NULL, cost_usd REAL NOT NULL, PRIMARY KEY (user_id, symbol));
        CREATE TABLE IF NOT EXISTS money_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester_id INTEGER NOT NULL, payer_id INTEGER NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, note TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS autotransfers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, from_account TEXT NOT NULL, to_value TEXT NOT NULL, amount REAL NOT NULL, freq TEXT NOT NULL, next_run INTEGER NOT NULL, active INTEGER DEFAULT 1, runs INTEGER DEFAULT 0, failures INTEGER DEFAULT 0, last_status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS refund_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tx_id INTEGER NOT NULL, reason TEXT, comment TEXT, status TEXT DEFAULT 'review', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME);
        CREATE TABLE IF NOT EXISTS policies (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product TEXT, params TEXT, premium_kzt REAL, number TEXT, valid_from TEXT, valid_to TEXT, status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS offers_active (user_id INTEGER NOT NULL, offer_id TEXT NOT NULL, code TEXT, activated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, offer_id));
        CREATE TABLE IF NOT EXISTS service_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT, details TEXT, fee_kzt REAL DEFAULT 0, code TEXT, status TEXT DEFAULT 'booked', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    `);

    let pfm = null; // Finance module (pfm.js), installed at the end of this file

    // ---------- small helpers ----------
    // R(): a route that needs login. fn(req, userId) returns an object (sent as JSON, success:true added) or nothing.
    const R = (method, p, fn) => app[method](p, isAuthenticated, async (req, res) => {
        const userId = req.session.userId;
        try {
            const out = await fn(req, userId, res);
            if (out !== undefined) res.json(out.success === undefined ? { success: true, ...out } : out);
        } catch (e) {
            handleRouteError(res, e, `${method.toUpperCase()} ${p}`, { userId }, 'Something went wrong. Please try again.');
        }
    });
    const tx = (fn) => db.transaction(fn);
    const toKzt = (amount, cur) => convert(amount, cur, 'KZT');
    const parseTime = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
    const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const isAdmin = (uid) => { const u = userRow(uid); return !!u && cfg.ADMIN_EMAILS.includes(u.email.toLowerCase()); };
    const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-4);
    const countryName = (code) => (cfg.COUNTRIES.find(x => x[0] === code) || [code, code])[1];
    const inviteCode = (seed) => crypto.createHash('sha256').update(seed + SECRET).digest('hex').slice(0, 8).toUpperCase();

    const notify = (userId, kind, title, body, data) =>
        db.prepare('INSERT INTO notifications (user_id, kind, title, body, data) VALUES (?, ?, ?, ?, ?)').run(userId, kind, title, body, data ? JSON.stringify(data) : null);
    hooks.notify = notify;

    function spendable(userId, accountNumber, needCurrency) {
        const a = getOwnAccount(userId, accountNumber);
        if (!a) fail('Account not found');
        if (a.frozen) fail('This card is frozen. Unfreeze it in the app to make payments.');
        if (needCurrency && a.currency !== needCurrency) fail(`Choose a ${needCurrency} account`);
        return a;
    }
    function debit(a, amountInAccountCurrency) {
        if (cents(a.balance) < cents(amountInAccountCurrency)) fail('Insufficient funds');
        db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(amountInAccountCurrency, a.id);
    }
    function credit(a, amount) { db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(amount, a.id); }
    const phoneOf = (userId) => getUserPhoneDigits(userId);

    // ================= notifications =================
    R('get', '/api/notifications', (req, uid) => {
        const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(uid);
        rows.forEach(r => { try { r.data = r.data ? JSON.parse(r.data) : null; } catch (e) { r.data = null; } });
        return { notifications: rows, unread: rows.filter(r => !r.is_read).length };
    });
    R('post', '/api/notifications/read', (req, uid) => { db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(uid); return {}; });

    // ================= bcc Plus =================
    const isPlus = (uid) => { const s = db.prepare('SELECT active_until FROM subscriptions WHERE user_id = ?').get(uid); return !!s && new Date(s.active_until) > new Date(); };
    hooks.isPlus = isPlus;
    R('get', '/api/plus', (req, uid) => {
        const s = db.prepare('SELECT active_until FROM subscriptions WHERE user_id = ?').get(uid);
        return { plus: isPlus(uid), activeUntil: s ? s.active_until : null, priceKzt: cfg.PLUS.priceKzt };
    });
    R('post', '/api/plus/subscribe', (req, uid) => {
        const months = Math.min(12, Math.max(1, parseInt(req.body.months, 10) || 1));
        return tx(() => {
            const a = spendable(uid, req.body.fromAccount);
            const cost = convert(cfg.PLUS.priceKzt * months, 'KZT', a.currency);
            debit(a, cost);
            const cur = db.prepare('SELECT active_until FROM subscriptions WHERE user_id = ?').get(uid);
            const base = cur && new Date(cur.active_until) > new Date() ? new Date(cur.active_until) : new Date();
            base.setMonth(base.getMonth() + months);
            db.prepare('INSERT INTO subscriptions (user_id, active_until) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET active_until = excluded.active_until').run(uid, base.toISOString());
            insertTx(uid, 'bill_payment', cost, a.currency, accLabel(a), 'bcc Plus', `bcc Plus subscription (${months} mo)`, 'completed', { category: 'subscription', provider: 'bcc Plus', amountKzt: cfg.PLUS.priceKzt * months });
            notify(uid, 'plus', 'bcc Plus is active', `Active until ${base.toISOString().slice(0, 10)}. International fees are half price and cashback is +2%.`);
            return { message: 'bcc Plus is active', activeUntil: base.toISOString() };
        })();
    });
    R('post', '/api/plus/cancel', (req, uid) => { db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(uid); return { message: 'bcc Plus cancelled' }; });

    // ================= analytics (PFM) =================
    const INCOME_TYPES = ['transfer_in', 'top_up', 'deposit_withdraw', 'loan_disbursement', 'invest_sell', 'cashback_withdraw', 'refund'];
    const CATEGORY_OF = { transfer_out: 'Transfers', domestic_out: 'Transfers', international_out: 'International', crypto_out: 'Crypto', deposit_open: 'Deposits', bill_payment: 'Payments', tax_payment: 'Taxes & fines', loan_payment: 'Loans', invest_buy: 'Investments', insurance_purchase: 'Insurance', service_fee: 'Services' };
    R('get', '/api/analytics', (req, uid) => {
        const now = new Date();
        const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const rows = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND status != 'rejected' AND strftime('%Y-%m', transaction_date) = ?").all(uid, month);
        let income = 0, expense = 0; const cats = {};
        rows.forEach(r => {
            const k = toKzt(r.amount, r.currency);
            if (INCOME_TYPES.includes(r.transaction_type)) income += k;
            else if (!(r.transaction_type === 'transfer_out' && (r.details || '').includes('"method":"own"'))) {
                expense += k; const c = CATEGORY_OF[r.transaction_type] || 'Other'; cats[c] = (cats[c] || 0) + k;
            }
        });
        const months = db.prepare("SELECT DISTINCT strftime('%Y-%m', transaction_date) AS m FROM transactions WHERE user_id = ? ORDER BY m DESC LIMIT 12").all(uid).map(r => r.m);
        return { month, months, incomeKzt: round2(income), expenseKzt: round2(expense), categories: Object.entries(cats).map(([name, v]) => ({ name, kzt: round2(v) })).sort((a, b) => b.kzt - a.kzt) };
    });

    // ================= cards: freeze / unfreeze / reveal details =================
    const cvvOf = (cardNumber) => String(parseInt(crypto.createHmac('sha256', SECRET).update('cvv:' + cardNumber.replace(/\D/g, '')).digest('hex').slice(0, 8), 16) % 1000).padStart(3, '0');
    const ownCard = (uid, n) => { const a = getOwnAccount(uid, n); if (!a || !a.card_number) fail('Card not found'); return a; };

    R('post', '/api/cards/freeze', (req, uid) => {
        const a = ownCard(uid, req.body.accountNumber);
        db.prepare('UPDATE accounts SET frozen = 1 WHERE id = ?').run(a.id);
        shieldEvent(uid, 'card_frozen', 0, 0, { card: accLabel(a) });
        notify(uid, 'security', 'Card frozen', `${accLabel(a)} is frozen. Unfreezing needs an SMS code.`);
        logger.info('CARD FROZEN', { userId: uid, accountId: a.id });
        return { message: 'Card frozen' };
    });
    R('post', '/api/cards/unfreeze', async (req, uid) => {
        const a = ownCard(uid, req.body.accountNumber);
        if (!a.frozen) fail('This card is not frozen');
        return { otpRequired: true, otp: await createPending(uid, 'unfreeze', { accountNumber: a.account_number }, phoneOf(uid)) };
    });
    executors.unfreeze = (uid, p) => {
        const a = ownCard(uid, p.accountNumber);
        db.prepare('UPDATE accounts SET frozen = 0 WHERE id = ?').run(a.id);
        notify(uid, 'security', 'Card unfrozen', `${accLabel(a)} can be used again.`);
        return { message: 'Card unfrozen' };
    };
    R('post', '/api/cards/reveal', async (req, uid) => {
        const a = ownCard(uid, req.body.accountNumber);
        return { otpRequired: true, otp: await createPending(uid, 'card_reveal', { accountNumber: a.account_number }, phoneOf(uid)) };
    });
    executors.card_reveal = (uid, p) => {
        const a = ownCard(uid, p.accountNumber), u = userRow(uid);
        logger.info('CARD DETAILS REVEALED', { userId: uid, accountId: a.id });
        return { message: 'Card details', card: { number: a.card_number, expiry: cardExpiry(a.created_at), cvv: cvvOf(a.card_number), holder: u.full_name.toUpperCase(), name: accLabel(a) } };
    };

    // ================= bcc SHIELD =================
    // Every transfer to another person / bank / country / wallet is scored 0-100 BEFORE the SMS code is sent.
    // low (<30): normal.  medium (30-59): friendly warning, user must confirm.  high (60+): HOLD (cooling-off) +
    // optional approval by a trusted "guardian". Every score comes with the reasons, in plain language.
    const SH = cfg.SHIELD;
    function shieldEvent(uid, kind, score, amountKzt, details) {
        db.prepare('INSERT INTO shield_events (user_id, kind, score, amount_kzt, details) VALUES (?, ?, ?, ?, ?)').run(uid, kind, score || 0, amountKzt || 0, details ? JSON.stringify(details) : null);
    }
    const OUTGOING = ['transfer_out', 'domestic_out', 'international_out', 'crypto_out'];

    // Pure function: factors -> score + reasons (also used by the simulator)
    function scoreFactors(f) {
        const reasons = []; let score = 0;
        const add = (points, code, text) => { score += points; reasons.push({ code, points, text }); };
        if (f.newRecipient) add(15, 'new_recipient', 'You have never sent money to this recipient before.');
        if (f.drain >= 0.7) add(30, 'drain', 'This is 70% or more of the money on the account.');
        else if (f.drain >= 0.4) add(15, 'big_share', 'This is 40% or more of the money on the account.');
        if (f.unusual) add(15, 'unusual_amount', 'This is much bigger than your usual transfers.');
        if (f.bigAbsolute) add(10, 'big_absolute', 'This is a very large amount.');
        if (f.night) add(10, 'night', 'Night-time transfers are a common scam pattern.');
        if (f.velocity) add(15, 'velocity', 'Several transfers in the last few minutes.');
        if (f.intl) add(15, 'intl', 'International transfers are very hard to get back.');
        if (f.crypto) add(20, 'crypto', 'Crypto transfers cannot be reversed.');
        if (f.newAccount) add(10, 'new_account', 'Your own account is less than 24 hours old.');
        if (f.recipientNew) add(10, 'recipient_new', 'The recipient account was opened less than 7 days ago.');
        if (f.mule) add(25, 'mule_pattern', 'The recipient just received money from 3 or more different people (typical of "mule" accounts).');
        if (f.coached) add(25, 'coached', 'You said someone on the phone is telling you what to do.');
        score = Math.min(100, score);
        const level = score >= SH.high ? 'high' : score >= SH.medium ? 'medium' : 'low';
        return { score, level, reasons };
    }
    const ADVICE = 'Bank staff, the police and the National Bank never ask you to move money to a "safe account", never ask for SMS codes, and never give you instructions by phone. In Kazakhstan, phone scams, fake investments and messenger/social-media fraud are the three most common types.';

    // Looks at the payload of an operation and builds the factors from real data
    function describe(uid, type, p) {
        let sender, label, recUserId = null, amountKzt, display, isIntl = false, isCrypto = false;
        if (type === 'transfer' || type === 'request_pay') {
            sender = getOwnAccount(uid, p.fromAccount); if (!sender) return null;
            amountKzt = toKzt(p.amount, sender.currency); display = fmtMoney(p.amount, sender.currency);
            if (p.transferType === 'phone') { label = '+' + normalizePhone(p.toAccount); const u = findUserByPhone(p.toAccount); if (u) recUserId = u.id; }
            else if (p.transferType === 'card') { const a = findAccountByCard(p.toAccount); if (!a) return null; label = logger.maskCard(a.card_number); recUserId = a.user_id; }
            else return null; // own transfers are never scored
        } else if (type === 'domestic') {
            sender = getOwnAccount(uid, p.fromAccount); if (!sender) return null;
            label = `${p.bank} ${logger.maskCard(normalizeCard(p.card))}`; amountKzt = toKzt(p.amount, sender.currency); display = fmtMoney(p.amount, sender.currency);
        } else if (type === 'international') {
            sender = getOwnAccount(uid, p.fromAccount); if (!sender) return null;
            label = `${p.beneficiary}, ${countryName(p.country)}`; amountKzt = toKzt(p.amount, 'USD'); display = fmtMoney(p.amount, 'USD'); isIntl = true;
        } else if (type === 'crypto_send') {
            sender = getOwnAccount(uid, p.fromAccount); const w = db.prepare('SELECT * FROM crypto_wallets WHERE id = ? AND user_id = ?').get(p.walletId, uid);
            if (!sender || !w) return null;
            const asset = cfg.CRYPTO.assets[w.network];
            label = `${asset.asset} ${shortAddr(w.address)}`; amountKzt = toKzt(p.amount, sender.currency); display = fmtMoney(p.amount, sender.currency); isCrypto = true;
        } else return null;
        return { sender, label, recUserId, amountKzt, display, isIntl, isCrypto };
    }

    function assess(uid, type, p) {
        const d = describe(uid, type, p); if (!d) return null;
        const me = userRow(uid);
        const known = db.prepare(`SELECT 1 FROM transactions WHERE user_id = ? AND to_account = ? AND transaction_type IN ('transfer_out','domestic_out','international_out','crypto_out') LIMIT 1`).get(uid, d.label);
        const balKzt = toKzt(d.sender.balance, d.sender.currency);
        const recent = db.prepare(`SELECT amount, currency FROM transactions WHERE user_id = ? AND transaction_type IN ('transfer_out','domestic_out','international_out','crypto_out') ORDER BY id DESC LIMIT 10`).all(uid).map(r => toKzt(r.amount, r.currency)).sort((a, b) => a - b);
        const median = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
        const night = ((new Date().getUTCHours() + 5) % 24) < 6; // Kazakhstan: UTC+5
        const velocity = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND transaction_type IN ('transfer_out','domestic_out','international_out','crypto_out') AND transaction_date >= datetime('now', '-10 minutes')`).get(uid).c >= 3;
        let recipientNew = false, mule = false;
        if (d.recUserId) {
            const ru = userRow(d.recUserId);
            recipientNew = Date.now() - parseTime(ru.created_at) < 7 * 864e5;
            mule = db.prepare(`SELECT COUNT(DISTINCT json_extract(details, '$.sk')) c FROM transactions WHERE user_id = ? AND transaction_type = 'transfer_in' AND transaction_date >= datetime('now', '-60 minutes')`).get(d.recUserId).c >= 3;
        }
        const f = {
            newRecipient: !known, drain: balKzt > 0 ? d.amountKzt / balKzt : 1,
            unusual: median > 0 && d.amountKzt >= 5 * median && d.amountKzt >= 50000, bigAbsolute: d.amountKzt >= 1000000,
            night, velocity, intl: d.isIntl, crypto: d.isCrypto, newAccount: Date.now() - parseTime(me.created_at) < 864e5,
            recipientNew, mule, coached: !!p.coached
        };
        const r = scoreFactors(f);
        shieldEvent(uid, r.level === 'low' ? 'checked' : (r.level === 'medium' ? 'warned' : 'high_risk'), r.score, d.amountKzt, { type, reasons: r.reasons.map(x => x.code) });
        return { ...r, advice: ADVICE, amountKzt: round2(d.amountKzt), label: d.label, display: d.display };
    }
    hooks.assess = assess;

    const DRY = {
        transfer: (u, p) => runTransfer(u, p, true), request_pay: (u, p) => runTransfer(u, p, true),
        domestic: (u, p) => runDomestic(u, p, true), international: (u, p) => runInternational(u, p, true), crypto_send: (u, p) => runCryptoSend(u, p, true)
    };
    const EXEC = (type) => (type === 'request_pay' ? executors.request_pay : executors[type]);

    // Confirmed (with SMS code) but too risky: park it instead of sending
    executors.held = (uid, p) => {
        DRY[p.type](uid, p.payload);
        const d = describe(uid, p.type, p.payload);
        const guardian = db.prepare("SELECT * FROM guardians WHERE user_id = ? AND status = 'active'").get(uid);
        const releaseAt = Date.now() + SH.holdMinutes * 60000;
        const id = db.prepare('INSERT INTO held_transfers (user_id, type, payload, score, reasons, amount_kzt, display, label, release_at, guardian_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(uid, p.type, JSON.stringify(p.payload), p.risk.score, JSON.stringify(p.risk.reasons), d.amountKzt, d.display, d.label, releaseAt, guardian ? guardian.guardian_id : null).lastInsertRowid;
        const me = userRow(uid);
        notify(uid, 'shield', 'Transfer on hold', `${d.display} to ${d.label} is on hold for your protection.`, { heldId: id });
        if (guardian) notify(guardian.guardian_id, 'guardian_request', 'Approval needed', `${maskName(me.full_name)} wants to send ${d.display} to ${d.label}. Risk ${p.risk.score}/100.`, { heldId: id });
        shieldEvent(uid, 'held', p.risk.score, d.amountKzt, { reasons: p.risk.reasons.map(x => x.code), guardian: !!guardian });
        logger.warn('SHIELD HOLD', { userId: uid, heldId: id, score: p.risk.score, guardian: !!guardian });
        const lines = [['Risk score', `${p.risk.score} / 100`], ['Why', p.risk.reasons.map(x => x.text).join(' ')], ['To', d.label]];
        lines.push(guardian ? ['Waiting for', 'Approval from your guardian'] : ['You can send it after', `${SH.holdMinutes} min (cooling-off)`]);
        lines.push(['Changed your mind?', 'Cancel it any time in Shield']);
        return { message: 'Held for your protection', held: true, receipt: { title: 'On hold for your protection', amount: d.display, lines } };
    };

    function heldRow(id) { const h = db.prepare('SELECT * FROM held_transfers WHERE id = ?').get(id); if (!h) fail('Transfer not found'); return h; }
    function executeHeld(h, who) {
        const result = tx(() => {
            const upd = db.prepare("UPDATE held_transfers SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'held'").run(who === 'guardian' ? 'approved' : 'released', h.id);
            if (!upd.changes) fail('This transfer is no longer waiting');
            return EXEC(h.type)(h.user_id, JSON.parse(h.payload));
        });
        try { return result(); } catch (e) { if (e instanceof BankError) db.prepare("UPDATE held_transfers SET status = 'failed' WHERE id = ?").run(h.id); throw e; }
    }
    R('post', '/api/shield/held/cancel', (req, uid) => {
        const h = heldRow(parseInt(req.body.id, 10));
        if (h.user_id !== uid || h.status !== 'held') fail('This transfer cannot be cancelled');
        db.prepare("UPDATE held_transfers SET status = 'cancelled', decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(h.id);
        shieldEvent(uid, 'cancelled', h.score, h.amount_kzt, { label: h.label });
        notify(uid, 'shield', 'Transfer cancelled', `${h.display} to ${h.label} was cancelled. Nothing was sent.`);
        return { message: 'Cancelled. No money was sent.' };
    });
    R('post', '/api/shield/held/release', (req, uid) => {
        const h = heldRow(parseInt(req.body.id, 10));
        if (h.user_id !== uid || h.status !== 'held') fail('This transfer cannot be sent');
        if (h.guardian_id) fail('Your guardian has to approve this transfer.');
        if (Date.now() < h.release_at) fail(`Please wait ${Math.ceil((h.release_at - Date.now()) / 1000)} s: the cooling-off period is not over yet.`);
        const r = executeHeld(h, 'owner'); shieldEvent(uid, 'released', h.score, h.amount_kzt, {}); return r;
    });
    R('post', '/api/shield/held/approve', (req, uid) => {
        const h = heldRow(parseInt(req.body.id, 10));
        if (h.guardian_id !== uid || h.status !== 'held') fail('Nothing to approve');
        const r = executeHeld(h, 'guardian');
        notify(h.user_id, 'shield', 'Transfer approved', `Your guardian approved ${h.display} to ${h.label}. It was sent.`);
        shieldEvent(h.user_id, 'approved', h.score, h.amount_kzt, {});
        return { message: 'Approved and sent' };
    });
    R('post', '/api/shield/held/decline', (req, uid) => {
        const h = heldRow(parseInt(req.body.id, 10));
        if (h.guardian_id !== uid || h.status !== 'held') fail('Nothing to decline');
        db.prepare("UPDATE held_transfers SET status = 'declined', decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(h.id);
        notify(h.user_id, 'shield', 'Transfer declined', `Your guardian declined ${h.display} to ${h.label}. Nothing was sent. If you are being pressured, call the bank.`);
        shieldEvent(h.user_id, 'guardian_declined', h.score, h.amount_kzt, { label: h.label });
        return { message: 'Declined. The money stays safe.' };
    });

    // ---- guardian (trusted person) ----
    R('post', '/api/shield/guardian/invite', (req, uid) => {
        const g = findUserByPhone(req.body.phone);
        if (!g) fail('No bcc.kz client with this phone number');
        if (g.id === uid) fail('You cannot be your own guardian');
        db.prepare("DELETE FROM guardians WHERE user_id = ?").run(uid);
        const id = db.prepare('INSERT INTO guardians (user_id, guardian_id) VALUES (?, ?)').run(uid, g.id).lastInsertRowid;
        notify(g.id, 'guardian_invite', 'Guardian request', `${maskName(userRow(uid).full_name)} asks you to be their trusted guardian: you approve their risky transfers.`, { guardianLinkId: id });
        return { message: `Invitation sent to ${maskName(g.full_name)}` };
    });
    R('post', '/api/shield/guardian/respond', (req, uid) => {
        const g = db.prepare('SELECT * FROM guardians WHERE id = ? AND guardian_id = ?').get(parseInt(req.body.id, 10), uid);
        if (!g || g.status !== 'pending') fail('This request is no longer valid');
        if (req.body.accept) { db.prepare("UPDATE guardians SET status = 'active' WHERE id = ?").run(g.id); notify(g.user_id, 'shield', 'Guardian accepted', `${maskName(userRow(uid).full_name)} is now your guardian.`); }
        else { db.prepare('DELETE FROM guardians WHERE id = ?').run(g.id); notify(g.user_id, 'shield', 'Guardian declined', 'Your guardian request was declined.'); }
        return { message: req.body.accept ? 'You are now a guardian' : 'Declined' };
    });
    R('post', '/api/shield/guardian/remove', async (req, uid) => {
        if (!db.prepare('SELECT 1 FROM guardians WHERE user_id = ?').get(uid)) fail('You have no guardian');
        return { otpRequired: true, otp: await createPending(uid, 'guardian_remove', {}, phoneOf(uid)) };
    });
    executors.guardian_remove = (uid) => { db.prepare('DELETE FROM guardians WHERE user_id = ?').run(uid); return { message: 'Guardian removed' }; };

    // ---- panic button ----
    R('post', '/api/shield/panic', (req, uid) => {
        const n = db.prepare("UPDATE accounts SET frozen = 1 WHERE user_id = ? AND account_type = 'card'").run(uid).changes;
        db.prepare('UPDATE autotransfers SET active = 0 WHERE user_id = ?').run(uid);
        shieldEvent(uid, 'panic', 0, 0, { cards: n });
        notify(uid, 'security', 'Everything is frozen', `${n} card(s) frozen and automatic transfers paused. Unfreezing needs an SMS code.`);
        logger.warn('SHIELD PANIC', { userId: uid, cards: n });
        return { message: `${n} card(s) frozen and automatic transfers paused` };
    });

    R('get', '/api/shield', (req, uid) => {
        const held = db.prepare("SELECT id, type, score, reasons, display, label, status, release_at, guardian_id, created_at FROM held_transfers WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(uid);
        held.forEach(h => { h.reasons = JSON.parse(h.reasons || '[]'); h.guardianName = h.guardian_id ? maskName(userRow(h.guardian_id).full_name) : null; });
        const toApprove = db.prepare("SELECT h.id, h.display, h.label, h.score, h.reasons, h.created_at, u.full_name FROM held_transfers h JOIN users u ON u.id = h.user_id WHERE h.guardian_id = ? AND h.status = 'held' ORDER BY h.id DESC").all(uid)
            .map(h => ({ id: h.id, display: h.display, label: h.label, score: h.score, reasons: JSON.parse(h.reasons || '[]'), owner: maskName(h.full_name), created_at: h.created_at }));
        const g = db.prepare('SELECT * FROM guardians WHERE user_id = ?').get(uid);
        const wards = db.prepare("SELECT g.id, g.status, u.full_name FROM guardians g JOIN users u ON u.id = g.user_id WHERE g.guardian_id = ?").all(uid).map(w => ({ id: w.id, status: w.status, name: maskName(w.full_name) }));
        const ev = (k) => db.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount_kzt),0) s FROM shield_events WHERE user_id = ? AND kind = ?').get(uid, k);
        const stopped = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_kzt),0) s FROM shield_events WHERE user_id = ? AND kind IN ('cancelled','guardian_declined')").get(uid);
        return {
            holdMinutes: SH.holdMinutes, guardian: g ? { id: g.id, status: g.status, name: maskName(userRow(g.guardian_id).full_name) } : null,
            wards, toApprove, held, stats: { checked: ev('checked').c + ev('warned').c + ev('high_risk').c, warned: ev('warned').c, held: ev('held').c, stoppedCount: stopped.c, stoppedKzt: round2(stopped.s) },
            frozenCards: db.prepare("SELECT COUNT(*) c FROM accounts WHERE user_id = ? AND frozen = 1").get(uid).c
        };
    });

    // "Is this a scam?" check without sending anything
    R('post', '/api/shield/check', (req, uid) => {
        const kind = req.body.kind;
        const amount = parseAmount(req.body.amount); if (amount === null) fail('Enter an amount');
        const from = req.body.fromAccount || (db.prepare("SELECT account_number FROM accounts WHERE user_id = ? AND account_type = 'card' AND is_active = 1 ORDER BY id LIMIT 1").get(uid) || {}).account_number;
        if (!from) fail('You need a card first');
        if (!['phone', 'card'].includes(kind)) fail('Choose phone or card');
        const target = kind === 'phone' ? findUserByPhone(req.body.to) : findAccountByCard(req.body.to);
        if (!target) return { notClient: true, level: 'medium', score: 40, reasons: [{ text: 'This is not a bcc.kz client, so we cannot see the account behind it. Treat it as unverified.' }], advice: ADVICE };
        const r = describe(uid, 'transfer', { transferType: kind, fromAccount: from, toAccount: req.body.to, amount }); if (!r) fail('Cannot check this recipient');
        const a = assess(uid, 'transfer', { transferType: kind, fromAccount: from, toAccount: req.body.to, amount, coached: !!req.body.coached });
        return { ...a, recipient: kind === 'phone' ? maskName(target.full_name) : maskName(target.owner_name) };
    });

    // Simulator for presentations: how Shield reacts to typical scams (nothing is stored)
    const SCENARIOS = {
        safe_account: { title: '"Bank security" calls: move your money to a safe account', f: { newRecipient: true, drain: 0.9, night: false, mule: true, recipientNew: true, coached: true } },
        fake_invest: { title: 'Fake investment: first crypto transfer of most of the savings', f: { newRecipient: true, drain: 0.75, crypto: true, unusual: true } },
        marketplace: { title: 'Marketplace prepayment to a brand new card', f: { newRecipient: true, drain: 0.2, recipientNew: true, mule: true } },
        landlord: { title: 'Normal: monthly rent to the same landlord', f: { newRecipient: false, drain: 0.1 } },
        abroad: { title: 'First transfer abroad to a new beneficiary', f: { newRecipient: true, drain: 0.3, intl: true } }
    };
    R('get', '/api/shield/scenarios', () => ({ scenarios: Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, ...scoreFactors(s.f) })), advice: ADVICE }));

    // ================= bank team dashboard =================
    R('get', '/api/admin/overview', (req, uid) => {
        if (!isAdmin(uid)) fail('This page is for the bank team only');
        const one = (sql, ...a) => db.prepare(sql).get(...a);
        const bal = db.prepare('SELECT currency, ROUND(SUM(balance),2) s, COUNT(*) n FROM accounts GROUP BY currency').all();
        const ev = db.prepare("SELECT kind, COUNT(*) c, ROUND(COALESCE(SUM(amount_kzt),0),0) s FROM shield_events GROUP BY kind").all();
        const evm = {}; ev.forEach(e => { evm[e.kind] = e; });
        const stopped = one("SELECT COUNT(*) c, COALESCE(SUM(amount_kzt),0) s FROM shield_events WHERE kind IN ('cancelled','guardian_declined')");
        const reasonCount = {};
        db.prepare("SELECT details FROM shield_events WHERE kind IN ('warned','high_risk','held') AND details IS NOT NULL").all().forEach(r => { try { (JSON.parse(r.details).reasons || []).forEach(c => { reasonCount[c] = (reasonCount[c] || 0) + 1; }); } catch (e) { /* ignore */ } });
        const volume = {}; db.prepare("SELECT transaction_type t, currency c, SUM(amount) s, COUNT(*) n FROM transactions WHERE transaction_date >= datetime('now','-30 days') GROUP BY transaction_type, currency").all().forEach(r => { const k = CATEGORY_OF[r.t] || (INCOME_TYPES.includes(r.t) ? 'Incoming' : 'Other'); volume[k] = volume[k] || { kzt: 0, n: 0 }; volume[k].kzt += toKzt(r.s, r.c); volume[k].n += r.n; });
        return {
            users: one('SELECT COUNT(*) c FROM users').c, newUsers7d: one("SELECT COUNT(*) c FROM users WHERE created_at >= datetime('now','-7 days')").c,
            balances: bal, plusSubscribers: one("SELECT COUNT(*) c FROM subscriptions WHERE active_until > ?", new Date().toISOString()).c,
            shield: { checked: (evm.checked || { c: 0 }).c + (evm.warned || { c: 0 }).c + (evm.high_risk || { c: 0 }).c, warned: (evm.warned || { c: 0 }).c, held: (evm.held || { c: 0 }).c, heldKzt: (evm.held || { s: 0 }).s, stoppedCount: stopped.c, stoppedKzt: round2(stopped.s), panic: (evm.panic || { c: 0 }).c, cardsFrozen: (evm.card_frozen || { c: 0 }).c, guardians: one("SELECT COUNT(*) c FROM guardians WHERE status = 'active'").c, reasons: reasonCount },
            volume30d: Object.entries(volume).map(([name, v]) => ({ name, kzt: round2(v.kzt), n: v.n })).sort((a, b) => b.kzt - a.kzt),
            loansOutstandingKzt: round2(one("SELECT COALESCE(SUM(remaining),0) s FROM loans WHERE status = 'active'").s), activeLoans: one("SELECT COUNT(*) c FROM loans WHERE status = 'active'").c,
            autotransfers: one('SELECT COUNT(*) c FROM autotransfers WHERE active = 1').c,
            refundsOpen: db.prepare("SELECT r.id, r.reason, r.comment, r.created_at, t.amount, t.currency, t.description, u.full_name FROM refund_requests r JOIN transactions t ON t.id = r.tx_id JOIN users u ON u.id = r.user_id WHERE r.status = 'review' ORDER BY r.id DESC LIMIT 20").all().map(r => ({ ...r, full_name: maskName(r.full_name) })),
            callbacks: db.prepare("SELECT s.id, s.details, s.created_at, u.full_name FROM service_requests s JOIN users u ON u.id = s.user_id WHERE s.kind = 'callback' AND s.status = 'booked' ORDER BY s.id DESC LIMIT 10").all().map(r => ({ id: r.id, created_at: r.created_at, name: maskName(r.full_name), details: JSON.parse(r.details || '{}') }))
        };
    });
    R('post', '/api/admin/refund', (req, uid) => {
        if (!isAdmin(uid)) fail('This page is for the bank team only');
        return tx(() => {
            const r = db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(parseInt(req.body.id, 10));
            if (!r || r.status !== 'review') fail('Request not found');
            if (!req.body.approve) { db.prepare("UPDATE refund_requests SET status = 'declined', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(r.id); notify(r.user_id, 'refund', 'Refund declined', 'Your refund request was reviewed and declined.'); return { message: 'Declined' }; }
            const t = db.prepare('SELECT * FROM transactions WHERE id = ?').get(r.tx_id);
            const accs = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1').all(r.user_id);
            const target = accs.find(a => accLabel(a) === t.from_account) || accs.find(a => a.currency === t.currency);
            if (!target) fail('No account to refund to');
            credit(target, t.amount);
            insertTx(r.user_id, 'refund', t.amount, t.currency, 'bcc.kz', accLabel(target), `Refund: ${t.description || 'operation'}`, 'completed', { refundOf: t.id });
            db.prepare("UPDATE refund_requests SET status = 'approved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(r.id);
            notify(r.user_id, 'refund', 'Refund approved', `${fmtMoney(t.amount, t.currency)} was returned to ${accLabel(target)}.`);
            return { message: 'Approved and refunded' };
        })();
    });
    R('get', '/api/admin/me', (req, uid) => ({ admin: isAdmin(uid) }));

    // ================= cashback =================
    const CB_CATS = [
        { id: 'mobile', name: 'Mobile' }, { id: 'utilities', name: 'Utilities' }, { id: 'internet', name: 'Internet & TV' },
        { id: 'transport', name: 'Transport' }, { id: 'entertainment', name: 'Entertainment' }, { id: 'insurance', name: 'Insurance' }
    ];
    const monthKey = () => new Date().toISOString().slice(0, 7);
    const cbBalance = (uid) => round2(db.prepare('SELECT COALESCE(SUM(amount),0) s FROM cashback_ledger WHERE user_id = ?').get(uid).s);
    const chosenCats = (uid) => { const c = db.prepare('SELECT * FROM cashback_choices WHERE user_id = ?').get(uid); return c && c.month === monthKey() ? JSON.parse(c.cats) : []; };
    function cashbackRate(uid, cat) { return (chosenCats(uid).includes(cat) ? 5 : 1) + (isPlus(uid) ? 2 : 0); }
    function earnCashback(uid, cat, amountKzt, note) {
        const rate = cashbackRate(uid, cat), amount = Math.min(5000, Math.floor(amountKzt * rate / 100));
        if (amount > 0) db.prepare("INSERT INTO cashback_ledger (user_id, amount, kind, note) VALUES (?, ?, 'earn', ?)").run(uid, amount, note);
        return { amount, rate };
    }
    R('get', '/api/cashback', (req, uid) => ({
        balance: cbBalance(uid), month: monthKey(), chosen: chosenCats(uid), plus: isPlus(uid), categories: CB_CATS.map(c => ({ ...c, rate: cashbackRate(uid, c.id) })),
        history: db.prepare('SELECT amount, kind, note, created_at FROM cashback_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(uid)
    }));
    R('post', '/api/cashback/choose', (req, uid) => {
        const cats = [...new Set((req.body.cats || []).map(String))].filter(c => CB_CATS.some(x => x.id === c));
        if (cats.length > 3) fail('Choose up to 3 categories');
        db.prepare('INSERT INTO cashback_choices (user_id, month, cats) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET month = excluded.month, cats = excluded.cats').run(uid, monthKey(), JSON.stringify(cats));
        return { message: cats.length ? 'Categories saved for this month' : 'No categories selected' };
    });
    R('post', '/api/cashback/withdraw', (req, uid) => tx(() => {
        const bal = cbBalance(uid); if (bal < 100) fail('Minimum to withdraw is 100 ₸');
        const a = getOwnAccount(uid, req.body.toAccount); if (!a) fail('Account not found'); if (a.currency !== 'KZT') fail('Choose a KZT account');
        credit(a, bal);
        db.prepare("INSERT INTO cashback_ledger (user_id, amount, kind, note) VALUES (?, ?, 'withdraw', 'Withdrawn to card')").run(uid, -bal);
        insertTx(uid, 'cashback_withdraw', bal, 'KZT', 'Cashback', accLabel(a), 'Cashback paid out', 'completed', null);
        return { message: `${fmtMoney(bal, 'KZT')} cashback paid to ${accLabel(a)}` };
    })());

    // ================= bill payments =================
    const BILLERS = [
        { id: 'mobile', name: 'Mobile', label: 'Phone number', pattern: /^\d{10,15}$/, providers: ['Beeline', 'Kcell', 'Tele2', 'Altel'] },
        { id: 'utilities', name: 'Utilities', label: 'Personal account number', pattern: /^[A-Za-z0-9-]{5,20}$/, providers: ['Electricity', 'Water supply', 'Gas', 'Heating', 'Waste collection'] },
        { id: 'internet', name: 'Internet & TV', label: 'Contract number', pattern: /^[A-Za-z0-9-]{5,20}$/, providers: ['Kazakhtelecom', 'Home internet', 'Cable TV'] },
        { id: 'transport', name: 'Transport', label: 'Transport card number', pattern: /^\d{8,19}$/, providers: ['City transport card', 'Parking'] },
        { id: 'entertainment', name: 'Entertainment', label: 'Account or e-mail', pattern: /^[^\s]{4,40}$/, providers: ['Cinema tickets', 'Streaming service', 'Games'] }
    ];
    R('get', '/api/billers', () => ({ billers: BILLERS.map(b => ({ id: b.id, name: b.name, label: b.label, providers: b.providers })) }));
    R('post', '/api/bills/pay', (req, uid) => {
        const b = BILLERS.find(x => x.id === req.body.category); if (!b) fail('Choose a category');
        const provider = String(req.body.provider || ''); if (!b.providers.includes(provider)) fail('Choose a provider');
        const ident = String(req.body.identifier || '').replace(/[\s()+]/g, ''); if (!b.pattern.test(ident)) fail(`Check the ${b.label.toLowerCase()}`);
        const amountKzt = parseAmount(req.body.amount); if (amountKzt === null || amountKzt < 100 || amountKzt > 1000000) fail('Amount must be between 100 ₸ and 1 000 000 ₸');
        return tx(() => {
            const a = spendable(uid, req.body.fromAccount), cost = convert(amountKzt, 'KZT', a.currency);
            debit(a, cost);
            const cb = earnCashback(uid, b.id, amountKzt, `${provider} payment`);
            insertTx(uid, 'bill_payment', cost, a.currency, accLabel(a), provider, `Payment: ${provider}`, 'completed', { category: b.name, provider, identifier: '••' + ident.slice(-4), amountKzt, cashback: cb.amount });
            const sv = hooks.afterSpend ? hooks.afterSpend(uid, a, amountKzt, cb.amount) : {};
            const lines = [['Provider', provider], [b.label, '••' + ident.slice(-4)], ['Paid from', accLabel(a)], ['Cashback', `${fmtMoney(cb.amount, 'KZT')} (${cb.rate}%)`]];
            if (sv.roundUp) lines.push(['Round-up to goal', `${fmtMoney(sv.roundUp, 'KZT')} → ${sv.goalName}`]);
            if (sv.cashbackToGoal) lines.push(['Cashback went to goal', sv.goalName]);
            return { message: 'Payment completed', receipt: { title: 'Payment completed', amount: fmtMoney(amountKzt, 'KZT'), lines } };
        })();
    });

    // ================= public services (DEMO data generated from the IIN) =================
    function iinValid(iin) {
        if (!/^\d{12}$/.test(iin)) return false;
        const d = iin.split('').map(Number);
        const mm = d[2] * 10 + d[3], dd = d[4] * 10 + d[5];
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
        let s = 0; for (let i = 0; i < 11; i++) s += d[i] * (i + 1);
        let c = s % 11;
        if (c === 10) { const w = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]; s = 0; for (let i = 0; i < 11; i++) s += d[i] * w[i]; c = s % 11; }
        return c !== 10 && c === d[11];
    }
    const seedBytes = (k) => crypto.createHash('sha256').update('gov:' + k).digest();
    function taxItems(iin) {
        const b = seedBytes(iin), items = [];
        const fines = b[0] % 4;
        const titles = ['Speeding fine', 'Parking violation', 'Seat belt fine', 'Red light fine'];
        for (let i = 0; i < fines; i++) items.push({ key: `fine-${iin}-${i}`, title: titles[(b[i + 1]) % 4], amount: 10000 + (b[i + 5] % 20) * 1000, kind: 'fine' });
        if (b[9] % 3 !== 0) items.push({ key: `ptax-${iin}`, title: 'Property tax 2026', amount: 5000 + (b[10] % 56) * 1000, kind: 'tax' });
        if (b[11] % 2 === 0) items.push({ key: `vtax-${iin}`, title: 'Transport tax 2026', amount: 3000 + (b[12] % 30) * 1000, kind: 'tax' });
        return items;
    }
    R('post', '/api/gov/lookup', (req, uid) => {
        const kind = req.body.kind;
        if (kind === 'vehicle') {
            const plate = String(req.body.plate || '').toUpperCase().replace(/\s/g, '');
            if (!/^\d{3}[A-Z]{2,3}\d{2}$/.test(plate)) fail('Plate format: 123ABC02');
            const b = seedBytes(plate);
            return { demo: true, kind, plate, pledge: b[0] % 5 === 0, arrest: b[1] % 9 === 0, inspectionUntil: `20${27 + b[2] % 2}-${String(1 + b[3] % 12).padStart(2, '0')}-15` };
        }
        const iin = String(req.body.iin || '').replace(/\s/g, '');
        if (!iinValid(iin)) fail('Invalid IIN (12 digits with a correct check digit)');
        const b = seedBytes(iin);
        if (kind === 'taxes') {
            const paid = new Set(db.prepare('SELECT item_key FROM gov_paid WHERE user_id = ?').all(uid).map(r => r.item_key));
            return { demo: true, kind, iin: '••••••••' + iin.slice(-4), items: taxItems(iin).filter(i => !paid.has(i.key)) };
        }
        if (kind === 'pension') return { demo: true, kind, iin: '••••••••' + iin.slice(-4), totalKzt: 400000 + b[3] * b[4] * 97, thisYearKzt: 50000 + b[5] * 1100, lastContribution: `2026-0${1 + b[6] % 9}-${String(10 + b[7] % 18)}` };
        if (kind === 'osms') return { demo: true, kind, iin: '••••••••' + iin.slice(-4), insured: b[10] % 4 !== 0, paidUntil: `2026-${String(10 + b[11] % 3)}-01` };
        fail('Unknown service');
    });
    R('post', '/api/gov/pay', (req, uid) => {
        const iin = String(req.body.iin || '').replace(/\s/g, ''); if (!iinValid(iin)) fail('Invalid IIN');
        const item = taxItems(iin).find(i => i.key === req.body.itemKey); if (!item) fail('Item not found');
        return tx(() => {
            if (db.prepare('SELECT 1 FROM gov_paid WHERE user_id = ? AND item_key = ?').get(uid, item.key)) fail('Already paid');
            const a = spendable(uid, req.body.fromAccount), cost = convert(item.amount, 'KZT', a.currency);
            debit(a, cost);
            db.prepare('INSERT INTO gov_paid (user_id, item_key) VALUES (?, ?)').run(uid, item.key);
            insertTx(uid, 'tax_payment', cost, a.currency, accLabel(a), 'State budget', item.title, 'completed', { service: item.title, amountKzt: item.amount, iin: '••••' + iin.slice(-4) });
            return { message: 'Paid', receipt: { title: 'Payment completed', amount: fmtMoney(item.amount, 'KZT'), lines: [['For', item.title], ['IIN', '••••' + iin.slice(-4)], ['Paid from', accLabel(a)], ['Note', 'Demo: no real government system']] } };
        })();
    });

    // ================= loans =================
    const L = cfg.LOAN;
    const annuity = (p, apr, n) => { const r = apr / 1200; return round2(p * r / (1 - Math.pow(1 + r, -n))); };
    function loanQuote(amount, months) {
        if (!(amount >= L.minAmount && amount <= L.maxAmount)) fail(`Amount must be between ${fmtMoney(L.minAmount, 'KZT')} and ${fmtMoney(L.maxAmount, 'KZT')}`);
        if (!L.months.includes(months)) fail('Choose a term from the list');
        const monthly = annuity(amount, L.aprPercent, months);
        return { monthly, total: round2(monthly * months), overpay: round2(monthly * months - amount), apr: L.aprPercent };
    }
    R('get', '/api/loans', (req, uid) => ({
        config: L,
        loans: db.prepare('SELECT * FROM loans WHERE user_id = ? ORDER BY id DESC').all(uid).map(l => ({ ...l, nextPayment: l.status === 'active' ? round2(Math.min(l.monthly, l.remaining * (1 + l.apr / 1200))) : 0, fullRepay: l.status === 'active' ? round2(l.remaining * (1 + l.apr / 1200)) : 0 }))
    }));
    R('post', '/api/loans/quote', (req) => loanQuote(parseAmount(req.body.amount) || 0, parseInt(req.body.months, 10)));
    R('post', '/api/loans/apply', (req, uid) => {
        const amount = parseAmount(req.body.amount) || 0, months = parseInt(req.body.months, 10), income = parseAmount(req.body.income);
        const q = loanQuote(amount, months);
        if (income === null) fail('Enter your monthly income');
        return tx(() => {
            if (db.prepare("SELECT COUNT(*) c FROM loans WHERE user_id = ? AND status = 'active'").get(uid).c >= 2) fail('You can have up to 2 active loans');
            const existing = db.prepare("SELECT COALESCE(SUM(monthly),0) s FROM loans WHERE user_id = ? AND status = 'active'").get(uid).s;
            const maxMonthly = income * 0.4 - existing;
            if (q.monthly > maxMonthly) {
                const maxAmount = Math.max(0, Math.floor(maxMonthly / annuity(1, L.aprPercent, months) / 1000) * 1000);
                return { success: true, approved: false, message: `Declined: the payment ${fmtMoney(q.monthly, 'KZT')} is above 40% of your income. ${maxAmount >= L.minAmount ? `A loan up to ${fmtMoney(maxAmount, 'KZT')} would be approved.` : 'Try a longer term or a smaller amount.'}` };
            }
            const a = getOwnAccount(uid, req.body.toAccount); if (!a || a.currency !== 'KZT') fail('Choose a KZT account for the money');
            const id = db.prepare('INSERT INTO loans (user_id, principal, apr, months, monthly, remaining) VALUES (?, ?, ?, ?, ?, ?)').run(uid, amount, L.aprPercent, months, q.monthly, amount).lastInsertRowid;
            credit(a, amount);
            insertTx(uid, 'loan_disbursement', amount, 'KZT', 'bcc.kz loan', accLabel(a), `Loan #${id} paid out`, 'completed', { loanId: id, apr: L.aprPercent, months });
            notify(uid, 'loan', 'Loan approved', `${fmtMoney(amount, 'KZT')} was sent to ${accLabel(a)}. Monthly payment: ${fmtMoney(q.monthly, 'KZT')}.`);
            return { success: true, approved: true, message: 'Approved! The money is on your account.', receipt: { title: 'Loan approved', amount: fmtMoney(amount, 'KZT'), lines: [['Term', `${months} months`], ['Rate (demo)', `${L.aprPercent}% per year`], ['Monthly payment', fmtMoney(q.monthly, 'KZT')], ['Paid to', accLabel(a)]] } };
        })();
    });
    R('post', '/api/loans/pay', (req, uid) => tx(() => {
        const l = db.prepare('SELECT * FROM loans WHERE id = ? AND user_id = ?').get(parseInt(req.body.loanId, 10), uid);
        if (!l || l.status !== 'active') fail('Loan not found');
        const a = spendable(uid, req.body.fromAccount, 'KZT');
        const interest = round2(l.remaining * l.apr / 1200), full = round2(l.remaining + interest);
        const pay = req.body.full ? full : Math.min(l.monthly, full);
        debit(a, pay);
        const principalPart = round2(pay - interest), remaining = Math.max(0, round2(l.remaining - principalPart));
        db.prepare('UPDATE loans SET remaining = ?, paid_count = paid_count + 1, status = ? WHERE id = ?').run(remaining, remaining <= 0.009 ? 'closed' : 'active', l.id);
        insertTx(uid, 'loan_payment', pay, 'KZT', accLabel(a), `Loan #${l.id}`, remaining <= 0.009 ? `Loan #${l.id} fully repaid` : `Loan #${l.id} payment`, 'completed', { loanId: l.id, interest, principal: principalPart });
        return { message: remaining <= 0.009 ? 'The loan is fully repaid. Congratulations!' : 'Payment accepted', receipt: { title: remaining <= 0.009 ? 'Loan repaid' : 'Payment accepted', amount: fmtMoney(pay, 'KZT'), lines: [['Interest', fmtMoney(interest, 'KZT')], ['Principal', fmtMoney(principalPart, 'KZT')], ['Left to pay', fmtMoney(remaining, 'KZT')]] } };
    })());

    // ================= investments (simulated market) =================
    const INSTR = [
        { symbol: 'KZBC', name: 'Kazakhstan Blue Chips fund', base: 1000, vol: 0.05, seed: 1 },
        { symbol: 'USTX', name: 'US Tech index fund', base: 450, vol: 0.07, seed: 2 },
        { symbol: 'GOLD', name: 'Gold, 1 gram', base: 95, vol: 0.03, seed: 3 },
        { symbol: 'EB30', name: 'Government bond 2030', base: 100, vol: 0.01, seed: 4 }
    ];
    const priceAt = (ins, t) => { const h = Math.floor(t / 3.6e6); return round2(ins.base * (1 + ins.vol * Math.sin(h / 9 + ins.seed) + ins.vol * 0.4 * Math.sin(h / 2.3 + ins.seed * 2))); };
    R('get', '/api/invest', (req, uid) => {
        const now = Date.now();
        const instruments = INSTR.map(i => { const p = priceAt(i, now), p0 = priceAt(i, now - 864e5); return { symbol: i.symbol, name: i.name, priceUsd: p, change24h: round2((p / p0 - 1) * 100) }; });
        const positions = db.prepare('SELECT * FROM positions WHERE user_id = ? AND qty > 0').all(uid).map(p => { const ins = instruments.find(i => i.symbol === p.symbol); const value = round2(p.qty * ins.priceUsd); return { symbol: p.symbol, name: ins.name, qty: p.qty, valueUsd: value, costUsd: round2(p.cost_usd), pnlUsd: round2(value - p.cost_usd) }; });
        return { demo: true, instruments, positions };
    });
    R('post', '/api/invest/trade', (req, uid) => {
        const ins = INSTR.find(i => i.symbol === req.body.symbol); if (!ins) fail('Choose an instrument');
        const qty = Number(req.body.qty); if (!Number.isInteger(qty) || qty < 1 || qty > 100000) fail('Quantity must be a whole number');
        const side = req.body.side === 'sell' ? 'sell' : 'buy', price = priceAt(ins, Date.now()), valueUsd = round2(qty * price);
        return tx(() => {
            const a = side === 'buy' ? spendable(uid, req.body.account) : getOwnAccount(uid, req.body.account);
            if (!a) fail('Account not found');
            const pos = db.prepare('SELECT * FROM positions WHERE user_id = ? AND symbol = ?').get(uid, ins.symbol);
            if (side === 'buy') {
                debit(a, convert(valueUsd, 'USD', a.currency));
                db.prepare('INSERT INTO positions (user_id, symbol, qty, cost_usd) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, symbol) DO UPDATE SET qty = qty + excluded.qty, cost_usd = cost_usd + excluded.cost_usd').run(uid, ins.symbol, qty, valueUsd);
                insertTx(uid, 'invest_buy', convert(valueUsd, 'USD', a.currency), a.currency, accLabel(a), ins.symbol, `Bought ${qty} × ${ins.symbol}`, 'completed', { symbol: ins.symbol, qty, priceUsd: price });
            } else {
                if (!pos || pos.qty < qty) fail('You do not own that many');
                const costPart = round2(pos.cost_usd * qty / pos.qty);
                credit(a, convert(valueUsd, 'USD', a.currency));
                db.prepare('UPDATE positions SET qty = qty - ?, cost_usd = cost_usd - ? WHERE user_id = ? AND symbol = ?').run(qty, costPart, uid, ins.symbol);
                insertTx(uid, 'invest_sell', convert(valueUsd, 'USD', a.currency), a.currency, ins.symbol, accLabel(a), `Sold ${qty} × ${ins.symbol}`, 'completed', { symbol: ins.symbol, qty, priceUsd: price, pnlUsd: round2(valueUsd - costPart) });
            }
            return { message: `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} × ${ins.symbol}`, receipt: { title: side === 'buy' ? 'Purchase completed' : 'Sale completed', amount: fmtMoney(valueUsd, 'USD'), lines: [['Instrument', ins.name], ['Quantity', String(qty)], ['Price (demo)', fmtMoney(price, 'USD')], ['Account', accLabel(a)]] } };
        })();
    });

    // ================= money requests =================
    R('get', '/api/requests', (req, uid) => {
        const row = (r, other) => ({ id: r.id, amount: r.amount, currency: r.currency, note: r.note, status: r.status, created_at: r.created_at, other: maskName(userRow(other).full_name) });
        return {
            incoming: db.prepare('SELECT * FROM money_requests WHERE payer_id = ? ORDER BY id DESC LIMIT 30').all(uid).map(r => row(r, r.requester_id)),
            outgoing: db.prepare('SELECT * FROM money_requests WHERE requester_id = ? ORDER BY id DESC LIMIT 30').all(uid).map(r => row(r, r.payer_id))
        };
    });
    R('post', '/api/requests/create', (req, uid) => {
        const phones = String(req.body.phones || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        if (!phones.length || phones.length > 5) fail('Add 1 to 5 phone numbers');
        const currency = req.body.currency === 'USD' ? 'USD' : 'KZT';
        let total = parseAmount(req.body.amount); if (total === null) fail('Enter an amount');
        const each = req.body.split ? round2(total / phones.length) : total;
        if (each <= 0) fail('Amount is too small');
        const note = cleanText(req.body.note, 100), me = userRow(uid);
        return tx(() => {
            const payers = phones.map(ph => { const u = findUserByPhone(ph); if (!u) fail(`${ph}: no bcc.kz client with this number`); if (u.id === uid) fail('You cannot request money from yourself'); return u; });
            payers.forEach(u => { const id = db.prepare('INSERT INTO money_requests (requester_id, payer_id, amount, currency, note) VALUES (?, ?, ?, ?, ?)').run(uid, u.id, each, currency, note).lastInsertRowid; notify(u.id, 'money_request', 'Money request', `${maskName(me.full_name)} asks for ${fmtMoney(each, currency)}${note ? ': ' + note : ''}`, { requestId: id }); });
            return { message: `Request sent to ${payers.length} ${payers.length === 1 ? 'person' : 'people'}` };
        })();
    });
    R('post', '/api/requests/decline', (req, uid) => { const r = db.prepare('SELECT * FROM money_requests WHERE id = ? AND payer_id = ?').get(parseInt(req.body.id, 10), uid); if (!r || r.status !== 'pending') fail('Request not found'); db.prepare("UPDATE money_requests SET status = 'declined' WHERE id = ?").run(r.id); notify(r.requester_id, 'money_request', 'Request declined', `${maskName(userRow(uid).full_name)} declined your request for ${fmtMoney(r.amount, r.currency)}.`); return { message: 'Declined' }; });
    R('post', '/api/requests/cancel', (req, uid) => { const r = db.prepare('SELECT * FROM money_requests WHERE id = ? AND requester_id = ?').get(parseInt(req.body.id, 10), uid); if (!r || r.status !== 'pending') fail('Request not found'); db.prepare("UPDATE money_requests SET status = 'cancelled' WHERE id = ?").run(r.id); return { message: 'Cancelled' }; });
    // Paying a request = a normal transfer to the requester (Shield + SMS code apply)
    R('post', '/api/requests/pay', async (req, uid, res) => {
        const r = db.prepare('SELECT * FROM money_requests WHERE id = ? AND payer_id = ?').get(parseInt(req.body.id, 10), uid);
        if (!r || r.status !== 'pending') fail('Request not found');
        const from = getOwnAccount(uid, req.body.fromAccount); if (!from) fail('Choose an account');
        const p = { requestId: r.id, transferType: 'phone', fromAccount: from.account_number, toAccount: '+' + phoneOf(r.requester_id), amount: convert(r.amount, r.currency, from.currency), description: r.note || 'Payment for request' };
        await startOtpOperation(req, res, 'request_pay', p, () => runTransfer(uid, { ...p }, true));
    });
    executors.request_pay = (uid, p) => {
        const r = db.prepare('SELECT * FROM money_requests WHERE id = ? AND payer_id = ?').get(p.requestId, uid);
        if (!r || r.status !== 'pending') fail('This request is no longer open');
        const out = runTransfer(uid, { transferType: 'phone', fromAccount: p.fromAccount, toAccount: p.toAccount, amount: p.amount, description: p.description }, false);
        db.prepare("UPDATE money_requests SET status = 'paid' WHERE id = ?").run(r.id);
        return out;
    };

    // ================= autotransfers (scheduled) =================
    const FREQ_MS = { minute: 60000, daily: 864e5, weekly: 7 * 864e5, monthly: 30 * 864e5 };
    R('get', '/api/autotransfers', (req, uid) => ({ items: db.prepare('SELECT * FROM autotransfers WHERE user_id = ? ORDER BY id DESC').all(uid) }));
    function parseAuto(uid, b) {
        const kind = b.kind === 'phone' ? 'phone' : 'own', amount = parseAmount(b.amount), freq = String(b.freq);
        if (amount === null) fail('Enter an amount'); if (!FREQ_MS[freq]) fail('Choose how often');
        const from = spendable(uid, b.fromAccount);
        if (kind === 'own') { const to = getOwnAccount(uid, b.to); if (!to || to.id === from.id) fail('Choose a different destination account'); }
        else { const u = findUserByPhone(b.to); if (!u) fail('No bcc.kz client with this phone number'); if (u.id === uid) fail('Use "own accounts" for your own money'); }
        return { kind, amount, freq, from: from.account_number, to: kind === 'own' ? String(b.to) : '+' + normalizePhone(b.to) };
    }
    const insertAuto = (uid, p) => db.prepare('INSERT INTO autotransfers (user_id, kind, from_account, to_value, amount, freq, next_run) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, p.kind, p.from, p.to, p.amount, p.freq, Date.now() + FREQ_MS[p.freq]).lastInsertRowid;
    R('post', '/api/autotransfers/create', async (req, uid) => {
        const p = parseAuto(uid, req.body);
        if (p.kind === 'own') { insertAuto(uid, p); return { message: 'Autotransfer created' }; }
        return { otpRequired: true, otp: await createPending(uid, 'autotransfer', p, phoneOf(uid)) };
    });
    executors.autotransfer = (uid, p) => { parseAuto(uid, { kind: p.kind, amount: p.amount, freq: p.freq, fromAccount: p.from, to: p.to }); insertAuto(uid, p); return { message: 'Autotransfer created. It is approved with your SMS code.' }; };
    R('post', '/api/autotransfers/toggle', (req, uid) => { const a = db.prepare('SELECT * FROM autotransfers WHERE id = ? AND user_id = ?').get(parseInt(req.body.id, 10), uid); if (!a) fail('Not found'); db.prepare('UPDATE autotransfers SET active = ?, failures = 0, next_run = ? WHERE id = ?').run(a.active ? 0 : 1, Date.now() + FREQ_MS[a.freq], a.id); return { message: a.active ? 'Paused' : 'Resumed' }; });
    R('post', '/api/autotransfers/delete', (req, uid) => { const r = db.prepare('DELETE FROM autotransfers WHERE id = ? AND user_id = ?').run(parseInt(req.body.id, 10), uid); if (!r.changes) fail('Not found'); return { message: 'Deleted' }; });
    function runAuto(a) {
        try {
            runTransfer(a.user_id, { transferType: a.kind === 'own' ? 'own' : 'phone', fromAccount: a.from_account, toAccount: a.to_value, amount: a.amount, description: 'Autotransfer' }, false);
            db.prepare("UPDATE autotransfers SET runs = runs + 1, failures = 0, last_status = 'ok', next_run = ? WHERE id = ?").run(Date.now() + FREQ_MS[a.freq], a.id);
            return 'ok';
        } catch (e) {
            const msg = e instanceof BankError ? e.message : 'Error';
            const fails = a.failures + 1;
            db.prepare('UPDATE autotransfers SET failures = ?, last_status = ?, active = ?, next_run = ? WHERE id = ?').run(fails, msg, fails >= 3 ? 0 : 1, Date.now() + FREQ_MS[a.freq], a.id);
            notify(a.user_id, 'autotransfer', 'Autotransfer failed', `${msg}${fails >= 3 ? ' It was paused after 3 failures.' : ''}`);
            if (!(e instanceof BankError)) logger.error(`AUTOTRANSFER ERROR: ${e.stack || e.message}`);
            return msg;
        }
    }
    R('post', '/api/autotransfers/run', (req, uid) => { const a = db.prepare('SELECT * FROM autotransfers WHERE id = ? AND user_id = ?').get(parseInt(req.body.id, 10), uid); if (!a) fail('Not found'); const r = runAuto(a); if (r !== 'ok') fail(r); return { message: 'Executed now' }; });
    setInterval(() => { try { db.prepare('SELECT * FROM autotransfers WHERE active = 1 AND next_run <= ?').all(Date.now()).forEach(runAuto); } catch (e) { logger.error(`SCHEDULER ERROR: ${e.message}`); } }, 15000);

    // ================= refund requests =================
    const REASONS = { not_mine: 'I did not make this operation', duplicate: 'Charged twice', wrong_amount: 'Wrong amount', not_received: 'Service or goods not received', other: 'Other' };
    R('get', '/api/refunds', (req, uid) => ({
        reasons: REASONS,
        items: db.prepare('SELECT r.id, r.reason, r.comment, r.status, r.created_at, t.amount, t.currency, t.description FROM refund_requests r JOIN transactions t ON t.id = r.tx_id WHERE r.user_id = ? ORDER BY r.id DESC').all(uid)
    }));
    R('post', '/api/refunds/create', (req, uid) => {
        const t = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(parseInt(req.body.txId, 10), uid);
        if (!t) fail('Operation not found');
        if (INCOME_TYPES.includes(t.transaction_type)) fail('Only outgoing operations can be disputed');
        if (t.transaction_type === 'refund') fail('This is already a refund');
        if (!REASONS[req.body.reason]) fail('Choose a reason');
        if (db.prepare("SELECT 1 FROM refund_requests WHERE tx_id = ? AND status IN ('review','approved')").get(t.id)) fail('A request for this operation already exists');
        db.prepare('INSERT INTO refund_requests (user_id, tx_id, reason, comment) VALUES (?, ?, ?, ?)').run(uid, t.id, req.body.reason, cleanText(req.body.comment, 300));
        notify(uid, 'refund', 'Refund request received', `We are reviewing your request for ${fmtMoney(t.amount, t.currency)}.`);
        if (req.body.reason === 'not_mine') notify(uid, 'security', 'Protect your money', 'Because you did not make this operation, we recommend freezing your cards in Shield and changing your password.');
        return { message: 'Request sent. We will review it.' };
    });
    R('post', '/api/refunds/cancel', (req, uid) => { const r = db.prepare("SELECT * FROM refund_requests WHERE id = ? AND user_id = ? AND status = 'review'").get(parseInt(req.body.id, 10), uid); if (!r) fail('Request not found'); db.prepare("UPDATE refund_requests SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(r.id); return { message: 'Cancelled' }; });

    // ================= insurance =================
    const INS = {
        travel: { name: 'Travel insurance', cat: 'insurance', calc: (p) => { const days = Math.round(p.days), n = Math.round(p.travelers); if (!(days >= 1 && days <= 365)) fail('Days: 1 to 365'); if (!(n >= 1 && n <= 6)) fail('Travelers: 1 to 6'); const z = { asia: 900, europe: 1400, world: 1900 }[p.zone]; if (!z) fail('Choose a zone'); return { premium: days * n * z, months: 0, days }; } },
        car: { name: 'Car insurance (OSAGO)', cat: 'insurance', calc: (p) => { const e = { '1.6': 1, '2.0': 1.4, '2.5': 1.8, 'over': 2.3 }[p.engine], a = { young: 1.6, adult: 1, senior: 1.2 }[p.age], r = { almaty: 1.4, astana: 1.3, other: 1 }[p.region]; if (!e || !a || !r) fail('Fill in all fields'); return { premium: Math.round(8000 * e * a * r), months: 12 }; } },
        home: { name: 'Home insurance', cat: 'insurance', calc: (p) => { const area = Number(p.area), value = Number(p.value); if (!(area >= 20 && area <= 500)) fail('Area: 20 to 500 m²'); if (!(value >= 1000000 && value <= 200000000)) fail('Value: 1 000 000 to 200 000 000 ₸'); return { premium: Math.round(value * 0.0012 + area * 40), months: 12 }; } }
    };
    R('post', '/api/insurance/quote', (req) => { const p = INS[req.body.product]; if (!p) fail('Choose a product'); return { premiumKzt: p.calc(req.body.params || {}).premium }; });
    R('get', '/api/insurance', (req, uid) => ({ policies: db.prepare('SELECT * FROM policies WHERE user_id = ? ORDER BY id DESC').all(uid).map(p => ({ ...p, params: JSON.parse(p.params), active: p.valid_to >= new Date().toISOString().slice(0, 10) })) }));
    R('post', '/api/insurance/buy', (req, uid) => {
        const prod = INS[req.body.product]; if (!prod) fail('Choose a product');
        const params = req.body.params || {}, q = prod.calc(params);
        return tx(() => {
            const a = spendable(uid, req.body.fromAccount), cost = convert(q.premium, 'KZT', a.currency);
            debit(a, cost);
            const from = new Date(), to = new Date();
            if (q.days) to.setDate(to.getDate() + q.days); else to.setMonth(to.getMonth() + q.months);
            const number = `BCC-${req.body.product.slice(0, 3).toUpperCase()}-${randomDigits(8)}`;
            db.prepare('INSERT INTO policies (user_id, product, params, premium_kzt, number, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?)').run(uid, req.body.product, JSON.stringify(params), q.premium, number, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
            const cb = earnCashback(uid, 'insurance', q.premium, prod.name);
            insertTx(uid, 'insurance_purchase', cost, a.currency, accLabel(a), prod.name, `${prod.name} ${number}`, 'completed', { policy: number, amountKzt: q.premium, cashback: cb.amount });
            return { message: 'Policy issued', receipt: { title: 'Policy issued', amount: fmtMoney(q.premium, 'KZT'), lines: [['Product', prod.name], ['Policy number', number], ['Valid until', to.toISOString().slice(0, 10)], ['Cashback', fmtMoney(cb.amount, 'KZT')]] } };
        })();
    });

    // ================= offers =================
    const OFFERS = [
        { id: 'coffee', title: '15% off at partner coffee shops', partner: 'Coffee partners', text: 'Show the code at the till when paying with a bcc.kz card.' },
        { id: 'cinema', title: 'Cinema: 2 tickets for the price of 1', partner: 'Cinema partners', text: 'Valid Monday to Thursday.' },
        { id: 'taxi', title: '10% off 5 taxi rides', partner: 'Taxi partners', text: 'Pay by card in the taxi app.' },
        { id: 'fitness', title: 'First month of fitness for 1 ₸', partner: 'Fitness clubs', text: 'New members only.' },
        { id: 'books', title: '20% off books and stationery', partner: 'Book stores', text: 'Valid in participating stores.' },
        { id: 'travel', title: '5% back on flights and hotels', partner: 'Travel partners', text: 'Pay with your bcc.kz USD card for the best rate.' }
    ];
    R('get', '/api/offers', (req, uid) => { const act = new Map(db.prepare('SELECT offer_id, code FROM offers_active WHERE user_id = ?').all(uid).map(r => [r.offer_id, r.code])); return { demo: true, offers: OFFERS.map(o => ({ ...o, active: act.has(o.id), code: act.get(o.id) || null })) }; });
    R('post', '/api/offers/activate', (req, uid) => {
        const o = OFFERS.find(x => x.id === req.body.id); if (!o) fail('Offer not found');
        const code = 'BCC-' + inviteCode(o.id + uid);
        db.prepare('INSERT OR IGNORE INTO offers_active (user_id, offer_id, code) VALUES (?, ?, ?)').run(uid, o.id, code);
        return { message: 'Offer activated', code };
    });

    // ================= safe deposit boxes + service requests =================
    const BOX = { S: { name: 'Small', priceKzt: 4000 }, M: { name: 'Medium', priceKzt: 6500 }, L: { name: 'Large', priceKzt: 9500 } };
    R('get', '/api/service-requests', (req, uid) => ({ boxes: BOX, items: db.prepare('SELECT * FROM service_requests WHERE user_id = ? ORDER BY id DESC').all(uid).map(r => ({ ...r, details: JSON.parse(r.details || '{}') })) }));
    R('post', '/api/safebox/book', (req, uid) => {
        const size = BOX[req.body.size]; if (!size) fail('Choose a box size');
        const months = parseInt(req.body.months, 10); if (![1, 3, 6, 12].includes(months)) fail('Choose a term');
        const branch = cleanText(req.body.branch, 80); if (!branch) fail('Choose a branch');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date))) fail('Choose a visit date');
        if (req.body.date < new Date().toISOString().slice(0, 10)) fail('The visit date cannot be in the past');
        return tx(() => {
            const a = spendable(uid, req.body.fromAccount), fee = size.priceKzt * months, cost = convert(fee, 'KZT', a.currency);
            debit(a, cost);
            const code = 'BOX-' + randomDigits(6);
            const id = db.prepare("INSERT INTO service_requests (user_id, kind, details, fee_kzt, code) VALUES (?, 'safe_box', ?, ?, ?)").run(uid, JSON.stringify({ size: req.body.size, months, branch, date: req.body.date }), fee, code).lastInsertRowid;
            insertTx(uid, 'service_fee', cost, a.currency, accLabel(a), 'Safe deposit box', `Safe box ${code}`, 'completed', { code, branch, amountKzt: fee });
            notify(uid, 'service', 'Safe box reserved', `${size.name} box at ${branch}. Visit on ${req.body.date} with your ID. Code ${code}.`);
            return { message: 'Box reserved', receipt: { title: 'Box reserved', amount: fmtMoney(fee, 'KZT'), lines: [['Size', size.name], ['Branch', branch], ['Visit date', req.body.date], ['Code', code]] } };
        })();
    });
    R('post', '/api/service-requests/cancel', (req, uid) => tx(() => {
        const r = db.prepare("SELECT * FROM service_requests WHERE id = ? AND user_id = ? AND status = 'booked' AND kind = 'safe_box'").get(parseInt(req.body.id, 10), uid);
        if (!r) fail('Reservation not found');
        const a = db.prepare("SELECT * FROM accounts WHERE user_id = ? AND currency = 'KZT' AND account_type = 'card' AND is_active = 1 ORDER BY id LIMIT 1").get(uid); if (!a) fail('No KZT card to refund to');
        credit(a, r.fee_kzt);
        db.prepare("UPDATE service_requests SET status = 'cancelled' WHERE id = ?").run(r.id);
        insertTx(uid, 'refund', r.fee_kzt, 'KZT', 'bcc.kz', accLabel(a), `Cancelled box ${r.code}`, 'completed', null);
        return { message: `Cancelled. ${fmtMoney(r.fee_kzt, 'KZT')} returned to ${accLabel(a)}` };
    })());

    // ================= QR =================
    // QR text format:  bcckz://pay?p=<phone digits>&a=<amount>&c=<KZT|USD>
    R('post', '/api/qr/resolve', (req, uid) => {
        const text = String(req.body.text || '').trim();
        const m = /^bcckz:\/\/pay\?(.+)$/.exec(text); if (!m) fail('This is not a bcc.kz payment QR code');
        const q = new URLSearchParams(m[1]), u = findUserByPhone('+' + String(q.get('p') || '').replace(/\D/g, ''));
        if (!u) fail('The owner of this QR code is not a bcc.kz client');
        if (u.id === uid) fail('This is your own QR code');
        const amount = q.get('a') ? parseAmount(q.get('a')) : null;
        return { name: maskName(u.full_name), phone: '+' + normalizePhone(u.phone), amount, currency: q.get('c') === 'USD' ? 'USD' : 'KZT' };
    });

    // ================= chat assistant (rule based, uses your real data) =================
    const RULES = [
        { re: /\b(hi|hello|hey|salam|привет|сәлем)\b/, intent: 'greet' },
        { re: /safe to spend|how much (can|could) i spend|can i spend|сколько (могу|можно) трат/, intent: 'safe' },
        { re: /subscription|netflix|spotify|yandex plus|подписк/, intent: 'subs' },
        { re: /freeze|block|lost|stolen|hacked|украл|потерял|заблок/, intent: 'freeze' },
        { re: /scam|fraud|suspicious|safe account|phishing|мошенник|аферист/, intent: 'scam' },
        { re: /balance|how much (money|do i have)|my (cards|accounts)\b|остаток|баланс/, intent: 'balance' },
        { re: /sms|otp|code|didn'?t (get|receive)/, intent: 'sms' },
        { re: /abroad|international|swift|iban|overseas|за границ/, intent: 'intl' },
        { re: /crypto|usdt|bitcoin|btc|ethereum|wallet/, intent: 'crypto' },
        { re: /exchange|dollar|usd|rate|курс|convert/, intent: 'fx' },
        { re: /loan|credit|borrow|кредит/, intent: 'loan' },
        { re: /deposit|saving|interest|депозит/, intent: 'deposit' },
        { re: /cashback|bonus|кэшбэк/, intent: 'cashback' },
        { re: /fee|commission|cost|комисси/, intent: 'fees' },
        { re: /send|transfer|pay someone|перевод/, intent: 'transfer' },
        { re: /contact|address|branch|office|email|адрес/, intent: 'contact' },
        { re: /operator|human|agent|call me|support|оператор/, intent: 'operator' }
    ];
    R('post', '/api/chat', (req, uid) => {
        const text = String(req.body.message || '').toLowerCase().slice(0, 300);
        const rule = RULES.find(r => r.re.test(text)); const intent = rule ? rule.intent : 'fallback';
        const me = userRow(uid), chips = ['My balance', 'Send money abroad', 'I think it is a scam', 'Talk to a person'];
        const out = { reply: '', chips, open: null, panic: false };
        switch (intent) {
            case 'greet': out.reply = `Hello, ${me.full_name.split(' ')[0]}! I am the bcc.kz assistant. Ask me about your balance, transfers, cards, loans or security.`; break;
            case 'balance': { const accs = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1').all(uid); out.reply = 'Here is what you have:\n' + accs.map(a => `• ${accLabel(a)}${a.frozen ? ' (frozen)' : ''}: ${fmtMoney(a.balance, a.currency)}`).join('\n'); break; }
            case 'freeze': out.reply = 'If your card or phone may be in the wrong hands, freeze everything now. Unfreezing needs an SMS code, so nobody else can undo it.'; out.panic = true; out.open = 'shield'; break;
            case 'scam': out.reply = 'Stop and do not send anything yet. Hang up on anyone who says they are from the bank, police or National Bank: they never ask for SMS codes or to move money to a "safe account". You can check a transfer in Shield before you send it, and freeze your cards in one tap.'; out.open = 'shield'; break;
            case 'sms': out.reply = 'Codes are valid for 5 minutes, you get 5 tries, and you can ask for a new one after 30 seconds. In this demo no real SMS is sent: the code is shown on screen.'; break;
            case 'intl': out.reply = `International transfers are sent in USD. Fee: ${cfg.INTERNATIONAL.feePercent}% (minimum $${cfg.INTERNATIONAL.feeMinUsd}); half price with bcc Plus. You need the beneficiary's SWIFT/BIC and IBAN. Limits: $${cfg.INTERNATIONAL.minUsd} to $${cfg.INTERNATIONAL.maxUsd}.`; out.open = 'intl'; break;
            case 'crypto': out.reply = `You can link a wallet (USDT, BTC, ETH) and send from your card. Network fee: $${cfg.CRYPTO.feeUsd}. Crypto transfers cannot be reversed, so Shield checks them first.`; out.open = 'crypto'; break;
            case 'fx': out.reply = `Demo rate: 1 USD = ${cfg.RATES_TO_KZT.USD} ₸. Move money between your own KZT and USD accounts instantly.`; out.open = 'own'; break;
            case 'loan': out.reply = `Loans from ${fmtMoney(L.minAmount, 'KZT')} up to ${fmtMoney(L.maxAmount, 'KZT')}, ${L.months[0]} to ${L.months[L.months.length - 1]} months. Demo rate ${L.aprPercent}% per year. The payment must stay under 40% of your income.`; out.open = 'loans'; break;
            case 'deposit': out.reply = 'Deposit rates by term: ' + Object.entries(cfg.DEPOSIT_RATES).map(([m, r]) => `${m} months ${r}%`).join(', ') + '.'; out.open = 'deposits'; break;
            case 'safe': { const s = pfm.safeToSpend(uid); out.reply = `You can safely spend about ${fmtMoney(s.leftTodayKzt, 'KZT')} today. There are ${s.daysLeft} days until payday, and ${fmtMoney(s.reserved.total, 'KZT')} is set aside for subscriptions, loans and goals.`; out.open = 'finance'; break; }
            case 'subs': { const p = pfm.subsPayload(uid); out.reply = p.activeCount ? `You have ${p.activeCount} subscription${p.activeCount === 1 ? '' : 's'} costing ${fmtMoney(p.monthlyKzt, 'KZT')} a month. Before each payment I ask you to pay, freeze or stop it.` : 'You are not tracking any subscriptions yet. Add one, or I will find recurring payments in your history.'; out.open = 'finance'; break; }
            case 'cashback': out.reply = 'Choose up to 3 categories each month for 5% cashback; everything else earns 1%. bcc Plus adds +2%.'; out.open = 'cashback'; break;
            case 'fees': out.reply = `Transfers between bcc.kz clients are free. International: ${cfg.INTERNATIONAL.feePercent}% (min $${cfg.INTERNATIONAL.feeMinUsd}). Crypto: $${cfg.CRYPTO.feeUsd} network fee. bcc Plus: ${fmtMoney(cfg.PLUS.priceKzt, 'KZT')} per month.`; break;
            case 'transfer': out.reply = 'To send money to a bcc.kz client you only need their phone number (any country code) or card number. Larger or unusual transfers are checked by Shield first.'; out.open = 'client'; break;
            case 'contact': out.reply = `${cfg.BANK.name}\nHead office: ${cfg.BANK.address}\nE-mail: ${cfg.BANK.email}\nWebsite: ${cfg.BANK.website}`; break;
            case 'operator': { db.prepare("INSERT INTO service_requests (user_id, kind, details, code) VALUES (?, 'callback', ?, ?)").run(uid, JSON.stringify({ phone: '+' + normalizePhone(me.phone), message: text }), 'CB-' + randomDigits(5)); out.reply = `I have asked a specialist to call you on +${normalizePhone(me.phone)}. (In this demo the request appears on the bank-team dashboard.)`; break; }
            default: out.reply = 'I did not fully understand. I can help with balances, transfers, cards, loans, deposits, cashback and security. Or I can ask a specialist to call you.';
        }
        return out;
    });

    pfm = require('./pfm')({ db, cfg, logger, hooks, R, tx, fail, toKzt, round2, cents, convert, fmtMoney, insertTx, getOwnAccount, accLabel, notify, spendable, debit, credit, earnCashback, INCOME_TYPES, CATEGORY_OF, parseAmount });

    logger.info('FEATURES READY (v3 + Finance)');
};
