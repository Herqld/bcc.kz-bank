@echo off
cd /d "%~dp0"
echo Building the Windows installer (first time: a few minutes, needs internet)...
call npm install
call npm run dist:win
echo.
echo Done. The installer (CODDY Setup ...exe) and a portable .exe are in the "dist" folder.
pause
