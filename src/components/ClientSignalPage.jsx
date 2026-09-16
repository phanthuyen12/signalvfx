import React, { useState, useEffect } from 'react';
import SignalWidget from './SignalWidget';
import ReportStats from './ReportStats';
import { playSignalChime } from '../services/storageService';

export default function ClientSignalPage({ signals, onOpenAdmin }) {
  const [subTab, setSubTab] = useState('signal'); // 'signal', 'analytics'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastPingTime, setLastPingTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    setLastPingTime(new Date().toLocaleTimeString());
  }, [signals]);

  return (
    <div className="client-portal-wrapper">
      {/* Client Floating Header Bar */}
      <header className="client-header-bar">
        <div className="client-brand">
          <div className="pulse-circle"></div>
          <div>
            <div className="client-brand-title">FinAI Realtime Signal</div>
            <div className="client-brand-sub">Kênh Tín Hiệu Khách Hàng Trực Tiếp</div>
          </div>
        </div>

        <div className="client-controls">
          <button
            className={`btn-sound ${soundEnabled ? 'active' : ''}`}
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playSignalChime('new');
            }}
            title={soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}
          >
            {soundEnabled ? '🔊 Âm Báo: BẬT' : '🔇 Âm Báo: TẮT'}
          </button>

          <button
            className="btn-admin-switch"
            onClick={onOpenAdmin}
            title="Chuyển sang trang Quản trị"
          >
            ⚙️ Cổng Admin
          </button>
        </div>
      </header>

      {/* Sub Tabs for Client: Live Signal vs Performance Report */}
      <div className="client-nav-pill">
        <button
          className={`pill-btn ${subTab === 'signal' ? 'active' : ''}`}
          onClick={() => setSubTab('signal')}
        >
          🎯 Tín Hiệu Live ({signals.length})
        </button>
        <button
          className={`pill-btn ${subTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setSubTab('analytics')}
        >
          📈 Báo Cáo Hiệu Suất
        </button>
      </div>

      {/* Live sync indicator */}
      <div className="client-sync-status">
        <span className="live-status-dot"></span>
        <span>Đồng bộ Realtime • Cập nhật lúc {lastPingTime}</span>
      </div>

      {/* Main Client Content */}
      <main className="client-main-content">
        {subTab === 'signal' ? (
          <SignalWidget signals={signals} />
        ) : (
          <ReportStats signals={signals} />
        )}
      </main>
    </div>
  );
}
