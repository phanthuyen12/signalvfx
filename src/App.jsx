import React, { useState, useEffect } from 'react';
import './index.css';
import { getSignals, initStorage, playSignalChime, saveSignals } from './services/storageService';
import SignalWidget from './components/SignalWidget';
import AdminPortalPage from './components/AdminPortalPage';
import logoUrl from '/favicon.svg';

// Dùng same-origin khi chạy qua ngrok/backend để tránh mất dữ liệu do lệch domain.
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

function isElectronRuntime() {
  return typeof window !== 'undefined' && Boolean(window.process?.versions?.electron);
}

function getCurrentRoute() {
  if (typeof window === 'undefined') return '/admin';
  if (isElectronRuntime()) return '/live';

  const hashPath = window.location.hash.replace(/^#/, '');
  if (hashPath === '/live' || hashPath === '/client') return '/live';
  if (hashPath === '/admin') return '/admin';

  if (window.location.pathname === '/live' || window.location.pathname === '/client') return '/live';
  return '/admin';
}

function App() {
  const [signals, setSignals] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('en-US'));
  const [pathname, setPathname] = useState(getCurrentRoute);
  const isElectron = isElectronRuntime();

  const navigateTo = (path) => {
    if (window.location.protocol === 'file:') {
      window.location.hash = path;
    } else {
      window.history.pushState({}, '', path);
    }
    setPathname(path);
  };

  // Nạp dữ liệu ban đầu
  const loadData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/signals`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSignals(data);
          saveSignals(data);
          setLastSync(new Date().toLocaleTimeString('vi-VN'));
          return;
        }
      }
    } catch (e) {
      // Backend offline thì fallback localStorage
    }

    const localData = getSignals();
    setSignals(localData);
  };

  useEffect(() => {
    // Khởi tạo Telegram Mini App SDK nếu đang chạy trong Telegram Mobile
    if (window.Telegram && window.Telegram.WebApp) {
      try {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      } catch (e) {
        console.warn('Telegram WebApp init error:', e);
      }
    }

    initStorage();
    loadData();

    // 1. Kết nối Server-Sent Events (SSE) Realtime từ Node.js Backend với Auto-Reconnect
    let eventSource = null;
    let reconnectTimer = null;

    const setupSSE = () => {
      try {
        eventSource = new EventSource(`${API_BASE_URL}/api/stream`);

        eventSource.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.data && payload.data.signals) {
              setSignals(payload.data.signals);
              saveSignals(payload.data.signals);
              setLastSync(new Date().toLocaleTimeString('vi-VN'));

              // Phát chuông báo âm thanh khi có tín hiệu mới
              if (soundEnabled && payload.data.latest) {
                const st = payload.data.latest.status;
                if (st === 'TP_HIT') playSignalChime('tp');
                else if (st === 'SL_HIT') playSignalChime('sl');
                else playSignalChime('new');
              }
            }
          } catch (err) {}
        };

        eventSource.onerror = () => {
          if (eventSource) eventSource.close();
          // Tự động kết nối lại sau 2 giây
          reconnectTimer = setTimeout(setupSSE, 2000);
        };
      } catch (err) {
        reconnectTimer = setTimeout(setupSSE, 3000);
      }
    };

    setupSSE();

    // 2. Lắng nghe storage event cục bộ
    const handleStorage = () => {
      const data = getSignals();
      setSignals(data);
      setLastSync(new Date().toLocaleTimeString('vi-VN'));
    };

    window.addEventListener('finai_storage_update', handleStorage);

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('finai_storage_update', handleStorage);
    };
  }, [soundEnabled]);

  useEffect(() => {
    const handleRouteChange = () => setPathname(getCurrentRoute());
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  const isAdminRoute = pathname === '/admin';

  const appHeader = (
    <header className="finai-app-header">
      <button
        className="brand-lockup"
        onClick={() => navigateTo(isElectron ? '/live' : '/admin')}
        title="FinAI Signals"
      >
        <img src={logoUrl} alt="FinAI Signals" className="brand-logo-mark" />
        <span className="brand-copy">
          <strong>FinAI</strong>
          <span>Signals</span>
        </span>
      </button>

      {!isElectron && (
        <nav className="app-mode-switch" aria-label="Mode Switch">
          <button
            className={`app-mode-btn ${isAdminRoute ? 'active' : ''}`}
            onClick={() => navigateTo('/admin')}
          >
            Admin Portal
          </button>
          <button
            className={`app-mode-btn ${!isAdminRoute ? 'active' : ''}`}
            onClick={() => navigateTo('/live')}
          >
            Live Signals
          </button>
        </nav>
      )}

      <div className="app-header-status">
        <span className="status-live-indicator">
          <span className="live-dot"></span>
          <span>LIVE • {lastSync}</span>
        </span>
        <button
          className={`sound-toggle-btn ${soundEnabled ? 'active' : ''}`}
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) playSignalChime('new');
          }}
          title={soundEnabled ? 'Sound: ON' : 'Sound: Muted'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
      </div>
    </header>
  );

  if (pathname === '/admin') {
    return (
      <div className="finai-electron-shell">
        {appHeader}
        <AdminPortalPage
          signals={signals}
          onDataChange={loadData}
          onBackToClient={() => navigateTo('/live')}
        />
      </div>
    );
  }

  return (
    <div className="finai-electron-shell live-shell">
      {appHeader}
      <div className="mobile-window-drag-area" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <main className="client-app-stage">
        <div className="app-container">
          <SignalWidget signals={signals} />
        </div>
      </main>
    </div>
  );
}

export default App;
