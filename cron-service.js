/**
 * cron-service.js
 * Node.js Cron Service & Backend Server
 * - Tự động nạp URL và Port từ file .env
 * - Quản lý toàn bộ Key, Telegram Bot Token, Group, Target Bot trên giao diện Admin (/admin)
 * - Tự động đọc tin nhắn Telegram theo thời gian thực (Zero-Delay Long Polling Stream)
 * - Tự động bóc tách tin nhắn FinAI / Forex sang JSON và lưu vào signals.json
 * - Cung cấp Realtime Stream (SSE) & REST API cho App Khách Hàng
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import localtunnel from 'localtunnel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. TỰ ĐỘNG NẠP CẤU HÌNH TỪ FILE .env
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length > 0) {
          const key = k.trim();
          const val = v.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
    console.log('[Env] ✅ Đã nạp cấu hình từ .env');
  } catch (e) {
    console.error('[Env] Lỗi đọc .env:', e.message);
  }
}

// Đường dẫn các file
const CONFIG_FILE = path.join(__dirname, 'config.json');
const SIGNALS_FILE = path.join(__dirname, 'signals.json');
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStaticFile(filePath, res) {
  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedDist = path.resolve(DIST_DIR);

    if (!resolvedPath.startsWith(resolvedDist) || !fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return false;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(resolvedPath).pipe(res);
    return true;
  } catch (err) {
    console.error('[Static] Lỗi serve file:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Static file error' }));
    return true;
  }
}

// Cấu hình mặc định (Keys, Telegram, Group quản lý động qua config.json)
const defaultConfig = {
  port: parseInt(process.env.PORT, 10) || 3001,
  host: process.env.HOST || '0.0.0.0',
  botToken: '',
  targetBotUsername: '', // Để trống để nhận từ TẤT CẢ thành viên & bot trong nhóm
  targetGroupName: 'thuyendev',
  chatId: '',
  adminPin: '8888',
  enableCron: true
};

// Đọc hoặc tạo config.json
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return { ...defaultConfig, ...parsed };
    }
  } catch (err) {
    console.error('[Config] Lỗi đọc config.json, dùng mặc định:', err.message);
  }
  saveConfig(defaultConfig);
  return defaultConfig;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('[Config] Lỗi ghi config.json:', err.message);
  }
}

// Đọc hoặc tạo signals.json
function loadSignals() {
  try {
    if (fs.existsSync(SIGNALS_FILE)) {
      const data = fs.readFileSync(SIGNALS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('[Storage] Lỗi đọc signals.json:', err.message);
  }
  return [];
}

function saveSignals(signals) {
  try {
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage] Lỗi ghi signals.json:', err.message);
  }
}

// -------------------------------------------------------------
// ENGINE BÓC TÁCH TIN NHẮN TELEGRAM (PARSER)
// -------------------------------------------------------------
function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return null;
  const cleaned = val.toString().replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parsePips(text) {
  if (!text) return null;
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:pips?|p)/i);
  return match ? parseFloat(match[1]) : null;
}

function splitMessages(rawText) {
  if (!rawText) return [];
  const regex = /\s+và\s+(?=[🚀🔹🛑⛔️✅📌⚡️💎💡🤖])/gu;
  const parts = rawText.split(regex).map(p => p.trim()).filter(p => p.length > 0);
  return parts.length > 0 ? parts : [rawText.trim()];
}

function parseTelegramMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  const base = {
    id: 'SIG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    rawText: trimmed,
    symbol: 'XAUUSD',
    action: 'BUY',
    orderType: 'PENDING LIMIT',
    orderNumber: null,
    status: 'PENDING',
    entry: null,
    exit: null,
    sl: null,
    tp1: null,
    tp2: null,
    tp3: null,
    pips: null,
    indicator: 'Gann FinAI',
    strategy: 'GAN',
    volume: '100%',
    lot: 0.10,
    timeframe: 'ALL (M1 ➔ D1)',
    expiration: '5 phút',
    notes: '',
    timeStr: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dateStr: new Date().toISOString().split('T')[0]
  };

  // 1. Tín hiệu Setup (Gann FinAI)
  if (/TÍN HIỆU GIAO DỊCH|CHỈ BÁO PHÁT TÍN HIỆU|Gann FinAI|KÊ LỆNH CHỜ/i.test(trimmed)) {
    base.status = 'PENDING';
    base.type = 'SIGNAL_SETUP';

    const pairMatch = trimmed.match(/Cặp tiền:\s*([A-Z0-9]+)/i);
    if (pairMatch) base.symbol = pairMatch[1].toUpperCase();

    const actionMatch = trimmed.match(/Hướng giao dịch:\s*[🟢🔴]?\s*(BUY|SELL)/i);
    if (actionMatch) base.action = actionMatch[1].toUpperCase();

    const indMatch = trimmed.match(/Chỉ báo phát tín hiệu:\s*([^\n\r]+)/i);
    if (indMatch) base.indicator = indMatch[1].replace(/[🔮🔹]/g, '').trim();

    const stMatch = trimmed.match(/Trạng thái:\s*([^\n\r]+)/i);
    if (stMatch) base.orderType = stMatch[1].replace(/⚡️/g, '').trim();

    const expMatch = trimmed.match(/Thời hạn hủy lệnh[^:]*:\s*([^\n\r]+)/i);
    if (expMatch) base.expiration = expMatch[1].trim();

    const entryMatch = trimmed.match(/Giá vào lệnh[^:]*:\s*([\d,.]+)/i);
    if (entryMatch) base.entry = parseNumber(entryMatch[1]);

    const slMatch = trimmed.match(/Cắt lỗ \(SL\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (slMatch) {
      base.sl = parseNumber(slMatch[1]);
      if (slMatch[2]) base.slPips = parsePips(slMatch[2]);
    }

    const tp1Match = trimmed.match(/Chốt lời \(TP1[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp1Match) base.tp1 = parseNumber(tp1Match[1]);

    const tp2Match = trimmed.match(/Chốt lời \(TP2[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp2Match) base.tp2 = parseNumber(tp2Match[1]);

    const tp3Match = trimmed.match(/Chốt lời \(TP3[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp3Match) base.tp3 = parseNumber(tp3Match[1]);

    const modelMatch = trimmed.match(/Mẫu Cấu hình:\s*["']?([^"'\n\r]+)["']?/i);
    if (modelMatch) base.strategy = modelMatch[1].trim();

    base.pips = 0;
    return base;
  }

  // 2. Vào lệnh / Khớp lệnh (#9)
  if (/ĐÃ VÀO LỆNH THỨ|Thời gian vào lệnh/i.test(trimmed)) {
    base.status = 'ACTIVE';
    base.type = 'ORDER_EXECUTED';

    const numMatch = trimmed.match(/LỆNH THỨ\s*#?(\d+)/i) || trimmed.match(/Lệnh thứ\s*#?(\d+)/i);
    if (numMatch) base.orderNumber = parseInt(numMatch[1], 10);

    const stratMatch = trimmed.match(/Chiến lược:\s*([^\n\r]+)/i);
    if (stratMatch) base.strategy = stratMatch[1].trim();

    const typeMatch = trimmed.match(/Loại lệnh:\s*[🟢🔴]?\s*(BUY|SELL)/i);
    if (typeMatch) base.action = typeMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/Cặp:\s*([A-Z0-9]+)/i);
    if (pairMatch) base.symbol = pairMatch[1].toUpperCase();

    const volMatch = trimmed.match(/Volume:\s*([\d.]+)\s*lot/i);
    if (volMatch) base.lot = parseFloat(volMatch[1]);

    const entryMatch = trimmed.match(/Giá vào \(Entry\):\s*([\d,.]+)/i);
    if (entryMatch) base.entry = parseNumber(entryMatch[1]);

    const slMatch = trimmed.match(/Stop Loss:\s*([\d,.]+)/i);
    if (slMatch) base.sl = parseNumber(slMatch[1]);

    const tpMatch = trimmed.match(/Take Profit:\s*([\d,.]+)/i);
    if (tpMatch) base.tp1 = parseNumber(tpMatch[1]);

    const timeMatch = trimmed.match(/Thời gian vào lệnh:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      base.dateStr = timeMatch[1];
      base.timeStr = timeMatch[2];
    }
    base.pips = 0;
    return base;
  }

  // 3. Hủy lệnh
  if (/HỦY LỆNH|Vô hiệu hóa setup|Không khớp/i.test(trimmed)) {
    base.status = 'CANCELLED';
    base.type = 'ORDER_CANCELLED';

    const numMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (numMatch) base.orderNumber = parseInt(numMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) base.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) base.symbol = pairMatch[1].toUpperCase();

    const entryMatch = trimmed.match(/Limit Entry:\s*([\d,.]+)/i) || trimmed.match(/Entry:\s*([\d,.]+)/i);
    if (entryMatch) base.entry = parseNumber(entryMatch[1]);

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    base.pips = pipsMatch ? parseFloat(pipsMatch[1]) : 0.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      base.dateStr = timeMatch[1];
      base.timeStr = timeMatch[2];
    }
    base.notes = 'Giá chạm TP trước khi khớp hoặc hết hạn';
    return base;
  }

  // 4. SL Hit
  if (/SL HIT|🛑 SL HIT/i.test(trimmed)) {
    base.status = 'SL_HIT';
    base.type = 'SL_HIT';

    const numMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (numMatch) base.orderNumber = parseInt(numMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) base.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) base.symbol = pairMatch[1].toUpperCase();

    const rangeMatch = trimmed.match(/Entry:\s*([\d,.]+)\s*➔\s*Exit:\s*([\d,.]+)/i);
    if (rangeMatch) {
      base.entry = parseNumber(rangeMatch[1]);
      base.exit = parseNumber(rangeMatch[2]);
    }

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    base.pips = pipsMatch ? parseFloat(pipsMatch[1]) : -40.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      base.dateStr = timeMatch[1];
      base.timeStr = timeMatch[2];
    }
    return base;
  }

  // 5. TP Hit
  if (/TP HIT|✅ TP HIT/i.test(trimmed)) {
    base.status = 'TP_HIT';
    base.type = 'TP_HIT';

    const numMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (numMatch) base.orderNumber = parseInt(numMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) base.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) base.symbol = pairMatch[1].toUpperCase();

    const rangeMatch = trimmed.match(/Entry:\s*([\d,.]+)\s*➔\s*Exit:\s*([\d,.]+)/i);
    if (rangeMatch) {
      base.entry = parseNumber(rangeMatch[1]);
      base.exit = parseNumber(rangeMatch[2]);
    }

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    base.pips = pipsMatch ? parseFloat(pipsMatch[1]) : 50.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      base.dateStr = timeMatch[1];
      base.timeStr = timeMatch[2];
    }
    return base;
  }

  return {
    ...base,
    type: 'GENERIC_MESSAGE',
    status: 'RECORDED'
  };
}

function parseAndStoreMessages(rawText) {
  const parts = splitMessages(rawText);
  const parsedItems = parts.map(parseTelegramMessage).filter(Boolean);
  if (parsedItems.length === 0) return [];

  const current = loadSignals();
  const updated = [...parsedItems, ...current];
  saveSignals(updated);

  // Broadcast Realtime SSE tới toàn bộ Website / App Client
  broadcastSSE({
    event: 'new_signal',
    data: {
      latest: parsedItems[0],
      total: updated.length,
      signals: updated
    }
  });

  return parsedItems;
}

// -------------------------------------------------------------
// SSE (SERVER-SENT EVENTS) REALTIME STREAM
// -------------------------------------------------------------
const sseClients = new Set();

function broadcastSSE(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// -------------------------------------------------------------
// TELEGRAM CONTINUOUS LONG-POLLING STREAM (REALTIME ZERO-DELAY)
// -------------------------------------------------------------
let lastUpdateId = 0;
let isPollerRunning = false;
let webhookClearedForToken = '';

function telegramApiRequest(botToken, method, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.ok) {
            reject(new Error(json.description || `Telegram API HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: true, result: [] });
    });
  });
}

let activeTunnel = null;
let currentTunnelUrl = '';

async function startAutoTunnel(botToken, targetPort = 3001) {
  if (activeTunnel) {
    try { activeTunnel.close(); } catch (e) {}
    activeTunnel = null;
  }

  console.log(`[Auto Tunnel 🌐] Đang khởi tạo đường hầm HTTPS công khai cho cổng ${targetPort}...`);
  activeTunnel = await localtunnel({ port: targetPort });
  currentTunnelUrl = activeTunnel.url;
  console.log(`[Auto Tunnel 🌐] ✅ Đã tạo đường hầm HTTPS: ${currentTunnelUrl}`);

  activeTunnel.on('close', () => {
    console.log('[Auto Tunnel 🌐] Đường hầm tunnel đã đóng.');
    activeTunnel = null;
    currentTunnelUrl = '';
  });

  activeTunnel.on('error', (err) => {
    console.error('[Auto Tunnel Error]:', err.message);
  });

  if (botToken) {
    const webhookUrl = `${currentTunnelUrl}/api/webhook`;
    console.log(`[Telegram Webhook ⚡️] Đang tự động đăng ký Webhook với Telegram: ${webhookUrl}...`);
    const setRes = await telegramApiRequest(botToken, 'setWebhook', {
      url: webhookUrl,
      drop_pending_updates: false,
      allowed_updates: JSON.stringify(['message', 'channel_post', 'edited_message'])
    });
    console.log(`[Telegram Webhook ⚡️] ✅ Đăng ký Webhook tự động THÀNH CÔNG!`);
    return { success: true, tunnelUrl: currentTunnelUrl, webhookUrl, telegram: setRes.result };
  }

  return { success: true, tunnelUrl: currentTunnelUrl };
}

async function stopAutoTunnel(botToken) {
  if (activeTunnel) {
    try { activeTunnel.close(); } catch (e) {}
    activeTunnel = null;
    currentTunnelUrl = '';
    console.log('[Auto Tunnel 🌐] Đã dừng đường hầm HTTPS.');
  }
  if (botToken) {
    await telegramApiRequest(botToken, 'deleteWebhook', { drop_pending_updates: false });
    webhookClearedForToken = botToken;
    console.log('[Telegram Webhook] ✅ Đã xóa Webhook trên Telegram để quay về Long-Polling.');
  }
  return { success: true, message: 'Đã đóng Tunnel và xóa Webhook thành công!' };
}

async function deleteWebhookIfNeeded(botToken) {
  if (!botToken || webhookClearedForToken === botToken) return;
  await telegramApiRequest(botToken, 'deleteWebhook', { drop_pending_updates: false });
  webhookClearedForToken = botToken;
  console.log('[Telegram Engine] ✅ Đã tắt webhook để dùng getUpdates polling');
}

// Bộ đệm lưu trữ tin nhắn nhận được gần nhất trong bộ nhớ (cả từ Webhook lẫn Polling)
const recentReceivedMessages = [];

function recordReceivedMessage(source, msg) {
  if (!msg) return;
  const textContent = msg.text || msg.caption || '';
  const updateChatId = String(msg.chat?.id || '');
  const chatTitle = msg.chat?.title || msg.chat?.username || msg.chat?.first_name || 'Chat ' + updateChatId;
  const chatType = msg.chat?.type || 'unknown';
  const senderUsername = (msg.from?.username || '').toLowerCase();
  const senderName = msg.from?.first_name || msg.from?.username || (chatType === 'channel' ? 'Channel Admin' : 'Unknown');

  const config = loadConfig();
  const isChatIdMatched = !config.chatId || updateChatId === String(config.chatId).trim();
  const targetBot = (config.targetBotUsername || '').toLowerCase().replace('@', '');
  const isSenderMatched = !targetBot ||
    senderUsername.includes(targetBot) ||
    senderName.toLowerCase().includes(targetBot) ||
    chatType === 'channel';

  const testParse = textContent ? splitMessages(textContent).map(parseTelegramMessage).filter(Boolean) : [];

  const item = {
    source, // 'webhook' hoặc 'polling'
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

  recentReceivedMessages.unshift(item);
  if (recentReceivedMessages.length > 50) recentReceivedMessages.pop();
}

function fetchTelegramUpdates(botToken) {
  const config = loadConfig();
  return new Promise((resolve, reject) => {
    if (!botToken) return resolve([]);
    const url = new URL(`https://api.telegram.org/bot${botToken}/getUpdates`);
    url.searchParams.set('offset', String(lastUpdateId + 1));
    url.searchParams.set('timeout', '20');
    url.searchParams.set('allowed_updates', JSON.stringify(['message', 'channel_post', 'edited_message']));

    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && Array.isArray(json.result)) {
            const items = [];
            for (const upd of json.result) {
              if (upd.update_id >= lastUpdateId) {
                lastUpdateId = upd.update_id;
              }
              const msg = upd.message || upd.channel_post || upd.edited_message;
              if (msg) {
                recordReceivedMessage('polling', msg);
                const textContent = msg.text || msg.caption || '';
                const updateChatId = String(msg.chat?.id || '');
                const chatTitle = msg.chat?.title || msg.chat?.username || msg.chat?.first_name || 'Private';
                const isChannel = Boolean(upd.channel_post || msg.chat?.type === 'channel');
                const senderUsername = (msg.from?.username || '').toLowerCase();
                const senderName = msg.from?.first_name || msg.from?.username || (isChannel ? 'Channel Admin' : 'Unknown');

                if (!textContent.trim()) continue;

                const isChatIdMatched = !config.chatId || updateChatId === String(config.chatId).trim();
                if (!isChatIdMatched) {
                  console.log(`[Telegram Realtime ℹ️] Bỏ qua tin từ Chat ID: ${updateChatId} (${chatTitle}) vì không khớp Chat ID cấu hình (${config.chatId}).`);
                  continue;
                }

                console.log(`[Telegram Realtime ⚡️] 📩 Nhận tin từ: @${senderUsername || senderName} [${chatTitle} | ID: ${updateChatId}]: ${textContent.slice(0, 50)}...`);

                // Nhận & bóc tách TẤT CẢ tín hiệu từ mọi user / bot trong nhóm
                const added = parseAndStoreMessages(textContent);
                if (added.length > 0) {
                  console.log(`[Parser 🚀] ✅ Đã bóc tách & bắn Realtime ${added.length} lệnh từ @${senderUsername || senderName} xuống Website/App!`);
                  items.push({ text: textContent, added, from: senderUsername || senderName, chat: chatTitle, chatId: updateChatId });
                } else {
                  console.log(`[Telegram Realtime ℹ️] Tin nhắn từ @${senderUsername || senderName} không chứa cấu trúc lệnh Forex/FinAI.`);
                }
              }
            }
            resolve(items);
          } else {
            resolve([]);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        resolve([]);
      } else {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

function startContinuousTelegramPoller() {
  if (isPollerRunning) return;
  isPollerRunning = true;
  console.log(`[Telegram Engine ⚡️] Đã kích hoạt chế độ Realtime Long-Polling (< 100ms)`);

  const loop = async () => {
    while (true) {
      const config = loadConfig();
      if (config.enableCron && config.botToken) {
        try {
          await deleteWebhookIfNeeded(config.botToken);
          await fetchTelegramUpdates(config.botToken);
        } catch (err) {
          console.error('[Telegram Poller Error]:', err.message);
          await new Promise(r => setTimeout(r, 2000));
        }
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  };

  loop();
}

// -------------------------------------------------------------
// GIAO DIỆN WEB ADMIN TRÊN DOMAIN (/admin)
// -------------------------------------------------------------
function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinAI Admin Portal - Quản Trị Hệ Thống</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070913;
      --card: #121826;
      --border: rgba(255,255,255,0.08);
      --text: #f8fafc;
      --sub: #94a3b8;
      --green: #00e676;
      --red: #ff4d4d;
      --blue: #3b82f6;
      --purple: #8b5cf6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .header { background: var(--card); border: 1px solid var(--border); padding: 18px 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    .title { font-size: 20px; font-weight: 900; background: linear-gradient(135deg, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: var(--card); border: 1px solid var(--border); padding: 20px; border-radius: 12px; }
    textarea { width: 100%; height: 120px; background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 8px; color: #fff; padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; resize: vertical; }
    button { cursor: pointer; border: none; border-radius: 6px; padding: 8px 14px; font-weight: 700; font-size: 12px; transition: 0.2s; }
    .btn-green { background: var(--green); color: #070913; }
    .btn-blue { background: var(--blue); color: #fff; }
    .btn-purple { background: var(--purple); color: #fff; }
    .btn-danger { background: rgba(255,77,77,0.15); color: var(--red); border: 1px solid rgba(255,77,77,0.3); }
    .tpl-bar { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .btn-tpl { background: rgba(255,255,255,0.06); color: var(--text); border: 1px solid var(--border); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    th { text-align: left; padding: 10px; border-bottom: 1px solid var(--border); color: var(--sub); font-size: 11px; }
    td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .badge { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 800; }
    .tp { color: var(--green); }
    .sl { color: var(--red); }
    .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    input { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; color: #fff; font-size: 12px; }
    .json-box { background: #000; padding: 12px; border-radius: 6px; max-height: 250px; overflow: auto; font-family: monospace; font-size: 11px; color: #34d399; }
    .toast { display: inline-block; background: rgba(0,230,118,0.15); color: var(--green); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; margin-left: 8px; }
    @media (max-width: 600px) { .config-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div style="font-size: 10px; color: var(--purple); font-weight: 800; letter-spacing: 1px;">WEB ADMIN CONTROL CENTER</div>
        <div class="title">FinAI Trading Data & Telegram Manager</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn-blue" onclick="exportJSON()">📥 Xuất JSON</button>
        <button class="btn-danger" onclick="clearData()">🗑 Xóa Hết</button>
      </div>
    </div>

    <!-- Cấu hình Telegram Keys & Nhóm trên Admin -->
    <div class="card">
      <h3 style="margin-bottom:10px;">🔑 Cấu Hình Telegram Bot, Key & Nhóm Lọc</h3>
      <div class="config-grid">
        <div>
          <label style="font-size:11px; color:var(--sub);">Telegram Bot Token (từ @BotFather):</label>
          <input type="text" id="botToken" placeholder="123456789:ABCdefGhIJKlmNo..." />
        </div>
        <div>
          <label style="font-size:11px; color:var(--sub);">Tên Bot Cần Lấy Tin (Target Bot):</label>
          <input type="text" id="targetBot" placeholder="Gannfinbot" />
        </div>
        <div>
          <label style="font-size:11px; color:var(--sub);">Tên Group Telegram (Target Group):</label>
          <input type="text" id="targetGroup" placeholder="thuyendev" />
        </div>
        <div>
          <label style="font-size:11px; color:var(--sub);">Mã PIN Admin:</label>
          <input type="text" id="adminPin" placeholder="8888" />
        </div>
      </div>
      <div style="margin-top:12px; display:flex; align-items:center;">
        <button class="btn-purple" onclick="saveBotConfig()">💾 Lưu Cấu Hình Ngay</button>
        <span id="saveToast" style="display:none;" class="toast">✅ Đã lưu thành công!</span>
      </div>
    </div>

    <!-- Bộ Test & Chẩn Đoán Bot Telegram -->
    <div class="card" style="border-color: rgba(59, 130, 246, 0.4);">
      <h3 style="margin-bottom:6px; color:#38bdf8;">🛠️ Test & Chẩn Đoán Kết Nối Bot Telegram</h3>
      <p style="font-size:12px; color:var(--sub); margin-bottom:12px;">Kiểm tra Token, soi các tin nhắn Bot vừa nhận được từ Telegram, xóa Webhook và test gửi tin nhắn.</p>
      
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        <button class="btn-blue" onclick="runDiagnose()">🔍 1-Click Chẩn Đoán Bot (getMe)</button>
        <button class="btn-danger" onclick="clearWebhook()">🧹 Xóa Webhook (Fix kẹt getUpdates)</button>
        <button class="btn-purple" onclick="inspectUpdates()">📡 Soi Tin Nhắn Mới Nhất (getUpdates)</button>
      </div>

      <div id="diagBox" style="display:none; background:#000; padding:12px; border-radius:6px; font-family:monospace; font-size:11px; color:#38bdf8; max-height:220px; overflow:auto; margin-bottom:12px;"></div>

      <div id="updatesBox" style="display:none; margin-top:10px;">
        <h4 style="font-size:12px; margin-bottom:6px; color:var(--green);">📡 Danh Sách Tin Nhắn Telegram Vừa Quét Được:</h4>
        <div id="updatesList" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    </div>

    <!-- Nạp Tin Nhắn Thủ Công -->
    <div class="card">
      <h3 style="margin-bottom:6px;">📝 Nạp & Bóc Tách Tin Nhắn Telegram Thủ Công</h3>
      <div class="tpl-bar">
        <button class="btn-tpl" onclick="loadTpl(1)">💎 Gann Setup</button>
        <button class="btn-tpl" onclick="loadTpl(2)">🚀 Vào lệnh #9</button>
        <button class="btn-tpl" onclick="loadTpl(3)">⛔️ Hủy lệnh #9</button>
        <button class="btn-tpl" onclick="loadTpl(4)">🛑 SL Hit #7</button>
        <button class="btn-tpl" onclick="loadTpl(5)">✅ TP Hit #4</button>
      </div>
      <textarea id="rawText" placeholder="Dán tin nhắn Telegram vào đây để test bắn xuống App..."></textarea>
      <div style="margin-top:10px;">
        <button class="btn-green" onclick="postMessage()">🚀 Phân Tích & Bắn Vào App Ngay</button>
      </div>
    </div>

    <!-- Danh Sách Tín Hiệu -->
    <div class="card">
      <h3>📋 Danh Sách Dữ Liệu Tín Hiệu (<span id="count">0</span>)</h3>
      <table>
        <thead>
          <tr>
            <th>Thời Gian</th>
            <th>Cặp</th>
            <th>Loại</th>
            <th>Entry</th>
            <th>SL / TP</th>
            <th>Pips</th>
            <th>Trạng Thái</th>
          </tr>
        </thead>
        <tbody id="signalTable"></tbody>
      </table>
    </div>

    <!-- Raw JSON -->
    <div class="card">
      <h3 style="margin-bottom:6px;">📦 Dữ Liệu JSON (signals.json)</h3>
      <pre class="json-box" id="jsonBox"></pre>
    </div>
  </div>

  <script>
    const TPLS = {
      1: \`🚀 FINAI TRADING - TÍN HIỆU GIAO DỊCH\\n──────────────────────────────\\n🔹 Chỉ báo phát tín hiệu: 🔮 Gann FinAI\\n🪙 Cặp tiền: XAUUSD (Vàng)\\n🎯 Hướng giao dịch: 🟢 BUY (MUA)\\n⏱️ Khung tín hiệu: ALL (Tất cả khung thời gian (M1 ➔ D1))\\n⚡️ Trạng thái: KÊ LỆNH CHỜ (PENDING LIMIT - Góc Gann Retest)\\n⏳ Thời hạn hủy lệnh (Expiration): 5 phút\\n💎 Giá vào lệnh (Buy Limit): 4,578.62\\n🛑 Cắt lỗ (SL): 4,574.35 (-42.7 pips)\\n🎯 Chốt lời (TP1 1:1): 4,582.89 (+42.7 pips)\\n🚀 Chốt lời (TP2 1:3): 4,591.43 (+128.1 pips)\\n🏆 Chốt lời (TP3 1:5): 4,599.97 (+213.5 pips)\\n──────────────────────────────\\n💡 Mẫu Cấu hình: "GAN"\`,
      2: \`🚀 ĐÃ VÀO LỆNH THỨ #9 TRONG NGÀY (2026-08-28)\\n──────────────────────\\n📡 Chiến lược: GAN\\n📌 Loại lệnh: 🟢 BUY | Cặp: XAUUSD | Volume: 0.10 lot\\n🎯 Giá vào (Entry): 4578.62\\n⛔️ Stop Loss: 4574.35\\n🎯 Take Profit: 4582.89\\n⏰ Thời gian vào lệnh: 2026-08-28 11:15:07\`,
      3: \`⛔️ HỦY LỆNH (ĐÃ CHẠM TP) - BUY XAUUSD (Lệnh #9)\\n⚠️ Giá đã chạm TP trước khi khớp Entry. Vô hiệu hóa setup!\\n📌 Limit Entry: 4578.62\\n📊 0.0 pips (Không khớp)\\n⏰ Time: 2026-08-28 11:19:00\`,
      4: \`🛑 SL HIT - BUY XAUUSD (Lệnh #7)\\n📌 Entry: 4593.99 ➔ Exit: 4584.72\\n📊 -92.7 pips\\n⏰ Time: 2026-08-28 01:28:01\`,
      5: \`✅ TP HIT - BUY XAUUSD (Lệnh #4)\\n📌 Entry: 4604.26 ➔ Exit: 4609.38\\n📊 +51.2 pips\\n⏰ Time: 2026-08-28 05:40:38\`
    };

    function loadTpl(idx) {
      document.getElementById('rawText').value = TPLS[idx] || '';
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/admin/config');
        const cfg = await res.json();
        if (cfg) {
          document.getElementById('botToken').value = cfg.botToken || '';
          document.getElementById('targetBot').value = cfg.targetBotUsername || 'Gannfinbot';
          document.getElementById('targetGroup').value = cfg.targetGroupName || 'thuyendev';
          document.getElementById('adminPin').value = cfg.adminPin || '8888';
        }
      } catch (e) {}
    }

    async function loadData() {
      try {
        const res = await fetch('/api/signals');
        const data = await res.json();
        render(data);
      } catch (e) {}
    }

    function render(list) {
      document.getElementById('count').innerText = list.length;
      document.getElementById('jsonBox').innerText = JSON.stringify(list, null, 2);
      const tbody = document.getElementById('signalTable');
      tbody.innerHTML = list.map(item => {
        const isBuy = item.action === 'BUY';
        const pips = parseFloat(item.pips) || 0;
        return \`<tr>
          <td>\${item.timeStr || ''}</td>
          <td><strong>\${item.symbol || ''}</strong></td>
          <td style="color:\${isBuy ? 'var(--green)' : 'var(--red)'}; font-weight:700;">\${item.action || ''} \${item.orderNumber ? '#' + item.orderNumber : ''}</td>
          <td>\${item.entry || '---'}</td>
          <td>SL: \${item.sl || '---'}<br/>TP1: \${item.tp1 || '---'}</td>
          <td style="color:\${pips > 0 ? 'var(--green)' : (pips < 0 ? 'var(--red)' : 'var(--sub)')}; font-weight:800;">\${pips > 0 ? '+' + pips : pips}p</td>
          <td><span class="badge" style="background:rgba(255,255,255,0.1)">\${item.status}</span></td>
        </tr>\`;
      }).join('');
    }

    async function postMessage() {
      const text = document.getElementById('rawText').value;
      if (!text.trim()) return alert('Vui lòng dán tin nhắn!');
      await fetch('/api/signals/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      document.getElementById('rawText').value = '';
      loadData();
    }

    async function clearData() {
      if (!confirm('Xóa toàn bộ tín hiệu?')) return;
      await fetch('/api/signals/clear', { method: 'POST' });
      loadData();
    }

    function exportJSON() {
      window.open('/api/signals/export', '_blank');
    }

    async function saveBotConfig() {
      const botToken = document.getElementById('botToken').value;
      const targetBotUsername = document.getElementById('targetBot').value;
      const targetGroupName = document.getElementById('targetGroup').value;
      const adminPin = document.getElementById('adminPin').value;

      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, targetBotUsername, targetGroupName, adminPin })
      });

      const t = document.getElementById('saveToast');
      t.style.display = 'inline-block';
      setTimeout(() => t.style.display = 'none', 3000);
    }

    async function runDiagnose() {
      const botToken = document.getElementById('botToken').value;
      if (!botToken) return alert('Vui lòng nhập Bot Token!');
      const diagBox = document.getElementById('diagBox');
      diagBox.style.display = 'block';
      diagBox.innerText = '⏳ Đang kiểm tra kết nối Telegram...';
      try {
        const res = await fetch('/api/admin/bot/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken })
        });
        const data = await res.json();
        diagBox.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        diagBox.innerText = '❌ Lỗi: ' + err.message;
      }
    }

    async function clearWebhook() {
      const botToken = document.getElementById('botToken').value;
      if (!botToken) return alert('Vui lòng nhập Bot Token!');
      const diagBox = document.getElementById('diagBox');
      diagBox.style.display = 'block';
      diagBox.innerText = '⏳ Đang xóa Webhook...';
      try {
        const res = await fetch('/api/admin/bot/clear-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken })
        });
        const data = await res.json();
        diagBox.innerText = JSON.stringify(data, null, 2);
        alert('Đã xóa Webhook thành công!');
      } catch (err) {
        diagBox.innerText = '❌ Lỗi: ' + err.message;
      }
    }

    async function inspectUpdates() {
      const botToken = document.getElementById('botToken').value;
      if (!botToken) return alert('Vui lòng nhập Bot Token!');
      const updatesBox = document.getElementById('updatesBox');
      const updatesList = document.getElementById('updatesList');
      updatesBox.style.display = 'block';
      updatesList.innerHTML = '<div style="color:var(--sub); font-size:12px;">⏳ Đang quét tin nhắn Telegram...</div>';
      try {
        const res = await fetch('/api/admin/bot/inspect-updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken, limit: 15 })
        });
        const data = await res.json();
        if (!data.items || data.items.length === 0) {
          updatesList.innerHTML = '<div style="color:var(--sub); font-size:12px;">Chưa có tin nhắn mới nào trên Bot. Hãy gửi 1 tin trong Group/Channel rồi quét lại!</div>';
          return;
        }
        updatesList.innerHTML = data.items.map(item => \`
          <div style="background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
              <span><strong>\${item.chatTitle}</strong> (ID: <code style="color:#38bdf8;">\${item.chatId}</code>) [\${item.chatType}]</span>
              <span style="color:var(--sub);">@\${item.senderUsername || item.senderName} • \${new Date(item.date).toLocaleTimeString()}</span>
            </div>
            <pre style="font-size:11px; color:#cbd5e1; white-space:pre-wrap; background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; margin:4px 0;">\${item.text}</pre>
            <div style="font-size:11px; color:\${item.canParse ? 'var(--green)' : 'var(--sub)'};">
              \${item.canParse ? '✅ Bóc tách: ' + item.parsedCount + ' lệnh' : 'ℹ️ Không phải mẫu lệnh'}
            </div>
          </div>
        \`).join('');
      } catch (err) {
        updatesList.innerHTML = '<div style="color:var(--red); font-size:12px;">❌ Lỗi: ' + err.message + '</div>';
      }
    }

    // Tự động kết nối SSE để cập nhật Realtime trên web Admin
    const evt = new EventSource('/api/stream');
    evt.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.data && payload.data.signals) {
          render(payload.data.signals);
        }
      } catch (err) {}
    };

    loadConfig();
    loadData();
  </script>
</body>
</html>`;
}

// -------------------------------------------------------------
// HTTP SERVER & REST API
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Web Admin Portal (/admin)
  if (url.pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getAdminHTML());
    return;
  }

  // 2. SSE Realtime Stream (/api/stream)
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: {"connected": true}\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 3. API lấy danh sách tín hiệu (/api/signals)
  if (url.pathname === '/api/signals' && req.method === 'GET') {
    const signals = loadSignals();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(signals));
    return;
  }

  // 4. API lấy tín hiệu mới nhất (/api/signals/latest)
  if (url.pathname === '/api/signals/latest' && req.method === 'GET') {
    const signals = loadSignals();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(signals[0] || null));
    return;
  }

  // 5. API lấy cấu hình (/api/admin/config)
  if (url.pathname === '/api/admin/config' && req.method === 'GET') {
    const current = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(current));
    return;
  }

  // 6. API lưu cấu hình Bot (/api/admin/config)
  if (url.pathname === '/api/admin/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const current = loadConfig();
        const updated = { ...current, ...payload };
        saveConfig(updated);
        console.log('[Admin] 💾 Đã cập nhật cấu hình Telegram mới từ giao diện Admin');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, config: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. API nạp tin nhắn Telegram thô (/api/signals/raw)
  if (url.pathname === '/api/signals/raw' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        const added = parseAndStoreMessages(text);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: added.length, items: added }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 8. API xóa dữ liệu (/api/signals/clear)
  if (url.pathname === '/api/signals/clear' && req.method === 'POST') {
    saveSignals([]);
    broadcastSSE({ event: 'clear', data: { signals: [] } });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // 9. Tải file JSON (/api/signals/export)
  if (url.pathname === '/api/signals/export') {
    const signals = loadSignals();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="signals.json"'
    });
    res.end(JSON.stringify(signals, null, 2));
    return;
  }

  // 10. API Test & Chẩn Đoán Bot (/api/admin/bot/diagnose)
  if (url.pathname === '/api/admin/bot/diagnose' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token. Vui lòng nhập Bot Token!' }));
          return;
        }

        const [meRes, webhookRes] = await Promise.allSettled([
          telegramApiRequest(token, 'getMe'),
          telegramApiRequest(token, 'getWebhookInfo')
        ]);

        const botInfo = meRes.status === 'fulfilled' ? meRes.value.result : null;
        const webhookInfo = webhookRes.status === 'fulfilled' ? webhookRes.value.result : null;
        const error = meRes.status === 'rejected' ? meRes.reason.message : (webhookRes.status === 'rejected' ? webhookRes.reason.message : null);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: !error,
          bot: botInfo,
          webhook: webhookInfo,
          error: error
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 11. API Xóa Webhook (/api/admin/bot/clear-webhook)
  if (url.pathname === '/api/admin/bot/clear-webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token!' }));
          return;
        }

        const dropPending = Boolean(payload.dropPendingUpdates);
        const result = await telegramApiRequest(token, 'deleteWebhook', { drop_pending_updates: dropPending });
        webhookClearedForToken = token;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, result: result.result, message: 'Đã xóa Webhook thành công!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 11b. API Đăng Ký Webhook Telegram (/api/admin/bot/set-webhook)
  if (url.pathname === '/api/admin/bot/set-webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;
        const webhookUrl = payload.url;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token!' }));
          return;
        }
        if (!webhookUrl || !webhookUrl.startsWith('https://')) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Webhook URL phải bắt đầu bằng https:// (yêu cầu của Telegram)' }));
          return;
        }

        const result = await telegramApiRequest(token, 'setWebhook', {
          url: webhookUrl,
          allowed_updates: JSON.stringify(['message', 'channel_post', 'edited_message'])
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đăng ký Webhook thành công!', result: result.result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 11d. API Tự Động Tạo HTTPS Tunnel & Đăng Ký Webhook (/api/admin/bot/auto-tunnel)
  if (url.pathname === '/api/admin/bot/auto-tunnel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;
        const port = config.port || 3001;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token. Vui lòng nhập Bot Token!' }));
          return;
        }

        const tunnelData = await startAutoTunnel(token, port);
        const updatedConfig = { ...config, webhookUrl: tunnelData.webhookUrl };
        saveConfig(updatedConfig);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          tunnelUrl: tunnelData.tunnelUrl,
          webhookUrl: tunnelData.webhookUrl,
          message: `⚡️ Đã tạo đường hầm HTTPS (${tunnelData.tunnelUrl}) và tự động đăng ký Webhook Telegram thành công!`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 11e. API Dừng HTTPS Tunnel (/api/admin/bot/stop-tunnel)
  if (url.pathname === '/api/admin/bot/stop-tunnel' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;

        const stopData = await stopAutoTunnel(token);
        const updatedConfig = { ...config, webhookUrl: '' };
        saveConfig(updatedConfig);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: stopData.message }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 11f. API Kiểm Tra Trạng Thái Tunnel (/api/admin/bot/tunnel-status)
  if (url.pathname === '/api/admin/bot/tunnel-status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      active: Boolean(activeTunnel),
      tunnelUrl: currentTunnelUrl,
      webhookUrl: currentTunnelUrl ? `${currentTunnelUrl}/api/webhook` : ''
    }));
    return;
  }

  // 11c. Webhook Receiver Endpoint (/api/webhook hoặc /api/telegram/webhook)
  if ((url.pathname === '/api/webhook' || url.pathname === '/api/telegram/webhook') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const upd = JSON.parse(body || '{}');
        const msg = upd.message || upd.channel_post || upd.edited_message;
        if (msg) {
          recordReceivedMessage('webhook', msg);
          const textContent = msg.text || msg.caption || '';
          if (textContent.trim()) {
            console.log(`[Telegram Webhook ⚡️] Nhận tin: ${textContent.slice(0, 50)}...`);
            parseAndStoreMessages(textContent);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, error: err.message }));
      }
    });
    return;
  }

  // 12. API Soi Updates Telegram Mới Nhất (/api/admin/bot/inspect-updates)
  // 12b. API 1-Click Tự Động Sửa Lỗi & Reset Xung Đột (/api/admin/bot/auto-fix)
  if (url.pathname === '/api/admin/bot/auto-fix' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token. Vui lòng nhập Bot Token!' }));
          return;
        }

        console.log('[Auto-Fix 🛠] Đang thực hiện 1-Click sửa lỗi & reset Telegram Bot...');
        // 1. Dừng tunnel nếu có
        await stopAutoTunnel(token).catch(() => {});

        // 2. Xóa Webhook và xóa sạch tin đọng trên Telegram (drop_pending_updates: true)
        const delRes = await telegramApiRequest(token, 'deleteWebhook', { drop_pending_updates: true }).catch(err => ({ error: err.message }));
        webhookClearedForToken = token;

        // 3. Reset ID update
        lastUpdateId = 0;

        // 4. Kiểm tra danh tính Bot (getMe)
        const meRes = await telegramApiRequest(token, 'getMe').catch(() => null);

        // 5. Cập nhật cấu hình & kích hoạt Polling sạch
        config.enableCron = true;
        config.webhookUrl = '';
        saveConfig(config);

        if (!isPollerRunning) {
          startContinuousTelegramPoller();
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: '✅ Đã sửa lỗi xung đột, xóa webhook kẹt và khởi động lại kết nối bot thành công!',
          bot: meRes?.result || null,
          webhookDeleted: delRes?.result || true
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 12. API Soi getUpdates Trực Tiếp Từ Telegram (/api/admin/bot/inspect-updates)
  if (url.pathname === '/api/admin/bot/inspect-updates' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const config = loadConfig();
        const token = payload.botToken || config.botToken;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token!' }));
          return;
        }

        // Ưu tiên 1: Nếu trong cache đã có tin nhắn vừa bắt được (cả Webhook lẫn Polling), trả về ngay không cần gọi getUpdates để tránh conflict
        if (recentReceivedMessages.length > 0) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            isWebhookActive: Boolean(activeTunnel) || Boolean(config.webhookUrl),
            total: recentReceivedMessages.length,
            items: recentReceivedMessages,
            source: 'cache',
            currentConfig: {
              chatId: config.chatId,
              targetBotUsername: config.targetBotUsername,
              enableCron: config.enableCron
            }
          }));
          return;
        }

        // Ưu tiên 2: Nếu cache trống và Poller đang chạy ngầm, không gọi getUpdates song song để tránh Conflict lỗi 'terminated by other getUpdates request'
        if (isPollerRunning && config.enableCron) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            isWebhookActive: false,
            total: 0,
            items: [],
            message: 'Engine đang lắng nghe tin nhắn trực tiếp. Hãy gửi 1 tin vào nhóm/kênh rồi bấm Soi lại.',
            currentConfig: {
              chatId: config.chatId,
              targetBotUsername: config.targetBotUsername,
              enableCron: config.enableCron
            }
          }));
          return;
        }

        try {
          // Thử gọi getUpdates từ Telegram API khi Poller chưa chạy
          const rawRes = await telegramApiRequest(token, 'getUpdates', {
            limit: payload.limit || 15,
            timeout: 1,
            allowed_updates: JSON.stringify(['message', 'channel_post', 'edited_message'])
          });

          const updates = rawRes.result || [];
          const inspected = updates.map(upd => {
            const msg = upd.message || upd.channel_post || upd.edited_message;
            if (!msg) return null;

            const textContent = msg.text || msg.caption || '';
            const updateChatId = String(msg.chat?.id || '');
            const chatTitle = msg.chat?.title || msg.chat?.username || msg.chat?.first_name || 'Chat ' + updateChatId;
            const chatType = msg.chat?.type || 'unknown';
            const senderUsername = (msg.from?.username || '').toLowerCase();
            const senderName = msg.from?.first_name || msg.from?.username || (chatType === 'channel' ? 'Channel Admin' : 'Unknown');

            const isChatIdMatched = !config.chatId || updateChatId === String(config.chatId).trim();
            const targetBot = (config.targetBotUsername || '').toLowerCase().replace('@', '');
            const isSenderMatched = !targetBot ||
              senderUsername.includes(targetBot) ||
              senderName.toLowerCase().includes(targetBot) ||
              chatType === 'channel';

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

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            isWebhookActive: false,
            total: updates.length,
            items: inspected,
            currentConfig: {
              chatId: config.chatId,
              targetBotUsername: config.targetBotUsername,
              enableCron: config.enableCron
            }
          }));
        } catch (apiErr) {
          // Xử lý xung đột khi Webhook đang bật
          if (apiErr.message && apiErr.message.includes('webhook is active')) {
            const webhookInfoRes = await telegramApiRequest(token, 'getWebhookInfo').catch(() => null);
            const webhookInfo = webhookInfoRes ? webhookInfoRes.result : null;

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              isWebhookActive: true,
              webhookInfo: webhookInfo,
              total: recentReceivedMessages.length,
              items: recentReceivedMessages,
              message: 'Bot đang ở chế độ Webhook (Telegram cấm getUpdates và tự động bắn tin trực tiếp về Webhook).'
            }));
            return;
          }

          // Xử lý lỗi Conflict do bot instance khác
          if (apiErr.message && (apiErr.message.includes('terminated by other getUpdates') || apiErr.message.includes('Conflict'))) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              hasConflict: true,
              total: recentReceivedMessages.length,
              items: recentReceivedMessages,
              message: 'Đang có tiến trình Telegram khác hoạt động. Đang hiển thị tin từ bộ nhớ cache.'
            }));
            return;
          }

          throw apiErr;
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 13. API Gửi Tin Nhắn Test từ Bot (/api/admin/bot/send-test)
  if (url.pathname === '/api/admin/bot/send-test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const config = loadConfig();
        const token = payload.botToken || config.botToken;
        const targetChatId = payload.chatId || config.chatId;
        const messageText = payload.text || `🔔 [FinAI Signals] Test kết nối Bot thành công lúc ${new Date().toLocaleTimeString('vi-VN')}!`;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Chưa có Bot Token!' }));
          return;
        }
        if (!targetChatId) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Vui lòng nhập Chat ID hoặc Group ID cần gửi test!' }));
          return;
        }

        const result = await telegramApiRequest(token, 'sendMessage', {
          chat_id: targetChatId,
          text: messageText
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã gửi tin test thành công!', result: result.result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 14. API Giả Lập Bot Nhận Tin & Bắn Realtime Stream (/api/admin/bot/simulate-receive)
  if (url.pathname === '/api/admin/bot/simulate-receive' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body || '{}');
        if (!text || !text.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Nội dung tin nhắn không được để trống!' }));
          return;
        }

        const added = parseAndStoreMessages(text);
        if (added.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Không nhận diện được định dạng tín hiệu. Vui lòng kiểm tra lại nội dung!' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          count: added.length,
          items: added,
          message: `⚡️ Đã giả lập thành công ${added.length} tín hiệu và bắn Realtime tới toàn bộ Client!`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 15. Serve React build khi public qua cùng một ngrok/backend URL
  if (req.method === 'GET' && fs.existsSync(DIST_DIR)) {
    const requestedPath = decodeURIComponent(url.pathname);
    const staticPath = requestedPath === '/'
      ? path.join(DIST_DIR, 'index.html')
      : path.join(DIST_DIR, requestedPath);

    if (serveStaticFile(staticPath, res)) return;

    const indexPath = path.join(DIST_DIR, 'index.html');
    if (!requestedPath.startsWith('/api') && serveStaticFile(indexPath, res)) return;
  }

  // 404 Fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

const config = loadConfig();
const PORT = parseInt(process.env.PORT, 10) || config.port || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 FinAI Node Backend & Stream Server running on ${HOST}:${PORT}`);
  console.log(`📡 Client API:   http://localhost:${PORT}/api/signals`);
  console.log(`⚡️ SSE Stream:   http://localhost:${PORT}/api/stream`);
  console.log(`🛡️ Web Admin:    http://localhost:${PORT}/admin`);
  console.log(`=======================================================`);
  startContinuousTelegramPoller();
});
