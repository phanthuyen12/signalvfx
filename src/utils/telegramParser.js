/**
 * telegramParser.js
 * Engine phân tích và bóc tách dữ liệu từ các tin nhắn Telegram FinAI Trading & Forex Signals.
 */

// Hàm hỗ trợ làm sạch chuỗi số (ví dụ "4,578.62" -> 4578.62)
export function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return null;
  const cleaned = val.toString().replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Hàm trích xuất Pips từ text như "(+42.7 pips)", "-92.7 pips", "+51.2 pips"
export function parsePips(text) {
  if (!text) return null;
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:pips?|p)/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Tách một chuỗi chứa nhiều tin nhắn được nối bằng từ khóa " và " hoặc các block phân cách
 */
export function splitMessages(rawText) {
  if (!rawText) return [];
  // Tách nếu có từ " và " nối giữa các thông báo có icon biểu thị bắt đầu tin nhắn mới
  const regex = /\s+và\s+(?=[🚀🔹🛑⛔️✅📌⚡️💎💡🤖])/gu;
  const parts = rawText.split(regex).map(p => p.trim()).filter(p => p.length > 0);
  return parts.length > 0 ? parts : [rawText.trim()];
}

/**
 * Parser chính: Nhận vào raw text (1 tin nhắn) và trả về đối tượng JSON có cấu trúc chuẩn
 */
export function parseTelegramMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  const baseResult = {
    id: 'SIG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    rawText: trimmed,
    symbol: 'XAUUSD',
    action: 'BUY', // BUY / SELL
    orderType: 'PENDING LIMIT', // PENDING LIMIT / MARKET / BUY STOP / SELL STOP ...
    orderNumber: null, // #9, #7, #4...
    status: 'NEW', // NEW_SETUP, EXECUTED, CANCELLED, TP_HIT, SL_HIT, ACTIVE
    entry: null,
    exit: null,
    sl: null,
    tp1: null,
    tp2: null,
    tp3: null,
    pips: null,
    indicator: 'FinAI Trading',
    strategy: 'GAN',
    volume: '100%',
    lot: 0.10,
    timeframe: 'ALL (M1 -> D1)',
    expiration: '5 phút',
    notes: '',
    timeStr: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dateStr: new Date().toISOString().split('T')[0]
  };

  // 1. DẠNG TÍN HIỆU SETUP MỚI (FINAI TRADING - TÍN HIỆU GIAO DỊCH)
  if (/TÍN HIỆU GIAO DỊCH|CHỈ BÁO PHÁT TÍN HIỆU|Gann FinAI|KÊ LỆNH CHỜ/i.test(trimmed)) {
    baseResult.status = 'PENDING';
    baseResult.type = 'SIGNAL_SETUP';

    // Cặp tiền
    const pairMatch = trimmed.match(/Cặp tiền:\s*([A-Z0-9]+)/i);
    if (pairMatch) baseResult.symbol = pairMatch[1].toUpperCase();

    // Hướng giao dịch (BUY / SELL)
    const actionMatch = trimmed.match(/Hướng giao dịch:\s*[🟢🔴]?\s*(BUY|SELL)/i);
    if (actionMatch) baseResult.action = actionMatch[1].toUpperCase();

    // Chỉ báo
    const indicatorMatch = trimmed.match(/Chỉ báo phát tín hiệu:\s*([^\n\r]+)/i);
    if (indicatorMatch) baseResult.indicator = indicatorMatch[1].replace(/[🔮🔹]/g, '').trim();

    // Trạng thái / Loại lệnh
    const statusMatch = trimmed.match(/Trạng thái:\s*([^\n\r]+)/i);
    if (statusMatch) {
      const st = statusMatch[1].replace(/⚡️/g, '').trim();
      baseResult.orderType = st;
    }

    // Thời hạn
    const expMatch = trimmed.match(/Thời hạn hủy lệnh[^:]*:\s*([^\n\r]+)/i);
    if (expMatch) baseResult.expiration = expMatch[1].trim();

    // Giá vào lệnh (Entry)
    const entryMatch = trimmed.match(/Giá vào lệnh[^:]*:\s*([\d,.]+)/i);
    if (entryMatch) baseResult.entry = parseNumber(entryMatch[1]);

    // Cắt lỗ (SL)
    const slMatch = trimmed.match(/Cắt lỗ \(SL\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (slMatch) {
      baseResult.sl = parseNumber(slMatch[1]);
      if (slMatch[2]) baseResult.slPips = parsePips(slMatch[2]);
    }

    // TP1
    const tp1Match = trimmed.match(/Chốt lời \(TP1[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp1Match) {
      baseResult.tp1 = parseNumber(tp1Match[1]);
      if (tp1Match[2]) baseResult.tp1Pips = parsePips(tp1Match[2]);
    }

    // TP2
    const tp2Match = trimmed.match(/Chốt lời \(TP2[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp2Match) {
      baseResult.tp2 = parseNumber(tp2Match[1]);
      if (tp2Match[2]) baseResult.tp2Pips = parsePips(tp2Match[2]);
    }

    // TP3
    const tp3Match = trimmed.match(/Chốt lời \(TP3[^)]*\):\s*([\d,.]+)(?:\s*\(([^)]+)\))?/i);
    if (tp3Match) {
      baseResult.tp3 = parseNumber(tp3Match[1]);
      if (tp3Match[2]) baseResult.tp3Pips = parsePips(tp3Match[2]);
    }

    // Mẫu cấu hình / Chiến lược
    const modelMatch = trimmed.match(/Mẫu Cấu hình:\s*["']?([^"'\n\r]+)["']?/i);
    if (modelMatch) baseResult.strategy = modelMatch[1].trim();

    baseResult.pips = 0; // Chưa khớp
    return baseResult;
  }

  // 2. DẠNG ĐÃ VÀO LỆNH / KHỚP LỆNH (ĐÃ VÀO LỆNH THỨ #9)
  if (/ĐÃ VÀO LỆNH THỨ|Thời gian vào lệnh/i.test(trimmed)) {
    baseResult.status = 'ACTIVE';
    baseResult.type = 'ORDER_EXECUTED';

    const orderNumMatch = trimmed.match(/LỆNH THỨ\s*#?(\d+)/i) || trimmed.match(/Lệnh thứ\s*#?(\d+)/i);
    if (orderNumMatch) baseResult.orderNumber = parseInt(orderNumMatch[1], 10);

    const stratMatch = trimmed.match(/Chiến lược:\s*([^\n\r]+)/i);
    if (stratMatch) baseResult.strategy = stratMatch[1].trim();

    const typeMatch = trimmed.match(/Loại lệnh:\s*[🟢🔴]?\s*(BUY|SELL)/i);
    if (typeMatch) baseResult.action = typeMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/Cặp:\s*([A-Z0-9]+)/i);
    if (pairMatch) baseResult.symbol = pairMatch[1].toUpperCase();

    const volMatch = trimmed.match(/Volume:\s*([\d.]+)\s*lot/i);
    if (volMatch) baseResult.lot = parseFloat(volMatch[1]);

    const entryMatch = trimmed.match(/Giá vào \(Entry\):\s*([\d,.]+)/i);
    if (entryMatch) baseResult.entry = parseNumber(entryMatch[1]);

    const slMatch = trimmed.match(/Stop Loss:\s*([\d,.]+)/i);
    if (slMatch) baseResult.sl = parseNumber(slMatch[1]);

    const tpMatch = trimmed.match(/Take Profit:\s*([\d,.]+)/i);
    if (tpMatch) {
      baseResult.tp1 = parseNumber(tpMatch[1]);
    }

    const timeMatch = trimmed.match(/Thời gian vào lệnh:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      baseResult.dateStr = timeMatch[1];
      baseResult.timeStr = timeMatch[2];
    }

    baseResult.pips = 0;
    return baseResult;
  }

  // 3. DẠNG HỦY LỆNH (HỦY LỆNH / ĐÃ CHẠM TP / VÔ HIỆU HÓA)
  if (/HỦY LỆNH|Vô hiệu hóa setup|Không khớp/i.test(trimmed)) {
    baseResult.status = 'CANCELLED';
    baseResult.type = 'ORDER_CANCELLED';

    const orderNumMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (orderNumMatch) baseResult.orderNumber = parseInt(orderNumMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) baseResult.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) baseResult.symbol = pairMatch[1].toUpperCase();

    const entryMatch = trimmed.match(/Limit Entry:\s*([\d,.]+)/i) || trimmed.match(/Entry:\s*([\d,.]+)/i);
    if (entryMatch) baseResult.entry = parseNumber(entryMatch[1]);

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    baseResult.pips = pipsMatch ? parseFloat(pipsMatch[1]) : 0.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      baseResult.dateStr = timeMatch[1];
      baseResult.timeStr = timeMatch[2];
    }

    baseResult.notes = 'Giá đã chạm TP trước khi khớp Entry hoặc hết hạn';
    return baseResult;
  }

  // 4. DẠNG SL HIT (CẮT LỖ)
  if (/SL HIT|🛑 SL HIT/i.test(trimmed)) {
    baseResult.status = 'SL_HIT';
    baseResult.type = 'SL_HIT';

    const orderNumMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (orderNumMatch) baseResult.orderNumber = parseInt(orderNumMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) baseResult.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) baseResult.symbol = pairMatch[1].toUpperCase();

    const rangeMatch = trimmed.match(/Entry:\s*([\d,.]+)\s*➔\s*Exit:\s*([\d,.]+)/i);
    if (rangeMatch) {
      baseResult.entry = parseNumber(rangeMatch[1]);
      baseResult.exit = parseNumber(rangeMatch[2]);
    }

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    baseResult.pips = pipsMatch ? parseFloat(pipsMatch[1]) : -40.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      baseResult.dateStr = timeMatch[1];
      baseResult.timeStr = timeMatch[2];
    }

    return baseResult;
  }

  // 5. DẠNG TP HIT (CHỐT LỜI)
  if (/TP HIT|✅ TP HIT/i.test(trimmed)) {
    baseResult.status = 'TP_HIT';
    baseResult.type = 'TP_HIT';

    const orderNumMatch = trimmed.match(/Lệnh\s*#?(\d+)/i);
    if (orderNumMatch) baseResult.orderNumber = parseInt(orderNumMatch[1], 10);

    const actionMatch = trimmed.match(/(BUY|SELL)/i);
    if (actionMatch) baseResult.action = actionMatch[1].toUpperCase();

    const pairMatch = trimmed.match(/(XAUUSD|[A-Z]{6})/i);
    if (pairMatch) baseResult.symbol = pairMatch[1].toUpperCase();

    const rangeMatch = trimmed.match(/Entry:\s*([\d,.]+)\s*➔\s*Exit:\s*([\d,.]+)/i);
    if (rangeMatch) {
      baseResult.entry = parseNumber(rangeMatch[1]);
      baseResult.exit = parseNumber(rangeMatch[2]);
    }

    const pipsMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*pips/i);
    baseResult.pips = pipsMatch ? parseFloat(pipsMatch[1]) : 50.0;

    const timeMatch = trimmed.match(/Time:\s*([\d-]+)\s+([\d:]+)/i);
    if (timeMatch) {
      baseResult.dateStr = timeMatch[1];
      baseResult.timeStr = timeMatch[2];
    }

    return baseResult;
  }

  // Generic fallback cho tin nhắn thông thường
  return {
    ...baseResult,
    type: 'GENERIC_MESSAGE',
    status: 'RECORDED'
  };
}

/**
 * Xử lý chuỗi tin nhắn đầy đủ (có thể gồm nhiều tin ghép lại)
 */
export function parseAllMessages(fullText) {
  const parts = splitMessages(fullText);
  const parsedItems = parts.map(p => parseTelegramMessage(p)).filter(Boolean);
  return parsedItems;
}
