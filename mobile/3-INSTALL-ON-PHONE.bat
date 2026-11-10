@echo off
cd /d "%~dp0"
if not exist CODDY-2.2.apk (echo Build the app first: 2-BUILD-APK.bat & pause & exit /b 1)
echo Plug in the phone with USB debugging on, then confirm the prompt on the phone.
set ADB=adb
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set ADB="%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
%ADB% install -r CODDY-2.2.apk
pause
