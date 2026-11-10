// ==================== FILE LOGGER ====================
// Writes every log line into a plain .txt file:  logs/banking-YYYY-MM-DD.txt
// (a new file is started automatically each day, so files never grow forever)
//
// Also prints the same line in the console (set LOG_TO_CONSOLE = false to turn off).
//
// SECURITY RULE: never pass passwords or full card numbers to the logger.
// Use maskCard() / maskPhone() below.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_TO_CONSOLE = true;

try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
    console.error('Cannot create logs folder:', err.message);
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function localDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level, message, meta) {
    const now = new Date();
    let line = `${localDate(now)} ${localTime(now)} [${level.padEnd(5)}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
        line += ' | ' + JSON.stringify(meta);
    }

    if (LOG_TO_CONSOLE) {
        (level === 'ERROR' ? console.error : console.log)(line);
    }

    try {
        const file = path.join(LOG_DIR, `banking-${localDate(now)}.txt`);
        fs.appendFileSync(file, line + '\n', 'utf8');
    } catch (err) {
        // Logging must never crash the bank. Just report it in the console.
        console.error('Cannot write log file:', err.message);
    }
}

// Mask helpers: "4400 1234 5678 9012" -> "**** 9012"
function maskCard(cardNumber) {
    if (!cardNumber) return '';
    const digits = String(cardNumber).replace(/\D/g, '');
    return '**** ' + digits.slice(-4);
}

// "+77001234567" -> "+7700***4567"
function maskPhone(phone) {
    if (!phone) return '';
    const p = String(phone);
    if (p.length < 8) return '***';
    return p.slice(0, 5) + '***' + p.slice(-4);
}

module.exports = {
    info: (message, meta) => write('INFO', message, meta),
    warn: (message, meta) => write('WARN', message, meta),
    error: (message, meta) => write('ERROR', message, meta),
    maskCard,
    maskPhone,
    LOG_DIR
};
