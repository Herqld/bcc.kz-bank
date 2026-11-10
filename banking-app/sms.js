// ==================== SMS SENDER ====================
// DEMO MODE (default): no real SMS is sent. The message is written to
//     logs/sms-outbox.txt   (think of it as your "fake phone")
// and printed in the server console. The app also shows the code on screen in demo mode.
//
// REAL MODE: set these 3 environment variables before starting the server
// (you need an account at an SMS provider, here: Twilio):
//     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
// Then real SMS are sent and the code is NOT shown on screen any more.
// (The Twilio call below is written from their public API docs but could not be tested here.)

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;
const DEMO = !(SID && TOKEN && FROM);

async function sendSms(phoneDigits, text) {
    if (DEMO) {
        const line = `${new Date().toISOString()}  to +${phoneDigits}:  ${text}\n`;
        try { fs.appendFileSync(path.join(logger.LOG_DIR, 'sms-outbox.txt'), line, 'utf8'); } catch (e) { /* ignore */ }
        console.log(`\n📱 [DEMO SMS] to +${phoneDigits}: ${text}\n`);
        return;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ To: '+' + phoneDigits, From: FROM, Body: text })
    });
    if (!res.ok) throw new Error('SMS provider error: HTTP ' + res.status);
}

module.exports = { sendSms, DEMO };
