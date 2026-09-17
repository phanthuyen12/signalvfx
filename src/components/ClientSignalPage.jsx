import React, { useState, useEffect } from 'react';
import SignalWidget from './SignalWidget';
import ReportStats from './ReportStats';
import { playSignalChime } from '../services/storageService';

export default function ClientSignalPage({ signals, onOpenAdmin }) {
  const [subTab, setSubTab] = useState('signal'); // 'signal', 'analytics'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastPingTime, setLastPingTime] = useState(new Date().toLocaleTimeString('en-US'));

  useEffect(() => {
    setLastPingTime(new Date().toLocaleTimeString('en-US'));
  }, [signals]);

  return (
    <div className="client-portal-wrapper">
      {/* Client Floating Header Bar */}
      <header className="client-header-bar">
        <div className="client-brand">
          <div className="pulse-circle"></div>
          <div>
            <div className="client-brand-title">FinAI Realtime Signal</div>
            <div className="client-brand-sub">Live Client Signal Feed</div>
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
            title={soundEnabled ? 'Audio: ON' : 'Audio: MUTED'}
          >
            {soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}
          </button>

          <button
            className="btn-admin-switch"
            onClick={onOpenAdmin}
            title="Switch to Admin Portal"
          >
            ⚙️ Admin Portal
          </button>
        </div>
      </header>

      {/* Sub Tabs for Client: Live Signal vs Performance Report */}
      <div className="client-nav-pill">
        <button
          className={`pill-btn ${subTab === 'signal' ? 'active' : ''}`}
          onClick={() => setSubTab('signal')}
        >
          🎯 Live Signals ({signals.length})
        </button>
        <button
          className={`pill-btn ${subTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setSubTab('analytics')}
        >
          📈 Performance Report
        </button>
      </div>

      {/* Live sync indicator */}
      <div className="client-sync-status">
        <span className="live-status-dot"></span>
        <span>Realtime Sync • Updated at {lastPingTime}</span>
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
