// bcc.kz demo banking server (Node.js + Express + SQLite)
const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const sms = require('./sms');
const cfg = require('./bank-config');
const tunnels = require('./lib/tunnels');

const app = express();
app.set('trust proxy', 1);   // behind ngrok/Cloudflare Tunnel the real client IP is in X-Forwarded-For
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || 'bcc-banking-secret-key-2026';
const MAX_CARDS_PER_USER = 5;
const MAX_WALLETS_PER_USER = 5;
const OTP_TTL_MS = 5 * 60 * 1000;   // a code is valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5;         // wrong codes allowed
const OTP_RESEND_MS = 30 * 1000;    // wait before asking for a new code
const OTP_MAX_RESENDS = 3;

app.disable('x-powered-by');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// One log line per /api call (method, url, status, time, user). Never the body -> no passwords/codes.
app.use((req, res, next) => {
    if (!req.originalUrl.startsWith('/api')) return next();
    const started = Date.now();
    const userAtStart = req.session && req.session.userId;
    res.on('finish', () => {
        const userId = (req.session && req.session.userId) || userAtStart || null;
        logger.info(`${req.method} ${req.originalUrl.split('?')[0]} -> ${res.statusCode} (${Date.now() - started}ms)`, { user: userId, ip: req.ip });
    });
    next();
});

const db = new Database(path.join(__dirname, 'banking.db'));

// ==================== DATABASE ====================
function ensureColumn(table, column, definition) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function initializeDatabase() {
    logger.info('Initializing SQLite database...');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_type TEXT DEFAULT 'checking',
            account_number TEXT UNIQUE NOT NULL,
            card_number TEXT,
            card_type TEXT DEFAULT 'visa',
            balance REAL DEFAULT 0.00,
            currency TEXT DEFAULT 'KZT',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            deposit_name TEXT NOT NULL,
            principal_amount REAL NOT NULL,
            interest_rate REAL NOT NULL,
            accumulated_interest REAL DEFAULT 0.00,
            term_months INTEGER NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'KZT',
            from_account TEXT,
            to_account TEXT,
            description TEXT,
            status TEXT DEFAULT 'completed',
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        -- NEW: operations waiting for an SMS code (registration, transfers to other people, crypto, ...)
        CREATE TABLE IF NOT EXISTS pending_operations (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            phone TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            resends INTEGER DEFAULT 0,
            expires_at INTEGER NOT NULL,
            last_sent_at INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        -- NEW: linked crypto wallets
        CREATE TABLE IF NOT EXISTS crypto_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            network TEXT NOT NULL,
            address TEXT NOT NULL,
            label TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, network, address),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
    ensureColumn('transactions', 'details', 'TEXT'); // JSON with extra info shown in the details screen
    ensureColumn('accounts', 'frozen', 'INTEGER DEFAULT 0'); // frozen cards can receive but not spend

    const checkUser = db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get('demo@bcc.kz');
    if (checkUser.count === 0) {
        logger.info('Creating demo user and data...');
        const hashedPassword = bcrypt.hashSync('demo123', 10);
        const demoUserId = db.prepare('INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)')
            .run('Demo User', 'demo@bcc.kz', '+77001234567', hashedPassword).lastInsertRowid;

        const insertAccount = db.prepare('INSERT INTO accounts (user_id, account_type, account_number, card_number, card_type, balance, currency) VALUES (?, ?, ?, ?, ?, ?, ?)');
        insertAccount.run(demoUserId, 'card', 'KZ86125KZT1234567890', '4400 1234 5678 9012', 'visa', 500000.00, 'KZT');
        insertAccount.run(demoUserId, 'card', 'KZ86125KZT0987654321', '5500 9876 5432 1098', 'mastercard', 250000.00, 'KZT');
        insertAccount.run(demoUserId, 'savings', 'KZ86125KZT5555555555', null, null, 1000000.00, 'KZT');
        insertAccount.run(demoUserId, 'card', 'KZ86125USD1111111111', '4400 5555 6666 7777', 'visa', 1000.00, 'USD');

        db.prepare('INSERT INTO deposits (user_id, deposit_name, principal_amount, interest_rate, accumulated_interest, term_months, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(demoUserId, 'Savings deposit 12%', 500000.00, 12.00, 15000.00, 12, '2026-01-01', '2027-01-01', 'active');

        const tx = db.prepare('INSERT INTO transactions (user_id, transaction_type, amount, currency, from_account, to_account, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        tx.run(demoUserId, 'top_up', 100000.00, 'KZT', 'External Source', '4400 1234 5678 9012', 'Top-up', 'completed');
        tx.run(demoUserId, 'transfer_out', 25000.00, 'KZT', '4400 1234 5678 9012', '+77001112233', 'Transfer by phone number', 'completed');
        tx.run(demoUserId, 'transfer_in', 50000.00, 'KZT', '+77009998877', '5500 9876 5432 1098', 'Transfer from a friend', 'completed');
        tx.run(demoUserId, 'deposit_open', 500000.00, 'KZT', '4400 1234 5678 9012', 'Deposit Account', 'Deposit opened', 'completed');
        logger.info('Demo data created successfully');
    } else {
        logger.info('Database already initialized (existing data kept)');
    }
}

initializeDatabase();

// ==================== HELPERS ====================

// "Business" error = the user can fix it (not enough money, wrong code...). Its message is shown as-is.
class BankError extends Error {}
function fail(message) { throw new BankError(message); }

// Plug-in points filled by features.js (Shield fraud check, notifications, bcc Plus)
const hooks = { assess: null, notify: () => {}, isPlus: () => false };

function cardExpiry(createdAt) {
    const d = new Date(String(createdAt).replace(' ', 'T') + 'Z');
    d.setUTCFullYear(d.getUTCFullYear() + 5);
    return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCFullYear()).slice(-2);
}

function cents(v) { return Math.round(Number(v) * 100); }
function round2(v) { return Math.round(Number(v) * 100) / 100; }

function parseAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e12) return null;
    const r = Math.round(n * 100) / 100;
    if (r <= 0 || Math.abs(r - n) > 1e-9) return null;
    return r;
}

function cleanText(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Demo currency conversion through KZT
function convert(amount, from, to) {
    if (from === to) return round2(amount);
    return round2(amount * cfg.RATES_TO_KZT[from] / cfg.RATES_TO_KZT[to]);
}

function normalizeCard(v) { return String(v || '').replace(/\D/g, ''); }

// Phone numbers of ANY country.
//  "+44 7700 900123" -> "447700900123"   (with "+", we trust the country code)
//  "87001234567" / "7001234567" (no "+") -> Kazakhstan: "77001234567"
function normalizePhone(value) {
    const raw = String(value || '').trim();
    let d = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return d;
    if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return d;
}
function isValidPhoneDigits(d) { return /^[1-9]\d{7,14}$/.test(d); }

function maskPhoneDisplay(d) { return '+' + d.slice(0, 3) + ' ••• •• ' + d.slice(-2); }

function maskName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Client';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + [...parts[1]][0].toUpperCase() + '.';
}

function luhnValid(digits) {
    if (!/^\d{12,19}$/.test(digits)) return false;
    let sum = 0;
    for (let i = digits.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) {
        let d = Number(digits[i]);
        if (dbl) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

function isValidIban(raw) {
    const iban = String(raw).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const ch of rearranged) {
        const num = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
        for (const digit of num) remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
}

const PHONE_DIGITS_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'+',''),' ',''),'-',''),'(',''),')','')";

function findUserByPhone(phone) {
    const digits = normalizePhone(phone);
    if (!isValidPhoneDigits(digits)) return null;
    return db.prepare(`SELECT * FROM users WHERE ${PHONE_DIGITS_SQL} = ?`).get(digits) || null;
}

function findAccountByCard(cardNumber) {
    const digits = normalizeCard(cardNumber);
    if (digits.length !== 16) return null;
    return db.prepare(`
        SELECT a.*, u.full_name AS owner_name FROM accounts a JOIN users u ON u.id = a.user_id
        WHERE REPLACE(a.card_number, ' ', '') = ? AND a.is_active = 1
    `).get(digits) || null;
}

// Money sent "by phone" lands on the recipient's card: same currency if they have one, otherwise their oldest card
function findCardForUser(userId, currency) {
    return db.prepare(`
        SELECT * FROM accounts WHERE user_id = ? AND account_type = 'card' AND is_active = 1
        ORDER BY (currency = ?) DESC, id LIMIT 1
    `).get(userId, currency) || null;
}

function getOwnAccount(userId, accountNumber) {
    return db.prepare('SELECT * FROM accounts WHERE account_number = ? AND user_id = ? AND is_active = 1').get(String(accountNumber), userId);
}

function getUserPhoneDigits(userId) {
    const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(userId);
    return u ? normalizePhone(u.phone) : '';
}

function insertTx(userId, type, amount, currency, from, to, description, status, details) {
    return db.prepare('INSERT INTO transactions (user_id, transaction_type, amount, currency, from_account, to_account, description, status, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, type, amount, currency, from, to, description, status || 'completed', details ? JSON.stringify(details) : null).lastInsertRowid;
}

function randomDigits(count) {
    let out = '';
    for (let i = 0; i < count; i++) out += crypto.randomInt(0, 10);
    return out;
}

function luhnCheckDigit(payload) {
    let sum = 0;
    for (let i = payload.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) {
        let d = Number(payload[i]);
        if (dbl) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return (10 - (sum % 10)) % 10;
}

function generateUniqueCardNumber(cardType) {
    for (let i = 0; i < 50; i++) {
        const payload = (cardType === 'mastercard' ? '5500' : '4400') + randomDigits(11);
        const candidate = (payload + luhnCheckDigit(payload)).replace(/(.{4})/g, '$1 ').trim();
        if (!db.prepare('SELECT 1 FROM accounts WHERE card_number = ?').get(candidate)) return candidate;
    }
    throw new Error('Could not generate a unique card number');
}

function generateUniqueAccountNumber(currency) {
    for (let i = 0; i < 50; i++) {
        const candidate = `KZ86125${currency}` + randomDigits(10);
        if (!db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(candidate)) return candidate;
    }
    throw new Error('Could not generate a unique account number');
}

function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.status(401).json({ success: false, message: 'Not authenticated' });
}

function handleRouteError(res, error, label, meta, fallbackMessage) {
    if (error instanceof BankError) {
        logger.warn(`${label} REJECTED: ${error.message}`, meta);
        return res.json({ success: false, message: error.message });
    }
    logger.error(`${label} ERROR: ${error.stack || error.message}`, meta);
    return res.json({ success: false, message: fallbackMessage });
}

const fmtMoney = (n, cur) => {
    const v = Number(n);
    const d = Math.round(Math.abs(v) * 100) % 100 === 0 ? 0 : 2;
    const str = v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, '\u00a0');
    return cur === 'USD' ? '$' + str : str + '\u00a0₸';
};

// ==================== SMS CODE (OTP) SYSTEM ====================
// Flow for risky actions:  1) app sends the request -> server checks everything and stores it as a "pending operation",
// sends a 6-digit code to the user's phone  2) app sends the code -> server checks it and ONLY THEN runs the operation.
// The stored operation can't be changed between the two steps. Codes are saved hashed, expire in 5 minutes,
// allow 5 wrong tries, and are never written to the app log.

function hashCode(opId, code) {
    return crypto.createHmac('sha256', SECRET).update(opId + ':' + code).digest('hex');
}

async function sendCode(phoneDigits, code) {
    await sms.sendSms(phoneDigits, `bcc.kz: your confirmation code is ${code}. Never share it with anyone.`);
}

function otpInfo(opId, phoneDigits, code) {
    return {
        opId,
        phoneMasked: maskPhoneDisplay(phoneDigits),
        expiresInSec: OTP_TTL_MS / 1000,
        resendInSec: OTP_RESEND_MS / 1000,
        ...(sms.DEMO ? { demoCode: code } : {}) // DEMO MODE ONLY: the app shows the code on screen
    };
}

async function createPending(userId, type, payload, phoneDigits) {
    const id = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    db.prepare('DELETE FROM pending_operations WHERE expires_at < ?').run(now - 24 * 60 * 60 * 1000);
    db.prepare('INSERT INTO pending_operations (id, user_id, type, payload, phone, code_hash, expires_at, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, userId, type, JSON.stringify(payload), phoneDigits, hashCode(id, code), now + OTP_TTL_MS, now);
    try {
        await sendCode(phoneDigits, code);
    } catch (e) {
        db.prepare('DELETE FROM pending_operations WHERE id = ?').run(id);
        logger.error(`SMS SEND FAILED: ${e.message}`, { userId, type });
        fail('Could not send the SMS code. Please try again later.');
    }
    logger.info('OTP SENT', { userId, type, phone: logger.maskPhone('+' + phoneDigits) });
    return otpInfo(id, phoneDigits, code);
}

// ==================== MONEY OPERATIONS ====================
// Every function below runs inside ONE database transaction: everything happens or nothing does.
// dry = true  -> only checks (used before we send the SMS code), nothing is changed.

const accLabel = (a) => {
    if (a.card_number) return `${a.card_type === 'mastercard' ? 'Mastercard' : 'Visa'} •• ${a.card_number.replace(/\D/g, '').slice(-4)}`;
    return `Account •• ${a.account_number.slice(-4)}`;
};

// ---- own accounts / bcc.kz client by phone or card ----
const runTransfer = db.transaction((userId, p, dry) => {
    const sender = getOwnAccount(userId, p.fromAccount);
    if (!sender) fail('Sender account not found');
    if (sender.frozen) fail('This card is frozen. Unfreeze it in the app to make payments.');

    let receiver, receiverName = null;

    if (p.transferType === 'own') {
        receiver = getOwnAccount(userId, p.toAccount);
        if (!receiver) fail('Destination account not found');
        if (receiver.id === sender.id) fail('Choose two different accounts');
    } else if (p.transferType === 'card') {
        receiver = findAccountByCard(p.toAccount);
        if (!receiver) fail('No bcc.kz client with this card number. You can only send to existing clients.');
        if (receiver.user_id === userId) fail('This is your own card. Use "To Own Accounts".');
        receiverName = receiver.owner_name;
    } else {
        const user = findUserByPhone(p.toAccount);
        if (!user) fail('No bcc.kz client with this phone number. You can only send to existing clients.');
        if (user.id === userId) fail('This is your own number. Use "To Own Accounts".');
        receiver = findCardForUser(user.id, sender.currency);
        if (!receiver) fail('The recipient has no active card to receive money.');
        receiverName = user.full_name;
    }

    const credit = convert(p.amount, sender.currency, receiver.currency);
    if (credit <= 0) fail('Amount is too small');
    if (cents(sender.balance) < cents(p.amount)) fail('Insufficient funds');
    if (dry) return null;

    db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(p.amount, sender.id);
    db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(credit, receiver.id);

    const crossCurrency = sender.currency !== receiver.currency;
    const rate = crossCurrency ? round2(convert(1, sender.currency, receiver.currency)) : null;

    if (p.transferType === 'own') {
        insertTx(userId, 'transfer_out', p.amount, sender.currency, accLabel(sender), accLabel(receiver),
            p.description || 'Transfer to own account', 'completed',
            { method: 'own', credited: credit, creditedCurrency: receiver.currency, rate });
    } else {
        const senderUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(userId);
        const toLabel = p.transferType === 'phone' ? '+' + normalizePhone(p.toAccount) : logger.maskCard(receiver.card_number);
        insertTx(userId, 'transfer_out', p.amount, sender.currency, accLabel(sender), toLabel,
            p.description || 'Transfer to client', 'completed',
            { method: p.transferType, counterparty: maskName(receiverName), credited: credit, creditedCurrency: receiver.currency, rate });
        hooks.notify(receiver.user_id, 'transfer_in', 'Money received', `${maskName(senderUser.full_name)} sent you ${fmtMoney(credit, receiver.currency)}`);
        insertTx(receiver.user_id, 'transfer_in', credit, receiver.currency, maskName(senderUser.full_name), accLabel(receiver),
            p.description || 'Transfer from client', 'completed',
            { method: p.transferType, counterparty: maskName(senderUser.full_name), sent: p.amount, sentCurrency: sender.currency, rate,
                sk: crypto.createHmac('sha256', SECRET).update('sender:' + userId).digest('hex').slice(0, 12) }); // opaque sender key (used by Shield, not shown)
    }

    const lines = [['From', accLabel(sender)], ['To', p.transferType === 'own' ? accLabel(receiver) : `${maskName(receiverName)} (${accLabel(receiver)})`]];
    if (crossCurrency) lines.push(['Credited', fmtMoney(credit, receiver.currency)], ['Rate', `1 ${sender.currency} = ${convert(1, sender.currency, receiver.currency)} ${receiver.currency} (demo rate)`]);
    return { message: 'Transfer completed', receipt: { title: 'Transfer completed', amount: fmtMoney(p.amount, sender.currency), lines } };
});

// ---- other banks in Kazakhstan (simulated) ----
const runDomestic = db.transaction((userId, p, dry) => {
    const sender = getOwnAccount(userId, p.fromAccount);
    if (!sender) fail('Sender account not found');
    if (sender.frozen) fail('This card is frozen. Unfreeze it in the app to make payments.');
    if (sender.currency !== 'KZT') fail('Transfers to other banks in Kazakhstan are made in KZT. Choose a KZT account.');
    if (!cfg.KZ_BANKS.includes(p.bank)) fail('Choose a bank from the list');
    const digits = normalizeCard(p.card);
    if (digits.length !== 16 || !luhnValid(digits)) fail('Invalid card number');
    if (findAccountByCard(digits)) fail('This is a bcc.kz card. Use "To bcc.kz client".');
    if (cents(sender.balance) < cents(p.amount)) fail('Insufficient funds');
    if (dry) return null;

    db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(p.amount, sender.id);
    insertTx(userId, 'domestic_out', p.amount, 'KZT', accLabel(sender), `${p.bank} ${logger.maskCard(digits)}`,
        p.description || `Transfer to ${p.bank}`, 'completed', { bank: p.bank, card: logger.maskCard(digits) });
    return { message: 'Transfer completed', receipt: { title: 'Transfer completed', amount: fmtMoney(p.amount, 'KZT'),
        lines: [['From', accLabel(sender)], ['To bank', p.bank], ['Card', logger.maskCard(digits)]] } };
});

// ---- international (simulated SWIFT-style transfer, always in USD) ----
function intlFee(amountUsd, userId) {
    const c = cfg.INTERNATIONAL;
    const k = hooks.isPlus(userId) ? 0.5 : 1; // bcc Plus: half price
    return Math.max(round2(c.feeMinUsd * k), round2(amountUsd * c.feePercent * k / 100));
}

function parseIntl(body) {
    const c = cfg.INTERNATIONAL;
    const amount = parseAmount(body.amount);
    if (amount === null) fail('Enter a valid amount');
    if (amount < c.minUsd || amount > c.maxUsd) fail(`Amount must be between $${c.minUsd} and $${c.maxUsd}`);
    const beneficiary = cleanText(body.beneficiary, 70);
    if (beneficiary.length < 2 || !/^[\p{L}\p{M} .,'-]+$/u.test(beneficiary)) fail('Enter the beneficiary full name (letters only)');
    const country = String(body.country || '').toUpperCase();
    if (!cfg.COUNTRIES.some(x => x[0] === country)) fail('Choose the destination country');
    const bank = cleanText(body.bank, 70);
    if (bank.length < 2) fail('Enter the beneficiary bank name');
    const swift = String(body.swift || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift)) fail('Invalid SWIFT/BIC code (8 or 11 characters, e.g. DEUTDEFF)');
    const account = String(body.account || '').replace(/\s/g, '').toUpperCase();
    if (/^[A-Z]{2}\d{2}/.test(account)) {
        if (!isValidIban(account)) fail('Invalid IBAN (the check digits do not match)');
    } else if (!/^[A-Z0-9]{6,34}$/.test(account)) {
        fail('Enter a valid IBAN or account number');
    }
    return { fromAccount: String(body.fromAccount || ''), amount, beneficiary, country, bank, swift, account,
        purpose: cleanText(body.purpose, 100) };
}

const runInternational = db.transaction((userId, p, dry) => {
    const sender = getOwnAccount(userId, p.fromAccount);
    if (!sender) fail('Sender account not found');
    if (sender.frozen) fail('This card is frozen. Unfreeze it in the app to make payments.');
    const fee = intlFee(p.amount, userId);
    const debit = convert(p.amount + fee, 'USD', sender.currency);
    if (cents(sender.balance) < cents(debit)) fail('Insufficient funds');
    if (dry) return null;

    db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(debit, sender.id);
    const country = cfg.COUNTRIES.find(x => x[0] === p.country)[1];
    insertTx(userId, 'international_out', debit, sender.currency, accLabel(sender), `${p.beneficiary}, ${country}`,
        `International transfer: $${p.amount}`, 'processing',
        { beneficiary: p.beneficiary, country, bank: p.bank, swift: p.swift, account: '••••' + p.account.slice(-4),
          amountUsd: p.amount, feeUsd: fee, purpose: p.purpose || null });
    return { message: 'Transfer sent for processing', receipt: { title: 'Transfer sent', amount: fmtMoney(p.amount, 'USD'),
        lines: [['To', p.beneficiary], ['Bank', `${p.bank} (${p.swift})`], ['Country', country], ['Fee', fmtMoney(fee, 'USD')],
            ['Debited', fmtMoney(debit, sender.currency)], ['Status', 'Processing (demo: not a real SWIFT payment)']] } };
});

// ---- crypto wallets (simulated ledger, no real blockchain) ----
const WALLET_RE = {
    BTC: /^(bc1[a-z0-9]{25,60}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
    ETH: /^0x[a-fA-F0-9]{40}$/,
    USDT_ERC20: /^0x[a-fA-F0-9]{40}$/,
    USDT_TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/
};
const shortAddr = (a) => a.slice(0, 6) + '…' + a.slice(-4);

function parseWallet(body) {
    const network = String(body.network || '');
    if (!cfg.CRYPTO.assets[network]) fail('Choose a network');
    const address = String(body.address || '').trim();
    if (!WALLET_RE[network].test(address)) fail(`This is not a valid ${cfg.CRYPTO.assets[network].name} address`);
    return { network, address, label: cleanText(body.label, 30) || cfg.CRYPTO.assets[network].name };
}

const runLinkWallet = db.transaction((userId, p, dry) => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM crypto_wallets WHERE user_id = ?').get(userId).c;
    if (count >= MAX_WALLETS_PER_USER) fail(`You can link up to ${MAX_WALLETS_PER_USER} wallets`);
    if (db.prepare('SELECT 1 FROM crypto_wallets WHERE user_id = ? AND network = ? AND address = ?').get(userId, p.network, p.address)) fail('This wallet is already linked');
    if (dry) return null;
    db.prepare('INSERT INTO crypto_wallets (user_id, network, address, label) VALUES (?, ?, ?, ?)').run(userId, p.network, p.address, p.label);
    return { message: 'Wallet linked', receipt: { title: 'Wallet linked', amount: '', lines: [['Network', cfg.CRYPTO.assets[p.network].name], ['Address', shortAddr(p.address)], ['Name', p.label]] } };
});

const runCryptoSend = db.transaction((userId, p, dry) => {
    const wallet = db.prepare('SELECT * FROM crypto_wallets WHERE id = ? AND user_id = ?').get(p.walletId, userId);
    if (!wallet) fail('Wallet not found');
    const sender = getOwnAccount(userId, p.fromAccount);
    if (!sender) fail('Sender account not found');
    const asset = cfg.CRYPTO.assets[wallet.network];
    if (sender.frozen) fail('This card is frozen. Unfreeze it in the app to make payments.');
    const usd = convert(p.amount, sender.currency, 'USD');
    if (usd < cfg.CRYPTO.minUsd) fail(`Minimum amount is $${cfg.CRYPTO.minUsd} (≈ ${fmtMoney(convert(cfg.CRYPTO.minUsd, 'USD', sender.currency), sender.currency)})`);
    const fee = convert(cfg.CRYPTO.feeUsd, 'USD', sender.currency);
    const total = round2(p.amount + fee);
    if (cents(sender.balance) < cents(total)) fail('Insufficient funds');
    const cryptoAmount = Number((usd / asset.priceUsd).toFixed(asset.asset === 'USDT' ? 2 : 8));
    if (dry) return null;

    db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(total, sender.id);
    insertTx(userId, 'crypto_out', total, sender.currency, accLabel(sender), `${asset.asset} ${shortAddr(wallet.address)}`,
        `Crypto transfer: ${cryptoAmount} ${asset.asset}`, 'completed',
        { network: asset.name, address: shortAddr(wallet.address), cryptoAmount, asset: asset.asset, fee, demoPriceUsd: asset.priceUsd });
    return { message: 'Crypto transfer completed (demo)', receipt: { title: 'Crypto transfer', amount: `${cryptoAmount} ${asset.asset}`,
        lines: [['Network', asset.name], ['To wallet', shortAddr(wallet.address)], ['Amount', fmtMoney(p.amount, sender.currency)],
            ['Network fee', fmtMoney(fee, sender.currency)], ['Total debited', fmtMoney(total, sender.currency)], ['Note', 'Simulated: no real blockchain transaction']] } };
});

// ---- registration (after the phone is verified) ----
const runRegister = db.transaction((p) => {
    const digits = normalizePhone(p.phone);
    if (db.prepare(`SELECT 1 FROM users WHERE email = ? OR ${PHONE_DIGITS_SQL} = ?`).get(p.email, digits)) fail('A client with this email or phone already exists');
    const userId = db.prepare('INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)').run(p.fullName, p.email, p.phone, p.hash).lastInsertRowid;
    db.prepare('INSERT INTO accounts (user_id, account_type, account_number, card_number, card_type, balance, currency) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, 'card', generateUniqueAccountNumber('KZT'), generateUniqueCardNumber('visa'), 'visa', 0, 'KZT');
    logger.info('REGISTER OK', { userId, email: p.email, phone: logger.maskPhone(p.phone) });
    return { message: 'Phone verified. Your account is ready: you can log in now.', registered: true, email: p.email };
});

const executors = {
    register: (_userId, p) => runRegister(p),
    transfer: (userId, p) => runTransfer(userId, p, false),
    domestic: (userId, p) => runDomestic(userId, p, false),
    international: (userId, p) => runInternational(userId, p, false),
    wallet_link: (userId, p) => runLinkWallet(userId, p, false),
    crypto_send: (userId, p) => runCryptoSend(userId, p, false)
};

// ==================== ROUTES ====================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Settings the app needs (rates, country lists...). Safe to share: no secrets here.
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        rates: cfg.RATES_TO_KZT,
        currencies: cfg.CURRENCIES,
        international: cfg.INTERNATIONAL,
        crypto: { feeUsd: cfg.CRYPTO.feeUsd, minUsd: cfg.CRYPTO.minUsd, assets: cfg.CRYPTO.assets },
        kzBanks: cfg.KZ_BANKS,
        countries: cfg.COUNTRIES,
        phoneCodes: cfg.PHONE_CODES,
        smsDemo: sms.DEMO,
        maxCards: MAX_CARDS_PER_USER,
        depositRates: cfg.DEPOSIT_RATES,
        shield: cfg.SHIELD,
        loan: cfg.LOAN,
        plusPriceKzt: cfg.PLUS.priceKzt,
        bank: cfg.BANK
    });
});

// Runs a pending operation after the correct code. Used by every "confirm with SMS code" step.
async function startOtpOperation(req, res, type, payload, dryRun) {
    const userId = req.session.userId;
    dryRun();
    // bcc Shield: explainable fraud check BEFORE any code is sent (see features.js)
    const risk = hooks.assess ? hooks.assess(userId, type, { ...payload, coached: !!req.body.coached }) : null;
    if (risk && risk.level === 'medium' && !req.body.shieldAck) {
        return res.json({ success: true, needsAck: true, shield: risk });
    }
    const hold = risk && risk.level === 'high';
    const otp = await createPending(userId, hold ? 'held' : type, hold ? { type, payload, risk } : payload, getUserPhoneDigits(userId));
    res.json({ success: true, otpRequired: true, otp, shield: risk && risk.level !== 'low' ? risk : undefined });
}

app.post('/api/otp/confirm', async (req, res) => {
    const opId = String(req.body.opId || '');
    const code = String(req.body.code || '').trim();
    const meta = { opId: opId.slice(0, 8) };

    try {
        const op = db.prepare('SELECT * FROM pending_operations WHERE id = ?').get(opId);
        if (!op || op.status !== 'pending') fail('This confirmation is no longer valid. Please start again.');
        if (op.user_id && op.user_id !== req.session.userId) fail('This confirmation is no longer valid. Please start again.');
        if (Date.now() > op.expires_at) {
            db.prepare("UPDATE pending_operations SET status = 'expired' WHERE id = ?").run(opId);
            fail('The code has expired. Please start again.');
        }
        if (!/^\d{6}$/.test(code)) fail('Enter the 6-digit code.');

        const expected = Buffer.from(op.code_hash);
        const given = Buffer.from(hashCode(opId, code));
        if (!crypto.timingSafeEqual(expected, given)) {
            const attempts = op.attempts + 1;
            if (attempts >= OTP_MAX_ATTEMPTS) {
                db.prepare("UPDATE pending_operations SET attempts = ?, status = 'locked' WHERE id = ?").run(attempts, opId);
                logger.warn('OTP LOCKED: too many wrong codes', { userId: op.user_id, type: op.type });
                fail('Too many wrong codes. Please start again.');
            }
            db.prepare('UPDATE pending_operations SET attempts = ? WHERE id = ?').run(attempts, opId);
            logger.warn('OTP WRONG CODE', { userId: op.user_id, type: op.type, attempts });
            fail(`Wrong code. ${OTP_MAX_ATTEMPTS - attempts} attempts left.`);
        }

        let result;
        try {
            result = db.transaction(() => {
                db.prepare("UPDATE pending_operations SET status = 'done' WHERE id = ? AND status = 'pending'").run(opId);
                return executors[op.type](op.user_id, JSON.parse(op.payload));
            })();
        } catch (e) {
            if (e instanceof BankError) db.prepare("UPDATE pending_operations SET status = 'failed' WHERE id = ?").run(opId);
            throw e;
        }
        logger.info(`OTP CONFIRMED -> ${op.type} done`, { userId: op.user_id });
        res.json({ success: true, ...result });
    } catch (error) {
        handleRouteError(res, error, 'OTP CONFIRM', meta, 'Could not confirm the operation');
    }
});

app.post('/api/otp/resend', async (req, res) => {
    const opId = String(req.body.opId || '');
    try {
        const op = db.prepare('SELECT * FROM pending_operations WHERE id = ?').get(opId);
        if (!op || op.status !== 'pending' || Date.now() > op.expires_at) fail('This confirmation is no longer valid. Please start again.');
        if (op.user_id && op.user_id !== req.session.userId) fail('This confirmation is no longer valid. Please start again.');
        const wait = OTP_RESEND_MS - (Date.now() - op.last_sent_at);
        if (wait > 0) fail(`Please wait ${Math.ceil(wait / 1000)} s before asking for a new code.`);
        if (op.resends >= OTP_MAX_RESENDS) fail('Too many code requests. Please start again.');
        const code = String(crypto.randomInt(100000, 1000000));
        const now = Date.now();
        try { await sendCode(op.phone, code); } catch (e) { fail('Could not send the SMS code. Please try again later.'); }
        db.prepare('UPDATE pending_operations SET code_hash = ?, attempts = 0, resends = resends + 1, last_sent_at = ?, expires_at = ? WHERE id = ?')
            .run(hashCode(opId, code), now, now + OTP_TTL_MS, opId);
        logger.info('OTP RESENT', { userId: op.user_id, type: op.type });
        res.json({ success: true, otp: otpInfo(opId, op.phone, code) });
    } catch (error) {
        handleRouteError(res, error, 'OTP RESEND', { opId: opId.slice(0, 8) }, 'Could not resend the code');
    }
});

// ---------- Registration: step 1 (data check + SMS code to the NEW phone number) ----------
app.post('/api/register/start', async (req, res) => {
    const fullName = cleanText(req.body.fullName, 100);
    const email = cleanText(req.body.email, 100).toLowerCase();
    const password = String(req.body.password || '');
    const digits = normalizePhone(req.body.phone);

    try {
        if (!fullName || !email || !password) fail('All fields are required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address');
        if (password.length < 6) fail('Password must be at least 6 characters');
        if (!isValidPhoneDigits(digits)) fail('Enter a valid phone number with the country code');
        if (db.prepare(`SELECT 1 FROM users WHERE email = ? OR ${PHONE_DIGITS_SQL} = ?`).get(email, digits)) {
            fail('A client with this email or phone already exists');
        }
        const hash = await bcrypt.hash(password, 10);
        const otp = await createPending(null, 'register', { fullName, email, phone: '+' + digits, hash }, digits);
        res.json({ success: true, otpRequired: true, otp });
    } catch (error) {
        handleRouteError(res, error, 'REGISTER', { email }, 'Registration error');
    }
});

app.post('/api/login', async (req, res) => {
    const email = cleanText(req.body.email, 100).toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.json({ success: false, message: 'Email and password are required' });

    try {
        const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
        if (!user) {
            logger.warn('LOGIN FAILED: unknown email', { email, ip: req.ip });
            return res.json({ success: false, message: 'Wrong email or password' });
        }
        if (!(await bcrypt.compare(password, user.password))) {
            logger.warn('LOGIN FAILED: wrong password', { userId: user.id, ip: req.ip });
            return res.json({ success: false, message: 'Wrong email or password' });
        }
        req.session.userId = user.id;
        req.session.userName = user.full_name;
        logger.info('LOGIN OK', { userId: user.id, ip: req.ip });
        res.json({ success: true, message: 'Logged in', user: { id: user.id, name: user.full_name } });
    } catch (error) {
        logger.error(`LOGIN ERROR: ${error.stack || error.message}`);
        res.json({ success: false, message: 'Server error' });
    }
});

app.post('/api/logout', (req, res) => {
    const userId = req.session.userId;
    req.session.destroy();
    logger.info('LOGOUT', { userId });
    res.json({ success: true });
});

// where the phone can reach this server (used by the "open on your phone" page and the Android app setup)
app.get('/api/server-info', async (req, res) => {
    let publicUrls = [];
    try { publicUrls = await tunnels.publicUrls(); } catch (e) { /* tunnels are optional */ }
    res.json({
        success: true, port: Number(PORT),
        host: req.hostname,
        addresses: getNetworkAddresses().map(a => ({ address: a.address, name: a.name, likely: !!a.likely })),
        publicUrls
    });
});
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) res.json({ authenticated: true, userId: req.session.userId, userName: req.session.userName });
    else res.json({ authenticated: false });
});

app.get('/api/dashboard', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    try {
        const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY id').all(userId);
        const totals = {};
        accounts.forEach(a => { totals[a.currency] = round2((totals[a.currency] || 0) + a.balance); });
        const user = db.prepare('SELECT full_name, phone, email FROM users WHERE id = ?').get(userId);
        accounts.forEach(a => { if (a.card_number) a.expiry = cardExpiry(a.created_at); });
        res.json({ success: true, user, accounts, totals, plus: hooks.isPlus(userId) });
    } catch (error) {
        logger.error(`DASHBOARD ERROR: ${error.stack || error.message}`, { userId });
        res.json({ success: false, message: 'Could not load data' });
    }
});

app.get('/api/transactions', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    try {
        const rows = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC LIMIT 300').all(userId);
        rows.forEach(r => { try { r.details = r.details ? JSON.parse(r.details) : null; } catch (e) { r.details = null; } });
        res.json({ success: true, transactions: rows });
    } catch (error) {
        logger.error(`TRANSACTIONS ERROR: ${error.stack || error.message}`, { userId });
        res.json({ success: false, message: 'Could not load history' });
    }
});

// "Who will get my money?" preview (shortened name only)
app.get('/api/recipient', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    try {
        let ownerId = null, ownerName = null;
        if (req.query.type === 'phone') {
            const u = findUserByPhone(req.query.value);
            if (u) { ownerId = u.id; ownerName = u.full_name; }
        } else if (req.query.type === 'card') {
            const a = findAccountByCard(req.query.value);
            if (a) { ownerId = a.user_id; ownerName = a.owner_name; }
        } else {
            return res.json({ success: false, message: 'Invalid type' });
        }
        if (!ownerId) return res.json({ success: true, found: false });
        res.json({ success: true, found: true, self: ownerId === userId, name: maskName(ownerName) });
    } catch (error) {
        logger.error(`RECIPIENT LOOKUP ERROR: ${error.stack || error.message}`, { userId });
        res.json({ success: false, message: 'Lookup failed' });
    }
});

// ---------- Transfers ----------
// type "own"            -> instant (your own money, your own accounts; currencies are converted at the demo rate)
// type "phone" / "card" -> to an EXISTING bcc.kz client (any country code), needs the SMS code
app.post('/api/transfer', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const amount = parseAmount(req.body.amount);
    const p = {
        transferType: req.body.transferType,
        fromAccount: String(req.body.fromAccount || ''),
        toAccount: String(req.body.toAccount || ''),
        amount,
        description: cleanText(req.body.description, 140)
    };
    const meta = { userId, transferType: p.transferType, amount };

    try {
        if (!['phone', 'card', 'own'].includes(p.transferType) || !p.fromAccount || !p.toAccount || amount === null) fail('Please check the transfer details');

        if (p.transferType === 'own') {
            const r = runTransfer(userId, p, false);
            logger.info(`TRANSFER OK (own): ${amount}`, { userId });
            return res.json({ success: true, ...r });
        }
        await startOtpOperation(req, res, 'transfer', p, () => runTransfer(userId, p, true));
    } catch (error) {
        handleRouteError(res, error, 'TRANSFER', meta, 'Transfer error');
    }
});

app.post('/api/transfer/domestic', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const amount = parseAmount(req.body.amount);
    const p = { fromAccount: String(req.body.fromAccount || ''), bank: String(req.body.bank || ''), card: String(req.body.card || ''), amount, description: cleanText(req.body.description, 140) };
    try {
        if (amount === null || !p.fromAccount) fail('Please check the transfer details');
        await startOtpOperation(req, res, 'domestic', p, () => runDomestic(userId, p, true));
    } catch (error) {
        handleRouteError(res, error, 'DOMESTIC TRANSFER', { userId, amount }, 'Transfer error');
    }
});

app.get('/api/international/quote', isAuthenticated, (req, res) => {
    const amount = parseAmount(req.query.amount);
    if (amount === null) return res.json({ success: false, message: 'Enter a valid amount' });
    const fee = intlFee(amount, req.session.userId);
    res.json({ success: true, amountUsd: amount, feeUsd: fee, totalUsd: round2(amount + fee) });
});

app.post('/api/transfer/international', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    try {
        const p = parseIntl(req.body);
        if (!p.fromAccount) fail('Choose the account to pay from');
        await startOtpOperation(req, res, 'international', p, () => runInternational(userId, p, true));
    } catch (error) {
        handleRouteError(res, error, 'INTERNATIONAL TRANSFER', { userId }, 'Transfer error');
    }
});

// ---------- Crypto wallets (simulated) ----------
app.get('/api/crypto/wallets', isAuthenticated, (req, res) => {
    const wallets = db.prepare('SELECT id, network, address, label, created_at FROM crypto_wallets WHERE user_id = ? ORDER BY id').all(req.session.userId);
    res.json({ success: true, wallets });
});

app.post('/api/crypto/wallets/link', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    try {
        const p = parseWallet(req.body);
        await startOtpOperation(req, res, 'wallet_link', p, () => runLinkWallet(userId, p, true));
    } catch (error) {
        handleRouteError(res, error, 'WALLET LINK', { userId }, 'Could not link the wallet');
    }
});

app.post('/api/crypto/wallets/remove', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const r = db.prepare('DELETE FROM crypto_wallets WHERE id = ? AND user_id = ?').run(parseInt(req.body.walletId, 10) || 0, userId);
    if (r.changes) logger.info('WALLET REMOVED', { userId });
    res.json({ success: r.changes > 0, message: r.changes ? 'Wallet removed' : 'Wallet not found' });
});

app.post('/api/crypto/send', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const amount = parseAmount(req.body.amount);
    const p = { walletId: parseInt(req.body.walletId, 10) || 0, fromAccount: String(req.body.fromAccount || ''), amount };
    try {
        if (amount === null || !p.walletId || !p.fromAccount) fail('Please check the details');
        await startOtpOperation(req, res, 'crypto_send', p, () => runCryptoSend(userId, p, true));
    } catch (error) {
        handleRouteError(res, error, 'CRYPTO SEND', { userId, amount }, 'Transfer error');
    }
});

// ---------- Top-up (simulated) ----------
const runTopup = db.transaction((userId, accountNumber, amount) => {
    const account = getOwnAccount(userId, accountNumber);
    if (!account) fail('Account not found');
    db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(amount, account.id);
    insertTx(userId, 'top_up', amount, account.currency, 'External Source', accLabel(account), 'Top-up', 'completed', null);
    return account;
});

app.post('/api/topup', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const amount = parseAmount(req.body.amount);
    try {
        if (!req.body.accountNumber || amount === null) fail('Please check the details');
        const account = runTopup(userId, req.body.accountNumber, amount);
        logger.info(`TOPUP OK: ${amount} ${account.currency}`, { userId, accountId: account.id, card: logger.maskCard(account.card_number) });
        res.json({ success: true, message: `Account topped up: ${fmtMoney(amount, account.currency)}` });
    } catch (error) {
        handleRouteError(res, error, 'TOPUP', { userId, amount }, 'Top-up error');
    }
});

// ---------- Deposits ----------
app.get('/api/deposits', isAuthenticated, (req, res) => {
    const deposits = db.prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);
    res.json({ success: true, deposits });
});

const runOpenDeposit = db.transaction((userId, name, amount, rate, months, fromAccount) => {
    const account = getOwnAccount(userId, fromAccount);
    if (!account) fail('Account not found');
    if (account.currency !== 'KZT') fail('Deposits are opened in KZT. Choose a KZT account.');
    if (cents(account.balance) < cents(amount)) fail('Insufficient funds');
    db.prepare('UPDATE accounts SET balance = ROUND(balance - ?, 2) WHERE id = ?').run(amount, account.id);
    const start = new Date().toISOString().split('T')[0];
    const end = new Date(); end.setMonth(end.getMonth() + months);
    db.prepare('INSERT INTO deposits (user_id, deposit_name, principal_amount, interest_rate, term_months, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, name, amount, rate, months, start, end.toISOString().split('T')[0]);
    insertTx(userId, 'deposit_open', amount, 'KZT', accLabel(account), 'Deposit', `Deposit opened: ${name}`, 'completed', null);
});

app.post('/api/deposits/open', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const name = cleanText(req.body.depositName, 100) || 'Savings deposit';
    const amount = parseAmount(req.body.amount);
    const months = parseInt(req.body.termMonths, 10);
    try {
        const rate = cfg.DEPOSIT_RATES[months];
        if (!rate) fail('Choose a deposit term');
        if (amount === null || !req.body.fromAccount) fail('Please check the deposit details');
        runOpenDeposit(userId, name, amount, rate, months, req.body.fromAccount);
        logger.info(`DEPOSIT OPEN OK: ${amount} KZT for ${months} months at ${rate}%`, { userId });
        res.json({ success: true, message: 'Deposit opened' });
    } catch (error) {
        handleRouteError(res, error, 'DEPOSIT OPEN', { userId, amount }, 'Could not open the deposit');
    }
});

// Deposit -> your own account. Interest is taken first, then the principal. Empty deposit = closed.
const runDepositWithdraw = db.transaction((userId, depositId, toAccount, amount) => {
    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ? AND user_id = ?').get(depositId, userId);
    if (!deposit) fail('Deposit not found');
    if (deposit.status !== 'active') fail('This deposit is already closed');
    const target = getOwnAccount(userId, toAccount);
    if (!target) fail('Destination account not found');
    if (target.currency !== 'KZT') fail('Deposits can only be paid to KZT accounts');

    const interestC = cents(deposit.accumulated_interest), principalC = cents(deposit.principal_amount), amountC = cents(amount);
    if (amountC > interestC + principalC) fail('The amount is more than the deposit balance');
    const fromInterest = Math.min(amountC, interestC);
    const newInterestC = interestC - fromInterest;
    const newPrincipalC = principalC - (amountC - fromInterest);
    const closed = newInterestC + newPrincipalC === 0;

    db.prepare('UPDATE deposits SET accumulated_interest = ?, principal_amount = ?, status = ? WHERE id = ?')
        .run(newInterestC / 100, newPrincipalC / 100, closed ? 'closed' : 'active', deposit.id);
    db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(amount, target.id);
    insertTx(userId, 'deposit_withdraw', amount, 'KZT', `Deposit #${deposit.id}`, accLabel(target),
        closed ? `Deposit closed: ${deposit.deposit_name}` : `From deposit: ${deposit.deposit_name}`, 'completed', null);
    return { deposit, target, closed, remaining: (newInterestC + newPrincipalC) / 100 };
});

app.post('/api/deposits/withdraw', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const depositId = parseInt(req.body.depositId, 10);
    const amount = parseAmount(req.body.amount);
    try {
        if (!depositId || !req.body.toAccount || amount === null) fail('Please check the details');
        const r = runDepositWithdraw(userId, depositId, req.body.toAccount, amount);
        logger.info(`DEPOSIT WITHDRAW OK: ${amount} KZT${r.closed ? ' (deposit closed)' : ''}`, { userId, depositId, remaining: r.remaining });
        res.json({ success: true, message: r.closed ? 'Done. The deposit is closed.' : 'Transferred from the deposit', closed: r.closed });
    } catch (error) {
        handleRouteError(res, error, 'DEPOSIT WITHDRAW', { userId, depositId, amount }, 'Transfer error');
    }
});

// ---------- New card (KZT or USD) ----------
app.post('/api/cards/create', isAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const cardType = String(req.body.cardType || '').toLowerCase();
    const currency = String(req.body.currency || 'KZT').toUpperCase();
    const meta = { userId, cardType, currency };
    try {
        if (!['visa', 'mastercard'].includes(cardType)) fail('Choose Visa or Mastercard');
        if (!cfg.CURRENCIES.includes(currency)) fail('Choose a currency');
        const card = db.transaction(() => {
            const count = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id = ? AND account_type = 'card' AND is_active = 1").get(userId).c;
            if (count >= MAX_CARDS_PER_USER) fail(`You can have up to ${MAX_CARDS_PER_USER} cards`);
            const cardNumber = generateUniqueCardNumber(cardType);
            const id = db.prepare('INSERT INTO accounts (user_id, account_type, account_number, card_number, card_type, balance, currency) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(userId, 'card', generateUniqueAccountNumber(currency), cardNumber, cardType, 0, currency).lastInsertRowid;
            return { id, cardNumber };
        })();
        logger.info(`CARD CREATED (${cardType}, ${currency})`, { userId, accountId: card.id, card: logger.maskCard(card.cardNumber) });
        res.json({ success: true, message: `New ${currency} ${cardType === 'visa' ? 'Visa' : 'Mastercard'} card opened` });
    } catch (error) {
        handleRouteError(res, error, 'CARD CREATE', meta, 'Could not open the card');
    }
});

// ---------- everything added in v3 lives in features.js ----------
require('./features')({
    app, db, cfg, logger, sms, hooks, executors, BankError, fail, isAuthenticated, handleRouteError,
    parseAmount, cleanText, round2, cents, convert, fmtMoney, insertTx, getOwnAccount, accLabel, findUserByPhone,
    findAccountByCard, normalizePhone, normalizeCard, isValidPhoneDigits, maskName, runTransfer, runDomestic, runInternational, runCryptoSend,
    createPending, startOtpOperation, getUserPhoneDigits, randomDigits, cardExpiry, SECRET
});

app.use((err, req, res, next) => {
    logger.error(`UNHANDLED EXPRESS ERROR: ${err.stack || err.message}`);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ success: false, message: 'Server error' });
});

// ==================== START SERVER ====================
function getNetworkAddresses() {
    const list = [];
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            const isV4 = net.family === 'IPv4' || net.family === 4;
            if (isV4 && !net.internal && !net.address.startsWith('169.254.')) {
                const privateRange = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address);
                const virtualName = /virtual|vethernet|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale|zerotier|vpn/i.test(name);
                list.push({ name, address: net.address, likely: privateRange && !virtualName });
            }
        }
    }
    return list.sort((a, b) => Number(b.likely) - Number(a.likely));
}

const server = app.listen(PORT, '0.0.0.0', () => {
    const addresses = getNetworkAddresses();
    console.log('\n' + '='.repeat(60));
    console.log('🏦  bcc.kz  -  demo banking server');
    console.log('='.repeat(60));
    console.log('\n✅ Server is running!\n');
    console.log(`   🖥️  On this PC:   http://localhost:${PORT}`);
    console.log(`   🔳 QR for your phone: http://localhost:${PORT}/phone.html   (open it on this PC, scan the QR with the phone camera)`);
    if (addresses.length === 0) {
        console.log('   📱 On your phone: no network found. Connect this PC to Wi-Fi first.');
    } else {
        console.log('   📱 On your phone (phone must be on the SAME Wi-Fi):');
        addresses.forEach(a => console.log(`        http://${a.address}:${PORT}   [${a.name}]${a.likely ? '' : '  (probably not your Wi-Fi)'}`));
        console.log('        Try the first link. If it does not open, try the next one.');
        console.log(`        Not opening on the phone? Run  ALLOW-FIREWALL.bat  once (it asks for Administrator).`);
        console.log(`        Phone on mobile data or another network? Run  SHARE-TUNNEL.bat  and use the https link it prints.`);
    }
    tunnels.publicUrls().then((urls) => {
        if (!urls.length) return;
        console.log('   🌍 From any network (tunnel detected):');
        urls.forEach(u => console.log(`        ${u}`));
    }).catch(() => { /* tunnels are optional */ });
    console.log('\n🔐 Demo login:  demo@bcc.kz  /  demo123');
    console.log(sms.DEMO
        ? '📨 SMS codes: DEMO mode (codes appear on screen and in logs/sms-outbox.txt, no real SMS)'
        : '📨 SMS codes: REAL mode (Twilio)');
    console.log(`📝 Log files: ${logger.LOG_DIR}`);
    console.log('='.repeat(60) + '\n');
    logger.info(`SERVER STARTED on port ${PORT}`, { addresses: addresses.map(a => a.address), smsDemo: sms.DEMO });
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. The server is probably already running in another window (START.bat, IntelliJ or terminal). Close it and try again.`);
    } else {
        logger.error(`SERVER ERROR: ${error.stack || error.message}`);
    }
    process.exit(1);
});
process.on('uncaughtException', (error) => { logger.error(`UNCAUGHT EXCEPTION: ${error.stack || error.message}`); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error(`UNHANDLED REJECTION: ${reason && reason.stack ? reason.stack : reason}`); });
process.on('SIGINT', () => { logger.info('SERVER STOPPED (Ctrl+C)'); process.exit(0); });
