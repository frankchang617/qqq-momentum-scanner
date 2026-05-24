/**
 * EtfAnnualBar.jsx — 年度收益柱状图（策略蓝 vs QQQ 灰 vs SPY 橙）
 */

export default function EtfAnnualBar({ stratAnnual, qqqAnnual, spyAnnual, T }) {
  const years = Object.keys(stratAnnual || {}).sort();
  if (years.length === 0) {
    return <div style={{ color: T.textMuted, padding: 16 }}>暂无年度数据</div>;
  }

  const allVals = years.flatMap(yr => [
    stratAnnual[yr], qqqAnnual?.[yr], spyAnnual?.[yr]
  ].filter(v => v != null));
  const maxAbs = Math.max(...allVals.map(Math.abs), 0.01);

  const W = 720, barH = 22, gap = 6;
  const rowH = barH * 3 + gap;
  const H = years.length * rowH + 60;
  const labelW = 48, valueW = 60;
  const barMaxW = W - labelW - valueW * 3 - 24;

  const barX = (v) => {
    const pct = Math.abs(v) / maxAbs;
    return pct * (barMaxW / 2);
  };
  const centerX = labelW + barMaxW / 2;

  const fmtPct = v => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const color = v => v >= 0 ? '#4488ee' : '#ee4444';
  const qColor = v => v == null ? T.textMuted : (v >= 0 ? '#88aacc' : '#cc8888');
  const sColor = v => v == null ? T.textMuted : (v >= 0 ? '#e8883a' : '#cc7744');

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* 零线 */}
        <line x1={centerX} y1={10} x2={centerX} y2={H - 20}
          stroke={T.borderMuted} strokeWidth="1" />

        {years.map((yr, yi) => {
          const sv = stratAnnual[yr];
          const qv = qqqAnnual?.[yr];
          const pv = spyAnnual?.[yr];
          const y0 = yi * rowH + 30;

          return (
            <g key={yr}>
              {/* 年份标签 */}
              <text x={labelW - 6} y={y0 + rowH / 2 + 4}
                textAnchor="end" fill={T.textSub} fontSize={11} fontWeight="600">
                {yr}
              </text>

              {/* 策略柱（蓝）*/}
              {sv != null && (() => {
                const bw = barX(sv);
                const bx = sv >= 0 ? centerX : centerX - bw;
                return (
                  <g>
                    <rect x={bx} y={y0} width={bw} height={barH - 2}
                      fill={color(sv)} opacity="0.85" rx={2} />
                    <text x={sv >= 0 ? bx + bw + 4 : bx - 4}
                      y={y0 + barH / 2 + 4}
                      textAnchor={sv >= 0 ? 'start' : 'end'}
                      fill={color(sv)} fontSize={10} fontWeight="600">
                      {fmtPct(sv)}
                    </text>
                  </g>
                );
              })()}

              {/* QQQ 柱（灰）*/}
              {qv != null && (() => {
                const bw = barX(qv);
                const bx = qv >= 0 ? centerX : centerX - bw;
                return (
                  <rect x={bx} y={y0 + barH} width={bw} height={barH - 2}
                    fill={qColor(qv)} opacity="0.6" rx={2} />
                );
              })()}

              {/* SPY 柱（橙）*/}
              {pv != null && (() => {
                const bw = barX(pv);
                const bx = pv >= 0 ? centerX : centerX - bw;
                return (
                  <rect x={bx} y={y0 + barH * 2} width={bw} height={barH - 2}
                    fill={sColor(pv)} opacity="0.6" rx={2} />
                );
              })()}
            </g>
          );
        })}

        {/* 图例 */}
        <rect x={labelW} y={8} width={12} height={10} fill="#4488ee" rx={2} />
        <text x={labelW + 16} y={17} fill={T.textSub} fontSize={10}>策略</text>
        <rect x={labelW + 60} y={8} width={12} height={10} fill="#88aacc" opacity="0.8" rx={2} />
        <text x={labelW + 76} y={17} fill={T.textSub} fontSize={10}>QQQ</text>
        <rect x={labelW + 120} y={8} width={12} height={10} fill="#e8883a" opacity="0.8" rx={2} />
        <text x={labelW + 136} y={17} fill={T.textSub} fontSize={10}>SPY</text>
      </svg>
    </div>
  );
}
