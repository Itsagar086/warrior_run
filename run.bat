@echo off
REM ===================================================================
REM  Naga Loka Runner - one-click launcher
REM  Double-click this file to play. It starts the local server and
REM  opens the game in your default browser.
REM ===================================================================
title Naga Loka Runner - server (close this window to stop the game)
cd /d "%~dp0"

echo.
echo   Starting Naga Loka Runner...
echo.

REM Give the server a moment to bind the port, then open the browser
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000"

node serve.mjs
