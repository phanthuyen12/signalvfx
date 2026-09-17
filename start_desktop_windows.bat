@echo off
title FinAI Signals - Desktop App (Electron)

echo ===================================================
echo     FinAI Signals - Desktop App (Electron)
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/4] Kiem tra Node.js...
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

echo [2/4] Kiem tra thu vien...
if not exist "node_modules" (
    echo    - Dang cai dat thu vien, vui long cho...
    call npm install
    if %errorlevel% neq 0 (
        echo    [!] Khong the cai dat thu vien.
        pause
        goto :eof
    )
)

echo [3/4] Cau hinh backend http://127.0.0.1:3001...
set "PORT=3001"
set "VITE_API_URL=http://127.0.0.1:3001"

echo [4/4] Dang khoi chay Backend va Desktop App...
echo    - Backend se tu khoi dong neu cong 3001 chua chay.
call npm run electron:start

echo.
pause
