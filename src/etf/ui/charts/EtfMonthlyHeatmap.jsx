/**
 * EtfMonthlyHeatmap.jsx — 月度收益热图（年×月矩阵，绿/红色阶）
 */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function heatColor(v) {
  if (v == null) return 'transparent';
  // 正收益：蓝绿色系；负收益：红色系
  const abs = Math.min(Math.abs(v), 0.15); // 超过 15% 饱和
  const alpha = abs / 0.15;
  if (v >= 0) {
    const g = Math.round(140 + 115 * alpha);
    const b = Math.round(80 * (1 - alpha));
    return `rgb(30,${g},${b})`;
  } else {
    const r = Math.round(140 + 115 * alpha);
    return `rgb(${r},40,40)`;
  }
}

function textColor(v) {
  if (v == null) return '#666';
  return Math.abs(v) > 0.05 ? '#fff' : (v >= 0 ? '#00c96e' : '#ee3344');
}

export default function EtfMonthlyHeatmap({ monthlyReturns, T }) {
  if (!monthlyReturns || Object.keys(monthlyReturns).length === 0) {
    return <div style={{ color: T.textMuted, padding: 16 }}>暂无月度数据</div>;
  }

  // 整理数据：{ year: { month(0-11): value } }
  const byYear = {};
  for (const [key, val] of Object.entries(monthlyReturns)) {
    const [yr, mo] = key.split('-').map(Number);
    if (!byYear[yr]) byYear[yr] = {};
    byYear[yr][mo - 1] = val; // mo: 1-12 → 0-11
  }

  const years = Object.keys(byYear).sort();
  const cellW = 46, cellH = 24, labelW = 44;
  const W = labelW + 12 * cellW + 60;
  const H = (years.length + 1) * cellH + 10;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block', fontSize: 10 }}>
        {/* 月份表头 */}
        {MONTHS.map((m, mi) => (
          <text key={mi}
            x={labelW + mi * cellW + cellW / 2} y={cellH - 6}
            textAnchor="middle" fill={T.textMuted} fontSize={10}>
            {m}
          </text>
        ))}

        {/* 年行 + 单元格 */}
        {years.map((yr, yi) => {
          const rowY = (yi + 1) * cellH;
          const rowData = byYear[yr] || {};

          // 年度合计
          const vals = Object.values(rowData).filter(v => v != null);
          const annual = vals.length > 0
            ? vals.reduce((a, b) => (1 + a) * (1 + b) - 1, 0)
            : null;

          return (
            <g key={yr}>
              {/* 年份标签 */}
              <text x={labelW - 6} y={rowY + cellH / 2 + 4}
                textAnchor="end" fill={T.textSub} fontSize={10} fontWeight="600">
                {yr}
              </text>

              {/* 12 个月 */}
              {MONTHS.map((_, mi) => {
                const v = rowData[mi];
                const cellX = labelW + mi * cellW;
                return (
                  <g key={mi}>
                    <rect x={cellX + 1} y={rowY + 1}
                      width={cellW - 2} height={cellH - 2}
                      fill={heatColor(v)} rx={3} />
                    {v != null && (
                      <text
                        x={cellX + cellW / 2} y={rowY + cellH / 2 + 4}
                        textAnchor="middle" fill={textColor(v)} fontSize={9}>
                        {v >= 0 ? '+' : ''}{(v * 100).toFixed(1)}%
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 年度合计 */}
              {annual != null && (
                <text x={labelW + 12 * cellW + 8} y={rowY + cellH / 2 + 4}
                  fill={annual >= 0 ? '#4fc86e' : '#ee4444'} fontSize={10} fontWeight="600">
                  {annual >= 0 ? '+' : ''}{(annual * 100).toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
