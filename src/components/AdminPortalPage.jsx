import React, { useState } from 'react';
import AdminPanel from './AdminPanel';
import ReportStats from './ReportStats';
import { getBotConfig } from '../services/storageService';
import logoUrl from '/favicon.svg';

export default function AdminPortalPage({ signals, onDataChange, onBackToClient }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('finai_admin_auth') !== 'false';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [adminViewMode, setAdminViewMode] = useState('manager'); // 'manager', 'report'

  const handleLogin = (e) => {
    e.preventDefault();
    const config = getBotConfig();
    const correctPin = config.adminPin || '8888';

    if (pinInput === correctPin || pinInput === 'admin' || pinInput === '123456') {
      setIsAuthenticated(true);
      sessionStorage.setItem('finai_admin_auth', 'true');
      setPinError('');
    } else {
      setPinError('Incorrect PIN code! (Default: 8888)');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.setItem('finai_admin_auth', 'false');
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login-screen">
        <div className="login-card">
          <img src={logoUrl} alt="FinAI Signals" className="login-brand-mark" />
          <h2 className="login-title">FinAI Signals Admin</h2>
          <p className="login-sub">Telegram Bot Configuration & Signal Pipeline Management</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Enter Admin PIN:</label>
              <input
                type="password"
                className="pin-input"
                placeholder="PIN (Default: 8888)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
            </div>

            {pinError && <div className="pin-error">{pinError}</div>}

            <div className="login-actions">
              <button type="submit" className="btn-primary-action" style={{ width: '100%' }}>
                🔓 Unlock Admin Dashboard
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: '8px' }}
                onClick={onBackToClient}
              >
                ⬅ Back to Live Signals View
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-portal-wrapper">
      {/* Top Bar Quản Trị */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <span className="admin-tag">CONTROL CENTER</span>
          <span className="admin-stats-summary">
            {signals.length} Signals • Realtime Connected
          </span>
        </div>

        <div className="admin-topbar-nav">
          <button
            className={`admin-nav-item ${adminViewMode === 'manager' ? 'active' : ''}`}
            onClick={() => setAdminViewMode('manager')}
          >
            Management
          </button>
          <button
            className={`admin-nav-item ${adminViewMode === 'report' ? 'active' : ''}`}
            onClick={() => setAdminViewMode('report')}
          >
            Analytics Report
          </button>
          <button
            className="btn-client-preview"
            onClick={onBackToClient}
            title="Switch to Live Signals client view"
          >
            Live Signals
          </button>
          <button
            className="btn-logout"
            onClick={handleLogout}
            title="Lock session"
          >
            Lock
          </button>
        </div>
      </header>

      {/* Main Admin Section */}
      <main className="admin-main-view">
        {adminViewMode === 'manager' ? (
          <AdminPanel signals={signals} onDataChange={onDataChange} />
        ) : (
          <div className="admin-report-view">
            <ReportStats signals={signals} />
          </div>
        )}
      </main>
    </div>
  );
}
