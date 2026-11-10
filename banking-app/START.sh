#!/bin/sh
# CODDY 2.2 server for macOS and Linux:   sh START.sh   (macOS: double-click START.command)
cd "$(dirname "$0")" || exit 1
echo "============================================================"
echo "       CODDY 2.2 - STARTING SERVER..."
echo "============================================================"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is not installed. Get Node.js 22 or newer: https://nodejs.org"; exit 1; fi
node -e "require('better-sqlite3')" 2>/dev/null || { echo "First start on this computer: installing the server parts, please wait..."; npm install || exit 1; }
( sleep 3; if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000/phone.html; elif command -v open >/dev/null 2>&1; then open http://localhost:3000/phone.html; fi ) >/dev/null 2>&1 &
exec node server-sqlite.js
