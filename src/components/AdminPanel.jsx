import React, { useState, useEffect } from 'react';
import {
  addSignalsFromRawText,
  exportSignalsJSON,
  resetToDefault,
  clearAllSignals,
  saveSignals,
  getBotConfig,
  saveBotConfig,
  SAMPLE_RAW_TEXT
} from '../services/storageService';
import {
  getBotMe,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  deleteTelegramWebhook,
  sendTelegramMessage,
  inspectRecentUpdates
} from '../services/telegramService';
import { splitMessages, parseTelegramMessage } from '../utils/telegramParser';

function getApiBaseUrl() {
  if (typeof window === 'undefined') return import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const { hostname, protocol, port } = window.location;
  if (port === '5173') return '';
  if (protocol === 'file:') return import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (!isLocalhost) return '';

  return import.meta.env.VITE_API_URL || `${protocol}//${hostname}:3001`;
}

const API_BASE_URL = getApiBaseUrl();

// Các tin nhắn mẫu để test nhanh 1-click
const TEMPLATE_SETUP = `🚀 FINAI TRADING - TÍN HIỆU GIAO DỊCH
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
🤖 Hệ thống FinAI Trading - Phân tích tự động 24/7`;

const TEMPLATE_EXECUTED = `🚀 ĐÃ VÀO LỆNH THỨ #9 TRONG NGÀY (2026-08-28)
──────────────────────
📡 Chiến lược: GAN
📌 Loại lệnh: 🟢 BUY | Cặp: XAUUSD | Volume: 0.10 lot
🎯 Giá vào (Entry): 4578.62
⛔️ Stop Loss: 4574.35
🎯 Take Profit: 4582.89
⏰ Thời gian vào lệnh: 2026-08-28 11:15:07
──────────────────────
🤖 Lệnh thứ #9 đã được ghi nhận vào nhật ký ngày 2026-08-28`;

const TEMPLATE_CANCELLED = `⛔️ HỦY LỆNH (ĐÃ CHẠM TP) - BUY XAUUSD (Lệnh #9)
⚠️ Giá đã chạm TP trước khi khớp Entry. Vô hiệu hóa setup!
📌 Limit Entry: 4578.62
📊 0.0 pips (Không khớp)
⏰ Time: 2026-08-28 11:19:00`;

const TEMPLATE_SL = `🛑 SL HIT - BUY XAUUSD (Lệnh #7)
📌 Entry: 4593.99 ➔ Exit: 4584.72
📊 -92.7 pips
⏰ Time: 2026-08-28 01:28:01`;

const TEMPLATE_TP = `✅ TP HIT - BUY XAUUSD (Lệnh #4)
📌 Entry: 4604.26 ➔ Exit: 4609.38
📊 +51.2 pips
⏰ Time: 2026-08-28 05:40:38`;

export default function AdminPanel({ signals, onDataChange }) {
  const [activeTab, setActiveTab] = useState('input'); // 'input', 'table', 'json', 'bot'
  const [rawInput, setRawInput] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [clearAllLoading, setClearAllLoading] = useState(false);
  
  // Bot Config State
  const [botConfig, setBotConfig] = useState(getBotConfig());
  const [isPolling, setIsPolling] = useState(false);
  const [botLogs, setBotLogs] = useState([]);

  // Bot Diagnostics & Testing States
  const [diagResult, setDiagResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [autoFixLoading, setAutoFixLoading] = useState(false);
  const [hidePrivacyWarning, setHidePrivacyWarning] = useState(false);
  const [clearWebhookLoading, setClearWebhookLoading] = useState(false);
  const [inspectedUpdates, setInspectedUpdates] = useState([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [simulateText, setSimulateText] = useState(TEMPLATE_SETUP);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [testSendChatId, setTestSendChatId] = useState('');
  const [testSendMessage, setTestSendMessage] = useState('');
  const [testSendLoading, setTestSendLoading] = useState(false);

  // Custom Webhook & Auto Tunnel Management State
  const [customWebhookUrl, setCustomWebhookUrl] = useState('');
  const [webhookInfoResult, setWebhookInfoResult] = useState(null);
  const [webhookActionLoading, setWebhookActionLoading] = useState(false);
  const [tunnelStatus, setTunnelStatus] = useState({ active: false, tunnelUrl: '', webhookUrl: '' });
  const [autoTunnelLoading, setAutoTunnelLoading] = useState(false);

  useEffect(() => {
    const loadBackendConfig = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/config`);
        if (res.ok) {
          const backendConfig = await res.json();
          setBotConfig(prev => ({ ...prev, ...backendConfig }));
          setIsPolling(Boolean(backendConfig.enableCron && backendConfig.botToken));
          if (backendConfig.chatId && !testSendChatId) {
            setTestSendChatId(backendConfig.chatId);
          }
          if (backendConfig.webhookUrl) {
            setCustomWebhookUrl(backendConfig.webhookUrl);
          }
        }

        // Kiểm tra trạng thái Auto Tunnel nếu backend đang chạy
        try {
          const tunnelRes = await fetch(`${API_BASE_URL}/api/admin/bot/tunnel-status`);
          if (tunnelRes.ok) {
            const tData = await tunnelRes.json();
            setTunnelStatus(tData);
            if (tData.webhookUrl) setCustomWebhookUrl(tData.webhookUrl);
          }
        } catch (e) {}
      } catch (err) {
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ⚠️ Chưa kết nối được backend 3001, app sẽ chỉ dùng dữ liệu local.`,
          ...prev
        ]);
      }
    };

    loadBackendConfig();
  }, []);

  // 1-Click Tự Động Tạo HTTPS Tunnel & Đăng Ký Webhook
  const handleStartAutoTunnel = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token trước khi tạo Tunnel!');
      return;
    }
    setAutoTunnelLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/bot/auto-tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botConfig.botToken })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Lỗi tạo tunnel');

      setTunnelStatus({ active: true, tunnelUrl: data.tunnelUrl, webhookUrl: data.webhookUrl });
      setCustomWebhookUrl(data.webhookUrl);
      showFeedback(`⚡️ ${data.message}`);
      setBotLogs(prev => [
        `[${new Date().toLocaleTimeString()}] 🌐 Đã mở HTTPS Tunnel: ${data.tunnelUrl}`,
        `[${new Date().toLocaleTimeString()}] ⚡️ Đã tự động đăng ký Webhook Telegram: ${data.webhookUrl}`,
        ...prev
      ]);
      handleCheckWebhookInfo();
      handleRunBotDiagnosis();
    } catch (err) {
      alert('Lỗi tạo Auto Tunnel: ' + err.message);
    } finally {
      setAutoTunnelLoading(false);
    }
  };

  // Đóng Tunnel và quay về Polling
  const handleStopAutoTunnel = async () => {
    setAutoTunnelLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/bot/stop-tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botConfig.botToken })
      });
      const data = await res.json();
      setTunnelStatus({ active: false, tunnelUrl: '', webhookUrl: '' });
      showFeedback('⏹ Đã đóng Tunnel và chuyển về chế độ Long-Polling!');
      setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ⏹ Đã đóng Tunnel & xóa Webhook Telegram.`, ...prev]);
      handleCheckWebhookInfo();
      handleRunBotDiagnosis();
    } catch (err) {
      alert('Lỗi đóng Tunnel: ' + err.message);
    } finally {
      setAutoTunnelLoading(false);
    }
  };

  // Đăng ký Webhook tùy chỉnh 100%
  const handleRegisterCustomWebhook = async (dropPending = false) => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token!');
      return;
    }
    const targetUrl = customWebhookUrl.trim();
    if (!targetUrl || !targetUrl.startsWith('https://')) {
      alert('Vui lòng nhập Webhook URL hợp lệ bắt đầu bằng https://\n(Ví dụ: https://your-domain.com/api/webhook hoặc https://xxx.ngrok-free.app/api/webhook)');
      return;
    }

    setWebhookActionLoading(true);
    try {
      let resData = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/set-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, url: targetUrl, dropPendingUpdates: dropPending })
        });
        if (res.ok) resData = await res.json();
      } catch (e) {}

      if (!resData) {
        const ok = await setTelegramWebhook(botConfig.botToken, targetUrl, dropPending);
        resData = { success: ok, message: 'Đăng ký Webhook thành công!' };
      }

      showFeedback(`🌐 Đã đăng ký Webhook Telegram thành công tới: ${targetUrl}`);
      setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] 🌐 Đã đăng ký Webhook: ${targetUrl}`, ...prev]);

      const nextConfig = { ...botConfig, webhookUrl: targetUrl };
      setBotConfig(nextConfig);
      try { await saveBotConfigToBackend(nextConfig); } catch (e) {}

      handleCheckWebhookInfo();
      handleRunBotDiagnosis();
    } catch (err) {
      alert('Lỗi đăng ký Webhook: ' + err.message);
    } finally {
      setWebhookActionLoading(false);
    }
  };

  // Kiểm tra chi tiết Webhook Info
  const handleCheckWebhookInfo = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token!');
      return;
    }
    setWebhookActionLoading(true);
    try {
      const hookInfo = await getTelegramWebhookInfo(botConfig.botToken);
      setWebhookInfoResult(hookInfo);
      if (hookInfo && hookInfo.url) {
        setCustomWebhookUrl(hookInfo.url);
        showFeedback(`🌐 Webhook đang hoạt động tại: ${hookInfo.url}`);
      } else {
        showFeedback('🌐 Webhook hiện đang TẮT (Chế độ Long-Polling sẵn sàng).');
      }
    } catch (err) {
      alert('Lỗi kiểm tra Webhook: ' + err.message);
    } finally {
      setWebhookActionLoading(false);
    }
  };

  // Tự động điền URL Webhook mẫu
  const handleFillOriginWebhook = () => {
    if (typeof window !== 'undefined') {
      const currentHost = window.location.host;
      const isLocal = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
      if (isLocal) {
        setCustomWebhookUrl('https://your-ngrok-domain.ngrok-free.app/api/webhook');
        showFeedback('💡 Đã điền URL mẫu Ngrok (Hãy thay bằng domain ngrok thật của bạn)');
      } else {
        setCustomWebhookUrl(`https://${currentHost}/api/webhook`);
        showFeedback(`💡 Đã điền URL webhook theo domain hiện tại: https://${currentHost}/api/webhook`);
      }
    }
  };

  const saveBotConfigToBackend = async (nextConfig) => {
    saveBotConfig(nextConfig);

    const res = await fetch(`${API_BASE_URL}/api/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Backend HTTP ${res.status}`);
    }

    return res.json();
  };

  const showFeedback = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // 1. 1-CLICK TỰ ĐỘNG BẬT / TẮT KẾT NỐI NHẬN TÍN HIỆU
  const handleToggleAutoConnect = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token!');
      return;
    }
    const nextState = !isPolling;
    try {
      if (nextState) {
        // Tự động giải phóng webhook cũ để sẵn sàng nhận tin realtime
        await fetch(`${API_BASE_URL}/api/admin/bot/clear-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, dropPendingUpdates: false })
        }).catch(() => {});
      }
      const updated = { ...botConfig, enableCron: nextState };
      setBotConfig(updated);
      setIsPolling(nextState);
      await saveBotConfigToBackend(updated).catch(() => {});
      showFeedback(nextState ? '🟢 ĐÃ BẬT TỰ ĐỘNG NHẬN TÍN HIỆU TELEGRAM REALTIME!' : '⏹ Đã tạm dừng nhận tin nhắn.');
      setBotLogs(prev => [
        `[${new Date().toLocaleTimeString()}] ${nextState ? '🟢 Đã kích hoạt kết nối nhận tín hiệu Realtime.' : '⏹ Đã dừng kết nối nhận tin.'}`,
        ...prev
      ]);
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  // 2. 1-CLICK TỰ ĐỘNG SỬA LỖI & RESET XUNG ĐỘT (FIX CONFLICT)
  const handleAutoFixBot = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token trước khi sửa lỗi!');
      return;
    }
    setAutoFixLoading(true);
    try {
      let result = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/auto-fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken })
        });
        if (res.ok) {
          result = await res.json();
        }
      } catch (e) {}

      if (!result) {
        // Local fallback nếu backend tạm ngưng
        await deleteTelegramWebhook(botConfig.botToken, true);
        const me = await getBotMe(botConfig.botToken);
        result = { success: true, bot: me, message: 'Đã giải phóng Webhook và dọn sạch tin đọng!' };
      }

      setIsPolling(true);
      const updated = { ...botConfig, enableCron: true };
      setBotConfig(updated);
      saveBotConfig(updated);

      if (result.bot) {
        setDiagResult({ success: true, bot: result.bot, webhook: { url: '', pending_update_count: 0 } });
      }

      showFeedback('🛠 ĐÃ TỰ ĐỘNG SỬA LỖI & RESET XUNG ĐỘT THÀNH CÔNG!');
      setBotLogs(prev => [
        `[${new Date().toLocaleTimeString()}] 🛠 1-Click Fix: Đã dọn dẹp Webhook kẹt, triệt tiêu lỗi conflict getUpdates, khởi động lại engine nhận tin.`,
        ...prev
      ]);
    } catch (err) {
      alert('Lỗi sửa tự động: ' + err.message);
    } finally {
      setAutoFixLoading(false);
    }
  };

  // 3. Chẩn đoán kết nối Bot (Health Check / getMe / getWebhookInfo)
  const handleRunBotDiagnosis = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token trước khi kiểm tra!');
      return;
    }
    setDiagLoading(true);
    try {
      let resData = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/diagnose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken })
        });
        if (res.ok) {
          resData = await res.json();
        }
      } catch (backendErr) {
        // Backend offline fallback
      }

      if (!resData) {
        const [me, hook] = await Promise.all([
          getBotMe(botConfig.botToken),
          getTelegramWebhookInfo(botConfig.botToken)
        ]);
        resData = { success: true, bot: me, webhook: hook };
      }

      setDiagResult(resData);
      if (resData.success && resData.bot) {
        showFeedback(`✅ Bot sẵn sàng: @${resData.bot.username} (${resData.bot.first_name})`);
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ✅ Bot: @${resData.bot.username} - Quyền đọc nhóm: ${resData.bot.can_read_all_group_messages ? 'BẬT' : 'TẮT (Cần /setprivacy)'}`,
          ...prev
        ]);
      } else {
        showFeedback(`❌ Lỗi Bot: ${resData.error || 'Token không hợp lệ'}`);
      }
    } catch (err) {
      setDiagResult({ success: false, error: err.message });
      showFeedback(`❌ Lỗi chẩn đoán Bot: ${err.message}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // 4. Xóa Webhook
  const handleClearWebhook = async (dropPending = false) => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Bot Token!');
      return;
    }
    setClearWebhookLoading(true);
    try {
      let resData = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/clear-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, dropPendingUpdates: dropPending })
        });
        if (res.ok) resData = await res.json();
      } catch (e) {}

      if (!resData) {
        const ok = await deleteTelegramWebhook(botConfig.botToken, dropPending);
        resData = { success: ok, message: 'Đã xóa Webhook thành công!' };
      }

      showFeedback('🧹 Đã xóa Webhook Telegram thành công!');
      setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] 🧹 Đã giải phóng Webhook Telegram.`, ...prev]);
      handleRunBotDiagnosis();
    } catch (err) {
      alert('Lỗi xóa Webhook: ' + err.message);
    } finally {
      setClearWebhookLoading(false);
    }
  };

  const [webhookActiveWarning, setWebhookActiveWarning] = useState(null);

  // 5. Soi tin nhắn mới nhất trực tiếp từ Telegram an toàn
  const handleInspectUpdates = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Bot Token!');
      return;
    }
    setInspectLoading(true);
    setWebhookActiveWarning(null);
    try {
      let items = [];
      let webhookMode = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/inspect-updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, limit: 20 })
        });
        if (res.ok) {
          const data = await res.json();
          items = data.items || [];
          if (data.isWebhookActive) {
            webhookMode = true;
            setWebhookActiveWarning({
              url: data.webhookInfo?.url || botConfig.webhookUrl || 'Đang kết nối Webhook',
              pendingCount: data.webhookInfo?.pending_update_count || 0,
              message: data.message || 'Bot đang ở chế độ Webhook.'
            });
          }
        }
      } catch (e) {}

      if (items.length === 0 && !webhookMode) {
        try {
          const raw = await inspectRecentUpdates(botConfig.botToken, 20);
          items = (raw || []).map(upd => {
            const msg = upd.message || upd.channel_post || upd.edited_message;
            if (!msg) return null;
            const textContent = msg.text || msg.caption || '';
            const updateChatId = String(msg.chat?.id || '');
            const chatTitle = msg.chat?.title || msg.chat?.username || msg.chat?.first_name || 'Chat ' + updateChatId;
            const chatType = msg.chat?.type || 'unknown';
            const senderUsername = (msg.from?.username || '').toLowerCase();
            const senderName = msg.from?.first_name || msg.from?.username || (chatType === 'channel' ? 'Channel Admin' : 'Unknown');

            const isChatIdMatched = !botConfig.chatId || updateChatId === String(botConfig.chatId).trim();
            const targetBot = (botConfig.targetBotUsername || '').toLowerCase().replace('@', '');
            const isSenderMatched = !targetBot || senderUsername.includes(targetBot) || senderName.toLowerCase().includes(targetBot) || chatType === 'channel';

            const testParse = textContent ? splitMessages(textContent).map(parseTelegramMessage).filter(Boolean) : [];

            return {
              updateId: upd.update_id,
              source: 'polling',
              date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
              chatId: updateChatId,
              chatTitle,
              chatType,
              senderName,
              senderUsername,
              text: textContent,
              isChatIdMatched,
              isSenderMatched,
              canParse: testParse.length > 0,
              parsedCount: testParse.length,
              parsedPreview: testParse[0] || null
            };
          }).filter(Boolean);
        } catch (rawErr) {
          if (rawErr.message && rawErr.message.includes('webhook is active')) {
            webhookMode = true;
            setWebhookActiveWarning({
              url: botConfig.webhookUrl || 'Webhook đang hoạt động',
              pendingCount: 0,
              message: 'Telegram đang ở chế độ Webhook.'
            });
          } else if (rawErr.message && (rawErr.message.includes('terminated by other getUpdates') || rawErr.message.includes('Conflict'))) {
            showFeedback('ℹ️ Đang có tiến trình Telegram chạy. Bạn có thể nhấn "1-Click Sửa Lỗi" để reset sạch.');
          } else {
            throw rawErr;
          }
        }
      }

      setInspectedUpdates(items);
      if (webhookMode) {
        showFeedback(items.length > 0 ? `⚡️ Chế độ Webhook: Đã nhận ${items.length} tin gần đây!` : '⚡️ Chế độ Webhook: Chưa có tin nhắn mới.');
      } else if (items.length > 0) {
        showFeedback(`📡 Đã soi thấy ${items.length} tin nhắn gần nhất!`);
      } else {
        showFeedback('📡 Chưa có tin nhắn mới nào. Gửi 1 tin trong Group/Channel rồi bấm Soi lại!');
      }
    } catch (err) {
      if (err.message && (err.message.includes('terminated by other getUpdates') || err.message.includes('Conflict'))) {
        showFeedback('⚠️ Phát hiện xung đột Telegram! Nhấn "1-Click Sửa Lỗi & Reset" để khắc phục ngay.');
      } else {
        showFeedback(`ℹ️ Trạng thái: ${err.message}`);
      }
    } finally {
      setInspectLoading(false);
    }
  };

  // 4. Giả lập Bot nhận tin qua toàn bộ pipeline
  const handleSimulateReceive = async (textToSimulate) => {
    const text = textToSimulate || simulateText;
    if (!text.trim()) {
      alert('Vui lòng nhập nội dung tin nhắn giả lập!');
      return;
    }
    setSimulateLoading(true);
    try {
      let success = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/simulate-receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (res.ok) {
          const data = await res.json();
          showFeedback(`⚡️ ${data.message || 'Đã bắn tín hiệu test qua Realtime Stream!'}`);
          success = true;
          if (onDataChange) onDataChange();
        }
      } catch (e) {}

      if (!success) {
        const added = addSignalsFromRawText(text);
        if (added.length > 0) {
          showFeedback(`⚡️ Đã nạp ${added.length} tín hiệu giả lập vào hệ thống!`);
          if (onDataChange) onDataChange();
        } else {
          alert('Không nhận diện được định dạng tín hiệu!');
        }
      }
    } catch (err) {
      alert('Lỗi giả lập nhận tin: ' + err.message);
    } finally {
      setSimulateLoading(false);
    }
  };

  // 5. Gửi tin nhắn test từ Bot đến Group
  const handleSendTest = async () => {
    const targetChat = testSendChatId || botConfig.chatId;
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Telegram Bot Token!');
      return;
    }
    if (!targetChat) {
      alert('Vui lòng nhập Chat ID hoặc Group ID nhận tin nhắn!');
      return;
    }
    const msg = testSendMessage.trim() || `🔔 [FinAI Test] Bot kết nối thành công lúc ${new Date().toLocaleTimeString('vi-VN')}!`;
    setTestSendLoading(true);
    try {
      let sent = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/send-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, chatId: targetChat, text: msg })
        });
        if (res.ok) {
          showFeedback('📤 Đã gửi tin nhắn test từ Bot thành công!');
          sent = true;
        }
      } catch (e) {}

      if (!sent) {
        await sendTelegramMessage(botConfig.botToken, targetChat, msg);
        showFeedback('📤 Đã gửi tin nhắn test từ Bot thành công!');
      }
    } catch (err) {
      alert('Lỗi gửi tin test: ' + err.message);
    } finally {
      setTestSendLoading(false);
    }
  };

  // 6. Tự động áp dụng Chat ID từ danh sách soi
  const handleApplyChatId = async (chatId) => {
    const nextConfig = { ...botConfig, chatId };
    setBotConfig(nextConfig);
    setTestSendChatId(chatId);
    try {
      await saveBotConfigToBackend(nextConfig);
      showFeedback(`📋 Đã lưu Chat ID "${chatId}" vào cấu hình!`);
    } catch (err) {
      showFeedback(`📋 Đã đặt Chat ID "${chatId}" (cần nhấn Lưu Cấu Hình)!`);
    }
  };

  // Xử lý nạp tin nhắn từ ô input
  const handleParseAndSave = () => {
    if (!rawInput.trim()) {
      alert('Vui lòng dán nội dung tin nhắn Telegram vào ô!');
      return;
    }

    const added = addSignalsFromRawText(rawInput);
    if (added.length > 0) {
      showFeedback(`✅ Đã phân tích thành công và lưu ${added.length} bản ghi vào JSON!`);
      setRawInput('');
      if (onDataChange) onDataChange();
    } else {
      alert('Không nhận diện được cấu trúc tin nhắn. Vui lòng kiểm tra lại định dạng!');
    }
  };

  // Thao tác với mẫu nhanh
  const handleLoadTemplate = (tpl, autoSave = false) => {
    setRawInput(tpl);
    if (autoSave) {
      const added = addSignalsFromRawText(tpl);
      showFeedback(`⚡️ Đã nạp ngay 1 bản ghi mới vào hệ thống!`);
      if (onDataChange) onDataChange();
    }
  };

  // Xóa 1 bản ghi
  const handleDeleteRecord = (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) {
      const updated = signals.filter(s => s.id !== id);
      saveSignals(updated);
      showFeedback('🗑️ Đã xóa bản ghi thành công!');
      if (onDataChange) onDataChange();
    }
  };

  // Xóa tất cả
  const handleClearAll = async () => {
    if (!window.confirm('CẢNH BÁO: Xóa TOÀN BỘ dữ liệu tín hiệu? Thao tác này không thể hoàn tác.')) {
      return;
    }

    setClearAllLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/signals/clear`, { method: 'POST' });
      if (!response.ok) throw new Error(`Backend trả về mã ${response.status}`);

      clearAllSignals();
      showFeedback('🗑️ Đã xóa toàn bộ dữ liệu trên backend và thiết bị này!');
      if (onDataChange) await onDataChange();
    } catch (error) {
      alert(`Không thể xóa dữ liệu: ${error.message}. Hãy kiểm tra backend cổng 3001.`);
    } finally {
      setClearAllLoading(false);
    }
  };

  // Khôi phục mặc định
  const handleResetDefault = () => {
    if (window.confirm('Khôi phục danh sách dữ liệu mẫu từ tin nhắn gốc?')) {
      resetToDefault();
      showFeedback('🔄 Đã khôi phục dữ liệu mẫu thành công!');
      if (onDataChange) onDataChange();
    }
  };

  // Import JSON từ file
  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (Array.isArray(parsed)) {
          saveSignals(parsed);
          showFeedback(`📥 Đã import thành công ${parsed.length} bản ghi JSON!`);
          if (onDataChange) onDataChange();
        } else {
          alert('File JSON không hợp lệ (cần là danh sách mảng Array)!');
        }
      } catch (err) {
        alert('Lỗi đọc file JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Bật/Tắt Bot Telegram Polling
  const handleTogglePolling = async () => {
    if (isPolling) {
      try {
        const nextConfig = { ...botConfig, enableCron: false };
        await saveBotConfigToBackend(nextConfig);
        setBotConfig(nextConfig);
        setIsPolling(false);
        setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ⏹ Đã tắt engine lắng nghe Telegram trên backend.`, ...prev]);
      } catch (err) {
        setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ❌ Không tắt được backend: ${err.message}`, ...prev]);
      }
    } else {
      if (!botConfig.botToken) {
        alert('Vui lòng nhập Telegram Bot Token trước khi kích hoạt!');
        return;
      }
      try {
        const nextConfig = { ...botConfig, enableCron: true };
        await saveBotConfigToBackend(nextConfig);
        setBotConfig(nextConfig);
        setIsPolling(true);
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ▶ Đã bật engine Telegram trên backend. Khi channel/group có tin mới, SSE sẽ tự đẩy về Admin và Client.`,
          ...prev
        ]);
      } catch (err) {
        setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ❌ Không bật được backend: ${err.message}`, ...prev]);
      }
    }
  };

  // Lọc dữ liệu hiển thị
  const filteredSignals = signals.filter(s => {
    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'TP') return s.status === 'TP_HIT' || (s.pips && s.pips > 0);
    if (filterStatus === 'SL') return s.status === 'SL_HIT' || (s.pips && s.pips < 0);
    if (filterStatus === 'CANCELLED') return s.status === 'CANCELLED';
    if (filterStatus === 'ACTIVE') return s.status === 'ACTIVE';
    if (filterStatus === 'PENDING') return s.status === 'PENDING';
    return true;
  });

  return (
    <div className="admin-container">
      {/* Admin Top Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <span className="admin-badge">⚡️ ADMIN CONTROL CENTER</span>
          <h1 className="admin-main-title">Telegram Signal Parser & Bot Management</h1>
        </div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={exportSignalsJSON}>
            📥 Export .JSON ({signals.length})
          </button>
          <label className="btn-secondary file-upload-label">
            📤 Import .JSON
            <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
          </label>
          <button className="btn-danger-outline" onClick={handleResetDefault}>
            🔄 Reset Sample Data
          </button>
          <button
            className="btn-danger-action"
            onClick={handleClearAll}
            disabled={clearAllLoading || signals.length === 0}
          >
            {clearAllLoading ? 'Đang xóa...' : `🗑 Xóa toàn bộ (${signals.length})`}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="admin-alert-toast" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg('')}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px', padding: '0 4px', opacity: 0.8 }}
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${activeTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          📝 Ingest Message & Parser
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          📋 Signal Database ({signals.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          🔍 Raw JSON Schema
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'bot' ? 'active' : ''}`}
          onClick={() => setActiveTab('bot')}
        >
          🤖 Bot Configuration {isPolling && <span className="pulse-mini"></span>}
        </button>
        <button
          className={`admin-tab-btn tab-highlight-pulse ${activeTab === 'bot_test' ? 'active' : ''}`}
          onClick={() => setActiveTab('bot_test')}
        >
          🛠️ Bot Test & Diagnostics
        </button>
      </div>

      {/* TAB 1: INGEST TELEGRAM MESSAGE */}
      {activeTab === 'input' && (
        <div className="admin-section-card">
          <div className="section-subtitle">
            Enter or paste any raw signal message from Telegram. The system automatically parses trading signals into structured JSON records and broadcasts them in realtime.
          </div>

          <div className="quick-templates">
            <span className="quick-label">⚡️ Quick Templates (1-Click Test):</span>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_SETUP, true)}>
              💎 1. Setup Signal (Gann Buy Limit)
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_EXECUTED, true)}>
              🚀 2. Order Executed #9
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_CANCELLED, true)}>
              ⛔️ 3. Order Cancelled #9
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_SL, true)}>
              🛑 4. Stop Loss Hit #7 (-92.7p)
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_TP, true)}>
              ✅ 5. Take Profit Hit #4 (+51.2p)
            </button>
            <button className="btn-tpl-highlight" onClick={() => handleLoadTemplate(SAMPLE_RAW_TEXT, true)}>
              📦 6. Ingest Full Bundle (5 messages)
            </button>
          </div>

          <div className="input-group">
            <textarea
              className="telegram-textarea"
              placeholder="Paste raw Telegram message here..."
              rows={8}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
            />
          </div>

          <div className="input-actions">
            <button className="btn-primary-action" onClick={handleParseAndSave}>
              🚀 Parse & Save to Database Now
            </button>
            <button className="btn-secondary" onClick={() => setRawInput('')}>
              Clear Field
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SIGNAL DATABASE TABLE */}
      {activeTab === 'table' && (
        <div className="admin-section-card">
          <div className="table-filter-bar">
            <div className="filter-group">
              <span>Filter Status:</span>
              {['ALL', 'TP', 'SL', 'CANCELLED', 'ACTIVE', 'PENDING'].map(st => (
                <button
                  key={st}
                  className={`btn-filter ${filterStatus === st ? 'active' : ''}`}
                  onClick={() => setFilterStatus(st)}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              className="btn-danger-sm"
              onClick={handleClearAll}
              disabled={clearAllLoading || signals.length === 0}
            >
              {clearAllLoading ? 'Đang xóa...' : `🗑 Clear All (${signals.length})`}
            </button>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th>Action / Order</th>
                  <th>Entry Price</th>
                  <th>SL / TP</th>
                  <th>Pips</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  filteredSignals.map(item => {
                    const isBuy = item.action === 'BUY';
                    const pips = parseFloat(item.pips) || 0;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.timeStr}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.dateStr}</div>
                        </td>
                        <td>
                          <span className="pair-tag">{item.symbol}</span>
                        </td>
                        <td>
                          <span style={{ color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)', fontWeight: 700 }}>
                            {isBuy ? '🟢 BUY' : '🔴 SELL'}
                          </span>
                          {item.orderNumber && <span className="badge-ord">#{item.orderNumber}</span>}
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {item.orderType || item.strategy || 'FinAI'}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {item.entry ? item.entry.toLocaleString() : '---'}
                          {item.exit && <div style={{ fontSize: '11px', color: '#94a3b8' }}>➔ Exit: {item.exit}</div>}
                        </td>
                        <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                          {item.sl && <div style={{ color: 'var(--color-sell)' }}>SL: {item.sl}</div>}
                          {item.tp1 && <div style={{ color: 'var(--color-buy)' }}>TP1: {item.tp1}</div>}
                        </td>
                        <td style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          color: pips > 0 ? 'var(--color-buy)' : (pips < 0 ? 'var(--color-sell)' : 'var(--text-secondary)')
                        }}>
                          {pips > 0 ? `+${pips}p` : `${pips}p`}
                        </td>
                        <td>
                          <span className={`status-pill ${item.status?.toLowerCase()}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-icon" title="View JSON" onClick={() => setSelectedRecord(item)}>
                              👁
                            </button>
                            <button className="btn-icon-danger" title="Delete" onClick={() => handleDeleteRecord(item.id)}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RAW JSON SCHEMA */}
      {activeTab === 'json' && (
        <div className="admin-section-card">
          <div className="json-header">
            <h3>📦 Global Realtime JSON Schema Database</h3>
            <button className="btn-secondary" onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(signals, null, 2));
              showFeedback('📋 Copied full JSON database to Clipboard!');
            }}>
              📋 Copy JSON
            </button>
          </div>
          <pre className="json-viewer">
            {JSON.stringify(signals, null, 2)}
          </pre>
        </div>
      )}

      {/* TAB 4: TELEGRAM BOT CONFIGURATION */}
      {activeTab === 'bot' && (
        <div className="admin-section-card">
          <h3 style={{ marginBottom: '10px' }}>🤖 Direct Telegram Bot API Integration</h3>
          <p className="section-subtitle">
            The bot reads messages from private chats, groups, and channels where it has been granted access permissions.
          </p>

          <div className="telegram-source-guide">
            <div className="source-guide-item">
              <span className="source-guide-step">1</span>
              <div>
                <strong>Create Bot</strong>
                <span>Obtain API token from @BotFather and paste below.</span>
              </div>
            </div>
            <div className="source-guide-item">
              <span className="source-guide-step">2</span>
              <div>
                <strong>Add Bot to Group/Channel</strong>
                <span>For channels: add bot as Administrator. For groups: add bot and disable Privacy Mode.</span>
              </div>
            </div>
            <div className="source-guide-item">
              <span className="source-guide-step">3</span>
              <div>
                <strong>Verify Live Stream</strong>
                <span>Start listener and send a sample signal to confirm matching Chat ID.</span>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Telegram Bot Token (from @BotFather):</label>
              <input
                type="text"
                className="admin-input"
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                value={botConfig.botToken}
                onChange={(e) => setBotConfig({ ...botConfig, botToken: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Polling Interval (ms):</label>
              <input
                type="number"
                className="admin-input"
                value={botConfig.pollInterval || 3000}
                onChange={(e) => setBotConfig({ ...botConfig, pollInterval: parseInt(e.target.value, 10) || 3000 })}
              />
            </div>
            <div className="form-group form-grid-full">
              <label>Target Chat ID / Channel ID (optional):</label>
              <input
                type="text"
                className="admin-input"
                placeholder="Leave empty to receive from all groups. Example: -100xxxxxxxxxx"
                value={botConfig.chatId || ''}
                onChange={(e) => setBotConfig({ ...botConfig, chatId: e.target.value.trim() })}
              />
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
            <button
              className={isPolling ? 'btn-danger-action' : 'btn-primary-action'}
              onClick={handleTogglePolling}
            >
              {isPolling ? '⏹ Stop Telegram Poller' : '▶ Start Realtime Listener'}
            </button>
            <button className="btn-secondary" onClick={async () => {
              try {
                await saveBotConfigToBackend(botConfig);
                showFeedback('💾 Saved Bot configuration to backend!');
              } catch (err) {
                setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ❌ Failed to save backend: ${err.message}`, ...prev]);
              }
            }}>
              Save Configuration
            </button>
          </div>

          {/* Bot Logs */}
          <div className="bot-logs-box">
            <div className="logs-title">Event & Connection Logs:</div>
            {botLogs.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No events logged yet.</div>
            ) : (
              botLogs.map((log, idx) => (
                <div key={idx} className="log-line">{log}</div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: BOT TEST & DIAGNOSTICS */}
      {activeTab === 'bot_test' && (
        <div className="admin-section-card test-bot-section">
          {/* 1. TWO PRIMARY ACTION BUTTONS */}
          <div className="diag-hero-actions">
            {/* HERO BUTTON 1: AUTO CONNECT */}
            <button
              className={`btn-hero-primary ${isPolling ? 'active-running' : ''}`}
              onClick={handleToggleAutoConnect}
            >
              <span className="hero-icon">{isPolling ? '🟢' : '⚡️'}</span>
              <div className="hero-text">
                <div className="hero-title">
                  {isPolling ? 'RECEIVING SIGNALS LIVE (CLICK TO PAUSE)' : '1-CLICK AUTO CONNECT & RECEIVE SIGNALS'}
                </div>
                <div className="hero-desc">
                  {isPolling
                    ? 'Realtime engine is actively listening for signals from Group/Channel'
                    : 'Automatically activate bot to receive signals from Telegram'}
                </div>
              </div>
            </button>

            {/* HERO BUTTON 2: AUTO FIX & RESET CONFLICT */}
            <button
              className="btn-hero-fix"
              onClick={handleAutoFixBot}
              disabled={autoFixLoading}
            >
              <span className="hero-icon">🛠</span>
              <div className="hero-text">
                <div className="hero-title">
                  {autoFixLoading ? 'FIXING CONFLICTS...' : '1-CLICK FIX CONFLICTS & RESET BOT'}
                </div>
                <div className="hero-desc">
                  Clear stuck webhooks, resolve getUpdates conflicts, and reset clean session
                </div>
              </div>
            </button>
          </div>

          {/* 2. QUICK TOOLBAR */}
          <div className="diag-quick-toolbar">
            <button
              className="btn-toolbar-action"
              onClick={handleInspectUpdates}
              disabled={inspectLoading}
            >
              {inspectLoading ? '⏳ Scanning...' : '📡 Inspect Recent Messages'}
            </button>

            <button
              className="btn-toolbar-action"
              onClick={() => handleSimulateReceive(TEMPLATE_SETUP)}
              disabled={simulateLoading}
            >
              {simulateLoading ? '⏳ Injecting...' : '🧪 Send Test Signal (Test Chime)'}
            </button>

            <button
              className="btn-toolbar-sub"
              onClick={handleRunBotDiagnosis}
              disabled={diagLoading}
            >
              {diagLoading ? '⏳ Checking...' : '🔍 Check Bot & Permissions'}
            </button>
          </div>

          {/* 3. BOT HEALTH STATUS CARDS */}
          <div className="diag-health-grid">
            <div className="diag-health-card">
              <div className="diag-card-label">🔑 BOT TOKEN</div>
              <div className="diag-card-value">
                {botConfig.botToken ? (
                  <span className="text-success">
                    ✅ Configured ({botConfig.botToken.slice(0, 7)}...{botConfig.botToken.slice(-4)})
                  </span>
                ) : (
                  <span className="text-danger">❌ Token Not Provided</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🤖 BOT IDENTITY</div>
              <div className="diag-card-value">
                {diagResult?.bot ? (
                  <span className="text-info font-bold">
                    @{diagResult.bot.username} ({diagResult.bot.first_name})
                  </span>
                ) : (
                  <span className="text-muted">Not checked (Click "Check Bot")</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🛡️ GROUP PERMISSION (PRIVACY)</div>
              <div className="diag-card-value">
                {diagResult?.bot ? (
                  diagResult.bot.can_read_all_group_messages ? (
                    <span className="text-success">✅ Privacy DISABLED (Can read all messages)</span>
                  ) : (
                    <span className="text-danger">⚠️ Privacy ENABLED (Disable in @BotFather)</span>
                  )
                ) : (
                  <span className="text-muted">---</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🌐 INGESTION MODE</div>
              <div className="diag-card-value">
                {diagResult?.webhook?.url || tunnelStatus.active ? (
                  <span className="text-info">⚡️ Webhook (Auto Tunnel)</span>
                ) : (
                  <span className="text-success">⚡️ Realtime Long-Polling (&lt; 100ms)</span>
                )}
              </div>
            </div>
          </div>

          {/* PRIVACY MODE WARNING IF ACTIVE */}
          {diagResult?.bot && !diagResult.bot.can_read_all_group_messages && !hidePrivacyWarning && (
            <div className="diag-alert-warning">
              <button
                className="diag-alert-close"
                onClick={() => setHidePrivacyWarning(true)}
                title="Dismiss warning"
              >
                ✕
              </button>
              <strong>⚠️ PRIVACY MODE WARNING:</strong> Your bot currently has <strong>Privacy Mode ENABLED</strong> in Telegram. 
              Telegram blocks this bot from reading messages from group members!
              <br />
              👉 <strong>Quick Fix:</strong> Open Telegram and message <code>@BotFather</code> ➔ send <code>/setprivacy</code> ➔ Select your Bot ➔ Select <code>Disable</code>.
            </div>
          )}

          {/* 4. RECENT MESSAGES INSPECTOR */}
          <div className="diag-sub-panel">
            <div className="diag-inspector-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 className="diag-sub-title">📡 Recently Received Telegram Messages</h4>
                <p className="diag-desc">
                  Inspects live messages captured by the bot. Copy verified <strong>Chat ID</strong> or test instant parsing.
                </p>
              </div>
              <button
                className="btn-toolbar-action"
                onClick={handleInspectUpdates}
                disabled={inspectLoading}
              >
                {inspectLoading ? '⏳ Scanning...' : '🔄 Refresh Messages'}
              </button>
            </div>

            {/* Filter Status Bar */}
            <div className="diag-filter-status">
              <span>🎯 Filtered Chat ID: <strong>{botConfig.chatId || 'All (No filter)'}</strong></span>
              <span>👥 Sender: <strong>{botConfig.targetBotUsername ? `@${botConfig.targetBotUsername}` : '✅ ALL Members & Bots'}</strong></span>
              <span>⚡️ Ingestion Engine: <strong>{isPolling ? '🟢 RUNNING' : '⚪️ STOPPED'}</strong></span>
            </div>

            {inspectedUpdates.length === 0 ? (
              <div className="diag-empty-box">
                No recent messages in cache. Send a message in your Telegram Group/Channel and click <strong>"📡 Inspect Recent Messages"</strong>.
              </div>
            ) : (
              <div className="diag-updates-list">
                {inspectedUpdates.map((item, idx) => (
                  <div key={idx} className={`diag-update-card ${item.canParse ? 'parsed-ok' : 'parsed-none'}`}>
                    <div className="update-card-header">
                      <div className="update-chat-info">
                        <span className={`chat-type-badge ${item.chatType}`}>{item.chatType.toUpperCase()}</span>
                        <strong>{item.chatTitle}</strong>
                        <span className="chat-id-tag">ID: {item.chatId}</span>
                        <button
                          className="btn-copy-id"
                          onClick={() => handleApplyChatId(item.chatId)}
                          title="Save this Chat ID to receive signals exclusively from this chat"
                        >
                          📋 Use this Chat ID
                        </button>
                      </div>
                      <div className="update-meta">
                        <span className="sender-tag">👤 @{item.senderUsername || item.senderName}</span>
                        <span className="time-tag">{new Date(item.date).toLocaleTimeString('en-US')}</span>
                      </div>
                    </div>

                    <div className="update-text-preview">
                      <pre>{item.text}</pre>
                    </div>

                    <div className="update-card-footer">
                      <div className="update-eval-tags">
                        <span className={`eval-pill ${item.isChatIdMatched ? 'eval-pass' : 'eval-fail'}`}>
                          {item.isChatIdMatched ? '✅ Matched Chat ID' : '⚠️ Different Chat ID'}
                        </span>
                        <span className="eval-pill eval-pass">
                          {item.senderUsername ? `👤 @${item.senderUsername}` : `👤 ${item.senderName}`}
                        </span>
                        <span className={`eval-pill ${item.canParse ? 'eval-pass' : 'eval-warn'}`}>
                          {item.canParse ? `✅ Parsed: ${item.parsedCount} order (${item.parsedPreview?.action} ${item.parsedPreview?.symbol})` : 'ℹ️ Non-standard Forex signal structure'}
                        </span>
                      </div>

                      <button
                        className="btn-tpl-highlight"
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        onClick={() => handleSimulateReceive(item.text)}
                      >
                        ⚡️ Ingest Signal Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. ADVANCED TOOLS (COLLAPSIBLE ACCORDION) */}
          <details className="diag-advanced-details">
            <summary>⚙️ Advanced Webhook Configuration & Manual Test (Click to expand)</summary>
            
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 1-Click Auto Tunnel */}
              <div className="auto-tunnel-banner" style={{ background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '12px 14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '13px', color: '#38bdf8' }}>
                      ⚡️ AUTOMATIC HTTPS TUNNEL WEBHOOK (1-CLICK)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Automatically opens a public HTTPS tunnel from localhost and registers with Telegram.
                    </div>
                  </div>
                  <div>
                    {tunnelStatus.active ? (
                      <button className="btn-danger-sm" onClick={handleStopAutoTunnel} disabled={autoTunnelLoading}>
                        {autoTunnelLoading ? '⏳...' : '⏹ Stop Auto Tunnel'}
                      </button>
                    ) : (
                      <button className="btn-tpl-highlight" onClick={handleStartAutoTunnel} disabled={autoTunnelLoading} style={{ padding: '8px 14px', fontSize: '12px' }}>
                        {autoTunnelLoading ? '⏳ Creating...' : '⚡️ Create Auto Tunnel'}
                      </button>
                    )}
                  </div>
                </div>
                {tunnelStatus.active && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#34d399' }}>
                    🟢 Tunnel URL: <code>{tunnelStatus.webhookUrl}</code>
                  </div>
                )}
              </div>

              {/* Custom Webhook URL Input */}
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: '700' }}>Custom Webhook URL (HTTPS):</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="https://your-domain.com/api/webhook"
                    value={customWebhookUrl}
                    onChange={(e) => setCustomWebhookUrl(e.target.value)}
                  />
                  <button className="btn-primary-action" onClick={() => handleRegisterCustomWebhook(false)} disabled={webhookActionLoading} style={{ whiteSpace: 'nowrap' }}>
                    Set Webhook
                  </button>
                  <button className="btn-danger-sm" onClick={() => handleClearWebhook(false)} disabled={clearWebhookLoading} style={{ whiteSpace: 'nowrap' }}>
                    Delete Webhook
                  </button>
                </div>
              </div>

              {/* Test sendMessage */}
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: '700' }}>Send Test Message from Bot to Chat ID:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Chat ID (-100...)"
                    value={testSendChatId}
                    onChange={(e) => setTestSendChatId(e.target.value.trim())}
                  />
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Message text..."
                    value={testSendMessage}
                    onChange={(e) => setTestSendMessage(e.target.value)}
                  />
                  <button className="btn-secondary" onClick={handleSendTest} disabled={testSendLoading} style={{ whiteSpace: 'nowrap' }}>
                    {testSendLoading ? '⏳...' : '📤 Send'}
                  </button>
                </div>
              </div>
            </div>
          </details>

          {/* 6. STEP-BY-STEP CHECKLIST */}
          <details className="diag-advanced-details">
            <summary>📚 Step-by-Step Bot Troubleshooting Checklist (Click to view)</summary>
            <div className="checklist-items" style={{ marginTop: '12px' }}>
              <div className="checklist-item">
                <span className="check-number">1</span>
                <div>
                  <strong>Disable Privacy Mode in @BotFather (REQUIRED for Groups)</strong>
                  <p>Message <code>@BotFather</code> ➔ send <code>/setprivacy</code> ➔ select Bot ➔ select <strong>Disable</strong>.</p>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-number">2</span>
                <div>
                  <strong>Grant Administrator Privileges (REQUIRED for Channels)</strong>
                  <p>If reading from a Telegram Channel, you MUST add the bot as an <strong>Administrator</strong> of that channel.</p>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-number">3</span>
                <div>
                  <strong>Fix getUpdates Conflict Errors</strong>
                  <p>Click the <strong>"🛠 1-Click Fix Conflicts & Reset Bot"</strong> button above to automatically resolve any session conflicts.</p>
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Modal view raw JSON */}
      {selectedRecord && (
        <div className="modal-overlay" onClick={() => setSelectedRecord(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 JSON Record Details ({selectedRecord.id})</h3>
              <button className="btn-close" onClick={() => setSelectedRecord(null)}>✕</button>
            </div>
            <pre className="json-viewer" style={{ maxHeight: '400px' }}>
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
            <div style={{ marginTop: '14px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => setSelectedRecord(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
