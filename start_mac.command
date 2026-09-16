#!/bin/bash
cd "$(dirname "$0")"

clear
echo "==================================================="
echo "       FinAI Signals - Hệ Thống Báo Tín Hiệu       "
echo "==================================================="
echo ""

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "❌ [LỖI] Không tìm thấy Node.js trên máy Mac!"
    echo "Vui lòng tải và cài đặt Node.js phiên bản LTS từ https://nodejs.org"
    echo "Sau đó bấm chạy lại file này."
    echo ""
    read -p "Nhấn Enter để thoát..."
    exit 1
fi

# Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 [1/3] Đang cài đặt thư viện (npm install)..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ [LỖI] Cài đặt thư viện thất bại!"
        read -p "Nhấn Enter để thoát..."
        exit 1
    fi
else
    echo "✅ [1/3] Thư viện đã sẵn sàng."
fi

# Kiểm tra thư mục dist
if [ ! -d "dist" ]; then
    echo "🔨 [2/3] Đang đóng gói giao diện web (npm run build)..."
    npm run build
else
    echo "✅ [2/3] Giao diện đã sẵn sàng."
fi

echo "🚀 [3/3] Đang khởi động hệ thống..."
echo ""
echo "==================================================="
echo "  🌐 Web App / Backend: http://localhost:3001"
echo "  ⚙️  Quản trị Admin: http://localhost:3001/admin (PIN: 8888)"
echo "==================================================="
echo ""

# Mở trình duyệt mặc định
sleep 1 && open "http://localhost:3001" &

# Chạy Backend (tự động phục vụ cả Web App và Realtime API)
node cron-service.js
