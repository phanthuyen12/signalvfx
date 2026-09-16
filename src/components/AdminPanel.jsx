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
  deleteTelegramWebhook,
  sendTelegramMessage,
  inspectRecentUpdates
} from '../services/telegramService';
import { splitMessages, parseTelegramMessage } from '../utils/telegramParser';

function getApiBaseUrl() {
  if (typeof window === 'undefined') return import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const { hostname, protocol } = window.location;
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
  
  // Bot Config State
  const [botConfig, setBotConfig] = useState(getBotConfig());
  const [isPolling, setIsPolling] = useState(false);
  const [botLogs, setBotLogs] = useState([]);

  // Bot Diagnostics & Testing States
  const [diagResult, setDiagResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [clearWebhookLoading, setClearWebhookLoading] = useState(false);
  const [inspectedUpdates, setInspectedUpdates] = useState([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [simulateText, setSimulateText] = useState(TEMPLATE_SETUP);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [testSendChatId, setTestSendChatId] = useState('');
  const [testSendMessage, setTestSendMessage] = useState('');
  const [testSendLoading, setTestSendLoading] = useState(false);

  useEffect(() => {
    const loadBackendConfig = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/config`);
        if (!res.ok) return;

        const backendConfig = await res.json();
        setBotConfig(prev => ({ ...prev, ...backendConfig }));
        setIsPolling(Boolean(backendConfig.enableCron && backendConfig.botToken));
        if (backendConfig.chatId && !testSendChatId) {
          setTestSendChatId(backendConfig.chatId);
        }
      } catch (err) {
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ⚠️ Chưa kết nối được backend 3001, app sẽ chỉ dùng dữ liệu local.`,
          ...prev
        ]);
      }
    };

    loadBackendConfig();
  }, []);

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

  // 1. Chẩn đoán kết nối Bot (Health Check / getMe / getWebhookInfo)
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
        showFeedback(`✅ Kết nối Bot thành công: @${resData.bot.username} (${resData.bot.first_name})`);
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ✅ Chẩn đoán Bot thành công: @${resData.bot.username} (ID: ${resData.bot.id}) - Quyền đọc nhóm: ${resData.bot.can_read_all_group_messages ? 'BẬT' : 'TẮT (Cần /setprivacy)'}`,
          ...prev
        ]);
      } else {
        showFeedback(`❌ Lỗi Bot: ${resData.error || 'Token không hợp lệ'}`);
        setBotLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ❌ Lỗi kết nối Bot: ${resData.error}`,
          ...prev
        ]);
      }
    } catch (err) {
      setDiagResult({ success: false, error: err.message });
      showFeedback(`❌ Lỗi chẩn đoán Bot: ${err.message}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // 2. Xóa Webhook
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

      showFeedback('🧹 Đã xóa Webhook Telegram thành công! Bây giờ Bot có thể nhận tin qua getUpdates.');
      setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] 🧹 Đã giải phóng Webhook Telegram.`, ...prev]);
      handleRunBotDiagnosis();
    } catch (err) {
      alert('Lỗi xóa Webhook: ' + err.message);
    } finally {
      setClearWebhookLoading(false);
    }
  };

  // 3. Soi getUpdates mới nhất trực tiếp từ Telegram
  const handleInspectUpdates = async () => {
    if (!botConfig.botToken) {
      alert('Vui lòng nhập Bot Token!');
      return;
    }
    setInspectLoading(true);
    try {
      let items = [];
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/bot/inspect-updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: botConfig.botToken, limit: 20 })
        });
        if (res.ok) {
          const data = await res.json();
          items = data.items || [];
        }
      } catch (e) {}

      if (items.length === 0) {
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
      }

      setInspectedUpdates(items);
      if (items.length > 0) {
        showFeedback(`📡 Đã soi thấy ${items.length} tin nhắn gần nhất từ Telegram!`);
      } else {
        showFeedback('📡 Chưa có tin nhắn mới nào trên Telegram Bot. Hãy gửi 1 tin trong Group/Channel rồi bấm lại!');
      }
    } catch (err) {
      alert('Lỗi soi getUpdates: ' + err.message);
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
  const handleClearAll = () => {
    if (window.confirm('CẢNH BÁO: Bạn có chắc muốn xóa TOÀN BỘ dữ liệu JSON hiện tại?')) {
      clearAllSignals();
      showFeedback('🗑️ Đã làm sạch toàn bộ dữ liệu!');
      if (onDataChange) onDataChange();
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
          <h1 className="admin-main-title">Quản Lý & Bóc Tách Dữ Liệu Telegram</h1>
        </div>
        <div className="admin-header-actions">
          <button className="btn-secondary" onClick={exportSignalsJSON}>
            📥 Xuất File .JSON ({signals.length})
          </button>
          <label className="btn-secondary file-upload-label">
            📤 Nhập .JSON
            <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
          </label>
          <button className="btn-danger-outline" onClick={handleResetDefault}>
            🔄 Khôi phục Mẫu
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="admin-alert-toast">
          {successMsg}
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn ${activeTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveTab('input')}
        >
          📝 Nạp Tin Nhắn & Parser
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          📋 Danh Sách Dữ Liệu ({signals.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          🔍 Xem Raw JSON
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'bot' ? 'active' : ''}`}
          onClick={() => setActiveTab('bot')}
        >
          🤖 Cấu Hình Bot Telegram {isPolling && <span className="pulse-mini"></span>}
        </button>
        <button
          className={`admin-tab-btn tab-highlight-pulse ${activeTab === 'bot_test' ? 'active' : ''}`}
          onClick={() => setActiveTab('bot_test')}
        >
          🛠️ Test & Chẩn Đoán Bot
        </button>
      </div>

      {/* TAB 1: NẠP TIN NHẮN TELEGRAM */}
      {activeTab === 'input' && (
        <div className="admin-section-card">
          <div className="section-subtitle">
            Nhập hoặc dán tin nhắn bất kỳ từ nhóm Telegram vào đây. Hệ thống tự động bóc tách thành đối tượng JSON chuẩn và lưu trữ realtime.
          </div>

          <div className="quick-templates">
            <span className="quick-label">⚡️ Mẫu thử nhanh (1-Click Test):</span>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_SETUP, true)}>
              💎 1. Tín hiệu Setup (Gann Buy Limit)
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_EXECUTED, true)}>
              🚀 2. Đã vào lệnh #9
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_CANCELLED, true)}>
              ⛔️ 3. Hủy lệnh #9 (Chạm TP trước)
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_SL, true)}>
              🛑 4. Cắt lỗ SL Hit #7 (-92.7p)
            </button>
            <button className="btn-tpl" onClick={() => handleLoadTemplate(TEMPLATE_TP, true)}>
              ✅ 5. Chốt lời TP Hit #4 (+51.2p)
            </button>
            <button className="btn-tpl-highlight" onClick={() => handleLoadTemplate(SAMPLE_RAW_TEXT, true)}>
              📦 6. Nạp Full Bundle (5 tin nhắn cùng lúc)
            </button>
          </div>

          <div className="input-group">
            <textarea
              className="telegram-textarea"
              placeholder="Dán tin nhắn Telegram từ nhóm người khác gửi tại đây..."
              rows={8}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
            />
          </div>

          <div className="input-actions">
            <button className="btn-primary-action" onClick={handleParseAndSave}>
              🚀 Phân Tích & Lưu Vào JSON Ngay
            </button>
            <button className="btn-secondary" onClick={() => setRawInput('')}>
              Làm trống ô
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BẢNG DỮ LIỆU ĐÃ LƯU */}
      {activeTab === 'table' && (
        <div className="admin-section-card">
          <div className="table-filter-bar">
            <div className="filter-group">
              <span>Lọc trạng thái:</span>
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

            <button className="btn-danger-sm" onClick={handleClearAll}>
              🗑 Xóa tất cả ({signals.length})
            </button>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Thời Gian</th>
                  <th>Cặp Tiền</th>
                  <th>Loại / Lệnh</th>
                  <th>Giá Vào (Entry)</th>
                  <th>SL / TP</th>
                  <th>Pips</th>
                  <th>Trạng Thái</th>
                  <th>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      Không có bản ghi nào phù hợp.
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
                            <button className="btn-icon" title="Xem JSON" onClick={() => setSelectedRecord(item)}>
                              👁
                            </button>
                            <button className="btn-icon-danger" title="Xóa" onClick={() => handleDeleteRecord(item.id)}>
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

      {/* TAB 3: XEM RAW JSON */}
      {activeTab === 'json' && (
        <div className="admin-section-card">
          <div className="json-header">
            <h3>📦 Dữ Liệu JSON Toàn Cục (Realtime Schema)</h3>
            <button className="btn-secondary" onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(signals, null, 2));
              showFeedback('📋 Đã sao chép toàn bộ JSON vào Clipboard!');
            }}>
              📋 Sao chép JSON
            </button>
          </div>
          <pre className="json-viewer">
            {JSON.stringify(signals, null, 2)}
          </pre>
        </div>
      )}

      {/* TAB 4: CẤU HÌNH BOT TELEGRAM */}
      {activeTab === 'bot' && (
        <div className="admin-section-card">
          <h3 style={{ marginBottom: '10px' }}>🤖 Kết Nối Telegram Bot API Trực Tiếp</h3>
          <p className="section-subtitle">
            Bot chỉ đọc được tin nhắn ở nơi bot được thêm vào: chat riêng với bot, group có bot, hoặc channel mà bot là admin.
          </p>

          <div className="telegram-source-guide">
            <div className="source-guide-item">
              <span className="source-guide-step">1</span>
              <div>
                <strong>Tạo bot</strong>
                <span>Lấy token từ @BotFather rồi dán vào ô bên dưới.</span>
              </div>
            </div>
            <div className="source-guide-item">
              <span className="source-guide-step">2</span>
              <div>
                <strong>Gắn bot vào nguồn tin</strong>
                <span>Với channel: thêm bot làm admin. Với group: thêm bot vào group và cho phép đọc tin nhắn.</span>
              </div>
            </div>
            <div className="source-guide-item">
              <span className="source-guide-step">3</span>
              <div>
                <strong>Gửi tin test</strong>
                <span>Bật lắng nghe rồi gửi một tin mẫu trong channel/group. Log sẽ hiện Chat ID để bạn lọc đúng nguồn.</span>
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Telegram Bot Token (từ @BotFather):</label>
              <input
                type="text"
                className="admin-input"
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                value={botConfig.botToken}
                onChange={(e) => setBotConfig({ ...botConfig, botToken: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Chu kỳ kiểm tra (ms):</label>
              <input
                type="number"
                className="admin-input"
                value={botConfig.pollInterval || 3000}
                onChange={(e) => setBotConfig({ ...botConfig, pollInterval: parseInt(e.target.value, 10) || 3000 })}
              />
            </div>
            <div className="form-group form-grid-full">
              <label>Chat ID / Channel ID cần nghe (tùy chọn):</label>
              <input
                type="text"
                className="admin-input"
                placeholder="Để trống = nghe tất cả nơi bot có mặt. Channel/group thường có dạng -100xxxxxxxxxx"
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
              {isPolling ? '⏹ Dừng Lắng Nghe Telegram' : '▶ Bắt Đầu Lắng Nghe Realtime'}
            </button>
            <button className="btn-secondary" onClick={async () => {
              try {
                await saveBotConfigToBackend(botConfig);
                showFeedback('💾 Đã lưu cấu hình Bot vào backend!');
              } catch (err) {
                setBotLogs(prev => [`[${new Date().toLocaleTimeString()}] ❌ Không lưu được backend: ${err.message}`, ...prev]);
              }
            }}>
              Lưu Cấu Hình
            </button>
          </div>

          {/* Bot Logs */}
          <div className="bot-logs-box">
            <div className="logs-title">Nhật ký kết nối (Logs):</div>
            {botLogs.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Chưa có sự kiện nào.</div>
            ) : (
              botLogs.map((log, idx) => (
                <div key={idx} className="log-line">{log}</div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: TEST & CHẨN ĐOÁN BOT TELEGRAM */}
      {activeTab === 'bot_test' && (
        <div className="admin-section-card test-bot-section">
          <div className="test-bot-header">
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                🛠️ Bộ Công Cụ Test Nhận Bot & Chẩn Đoán Toàn Diện
                <span className="live-status-pill online">REALTIME DIAGNOSTICS</span>
              </h3>
              <p className="section-subtitle" style={{ margin: '6px 0 0 0' }}>
                Chẩn đoán lỗi không nhận tin nhắn, soi trực tiếp getUpdates từ Telegram, và giả lập bắn tín hiệu qua toàn bộ Pipeline.
              </p>
            </div>
            <div className="test-quick-actions">
              <button
                className="btn-primary-action"
                onClick={handleRunBotDiagnosis}
                disabled={diagLoading}
              >
                {diagLoading ? '⏳ Đang kiểm tra...' : '🔍 1-Click Chẩn Đoán Bot'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleInspectUpdates}
                disabled={inspectLoading}
              >
                {inspectLoading ? '⏳ Đang quét...' : '📡 Soi Tin Nhắn Mới Nhất'}
              </button>
            </div>
          </div>

          {/* 1. BẢNG TRẠNG THÁI SỨC KHỎE BOT (HEALTH STATUS CARD) */}
          <div className="diag-health-grid">
            <div className="diag-health-card">
              <div className="diag-card-label">🔑 TOKEN BOT</div>
              <div className="diag-card-value">
                {botConfig.botToken ? (
                  <span className="text-success">
                    ✅ Đã cấu hình ({botConfig.botToken.slice(0, 7)}...{botConfig.botToken.slice(-4)})
                  </span>
                ) : (
                  <span className="text-danger">❌ Chưa nhập Bot Token</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🤖 DANH TÍNH BOT</div>
              <div className="diag-card-value">
                {diagResult?.bot ? (
                  <span className="text-info font-bold">
                    @{diagResult.bot.username} ({diagResult.bot.first_name})
                  </span>
                ) : (
                  <span className="text-muted">Chưa kiểm tra (Bấm nút chẩn đoán)</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🛡️ QUYỀN ĐỌC TIN TRONG NHÓM (PRIVACY)</div>
              <div className="diag-card-value">
                {diagResult?.bot ? (
                  diagResult.bot.can_read_all_group_messages ? (
                    <span className="text-success">✅ TẮT Privacy (Đọc được mọi tin)</span>
                  ) : (
                    <span className="text-danger">⚠️ BẬT Privacy (Cần tắt trong @BotFather)</span>
                  )
                ) : (
                  <span className="text-muted">---</span>
                )}
              </div>
            </div>

            <div className="diag-health-card">
              <div className="diag-card-label">🌐 TRẠNG THÁI WEBHOOK</div>
              <div className="diag-card-value">
                {diagResult?.webhook ? (
                  diagResult.webhook.url ? (
                    <span className="text-danger">⚠️ Đang bật Webhook ({diagResult.webhook.url})</span>
                  ) : (
                    <span className="text-success">✅ Đã tắt Webhook (Sẵn sàng Long-polling)</span>
                  )
                ) : (
                  <span className="text-muted">---</span>
                )}
              </div>
            </div>
          </div>

          {/* CẢNH BÁO QUAN TRỌNG NẾU CÓ LỖI */}
          {diagResult?.bot && !diagResult.bot.can_read_all_group_messages && (
            <div className="diag-alert-warning">
              <strong>⚠️ CẢNH BÁO PRIVACY MODE:</strong> Bot của bạn đang <strong>BẬT Privacy Mode</strong> trong Telegram. 
              Điều này khiến bot <strong>KHÔNG THỂ ĐỌC ĐƯỢC</strong> tin nhắn của người khác hoặc bot khác trong Group!
              <br />
              👉 <strong>Cách sửa ngay:</strong> Mở Telegram nhắn cho <code>@BotFather</code> ➔ Gõ <code>/setprivacy</code> ➔ Chọn Bot của bạn ➔ Chọn <code>Disable</code>.
            </div>
          )}

          {diagResult?.webhook?.url && (
            <div className="diag-alert-warning">
              <strong>⚠️ CẢNH BÁO WEBHOOK ĐANG KẸT:</strong> Bot đang gắn Webhook tới <code>{diagResult.webhook.url}</code>. 
              Khi Webhook đang bật, Telegram sẽ chặn cơ chế <code>getUpdates</code> khiến backend không nhận được tin!
              <br />
              👉 Hãy bấm nút <strong>"🧹 Xóa Webhook"</strong> bên dưới để giải phóng.
            </div>
          )}

          {/* 2. KHU VỰC CÔNG CỤ CHẨN ĐOÁN & XÓA WEBHOOK */}
          <div className="diag-sub-panel">
            <h4 className="diag-sub-title">1. Chẩn Đoán Chi Tiết & Quản Lý Webhook</h4>
            <div className="diag-btn-row">
              <button
                className="btn-primary-sm"
                onClick={handleRunBotDiagnosis}
                disabled={diagLoading}
              >
                {diagLoading ? '⏳ Đang kiểm tra...' : '🔍 Chẩn Đoán Lại'}
              </button>
              <button
                className="btn-danger-sm"
                onClick={() => handleClearWebhook(false)}
                disabled={clearWebhookLoading}
              >
                {clearWebhookLoading ? '⏳ Đang xóa...' : '🧹 Xóa Webhook (deleteWebhook)'}
              </button>
              <button
                className="btn-danger-outline-sm"
                onClick={() => handleClearWebhook(true)}
                disabled={clearWebhookLoading}
              >
                🗑 Xóa Webhook & Bỏ Tin Cũ Đọng (Drop Pending)
              </button>
            </div>

            {diagResult && (
              <div className="diag-json-box">
                <div className="diag-json-title">Kết quả phản hồi Telegram API:</div>
                <pre className="diag-json-content">
                  {JSON.stringify(diagResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* 3. SOI TIN NHẮN TELEGRAM MỚI NHẤT (LIVE GETUPDATES INSPECTOR) */}
          <div className="diag-sub-panel">
            <div className="diag-inspector-header">
              <div>
                <h4 className="diag-sub-title">2. Soi Tin Nhắn Telegram Mới Nhất (Live getUpdates Inspector)</h4>
                <p className="diag-desc">
                  Trực tiếp quét các tin nhắn Bot vừa nhận được từ Telegram. Giúp bạn xem ngay <strong>Chat ID thật</strong>, <strong>Tên người gửi</strong> và xem hệ thống bóc tách được hay không.
                </p>
              </div>
              <button
                className="btn-primary-action"
                onClick={handleInspectUpdates}
                disabled={inspectLoading}
              >
                {inspectLoading ? '⏳ Đang quét Telegram...' : '📡 Quét Tin Nhắn Mới Nhất'}
              </button>
            </div>

            {/* Filter Status Bar */}
            <div className="diag-filter-status">
              <span>🎯 Chat ID đang lọc: <strong>{botConfig.chatId || 'Tất cả (Không lọc)'}</strong></span>
              <span>🤖 Bot Username đang lọc: <strong>{botConfig.targetBotUsername || 'Tất cả'}</strong></span>
              <span>⚡️ Engine backend: <strong>{isPolling ? 'ĐANG CHẠY (ON)' : 'TẮT (OFF)'}</strong></span>
            </div>

            {inspectedUpdates.length === 0 ? (
              <div className="diag-empty-box">
                Chưa có dữ liệu quét. Nhấn <strong>"Quét Tin Nhắn Mới Nhất"</strong> sau khi bạn hoặc bot khác vừa gửi tin nhắn vào Group/Channel.
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
                          title="Lưu Chat ID này vào cấu hình để chỉ nhận từ nhóm này"
                        >
                          📋 Dùng Chat ID này
                        </button>
                      </div>
                      <div className="update-meta">
                        <span className="sender-tag">👤 @{item.senderUsername || item.senderName}</span>
                        <span className="time-tag">{new Date(item.date).toLocaleTimeString('vi-VN')}</span>
                      </div>
                    </div>

                    <div className="update-text-preview">
                      <pre>{item.text}</pre>
                    </div>

                    <div className="update-card-footer">
                      <div className="update-eval-tags">
                        <span className={`eval-pill ${item.isChatIdMatched ? 'eval-pass' : 'eval-fail'}`}>
                          {item.isChatIdMatched ? '✅ Khớp Chat ID' : '⚠️ Bị lọc do khác Chat ID'}
                        </span>
                        <span className={`eval-pill ${item.canParse ? 'eval-pass' : 'eval-warn'}`}>
                          {item.canParse ? `✅ Bóc tách: ${item.parsedCount} lệnh (${item.parsedPreview?.action} ${item.parsedPreview?.symbol})` : 'ℹ️ Không phải cấu trúc lệnh Forex/FinAI'}
                        </span>
                      </div>

                      <button
                        className="btn-tpl-highlight"
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        onClick={() => handleSimulateReceive(item.text)}
                      >
                        ⚡️ Nạp tín hiệu này ngay
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. GIẢ LẬP NHẬN TÍN HIỆU BOT (SIMULATE PIPELINE INJECTION) */}
          <div className="diag-sub-panel">
            <h4 className="diag-sub-title">3. Giả Lập Bot Nhận Tín Hiệu (Pipeline Simulator)</h4>
            <p className="diag-desc">
              Kiểm tra ngay luồng dữ liệu từ <strong>Backend ➔ Bóc tách Parser ➔ Lưu Database JSON ➔ Bắn SSE Realtime ➔ Chuông âm thanh Khách Hàng</strong>.
            </p>

            <div className="quick-templates" style={{ margin: '10px 0' }}>
              <span className="quick-label">⚡️ Chọn mẫu lệnh test:</span>
              <button className="btn-tpl" onClick={() => setSimulateText(TEMPLATE_SETUP)}>
                💎 1. Setup Gann Buy Limit
              </button>
              <button className="btn-tpl" onClick={() => setSimulateText(TEMPLATE_EXECUTED)}>
                🚀 2. Đã vào lệnh #9
              </button>
              <button className="btn-tpl" onClick={() => setSimulateText(TEMPLATE_TP)}>
                ✅ 3. TP Hit #4 (+51.2p)
              </button>
              <button className="btn-tpl" onClick={() => setSimulateText(TEMPLATE_SL)}>
                🛑 4. SL Hit #7 (-92.7p)
              </button>
              <button className="btn-tpl" onClick={() => setSimulateText(TEMPLATE_CANCELLED)}>
                ⛔️ 5. Hủy lệnh #9
              </button>
              <button className="btn-tpl-highlight" onClick={() => setSimulateText(SAMPLE_RAW_TEXT)}>
                📦 6. Full Bundle (5 tin)
              </button>
            </div>

            <div className="input-group">
              <textarea
                className="telegram-textarea"
                rows={5}
                value={simulateText}
                onChange={(e) => setSimulateText(e.target.value)}
                placeholder="Dán hoặc chỉnh sửa tin nhắn giả lập..."
              />
            </div>

            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button
                className="btn-primary-action"
                onClick={() => handleSimulateReceive(simulateText)}
                disabled={simulateLoading}
              >
                {simulateLoading ? '⏳ Đang bắn...' : '🧪 Bắn Tín Hiệu Giả Lập Vào Hệ Thống'}
              </button>
            </div>
          </div>

          {/* 5. GỬI TIN TEST TỪ BOT ĐẾN GROUP / CHANNEL */}
          <div className="diag-sub-panel">
            <h4 className="diag-sub-title">4. Test Gửi Tin Nhắn từ Bot đến Group / Kênh (sendMessage)</h4>
            <p className="diag-desc">
              Kiểm tra xem Bot có quyền phát biểu trong Group/Channel không và kiểm tra tính chính xác của Chat ID.
            </p>

            <div className="form-grid">
              <div className="form-group">
                <label>Chat ID / Group ID người nhận:</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ví dụ: -100123456789 hoặc @tenchannel"
                  value={testSendChatId}
                  onChange={(e) => setTestSendChatId(e.target.value.trim())}
                />
              </div>
              <div className="form-group">
                <label>Nội dung tin nhắn test:</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ví dụ: 🔔 [FinAI Test] Bot kết nối thành công!"
                  value={testSendMessage}
                  onChange={(e) => setTestSendMessage(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <button
                className="btn-secondary"
                onClick={handleSendTest}
                disabled={testSendLoading}
              >
                {testSendLoading ? '⏳ Đang gửi...' : '📤 Gửi Tin Nhắn Test từ Bot'}
              </button>
            </div>
          </div>

          {/* 6. HƯỚNG DẪN TỪNG BƯỚC KHẮC PHỤC LỖI KHÔNG NHẬN TIN */}
          <div className="diag-sub-panel guide-box">
            <h4 className="diag-sub-title">📚 Checklist Khắc Phục Lỗi Bot Không Nhận Tin Nhắn</h4>
            <div className="checklist-items">
              <div className="checklist-item">
                <span className="check-number">1</span>
                <div>
                  <strong>Tắt Privacy Mode trong @BotFather (BẮT BUỘC cho Group)</strong>
                  <p>Mặc định Telegram chặn Bot đọc tin nhắn trong Group. Vào <code>@BotFather</code> ➔ gửi <code>/setprivacy</code> ➔ chọn Bot ➔ chọn <strong>Disable</strong>.</p>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-number">2</span>
                <div>
                  <strong>Cấp quyền Quản Trị Viên (Administrator) nếu là Channel</strong>
                  <p>Nếu bạn muốn bot đọc bài từ Channel, bạn BẮT BUỘC phải thêm bot làm <strong>Administrator</strong> của Channel đó.</p>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-number">3</span>
                <div>
                  <strong>Kiểm tra và Xóa Webhook</strong>
                  <p>Nếu trước đó bot từng dùng Webhook, hãy bấm <strong>"🧹 Xóa Webhook"</strong> ở trên để giải phóng kết nối getUpdates Long-polling.</p>
                </div>
              </div>
              <div className="checklist-item">
                <span className="check-number">4</span>
                <div>
                  <strong>Tìm đúng Chat ID của Nhóm</strong>
                  <p>Gửi 1 tin nhắn bất kỳ vào Group ➔ Bấm <strong>"📡 Soi Tin Nhắn Mới Nhất"</strong> ở trên ➔ Bấm nút <strong>"📋 Dùng Chat ID này"</strong>.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem chi tiết 1 bản ghi JSON */}
      {selectedRecord && (
        <div className="modal-overlay" onClick={() => setSelectedRecord(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 Chi Tiết Bản Ghi JSON ({selectedRecord.id})</h3>
              <button className="btn-close" onClick={() => setSelectedRecord(null)}>✕</button>
            </div>
            <pre className="json-viewer" style={{ maxHeight: '400px' }}>
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
            <div style={{ marginTop: '14px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => setSelectedRecord(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
