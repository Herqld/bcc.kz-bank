@echo off
cd /d "%~dp0"
echo Looking for your PC address...
node tools\set-server.js
pause
