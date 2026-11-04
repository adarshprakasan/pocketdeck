@echo off
setlocal
cd /d "%~dp0app"
set "HOSTNAME=0.0.0.0"
set "PORT=3000"
echo Starting PocketDeck. Keep this window open while using the deck.
echo On this computer, open http://localhost:3000
echo Scan the QR code with a phone browser on the same Wi-Fi.
if exist "..\pocketdeck.env" (
  "%~dp0runtime\node.exe" --env-file="..\pocketdeck.env" server.js
) else (
  "%~dp0runtime\node.exe" server.js
)
echo.
echo PocketDeck stopped. Press any key to close this window.
pause >nul
