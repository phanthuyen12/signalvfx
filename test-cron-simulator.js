/**
 * test-cron-simulator.js
 * Script mô phỏng bot Telegram gửi tin nhắn tự động theo chu kỳ thời gian thực
 * Dùng để test App xem tín hiệu nhảy realtime, đổi màu card và phát chuông âm thanh!
 */

const MESSAGES = [
  {
    name: '1. Tín hiệu Setup mới (Gann Buy Limit)',
    text: `🚀 FINAI TRADING - TÍN HIỆU GIAO DỊCH
──────────────────────────────
🔹 Chỉ báo phát tín hiệu: 🔮 Gann FinAI
🪙 Cặp tiền: XAUUSD (Vàng)
🎯 Hướng giao dịch: 🟢 BUY (MUA)
⏱️ Khung tín hiệu: ALL (Tất cả khung thời gian (M1 ➔ D1))
⚡️ Trạng thái: KÊ LỆNH CHỜ (PENDING LIMIT - Góc Gann Retest)
⏳ Thời hạn hủy lệnh (Expiration): 5 phút
💎 Giá vào lệnh (Buy Limit): 4,578.62
🛑 Cắt lỗ (SL): 4,574.35 (-42.7 pips)
🎯 Chốt lời (TP1 1:1): 4,582.89 (+42.7 pips)
🚀 Chốt lời (TP2 1:3): 4,591.43 (+128.1 pips)
🏆 Chốt lời (TP3 1:5): 4,599.97 (+213.5 pips)
──────────────────────────────
🛡️ KỊCH BẢN VÀO LỆNH & CHIA VOLUME (1 LỆNH 100% VOL):
├ 📊 Khối lượng: Vào 100% Volume tại Entry 4,578.62
├ ⚠️ Mức rủi ro khuyến nghị: Tối đa 1% - 2% tổng tài khoản
├ 💼 Quản lý vị thế: Cắn TP1 ➔ Dời SL về BE.
└ ✍️ Tín hiệu hỗ trợ giao dịch - Tuân thủ tuyệt đối quy tắc quản lý vốn!
──────────────────────────────
💡 Mẫu Cấu hình: "GAN"
🤖 Hệ thống FinAI Trading - Phân tích tự động 24/7`
  },
  {
    name: '2. Đã vào lệnh #9 (Khớp lệnh)',
    text: `🚀 ĐÃ VÀO LỆNH THỨ #9 TRONG NGÀY (${new Date().toISOString().slice(0, 10)})
──────────────────────
📡 Chiến lược: GAN
📌 Loại lệnh: 🟢 BUY | Cặp: XAUUSD | Volume: 0.10 lot
🎯 Giá vào (Entry): 4578.62
⛔️ Stop Loss: 4574.35
🎯 Take Profit: 4582.89
⏰ Thời gian vào lệnh: ${new Date().toLocaleTimeString('vi-VN')}
──────────────────────
🤖 Lệnh thứ #9 đã được ghi nhận vào nhật ký ngày ${new Date().toISOString().slice(0, 10)}`
  },
  {
    name: '3. Chốt lời TP Hit #4 (+51.2 pips)',
    text: `✅ TP HIT - BUY XAUUSD (Lệnh #4)
📌 Entry: 4604.26 ➔ Exit: 4609.38
📊 +51.2 pips
⏰ Time: ${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('vi-VN')}`
  },
  {
    name: '4. Cắt lỗ SL Hit #7 (-92.7 pips)',
    text: `🛑 SL HIT - BUY XAUUSD (Lệnh #7)
📌 Entry: 4593.99 ➔ Exit: 4584.72
📊 -92.7 pips
⏰ Time: ${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('vi-VN')}`
  },
  {
    name: '5. Hủy lệnh #9 (Giá chạm TP trước khi khớp)',
    text: `⛔️ HỦY LỆNH (ĐÃ CHẠM TP) - BUY XAUUSD (Lệnh #9)
⚠️ Giá đã chạm TP trước khi khớp Entry. Vô hiệu hóa setup!
📌 Limit Entry: 4578.62
📊 0.0 pips (Không khớp)
⏰ Time: ${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('vi-VN')}`
  }
];

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

async function sendSignal(msgObj, index) {
  try {
    const res = await fetch(`${API_URL}/api/signals/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msgObj.text })
    });
    const json = await res.json();
    console.log(`[${new Date().toLocaleTimeString()}] 🚀 Bắn tin nhắn [${index + 1}/${MESSAGES.length}]: ${msgObj.name} ➔ Trạng thái: Thành công (Server đã stream tới App)!`);
  } catch (err) {
    console.error(`[Lỗi] Không thể kết nối tới server (đảm bảo 'npm run server' đang chạy):`, err.message);
  }
}

async function startSimulation() {
  console.log('====================================================');
  console.log('⚡️ BẮT ĐẦU MÔ PHỎNG BẮN TIN NHẮN REALTIME VÀO APP ⚡️');
  console.log('Mỗi 5 giây sẽ tự động gửi 1 tin nhắn Telegram FinAI...');
  console.log('Hãy mở App hoặc trình duyệt http://localhost:5173 để xem!');
  console.log('====================================================\n');

  let i = 0;
  // Gửi tin đầu tiên ngay lập tức
  await sendSignal(MESSAGES[0], 0);

  // Lặp gửi từng tin nhắn mỗi 5 giây
  setInterval(async () => {
    i = (i + 1) % MESSAGES.length;
    await sendSignal(MESSAGES[i], i);
  }, 5000);
}

startSimulation();
