/**
 * telegramService.js
 * Quản lý kết nối tự động với Telegram Bot API để đọc tin nhắn từ group/channel theo thời gian thực
 */

import { addSignalsFromRawText } from './storageService';

let pollingTimer = null;
let lastUpdateId = 0;
let isPollingActive = false;
let webhookClearedForToken = '';

async function requestTelegram(botToken, method, params = {}) {
  const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `HTTP ${res.status}`);
  }

  return data;
}

export async function deleteTelegramWebhook(botToken, dropPendingUpdates = false) {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');

  const data = await requestTelegram(botToken, 'deleteWebhook', {
    drop_pending_updates: dropPendingUpdates
  });

  webhookClearedForToken = botToken;
  return data.result;
}

export async function fetchTelegramUpdates(botToken, chatId = '') {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');

  const data = await requestTelegram(botToken, 'getUpdates', {
    offset: lastUpdateId + 1,
    timeout: 5
  });

  if (data.ok && Array.isArray(data.result)) {
    const newItems = [];
    for (const update of data.result) {
      if (update.update_id >= lastUpdateId) {
        lastUpdateId = update.update_id;
      }
      
      const msg = update.message || update.channel_post || update.edited_message;
      if (msg && msg.text) {
        const updateChatId = String(msg.chat?.id || '');
        if (chatId && updateChatId !== String(chatId).trim()) {
          continue;
        }

        const added = addSignalsFromRawText(msg.text);
        newItems.push({
          msgId: msg.message_id,
          text: msg.text,
          from: msg.from?.username || msg.chat?.title || 'User',
          chatId: updateChatId,
          chatTitle: msg.chat?.title || msg.chat?.username || msg.chat?.first_name || 'Unknown chat',
          chatType: msg.chat?.type || 'unknown',
          parsed: added
        });
      }
    }
    return newItems;
  }
  return [];
}

export function startTelegramPolling(botToken, intervalMs = 3000, onNewMessages, onError, options = {}) {
  if (isPollingActive) stopTelegramPolling();
  if (!botToken) return;

  isPollingActive = true;
  const poll = async () => {
    if (!isPollingActive) return;
    try {
      if (webhookClearedForToken !== botToken) {
        await deleteTelegramWebhook(botToken, false);
      }

      const messages = await fetchTelegramUpdates(botToken, options.chatId);
      if (messages && messages.length > 0 && onNewMessages) {
        onNewMessages(messages);
      }
    } catch (err) {
      if (onError) onError(err);
    } finally {
      if (isPollingActive) {
        pollingTimer = setTimeout(poll, intervalMs);
      }
    }
  };

  poll();
}

export async function getBotMe(botToken) {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');
  const data = await requestTelegram(botToken, 'getMe');
  return data.result;
}

export async function getTelegramWebhookInfo(botToken) {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');
  const data = await requestTelegram(botToken, 'getWebhookInfo');
  return data.result;
}

export async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');
  if (!chatId) throw new Error('Vui lòng nhập Chat ID người nhận');
  const data = await requestTelegram(botToken, 'sendMessage', {
    chat_id: chatId,
    text: text
  });
  return data.result;
}

export async function inspectRecentUpdates(botToken, limit = 20) {
  if (!botToken) throw new Error('Vui lòng nhập Telegram Bot Token');
  const data = await requestTelegram(botToken, 'getUpdates', {
    limit: limit,
    timeout: 3,
    allowed_updates: JSON.stringify(['message', 'channel_post', 'edited_message'])
  });
  return data.result || [];
}

export function stopTelegramPolling() {
  isPollingActive = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

export function getPollingStatus() {
  return isPollingActive;
}
