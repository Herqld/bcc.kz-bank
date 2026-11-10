@echo off
rem ============================================================
rem  CODDY 2.2 - allow other phones/PCs to reach this PC (one time)
rem  Adds a Windows Firewall rule for TCP 3000. Runs as Administrator.
rem  Safe to run many times. Removes an old "block node.exe" rule first
rem  (this is what happens if you once clicked "Cancel" on the
rem  Windows Security Alert popup).
rem ============================================================
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator rights - a popup will appear, click Yes...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo Adding the firewall rule for port 3000...

rem Clean any old rules we (or a blocked node.exe popup) created before, so this stays idempotent.
netsh advfirewall firewall delete rule name="CODDY 2.2 Server (TCP 3000)" >nul 2>&1
for /f "delims=" %%P in ('where node.exe 2^>nul') do netsh advfirewall firewall delete rule name="CODDY 2.2 node.exe" program="%%P" >nul 2>&1

rem Allow inbound TCP 3000 on ALL network profiles (private and public Wi-Fi).
netsh advfirewall firewall add rule name="CODDY 2.2 Server (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any enable=yes >nul

rem Belt and braces: also allow the node.exe program itself on all profiles.
for /f "delims=" %%P in ('where node.exe 2^>nul') do netsh advfirewall firewall add rule name="CODDY 2.2 node.exe" dir=in action=allow program="%%P" profile=any enable=yes >nul

echo.
echo ============================================================
echo  DONE. Other phones/PCs on the same Wi-Fi can now use
echo  http://THIS-PC-IP:3000   (the address START.bat prints).
echo.
echo  Still not opening on the phone?
echo   - Phone and PC must be on the SAME Wi-Fi network (not a
echo     "Guest" network - guest Wi-Fi usually blocks devices
echo     from talking to each other).
echo   - Restart the server (START.bat) after this script.
echo ============================================================
echo.
pause
