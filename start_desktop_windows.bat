@echo off
title FinAI Signals - Desktop App (Electron)

echo ===================================================
echo     FinAI Signals - Desktop App (Electron)
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Kiem tra Node.js...
call node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo  [!] MAY TINH CHUA CAI DAT NODE.JS!
    echo ========================================================
    echo  Vui long tai va cai tai: https://nodejs.org
    echo ========================================================
    echo.
    pause
    goto :eof
)

echo [2/3] Kiem tra thu vien...
if not exist "node_modules" (
    echo    - Dang cai dat thu vien, vui long cho...
    call npm install
)

echo [3/3] Dang khoi chay Desktop App...
call npm run electron:start

echo.
pause
