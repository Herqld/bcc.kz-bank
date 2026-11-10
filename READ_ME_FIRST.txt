=====================================================================
  bcc.kz  -  demo mobile banking app  CODDY 2.2     (folder: CODDY 2.2)
=====================================================================

=== CODDY 2.2 : ONE BANK, APPS FOR EVERY SYSTEM ===========================================
   The bank itself (the "server") runs on one computer. The apps are its windows, like a real bank:

   System            App                       How to get it
   ----------------  ------------------------  ------------------------------------------------
   Any phone/PC      Browser / installable web  Way A below (QR code, "Add to Home screen")
   Windows           CODDY Setup.exe + portable desktop\BUILD-WINDOWS.bat   (or just run: RUN-DESKTOP.bat)
   macOS             CODDY.dmg                 desktop/build-mac.sh   (on a Mac)
   Linux             AppImage + .deb           desktop/build-linux.sh
   Android           CODDY-2.2.apk             mobile\1-SET-SERVER.bat, then 2-BUILD-APK.bat
   iPhone / iPad     Xcode project             mobile/5-IOS-SETUP.command   (needs a Mac with Xcode: an Apple rule)

   Server start:  Windows banking-app\START.bat   |   macOS: double-click banking-app/START.command   |   Linux: sh START.sh
   Desktop app: if the server is on the same computer and not running, the app starts it by itself (needs Node.js).
   If the server is elsewhere (another PC, a cloud), type its address on the first screen (menu: CODDY > Server address).
   Tools you need ONCE for building: Node.js 22+; for Android: Android Studio; for iPhone: a Mac + Xcode.
   Honest note: I prepared all of these and tested the logic (settings, safety rules, server start, scripts, files),
   but I could not build the installers or run them on real devices in my environment (no internet, no Android SDK,
   no Mac, no Windows). If a build step stops, send me the red text and I will fix it.

   BANK-STYLE SECURITY AND FEEL (all apps)
     - splash screen; login with show/hide password, "remember my email", shake on a wrong password
     - PIN lock (4 digits): Profile > Security. The app locks after you leave it (immediately / 30 s / 1 min / 5 min),
       the screen is covered with the logo in the app switcher, and a time-out asks "Are you still there?"
       5 wrong PINs = 30 s pause, 10 = signed out. The PIN stays on the device (only a salted hash is stored).
     - fingerprint / Face ID: works where the device allows it in a secure page (desktop apps, https, localhost).
       On a phone opened over plain http://192... use the PIN (that is a browser rule, not a limitation of the bank).
     - pull down to refresh, shimmer while loading, "No internet" banner, vibration on taps and results,
       "Share receipt", "Good morning, <name>" greeting.


0) HOW TO OPEN THE APP ON YOUR PHONE (details for Way A and Way B)   (the server must be running on the PC: START.bat)

   WAY A - fastest, 2 minutes, nothing to install
     1. Phone and PC on the SAME Wi-Fi.
     2. Double-click  banking-app\START.bat . A page with a QR code opens on the PC.
     3. Point the phone camera at the QR code, tap the link. Log in: demo@bcc.kz / demo123
     4. In Chrome on the phone: menu (three dots) > "Add to Home screen". The CODDY icon appears
        on the phone like any other app.
     Not opening?  Windows asks "allow Node.js?": choose Private networks. The phone must use Wi-Fi
     (not mobile data, not a guest Wi-Fi). You can also type the address by hand, for example
     http://192.168.0.7:3000  (START.bat prints your real address).

   WAY B - a real Android app (CODDY-2.2.apk) that talks to the server on your PC
     You need, once:  Android Studio (https://developer.android.com/studio): install it and open it once
     so it downloads the Android SDK.  And Node.js 20 or newer (you already have Node for the server).
     1. Start the server: banking-app\START.bat  (keep the window open).
     2. Double-click  mobile\2-BUILD-APK.bat  : the first time it needs 10-20 minutes and internet
        (it downloads the Android build tools). It ends with:  CODDY-2.2.apk  in the mobile folder.
        The APK no longer bakes in your PC's address. On first launch it asks you to type the server
        address (the one START.bat prints, e.g. http://192.168.0.7:3000, or a public tunnel link).
     3. Put the file on the phone (USB cable, Telegram, Google Drive), open it, allow
        "install unknown apps" when the phone asks. Or plug the phone in with USB debugging on and
        double-click  mobile\3-INSTALL-ON-PHONE.bat .
     4. Open CODDY on the phone, type the server address, and tap Connect. The PC must be on, the
        server running, and the phone able to reach that address (same Wi-Fi, or a public tunnel).
     If the server address changes (a new Wi-Fi, the router gave a new address) you do NOT need to
     rebuild: just re-enter the address on the app's first screen (or clear the app storage).
     Note: scanning a QR with the camera needs https; on your home network use the "paste QR text" box.
     Note: I could not build and run the APK in my own environment (no Android SDK, no internet there), so
     WAY B is prepared but not tested on a real phone. The app inside it is the same tested web app.
     If a step fails, send me the red text from the black window.

   LANGUAGES:  English / Қазақша / Русский. Switch with the  EN | ҚАЗ | РУС  button at the top of the
     login screen and of Home (also in Profile). It changes instantly and is remembered. Missing translations
     stay in English. The texts live in banking-app\public\i18n-ru.js and i18n-kk.js.
   ANIMATIONS: screens slide, buttons ripple (and tick on Android), sheets slide, loading bar, success
     tick with confetti, cards have depth. Phones with "reduce motion" turned on get none of it.

1) WHAT YOU NEED
   Node.js version 22 or newer.   Check:  open a terminal and type   node -v

2) START THE SERVER  (any one of these)
   A. Double-click   banking-app\START.bat
   B. In IntelliJ IDEA:
        File > Open > choose the CODDY 2.2 folder > "Trust Project"
        (ignore any "Java SDK / JDK" warning: this project is Node.js, not Java)
        Open the Terminal tab (Alt+F12) and type:
              cd banking-app
              node server-sqlite.js
        (npm start does the same thing)
   Stop the server: press Ctrl+C in that window.

3) OPEN THE APP
   On the PC:      http://localhost:3000
   Demo login:     demo@bcc.kz   /   demo123
   Or register a new account (an SMS code is needed, see section 5).

4) OPEN IT ON YOUR PHONE
   - The phone and the PC must be on the SAME Wi-Fi.
   - When the server starts it prints addresses like  http://192.168.1.25:3000
     Type the FIRST one in the phone browser (Chrome / Safari). If it does not
     open, try the next address in the list.
   - Windows asks "Allow access?" the first time: tick PRIVATE networks and Allow.
     (If you pressed Cancel: Windows Defender Firewall > Allow an app > node.js > Private.)
   - Turn off VPN on the phone/PC if it still does not open.
   Make it look like an app on the home screen:
     Android (Chrome):  menu (3 dots) > "Add to Home screen"
     iPhone (Safari):   Share button > "Add to Home Screen"
   (Full "Install app" with offline support needs https://, which a plain
    home-Wi-Fi address does not have. The home-screen icon works either way.)

4b) OPEN IT ON ANOTHER PC / ANYWHERE (new)
   The server is on YOUR PC. To reach it from another computer or a phone on
   a different network, use one of these (in order of how far it reaches):

   SAME Wi-Fi (another phone/PC on your home network):
     - Run  banking-app\ALLOW-FIREWALL.bat  ONCE as Administrator. It opens
       inbound TCP 3000 (this is the usual reason "no connection" appears).
     - Start the server (START.bat). It prints addresses like
       http://192.168.0.7:3000 . Give that address to the other device.
     - The phone and the PC must be on the SAME Wi-Fi (not a "Guest" network,
       which usually blocks devices from talking to each other).

   ANYWHERE ON THE INTERNET (mobile data, another Wi-Fi, another country):
     - Start the server (START.bat) as usual.
     - Run  banking-app\SHARE-TUNNEL.bat . It prints a public https:// address
       (uses Cloudflare Tunnel via npx - no install needed, it downloads
       cloudflared on first run; falls back to ssh/localhost.run if needed).
     - Send that https address to anyone. They can open the app with it in a
       browser, or type it into the APK's first screen / the desktop app's
       "Server address" box.
     - KEEP the SHARE-TUNNEL.bat window open while people are using it.
       Closing it stops the public address immediately.
     - The tunnel can take 30-60 seconds to become reachable after it prints
       its URL - that is normal, the script waits for it to really answer
       before handing you the address.

   The desktop app and the APK now ask for the server address at runtime, so
   the same built APK / installed desktop app works on any phone or PC - you
   just type the address it needs (LAN address or the tunnel https link).

5) SMS CODES
   Codes are asked when you register, send to other people, send abroad,
   send to a crypto wallet or link a wallet.
   DEMO MODE (default): no real SMS is sent. The code is shown on screen in a
   yellow box, printed in the server window, and saved in logs\sms-outbox.txt.
   REAL SMS (needs your own Twilio account) - set before starting the server:
        set TWILIO_ACCOUNT_SID=...
        set TWILIO_AUTH_TOKEN=...
        set TWILIO_FROM=+1xxxxxxxxxx
        node server-sqlite.js
   In real mode the code is no longer shown on screen. (Code is in sms.js;
   it follows Twilio's public docs but could not be tested without an account.)

6) WHAT IS REAL AND WHAT IS SIMULATED
   REAL:  accounts, KZT/USD cards, transfers between bcc.kz clients (phone numbers
          of any country, or card), SMS-code check (hashed, 5 min, 5 tries),
          money moves in one database transaction, history, deposits.
   SIMULATED (demo only, no real money anywhere):
          - exchange rate KZT/USD and crypto prices: fixed numbers in bank-config.js
          - SMS sending (until you add Twilio)
          - international (SWIFT) transfers: IBAN check digits and SWIFT format are
            really validated, but nothing leaves the bank
          - crypto wallets: addresses are format-checked; no blockchain transaction
          - transfers to other banks in Kazakhstan
   Menu items marked "Coming soon": loans, QR, chat, money requests, autotransfers...

NEW IN VERSION 3 (kept in 2.1)  (every button in the app now does something real)
   Home:       big swipeable cards (details after SMS code, freeze / unfreeze), messages bell,
               analytics, cashback, QR, chat assistant, public services
   Transfers:  money requests (up to 5 people, split), autotransfers (scheduler), refund requests, bank contact
   Payments:   mobile, utilities, internet, transport, entertainment (earn cashback)
   Services:   loans (instant decision, repay), investments (demo market), insurance (travel/car/home),
               offers, safe-deposit box booking, documents (CSV statement, bank details), bcc Plus
   FLAGSHIP:   bcc Shield  -  see section 10
   Bank team:  log in as demo@bcc.kz > Services > Other services > "Bank team"
               (who may open it: ADMIN_EMAILS in bank-config.js)

10) bcc SHIELD  (the idea to show the bank's owners)
   Why: in Kazakhstan phone scams, fake investments and messenger fraud are the most common types of
   fraud (National Bank Anti-Fraud Center). Shield is the customer-facing layer on top of that.
   What it does, for every transfer to another person / bank / country / wallet:
     1. Scores it 0-100 BEFORE the SMS code, and explains each reason in plain words
        (new recipient, most of the balance, unusual amount, night, crypto, brand-new recipient
        account, "mule" pattern = recipient just got money from 3+ different people, ...).
     2. LOW: normal.  CAUTION: friendly warning + scam advice, customer confirms.
        HIGH: the transfer is HELD (cooling-off) and can be cancelled; with a trusted GUARDIAN
        (family member with bcc.kz) it is only sent after the guardian approves.
     3. The customer can tick "someone on the phone is telling me what to do" (+25 points).
     4. PANIC button: freezes every card and pauses autotransfers; unfreezing needs an SMS code.
     5. "Check before you send" tool, scam education, and a scenario list to demo how it reacts.
   The bank team dashboard shows what Shield stopped, why it fired, volumes, refund queue.
   Tune it in bank-config.js: SHIELD { holdMinutes (2 for demos, use 30-60+ for real), medium, high }.

11) FINANCE & AI  (new in CODDY 2.0)
   Where:  Home > the green "Safe to spend today" strip, or Services > New > Finance & AI / Subscriptions / Savings goals
   OVERVIEW       Safe-to-Spend = (money on cards - subscriptions - loan payments - goal needs) / days to payday.
                  AI tips from your own numbers (which category you spend faster than usual, what subscriptions cost,
                  a warning if the cards will not last until payday), a balance forecast chart, and the 50/30/20 donut.
   SUBSCRIPTIONS  Netflix, Yandex Plus, Spotify (demo prices). BEFORE each charge the app asks the customer:
                    [Pay]        -> the money is taken
                    [Don't pay]  -> nothing is taken, and the customer chooses:
                                      Freeze        = paused until resumed, or
                                      Stop paying   = never asked about it again.
                  No answer = no payment. The question pops up after login and also arrives as a message.
                  The app also finds recurring payments in the history (same shop, same amount, every month)
                  and offers to track them. Try it: Finance > Subscriptions > "Remind me now".
   GOALS          A road with a car / plane. Round-up (a 1 150 purchase leaves the card as 1 200, the 50 goes to the goal),
                  cashback -> goal, and a savings calculator. Try it: Finance > Overview > "Make a demo card purchase".
   Not included on purpose: the "penalty for bad habits" idea.
   Nothing here uses an outside AI service: the tips are rules working on the customer's own data.
   On the first start a demo history is created for demo@bcc.kz (salary, shops, taxi, cafes, bills, subscriptions, goals).
   Settings: bank-config.js > PFM { remindHours, roundUpStep }.

HONEST NOTES
   - QR camera scanning only works on https:// or localhost (browser rule) and in browsers that
     support it (Chrome on Android). On a plain http://192.168... address use the "paste QR text" box.
   - Loans, insurance, public services, investments, offers, branches (except the head office),
     exchange rate and crypto prices are DEMO data. Nothing here is a real financial product.
   - No real SMS is sent until you add Twilio (section 5).
   - "Stop paying" only stops the reminders in this demo. A real bank would also block that shop on the card through
     the card network (Visa / Mastercard token controls); a demo cannot do that.
   - Demo purchases and the demo history are made-up data, not real card payments.

7) FILES YOU MAY WANT TO EDIT
   banking-app\bank-config.js   rates, fees, limits, Shield, loan terms, admin logins, countries
   banking-app\sms.js           how SMS codes are sent
   banking-app\server-sqlite.js core logic (login, transfers, SMS codes)
   banking-app\features.js      v3 features (Shield, loans, requests, ... )
   banking-app\pfm.js           Finance: subscriptions, Safe-to-Spend, AI tips, forecast, goals
   banking-app\public\i18n*.js   languages     anim.js  animations     bankfeel.js  PIN / lock / bank feel     native.js  app shells
   banking-app\public\phone.html  the QR page for the phone
   mobile\                       the Android + iPhone app project and build scripts
   desktop\                      the Windows / macOS / Linux app project and build scripts
   banking-app\public\          the app screens (index.html, app.js, features-ui.js, finance-ui.js, qr.js, styles.css)

8) LOGS
   banking-app\logs\banking-YYYY-MM-DD.txt   (one file per day)
   Passwords, SMS codes, full card numbers, IBANs and wallet addresses are never written there.

9) YOUR DATA
   banking-app\banking.db is your database (users, cards, history). Copy it to back it up.
   Delete it only if you want to start from zero (a fresh demo user is created automatically).
