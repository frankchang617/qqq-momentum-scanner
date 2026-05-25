/**
 * EtfDrawdownChart.jsx — 回撤曲线（策略红色填充 + 可选 QQQ 对比）
 */
import { Fragment } from "react";

const W = 720, H = 140;
const PAD = { l: 52, r: 16, t: 12, b: 36 };

export default function EtfDrawdownChart({ drawdowns, qqqDrawdowns, timestamps, T }) {
  if (!drawdowns || drawdowns.length < 2) {
    return <div style={{ color: T.textMuted, padding: 16, textAlign: 'center' }}>暂无数据</div>;
  }

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const n = drawdowns.length;

  const allDd = [...drawdowns, ...(qqqDrawdowns || [])].filter(v => v != null);
  const minV = Math.min(...allDd, -0.01) * 1.1;

  const tx = i => PAD.l + (i / Math.max(n - 1, 1)) * iw;
  const ty = v => PAD.t + (1 - v / minV) * ih;

  const stratPts = drawdowns.map((v, i) => `${tx(i)},${ty(v)}`).join(' ');
  const fillPts  = `${PAD.l},${PAD.t} ${stratPts} ${PAD.l + iw},${PAD.t}`;

  // 横轴时间刻度
  const timeTicks = [];
  if (timestamps?.length > 1) {
    const startY = new Date(timestamps[0] * 1000).getFullYear();
    const endY   = new Date(timestamps[timestamps.length - 1] * 1000).getFullYear();
    for (let yr = startY; yr <= endY + 1; yr++) {
      const targetTs = Date.UTC(yr, 0, 1) / 1000;
      const idx = timestamps.findIndex(ts => ts >= targetTs);
      if (idx >= 0 && idx < n) timeTicks.push({ x: tx(idx), label: String(yr) });
    }
  }

  // Y 轴刻度（0%, -10%, -20%, ...）
  const yStep = Math.abs(minV) > 0.3 ? 0.1 : 0.05;
  const yTicks = [];
  for (let v = 0; v >= minV; v -= yStep) {
    yTicks.push(parseFloat(v.toFixed(3)));
  }

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
      {/* 零线 */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l + iw} y2={PAD.t}
        stroke={T.border} strokeWidth="0.7" />

      {/* Y 轴网格 */}
      {yTicks.map((v, i) => (
        <Fragment key={i}>
          {v !== 0 && (
            <line x1={PAD.l} y1={ty(v)} x2={PAD.l + iw} y2={ty(v)}
              stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" />
          )}
          <text x={PAD.l - 5} y={ty(v) + 4} textAnchor="end"
            fill={T.textMuted} fontSize={9}>
            {(v * 100).toFixed(0)}%
          </text>
        </Fragment>
      ))}

      {/* 横轴基线 */}
      <line x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih}
        stroke={T.borderMuted} strokeWidth="0.5" />

      {/* 横轴时间刻度 */}
      {timeTicks.map((tick, i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={PAD.t + ih} x2={tick.x} y2={PAD.t + ih + 5}
            stroke={T.textMuted} strokeWidth="0.5" />
          <text x={tick.x} y={PAD.t + ih + 16} textAnchor="middle"
            fill={T.textMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}

      {/* QQQ 回撤（灰色虚线，仅轮廓）*/}
      {qqqDrawdowns && (
        <polyline
          points={qqqDrawdowns.map((v, i) => `${tx(i)},${ty(v)}`).join(' ')}
          fill="none" stroke={T.textMuted} strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />
      )}

      {/* 策略回撤（红色填充）*/}
      <polygon points={fillPts} fill="#ee334420" />
      <polyline points={stratPts} fill="none" stroke="#ee3344" strokeWidth="1.5" />

      {/* 最大回撤标注 */}
      {(() => {
        const mdd = Math.min(...drawdowns);
        const mddIdx = drawdowns.indexOf(mdd);
        if (mddIdx < 0) return null;
        const mx = tx(mddIdx), my = ty(mdd);
        return (
          <g>
            <circle cx={mx} cy={my} r={3} fill="#ee3344" />
            <text x={mx} y={my - 6} textAnchor="middle"
              fill="#ee3344" fontSize={9} fontWeight="600">
              MDD {(mdd * 100).toFixed(1)}%
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
