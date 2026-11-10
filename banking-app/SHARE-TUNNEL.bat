@echo off
rem ============================================================
rem  CODDY 2.2 - open the server to ANY phone / ANY network
rem  Gives you one public https address you can send to anyone.
rem  (DEMO app - no real money, so a public demo address is fine.)
rem  Leave this window open while people are testing.
rem ============================================================
cd /d "%~dp0"
echo ============================================================
echo        CODDY 2.2 - OPENING THE SERVER TO THE INTERNET
echo ============================================================
echo.
echo If the bank server is not running yet, start START.bat in another window.
echo Waiting a moment...
timeout /t 2 /nobreak >nul
node tools\tunnel.js
echo.
echo The public address above stopped working (this window is free now).
pause
