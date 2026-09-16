#!/bin/bash
cd "$(dirname "$0")"

clear
echo "==================================================="
echo "     FinAI Signals - Khởi Chạy Desktop App         "
echo "==================================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "❌ [LỖI] Không tìm thấy Node.js! Vui lòng cài tại https://nodejs.org"
    read -p "Nhấn Enter để thoát..."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "📦 Đang cài đặt thư viện..."
    npm install
fi

echo "🚀 Đang khởi chạy Desktop App..."
npm run electron:start
