/**
 * ParamHeatmap.jsx — 参数热图（X轴参数A，Y轴参数B，颜色=Sharpe/CAGR/MDD）
 * 用于可视化哪些参数组合在网格搜索中表现最优
 */

function heatColor(normalized) {
  // 0 → 红，0.5 → 黄，1 → 绿
  if (normalized == null) return '#333';
  const r = normalized < 0.5 ? 255 : Math.round(255 * (1 - normalized) * 2);
  const g = normalized > 0.5 ? 200 : Math.round(200 * normalized * 2);
  return `rgb(${r},${g},50)`;
}

export default function ParamHeatmap({ results, xParam, yParam, colorMetric = 'sharpe', T }) {
  if (!results || results.length === 0) {
    return <div style={{ color: T.textMuted, padding: 16 }}>暂无优化结果</div>;
  }

  // 收集 x/y 轴唯一值
  const xVals = [...new Set(results.map(r => r.params[xParam]))].sort((a, b) => a - b);
  const yVals = [...new Set(results.map(r => r.params[yParam]))].sort((a, b) => a - b);

  if (xVals.length < 2 || yVals.length < 2) {
    return (
      <div style={{ color: T.textMuted, padding: 16, fontSize: 12 }}>
        所选参数维度不足以生成热图（需至少 2×2）
      </div>
    );
  }

  // 构建矩阵：对相同 (x,y) 的结果取均值
  const matrix = {};
  const allVals = [];
  for (const r of results) {
    const x = r.params[xParam];
    const y = r.params[yParam];
    if (x == null || y == null) continue;
    const key = `${x}|${y}`;
    const v = colorMetric === 'mdd' ? -r.mdd : r[colorMetric]; // MDD取负（越接近0越好）
    if (!matrix[key]) matrix[key] = [];
    matrix[key].push(v);
    allVals.push(v);
  }

  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const norm = v => (v - minV) / range;

  const cellW = Math.min(64, Math.floor(680 / xVals.length));
  const cellH = 32;
  const labelH = 44, labelW = 80;
  const W = labelW + xVals.length * cellW + 20;
  const H = labelH + yVals.length * cellH + 30;

  const metricLabel = { sharpe: 'Sharpe', cagr: 'CAGR', mdd: '|MDD|', compositeScore: '综合' }[colorMetric] ?? colorMetric;
  const fmtVal = (v, m) => {
    if (v == null) return '—';
    const raw = m === 'mdd' ? -v : v; // 还原
    if (m === 'sharpe' || m === 'compositeScore') return raw.toFixed(2);
    return (raw >= 0 ? '+' : '') + (raw * 100).toFixed(1) + '%';
  };

  const xLabel = { lookback: '回看期', topN: 'TopN', maFilter: 'MA', lowThreshold: '低阈值%', highThreshold: '高阈值%' }[xParam] ?? xParam;
  const yLabel = { lookback: '回看期', topN: 'TopN', maFilter: 'MA', lowThreshold: '低阈值%', highThreshold: '高阈值%' }[yParam] ?? yParam;
  const lookbackFmt = v => ({ 21: '1M', 63: '3M', 126: '6M', 252: '12M' }[v] ?? v);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
        颜色指标：<strong style={{ color: T.textBright }}>{metricLabel}</strong>
        &ensp;·&ensp;深绿=高，深红=低
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* X 轴标签 */}
        <text x={labelW + xVals.length * cellW / 2} y={14}
          textAnchor="middle" fill={T.textMuted} fontSize={10}>{xLabel}</text>
        {xVals.map((v, xi) => (
          <text key={xi}
            x={labelW + xi * cellW + cellW / 2} y={labelH - 8}
            textAnchor="middle" fill={T.textSub} fontSize={10}>
            {xParam === 'lookback' ? lookbackFmt(v) : v}
          </text>
        ))}

        {/* Y 轴标签 */}
        <text x={14} y={labelH + yVals.length * cellH / 2}
          textAnchor="middle" fill={T.textMuted} fontSize={10}
          transform={`rotate(-90, 14, ${labelH + yVals.length * cellH / 2})`}>
          {yLabel}
        </text>

        {/* 单元格 */}
        {yVals.map((yv, yi) => (
          <g key={yi}>
            <text x={labelW - 6} y={labelH + yi * cellH + cellH / 2 + 4}
              textAnchor="end" fill={T.textSub} fontSize={10}>
              {yParam === 'lookback' ? lookbackFmt(yv) : yv}
            </text>
            {xVals.map((xv, xi) => {
              const key = `${xv}|${yv}`;
              const vals = matrix[key];
              if (!vals) return null;
              const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
              const color = heatColor(norm(avg));
              const cellX = labelW + xi * cellW;
              const cellY = labelH + yi * cellH;
              return (
                <g key={xi}>
                  <rect x={cellX + 1} y={cellY + 1}
                    width={cellW - 2} height={cellH - 2}
                    fill={color} rx={3} />
                  <text x={cellX + cellW / 2} y={cellY + cellH / 2 + 4}
                    textAnchor="middle" fill="#fff" fontSize={9}>
                    {fmtVal(avg, colorMetric)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
