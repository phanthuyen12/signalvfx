@echo off
title FinAI Signals - He Thong Tin Hieu

echo ===================================================
echo        FinAI Signals - He Thong Tin Hieu
echo ===================================================
echo.

cd /d "%~dp0"
echo [Thu muc]: %CD%
echo.

echo [1/4] Kiem tra Node.js...
call node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo  [!] MAY TINH CHUA CAI DAT NODE.JS HOAC CHUA KHOI DONG LAI
    echo ========================================================
    echo  De chay duoc chuong trinh, ban can cai Node.js:
    echo  1. Truy cap: https://nodejs.org
    echo  2. Tai ban LTS (Recommended) va cai dat vao may.
    echo  3. (Neu vua cai xong) Hay khoi dong lai may hoac mo lai file nay.
    echo ========================================================
    echo.
    pause
    goto :eof
)

echo    - Node version:
call node -v
echo    - NPM version:
call npm -v
echo.

echo [2/4] Kiem tra thu vien npm (node_modules)...
if not exist "node_modules" (
    echo    - Dang cai dat thu vien, vui long cho...
    call npm install
) else (
    echo    - Thu vien da san sang.
)
echo.

echo [3/4] Kiem tra thu muc dist...
if not exist "dist" (
    echo    - Dang dong goi giao dien web (npm run build)...
    call npm run build
) else (
    echo    - Giao dien dist da san sang.
)
echo.

echo [4/4] Dang khoi dong Web Server va mo trinh duyet...
echo ===================================================
echo   - Web App:   http://localhost:3001
echo   - Admin Pin: http://localhost:3001/admin (PIN: 8888)
echo ===================================================
echo.

start http://localhost:3001

call node cron-service.js

echo.
echo Server da dung.
pause
