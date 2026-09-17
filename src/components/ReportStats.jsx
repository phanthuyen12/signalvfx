import React, { useMemo } from 'react';

export default function ReportStats({ signals }) {
  const stats = useMemo(() => {
    let tpCount = 0;
    let slCount = 0;
    let cancelledCount = 0;
    let activeCount = 0;
    let pendingCount = 0;
    let tpPips = 0;
    let slPips = 0;

    signals.forEach(s => {
      const pips = parseFloat(s.pips) || 0;
      if (s.status === 'TP_HIT' || (s.pips && s.pips > 0)) {
        tpCount++;
        tpPips += Math.abs(pips);
      } else if (s.status === 'SL_HIT' || (s.pips && s.pips < 0)) {
        slCount++;
        slPips += Math.abs(pips);
      } else if (s.status === 'CANCELLED') {
        cancelledCount++;
      } else if (s.status === 'ACTIVE') {
        activeCount++;
      } else if (s.status === 'PENDING') {
        pendingCount++;
      }
    });

    const netPips = tpPips - slPips;
    const totalClosed = tpCount + slCount;
    const winRate = totalClosed > 0 ? ((tpCount / totalClosed) * 100).toFixed(1) : '0.0';

    return {
      total: signals.length,
      tpCount,
      slCount,
      cancelledCount,
      activeCount,
      pendingCount,
      tpPips: tpPips.toFixed(1),
      slPips: slPips.toFixed(1),
      netPips: netPips.toFixed(1),
      isNetPositive: netPips >= 0,
      winRate
    };
  }, [signals]);

  // Cumulative Pips Chart Data
  const chartPoints = useMemo(() => {
    let runningNet = 0;
    const sorted = [...signals].reverse(); // Oldest to newest
    const points = [{ index: 0, pips: 0 }];

    sorted.forEach((item, idx) => {
      const p = parseFloat(item.pips) || 0;
      runningNet += p;
      points.push({ index: idx + 1, pips: Math.round(runningNet * 10) / 10 });
    });

    return points;
  }, [signals]);

  return (
    <div className="report-dashboard">
      <div className="report-header-banner">
        <div>
          <h2 className="report-title">📊 REALTIME PERFORMANCE REPORT</h2>
          <p className="report-subtitle">Aggregated and computed from Telegram signal feed</p>
        </div>
        <div className="live-indicator">
          <span className="pulse-dot"></span> LIVE SYNC
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-kpi-grid">
        <div className="kpi-card winrate">
          <div className="kpi-label">WIN RATE</div>
          <div className="kpi-value">{stats.winRate}%</div>
          <div className="kpi-meta">{stats.tpCount} Wins / {stats.slCount} Losses</div>
        </div>

        <div className={`kpi-card net ${stats.isNetPositive ? 'pos' : 'neg'}`}>
          <div className="kpi-label">NET PROFIT (PIPS)</div>
          <div className="kpi-value">
            {stats.isNetPositive ? `+${stats.netPips}p` : `${stats.netPips}p`}
          </div>
          <div className="kpi-meta">TP: +{stats.tpPips}p | SL: -{stats.slPips}p</div>
        </div>

        <div className="kpi-card total">
          <div className="kpi-label">TOTAL SIGNALS</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-meta">
            ⏳ {stats.pendingCount} Pending • ⚡️ {stats.activeCount} Active • ⛔️ {stats.cancelledCount} Void
          </div>
        </div>
      </div>

      {/* 3 Detail Stat Cards */}
      <div className="report-grid">
        <div className="report-item tp">
          <div className="report-label tp">✓ TAKE PROFIT (TP)</div>
          <div className="report-count tp">{stats.tpCount}</div>
          <div className="report-pips tp">+{stats.tpPips} pips</div>
        </div>

        <div className="report-item sl">
          <div className="report-label sl">✗ STOP LOSS (SL)</div>
          <div className="report-count sl">{stats.slCount}</div>
          <div className="report-pips sl">-{stats.slPips} pips</div>
        </div>

        <div className="report-item exit">
          <div className="report-label exit">⛔️ CANCELLED / 0.0 PIPS</div>
          <div className="report-count exit">{stats.cancelledCount}</div>
          <div className="report-pips exit">0.0 pips</div>
        </div>
      </div>

      {/* Equity Curve Pips SVG Chart */}
      {chartPoints.length > 1 && (
        <div className="chart-card">
          <div className="chart-title">📈 PROFIT GROWTH (CUMULATIVE PIPS)</div>
          <div className="chart-svg-container">
            <svg viewBox="0 0 400 120" className="equity-svg">
              <defs>
                <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00e676" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00e676" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Grid lines */}
              <line x1="20" y1="60" x2="380" y2="60" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              
              {/* Path calculation */}
              {(() => {
                const maxP = Math.max(...chartPoints.map(p => p.pips), 50);
                const minP = Math.min(...chartPoints.map(p => p.pips), -50);
                const range = maxP - minP || 1;
                
                const getY = (val) => 100 - ((val - minP) / range) * 80;
                const getX = (idx) => 30 + (idx / (chartPoints.length - 1)) * 340;
                
                const pointsStr = chartPoints.map((p, i) => `${getX(i)},${getY(p.pips)}`).join(' ');
                const areaStr = `${pointsStr} ${getX(chartPoints.length - 1)},110 30,110`;
                
                return (
                  <>
                    <polygon points={areaStr} fill="url(#chartGrad)" />
                    <polyline points={pointsStr} fill="none" stroke="#00e676" strokeWidth="2.5" strokeLinecap="round" />
                    {chartPoints.map((p, i) => (
                      <circle key={i} cx={getX(i)} cy={getY(p.pips)} r="3.5" fill="#fff" stroke="#00e676" strokeWidth="2" />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
