/**
 * storageService.js
 * Quản lý lưu trữ JSON, Đồng bộ Realtime Đa Tab/Cửa sổ qua BroadcastChannel, Âm thanh thông báo
 */

import { parseAllMessages } from '../utils/telegramParser';

const STORAGE_KEY = 'FINAI_SIGNALS_DB_V1';
const BOT_CONFIG_KEY = 'FINAI_TELEGRAM_BOT_CONFIG';

// Kênh BroadcastChannel để đồng bộ tức thì giữa tab Khách Hàng và tab Admin
const channel = typeof window !== 'undefined' && window.BroadcastChannel 
  ? new window.BroadcastChannel('finai_realtime_sync') 
  : null;

// Dữ liệu mẫu khởi tạo ban đầu
export const SAMPLE_RAW_TEXT = `🚀 FINAI TRADING - TÍN HIỆU GIAO DỊCH
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
├ 💼 Quản lý vị thế: Cắn TP1 ➔ Dời SL về BE. Cắn TP2 ➔ Dời SL lệnh 3 lên mốc TP1 để khóa 1 phần lợi nhuận.
└ ✍️ Tín hiệu hỗ trợ giao dịch - Tuân thủ tuyệt đối quy tắc quản lý vốn!
──────────────────────────────
💡 Mẫu Cấu hình: "GAN"
🤖 Hệ thống FinAI Trading - Phân tích tự động 24/7 và 🚀 ĐÃ VÀO LỆNH THỨ #9 TRONG NGÀY (2026-08-28)
──────────────────────
📡 Chiến lược: GAN
📌 Loại lệnh: 🟢 BUY | Cặp: XAUUSD | Volume: 0.10 lot
🎯 Giá vào (Entry): 4578.62
⛔️ Stop Loss: 4574.35
🎯 Take Profit: 4582.89
⏰ Thời gian vào lệnh: 2026-08-28 11:15:07
──────────────────────
🤖 Lệnh thứ #9 đã được ghi nhận vào nhật ký ngày 2026-08-28 và ⛔️ HỦY LỆNH (ĐÃ CHẠM TP) - BUY XAUUSD (Lệnh #9)
⚠️ Giá đã chạm TP trước khi khớp Entry. Vô hiệu hóa setup!
📌 Limit Entry: 4578.62
📊 0.0 pips (Không khớp)
⏰ Time: 2026-08-28 11:19:00 và 🛑 SL HIT - BUY XAUUSD (Lệnh #7)
📌 Entry: 4593.99 ➔ Exit: 4584.72
📊 -92.7 pips
⏰ Time: 2026-08-28 01:28:01 và ✅ TP HIT - BUY XAUUSD (Lệnh #4)
📌 Entry: 4604.26 ➔ Exit: 4609.38
📊 +51.2 pips
⏰ Time: 2026-08-28 05:40:38`;

// Phát âm thanh khi có tín hiệu mới (Web Audio API)
export function playSignalChime(type = 'new') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'tp') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'sl') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Audio Context block by browser policy if no interaction
  }
}

// Khởi tạo database ban đầu
export function initStorage() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    const defaultData = parseAllMessages(SAMPLE_RAW_TEXT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return defaultData;
  }
  try {
    return JSON.parse(existing);
  } catch (e) {
    const defaultData = parseAllMessages(SAMPLE_RAW_TEXT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return defaultData;
  }
}

export function getSignals() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return initStorage();
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function notifyChange(action = 'update', latestItem = null) {
  // Bắn event local
  window.dispatchEvent(new CustomEvent('finai_storage_update', { detail: { action, latestItem } }));
  // Bắn BroadcastChannel tới tất cả tab/cửa sổ khác
  if (channel) {
    channel.postMessage({ type: 'FINAI_SIGNAL_SYNC', action, latestItem, timestamp: Date.now() });
  }
}

export function saveSignals(signals, latestItem = null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  notifyChange('save', latestItem);
}

export function addSignalsFromRawText(rawText) {
  const parsedList = parseAllMessages(rawText);
  if (parsedList.length === 0) return [];
  const current = getSignals();
  const updated = [...parsedList, ...current];
  const first = parsedList[0];
  saveSignals(updated, first);
  
  // Phát âm thanh
  if (first.status === 'TP_HIT') playSignalChime('tp');
  else if (first.status === 'SL_HIT') playSignalChime('sl');
  else playSignalChime('new');

  return parsedList;
}

export function clearAllSignals() {
  saveSignals([]);
}

export function resetToDefault() {
  const defaultData = parseAllMessages(SAMPLE_RAW_TEXT);
  saveSignals(defaultData);
  return defaultData;
}

export function exportSignalsJSON() {
  const data = getSignals();
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finai_signals_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getBotConfig() {
  const cfg = localStorage.getItem(BOT_CONFIG_KEY);
  if (cfg) {
    try { return JSON.parse(cfg); } catch (e) {}
  }
  return {
    botToken: '',
    chatId: '',
    autoPoll: false,
    pollInterval: 3000,
    adminPin: '8888'
  };
}

export function saveBotConfig(config) {
  localStorage.setItem(BOT_CONFIG_KEY, JSON.stringify(config));
}

// Lắng nghe channel ở các tab khác
export function subscribeToRealtimeSync(callback) {
  if (!channel) return () => {};
  const handler = (e) => {
    if (e.data && e.data.type === 'FINAI_SIGNAL_SYNC') {
      callback(e.data);
    }
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
  };
}
