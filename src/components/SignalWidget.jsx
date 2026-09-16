import React, { useState, useMemo } from 'react';
import logoUrl from '/favicon.svg';

// Format số an toàn không gây tràn
function formatPriceVal(val) {
  if (val === null || val === undefined || isNaN(val)) return '---';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return val.toString();
  return num.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function formatPipsVal(pips) {
  if (pips === null || pips === undefined || isNaN(pips)) return '0.0p';
  const num = typeof pips === 'number' ? pips : parseFloat(pips);
  if (isNaN(num)) return '0.0p';
  return num > 0 ? `+${num.toFixed(1)}p` : `${num.toFixed(1)}p`;
}

export default function SignalWidget({ signals }) {
  const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL', 'TP', 'SL', 'CANCELLED'

  // Tín hiệu mới nhất đang hoạt động
  const currentSignal = signals.length > 0 ? signals[0] : null;
  // Danh sách lịch sử các lệnh trước đó
  const allPreviousSignals = useMemo(() => signals.slice(1), [signals]);

  // Lọc lịch sử theo tab
  const filteredPreviousSignals = useMemo(() => {
    return allPreviousSignals.filter(s => {
      if (historyFilter === 'ALL') return true;
      if (historyFilter === 'TP') return s.status === 'TP_HIT' || (s.pips && s.pips > 0);
      if (historyFilter === 'SL') return s.status === 'SL_HIT' || (s.pips && s.pips < 0);
      if (historyFilter === 'CANCELLED') return s.status === 'CANCELLED';
      return true;
    });
  }, [allPreviousSignals, historyFilter]);

  // Tính toán chi tiết Total Lợi Nhuận Hôm Nay
  const todayStats = useMemo(() => {
    let tpCount = 0;
    let slCount = 0;
    let exitCount = 0;
    let pendingCount = 0;
    let tpPips = 0;
    let slPips = 0;

    signals.forEach(s => {
      const pips = parseFloat(s.pips) || 0;
      if (s.status === 'TP_HIT' || (pips > 0 && s.status !== 'PENDING')) {
        tpCount++;
        tpPips += Math.abs(pips);
      } else if (s.status === 'SL_HIT' || pips < 0) {
        slCount++;
        slPips += Math.abs(pips);
      } else if (s.status === 'CANCELLED') {
        exitCount++;
      } else if (s.status === 'PENDING') {
        pendingCount++;
      }
    });

    const netPips = tpPips - slPips;
    const totalClosed = tpCount + slCount;
    const winRate = totalClosed > 0 ? ((tpCount / totalClosed) * 100).toFixed(1) : '0.0';
    // Ước tính lợi nhuận USD (với Volume 0.10 lot standard = $1/pip trên XAUUSD)
    const estUsd = (netPips * 1.0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return {
      tpCount,
      slCount,
      exitCount,
      pendingCount,
      totalSignals: signals.length,
      tpPips: tpPips.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      slPips: slPips.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      netPips: netPips.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      isNetPositive: netPips >= 0,
      winRate,
      estUsd
    };
  }, [signals]);

  if (!currentSignal) {
    return (
      <div className="empty-widget">
        <div className="empty-icon">📡</div>
        <h3>Đang chờ tín hiệu mới từ Telegram...</h3>
        <p>Hệ thống đang kết nối Socket SSE. Khi có tin nhắn trong nhóm, tín hiệu sẽ tự động hiển thị tại đây.</p>
      </div>
    );
  }

  const isBuy = (currentSignal.action || 'BUY').toUpperCase() === 'BUY';
  const isSl = currentSignal.status === 'SL_HIT' || (currentSignal.pips && currentSignal.pips < 0);
  const isTp = currentSignal.status === 'TP_HIT' || (currentSignal.pips && currentSignal.pips > 0);
  const isCancelled = currentSignal.status === 'CANCELLED';

  // Xác định theme thẻ Top
  let cardThemeClass = 'theme-pending';
  let badgeText = 'PENDING';
  let badgeClass = 'status-pending';

  if (isSl) {
    cardThemeClass = 'theme-sl';
    badgeText = 'SL HIT';
    badgeClass = 'status-badge sl-hit';
  } else if (isTp) {
    cardThemeClass = 'theme-tp';
    badgeText = 'TP HIT';
    badgeClass = 'status-badge tp-hit';
  } else if (isCancelled) {
    cardThemeClass = 'theme-cancelled';
    badgeText = 'CANCELLED';
    badgeClass = 'status-badge cancel-hit';
  } else if (currentSignal.status === 'ACTIVE') {
    cardThemeClass = 'theme-active';
    badgeText = 'EXECUTED';
    badgeClass = 'status-badge active-hit';
  }

  const pipsDisplay = formatPipsVal(currentSignal.pips);

  return (
    <div className="widget-wrapper">
      {/* Header Bot Info */}
      <div className="header">
        <div className="user-info">
          <img src={logoUrl} alt="FinAI Signals" className="avatar client-logo-avatar" />
          <div className="user-text-box">
            <div className="user-name">FinAI Signals</div>
            <div className="user-sub text-truncate">
              {currentSignal.indicator || 'Gann FinAI'} • {currentSignal.strategy || 'GAN'}
            </div>
          </div>
        </div>
        <div className={badgeClass}>
          {badgeText}
        </div>
      </div>

      {/* Main Signal Card Top */}
      <div className={`main-card-top ${cardThemeClass}`}>
        <div className="signal-badge-header">
          <span className="pair-badge text-truncate">{currentSignal.symbol || 'XAUUSD'}</span>
          <span className="order-type-badge text-truncate">{currentSignal.orderType || (isBuy ? 'BUY LIMIT' : 'SELL LIMIT')}</span>
        </div>

        <div className="signal-title" style={{ color: isBuy ? 'var(--color-buy)' : 'var(--color-sell)' }}>
          <span className="title-text">{isBuy ? '🟢 BUY' : '🔴 SELL'} {currentSignal.symbol}</span>
          {currentSignal.orderNumber && <span className="signal-id">#{currentSignal.orderNumber}</span>}
        </div>

        <div className="entry-line">
          <div className="entry-part">
            <span className="entry-lbl">Entry:</span>
            <span className="entry-val">{formatPriceVal(currentSignal.entry)}</span>
          </div>
          {currentSignal.exit && (
            <div className="exit-part">
              <span className="exit-arrow">➔</span>
              <span className="exit-lbl">Exit:</span>
              <span className="exit-val">{formatPriceVal(currentSignal.exit)}</span>
            </div>
          )}
        </div>

        {/* Profit Box */}
        <div className="profit-box">
          <div className="profit-value-wrap">
            <div className="profit-value" style={{
              color: isSl ? 'var(--color-sell)' : (isTp ? 'var(--color-buy)' : (isCancelled ? '#fcd34d' : 'var(--color-accent-2)'))
            }}>
              {pipsDisplay}
            </div>
          </div>
          <div className="profit-label text-truncate">
            {isSl ? 'STOP LOSS HIT' : (isTp ? 'PROFIT HIT' : (isCancelled ? 'SETUP VOID / CANCELED' : 'STATUS PIPS'))}
          </div>
        </div>

        {/* Meta Info */}
        <div className="signal-meta">
          <div className="text-truncate">Time: <strong>{currentSignal.timeStr || '11:15'}</strong> ({currentSignal.dateStr || 'Today'})</div>
          <div className="meta-timer">
            {currentSignal.expiration || 'Live Socket'}
          </div>
        </div>
      </div>

      {/* Main Signal Card Bottom */}
      <div className="main-card-bottom">
        <div className="targets-grid">
          <div className="target-item">
            <div className="target-label tp text-truncate">TP1 (1:1)</div>
            <div className="target-value text-truncate">{formatPriceVal(currentSignal.tp1)}</div>
          </div>
          <div className="target-item">
            <div className="target-label tp text-truncate">TP2 (1:3)</div>
            <div className="target-value text-truncate">{formatPriceVal(currentSignal.tp2)}</div>
          </div>
          <div className="target-item">
            <div className="target-label tp text-truncate">TP3 (1:5)</div>
            <div className="target-value text-truncate">{formatPriceVal(currentSignal.tp3)}</div>
          </div>
          <div className={`target-item ${isSl ? 'sl-active' : ''}`}>
            <div className="target-label sl text-truncate">🛑 SL</div>
            <div className="target-value text-truncate">{formatPriceVal(currentSignal.sl)}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-track">
            <div className="progress-fill" style={{
              width: isSl ? '0%' : (isTp ? '100%' : '50%'),
              background: isSl ? 'var(--color-sell)' : (isTp ? 'var(--color-buy)' : 'linear-gradient(90deg, #8b5cf6, #20d4ff)')
            }}></div>
            <div className="progress-thumb" style={{
              left: isSl ? '0%' : (isTp ? '100%' : '50%'),
              borderColor: isSl ? 'var(--color-sell)' : (isTp ? 'var(--color-buy)' : 'var(--color-accent-2)')
            }}></div>
          </div>
          <div className="progress-labels">
            <span className="sl text-truncate">SL ({formatPriceVal(currentSignal.sl)})</span>
            <span className="entry text-truncate">Entry ({formatPriceVal(currentSignal.entry)})</span>
            <span className="tp text-truncate">TP1</span>
            <span className="tp text-truncate">TP2</span>
            <span className="tp text-truncate">TP3</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          THẺ TOTAL LỢI NHUẬN HÔM NAY (NỔI BẬT)
          ======================================================== */}
      <div className="today-total-profit-card">
        <div className="total-profit-header">
          <div className="total-profit-title text-truncate">
            <span>🏆 TOTAL LỢI NHUẬN HÔM NAY</span>
            <span className="live-badge-mini">REALTIME</span>
          </div>
          <div className="total-profit-date">{new Date().toLocaleDateString('vi-VN')}</div>
        </div>

        <div className="total-profit-hero">
          <div className="total-profit-main">
            <div className="total-profit-pips text-truncate" style={{ color: todayStats.isNetPositive ? 'var(--color-buy)' : 'var(--color-sell)' }}>
              {todayStats.isNetPositive ? `+${todayStats.netPips} pips` : `${todayStats.netPips} pips`}
            </div>
            <div className="total-profit-usd text-truncate">
              Ước tính: <strong style={{ color: todayStats.isNetPositive ? '#34d399' : '#f87171' }}>
                {todayStats.isNetPositive ? `+$${todayStats.estUsd}` : `-$${todayStats.estUsd.replace('-', '')}`}
              </strong> (Vol 0.10 lot)
            </div>
          </div>

          <div className="total-profit-winrate">
            <div className="winrate-circle">
              <span className="winrate-num">{todayStats.winRate}%</span>
              <span className="winrate-lbl">WINRATE</span>
            </div>
          </div>
        </div>

        {/* Win/Loss Mini Progress Bar */}
        <div className="winrate-bar-container">
          <div className="winrate-bar-track">
            <div
              className="winrate-bar-win"
              style={{ width: `${Math.min(Math.max(parseFloat(todayStats.winRate) || 0, 0), 100)}%` }}
            ></div>
          </div>
          <div className="winrate-bar-labels">
            <span className="lbl-win text-truncate">✓ {todayStats.tpCount} TP (+{todayStats.tpPips}p)</span>
            <span className="lbl-loss text-truncate">✗ {todayStats.slCount} SL (-{todayStats.slPips}p)</span>
          </div>
        </div>

        {/* 3 Thẻ thống kê chi tiết */}
        <div className="report-grid" style={{ marginTop: '8px' }}>
          <div className="report-item">
            <div className="report-label tp text-truncate">✓ CHỐT LỜI</div>
            <div className="report-count tp text-truncate">{todayStats.tpCount}</div>
            <div className="report-pips tp text-truncate">+{todayStats.tpPips}p</div>
          </div>
          <div className="report-item">
            <div className="report-label sl text-truncate">✗ CẮT LỖ</div>
            <div className="report-count sl text-truncate">{todayStats.slCount}</div>
            <div className="report-pips sl text-truncate">-{todayStats.slPips}p</div>
          </div>
          <div className="report-item">
            <div className="report-label exit text-truncate">⛔️ HỦY / VOID</div>
            <div className="report-count exit text-truncate">{todayStats.exitCount}</div>
            <div className="report-pips exit text-truncate">0.0p</div>
          </div>
        </div>
      </div>

      {/* ========================================================
          NHẬT KÝ TÍN HIỆU GẦN ĐÂY (CUỘN SOCKET LỊCH SỬ)
          ======================================================== */}
      <div className="history-section-wrapper">
        <div className="section-title-bar">
          <div className="section-title text-truncate">
            <span>⚡️ NHẬT KÝ TÍN HIỆU GẦN ĐÂY</span>
            <span className="badge-count">{allPreviousSignals.length} lệnh</span>
          </div>

          {/* Bộ lọc nhanh lịch sử */}
          <div className="history-filter-chips">
            {['ALL', 'TP', 'SL', 'CANCELLED'].map(f => (
              <button
                key={f}
                className={`filter-chip ${historyFilter === f ? 'active' : ''}`}
                onClick={() => setHistoryFilter(f)}
              >
                {f === 'ALL' ? 'Tất cả' : (f === 'TP' ? '✓ TP' : (f === 'SL' ? '✗ SL' : '⛔️ Hủy'))}
              </button>
            ))}
          </div>
        </div>

        {/* Danh sách cuộn lịch sử */}
        <div className="history-scroll-box">
          {filteredPreviousSignals.length === 0 ? (
            <div className="history-empty">
              Chưa có lệnh lịch sử nào phù hợp bộ lọc.
            </div>
          ) : (
            filteredPreviousSignals.map(sig => {
              const sigBuy = (sig.action || 'BUY').toUpperCase() === 'BUY';
              const sigPips = parseFloat(sig.pips) || 0;
              const isP = sigPips > 0;
              const isN = sigPips < 0;

              let statusText = sig.status || 'CLOSED';
              let statusClass = 'status-default';

              if (sig.status === 'TP_HIT' || isP) {
                statusText = '✓ TP HIT';
                statusClass = 'tp';
              } else if (sig.status === 'SL_HIT' || isN) {
                statusText = '✗ SL HIT';
                statusClass = 'sl';
              } else if (sig.status === 'CANCELLED') {
                statusText = '⛔️ HỦY';
                statusClass = 'exit';
              } else if (sig.status === 'ACTIVE') {
                statusText = '⚡️ ĐÃ VÀO';
                statusClass = 'active';
              } else if (sig.status === 'PENDING') {
                statusText = '⏳ CHỜ';
                statusClass = 'pending';
              }

              return (
                <div key={sig.id} className="history-item">
                  <div className="history-left">
                    <div className="history-type" style={{ color: sigBuy ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                      <span className="text-truncate">{sigBuy ? '🟢 BUY' : '🔴 SELL'} {sig.symbol || 'XAUUSD'}</span>
                      {sig.orderNumber && <span className="signal-id">#{sig.orderNumber}</span>}
                    </div>
                    <div className="history-meta text-truncate">
                      {sig.entry ? `Entry: ${formatPriceVal(sig.entry)}` : ''}
                      {sig.exit ? ` ➔ Exit: ${formatPriceVal(sig.exit)}` : ''}
                      <span> • {sig.timeStr || sig.dateStr}</span>
                    </div>
                  </div>

                  <div className="history-right">
                    <div className={`history-tp-label ${statusClass} text-truncate`}>
                      {statusText}
                    </div>
                    <div className="history-result text-truncate" style={{
                      color: isP ? 'var(--color-buy)' : (isN ? 'var(--color-sell)' : 'var(--text-secondary)')
                    }}>
                      {formatPipsVal(sig.pips)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
