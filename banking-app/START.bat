@echo off
cd /d "%~dp0"
echo ============================================================
echo        CODDY 2.2 - STARTING SERVER...
echo ============================================================
echo.
node -e "require(\x27better-sqlite3\x27)" 2>nul || (echo First start on this computer: installing the server parts, please wait... & call npm install)
echo Please wait while the server starts...
echo A page with a QR code for your phone will open in your browser.
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000/phone.html"

node server-sqlite.js

pause
