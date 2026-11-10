@echo off
cd /d "%~dp0"
if not exist node_modules (echo First start: installing Electron, please wait... & call npm install)
call npx electron .
pause
