/**
 * StrategyRanking.jsx — 策略排名表（Grid Search 结果 Top N）
 */
import { paramLabel } from '../../optimization/gridSearch.js';

const fmtPct = (v, d = 1) =>
  v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';

const fmtNum = (v, d = 2) =>
  v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d);

function metricColor(v, isPositiveGood = true) {
  if (v == null) return '#777';
  const good = isPositiveGood ? v >= 0 : v <= 0;
  if (Math.abs(v) < 0.001) return '#888';
  return good ? '#4fc86e' : '#ee4444';
}

export default function StrategyRanking({ results, topN = 10, onApply, T }) {
  if (!results || results.length === 0) {
    return <div style={{ color: T.textMuted, padding: 16 }}>暂无优化结果，请先运行一键优化</div>;
  }

  const rows = results.slice(0, topN);

  const thStyle = {
    padding: '8px 10px', textAlign: 'left', fontSize: 11,
    color: T.textMuted, fontWeight: 600, borderBottom: `1px solid ${T.border}`,
    position: 'sticky', top: 0, background: T.theadBg,
  };
  const tdStyle = {
    padding: '7px 10px', fontSize: 11, color: T.text,
    borderBottom: `1px solid ${T.border}`,
  };

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>策略参数</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>综合评分</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>CAGR</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Sharpe</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>MDD</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>总收益</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? T.rowEven : T.cardBg }}>
              <td style={{ ...tdStyle, color: i < 3 ? '#f0c040' : T.textMuted, fontWeight: 700 }}>
                {i + 1}
              </td>
              <td style={{ ...tdStyle, maxWidth: 280 }}>
                <div style={{ fontSize: 11, color: T.textBright, lineHeight: 1.4 }}>
                  {paramLabel(r.params)}
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#4488ee' }}>
                {r.compositeScore != null ? (r.compositeScore * 100).toFixed(1) : '—'}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: metricColor(r.cagr) }}>
                {fmtPct(r.cagr)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: metricColor(r.sharpe) }}>
                {fmtNum(r.sharpe)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: metricColor(r.mdd, false) }}>
                {fmtPct(r.mdd)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', color: metricColor(r.totalReturn) }}>
                {fmtPct(r.totalReturn)}
              </td>
              <td style={tdStyle}>
                {onApply && (
                  <button onClick={() => onApply(r)} style={{
                    padding: '3px 10px', fontSize: 10, borderRadius: 4, cursor: 'pointer',
                    background: '#4488ee22', border: '1px solid #4488ee66',
                    color: '#4488ee', fontFamily: 'inherit',
                  }}>
                    应用并回测
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
