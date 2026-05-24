/**
 * TradeLog.jsx — 每次交易/换仓记录表
 */

function weightStr(w) {
  if (!w) return '—';
  return Object.entries(w)
    .filter(([, v]) => v > 0.001)
    .map(([sym, v]) => `${sym}(${(v * 100).toFixed(0)}%)`)
    .join(' + ') || '—';
}

export default function TradeLog({ tradeLog, T }) {
  if (!tradeLog || tradeLog.length === 0) {
    return <div style={{ color: T.textMuted, padding: 16 }}>暂无交易记录</div>;
  }

  const thStyle = {
    padding: '7px 10px', textAlign: 'left', fontSize: 11,
    color: T.textMuted, fontWeight: 600, borderBottom: `1px solid ${T.border}`,
    position: 'sticky', top: 0, background: T.theadBg,
  };
  const tdStyle = {
    padding: '6px 10px', fontSize: 11, color: T.text,
    borderBottom: `1px solid ${T.border}`,
  };

  // 计算每笔换仓的价值变化
  const rows = tradeLog.map((t, i) => ({
    ...t,
    idx: i + 1,
  }));

  return (
    <div style={{ overflowY: 'auto', maxHeight: 360 }}>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
        共 {tradeLog.length} 次换仓
      </div>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 600 }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>日期</th>
            <th style={thStyle}>类型</th>
            <th style={thStyle}>调仓前</th>
            <th style={thStyle}>调仓后</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>净值</th>
            {rows[0]?.regime != null && <th style={thStyle}>Regime</th>}
            {rows[0]?.vol != null && <th style={{ ...thStyle, textAlign: 'right' }}>波动率</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? T.rowEven : T.cardBg }}>
              <td style={{ ...tdStyle, color: T.textMuted }}>{r.idx}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', color: T.textSub }}>{r.date}</td>
              <td style={tdStyle}>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3,
                  background: r.action === 'REGIME_CHANGE' ? '#9944ee22' : '#4488ee22',
                  color: r.action === 'REGIME_CHANGE' ? '#aa66ff' : '#4488ee',
                  border: `1px solid ${r.action === 'REGIME_CHANGE' ? '#9944ee44' : '#4488ee44'}`,
                }}>
                  {r.action === 'REGIME_CHANGE' ? 'Regime变化' : '月度调仓'}
                </span>
              </td>
              <td style={{ ...tdStyle, color: T.textMuted, fontSize: 10 }}>
                {weightStr(r.from)}
              </td>
              <td style={{ ...tdStyle, color: T.textBright, fontSize: 10, fontWeight: 500 }}>
                {weightStr(r.to)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: 11 }}>
                {r.equityBefore != null ? r.equityBefore.toFixed(3) : '—'}
              </td>
              {r.regime != null && (
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 3,
                    background: r.regime === 'full' ? '#22aa4422'
                      : r.regime === 'half' ? '#aaaa2222' : '#aa222222',
                    color: r.regime === 'full' ? '#44cc66'
                      : r.regime === 'half' ? '#cccc44' : '#cc4444',
                  }}>
                    {r.regime === 'full' ? '满仓' : r.regime === 'half' ? '半仓' : '防御'}
                  </span>
                </td>
              )}
              {r.vol != null && (
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', color: T.textSub }}>
                  {r.vol}%
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
