/**
 * EtfEquityChart.jsx — 净值曲线（策略 vs QQQ vs SPY，3条线）
 * 复用现有 EquityCurveChart 风格，扩展支持 3 条线
 */
import { Fragment } from "react";

const W = 720, H = 240;
const PAD = { l: 52, r: 16, t: 16, b: 36 };

export default function EtfEquityChart({ stratEq, qqqEq, spyEq, timestamps, T }) {
  if (!stratEq || stratEq.length < 2) {
    return <div style={{ color: T.textMuted, padding: 20, textAlign: 'center' }}>暂无数据</div>;
  }

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const allV = [...stratEq, ...(qqqEq || []), ...(spyEq || [])].filter(v => v != null);
  const minV = Math.min(...allV) * 0.97;
  const maxV = Math.max(...allV) * 1.03;
  const rng = maxV - minV || 1;
  const n = stratEq.length;

  const tx = i => PAD.l + (i / Math.max(n - 1, 1)) * iw;
  const ty = v => PAD.t + ih - ((v - minV) / rng) * ih;

  const pts = arr => arr?.map((v, i) => `${tx(i)},${ty(v)}`).join(' ');

  // Y 轴刻度
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => minV + f * rng);

  // 横轴年份刻度
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

  return (
    <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
      {/* 网格线 + Y 轴标签 */}
      {yTicks.map((v, i) => (
        <Fragment key={i}>
          <line x1={PAD.l} y1={ty(v)} x2={PAD.l + iw} y2={ty(v)}
            stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" />
          <text x={PAD.l - 5} y={ty(v) + 4} textAnchor="end"
            fill={T.textVMuted} fontSize={9}>
            {((v - 1) * 100).toFixed(0)}%
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
            stroke={T.textVMuted} strokeWidth="0.5" />
          <text x={tick.x} y={PAD.t + ih + 16} textAnchor="middle"
            fill={T.textVMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}

      {/* SPY 线（橙色虚线）*/}
      {spyEq && (
        <polyline points={pts(spyEq)} fill="none"
          stroke="#e8883a" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
      )}

      {/* QQQ 线（灰色虚线）*/}
      {qqqEq && (
        <polyline points={pts(qqqEq)} fill="none"
          stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.7" />
      )}

      {/* 策略线（蓝色实线）*/}
      <polyline points={pts(stratEq)} fill="none" stroke="#4488ee" strokeWidth="2.2" />

      {/* 图例 */}
      <line x1={PAD.l + 8}  y1={PAD.t + 10} x2={PAD.l + 24} y2={PAD.t + 10} stroke="#4488ee" strokeWidth="2.2" />
      <text x={PAD.l + 28} y={PAD.t + 14} fill={T.textSub} fontSize={10}>策略</text>

      <line x1={PAD.l + 64} y1={PAD.t + 10} x2={PAD.l + 80} y2={PAD.t + 10}
        stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3" />
      <text x={PAD.l + 84} y={PAD.t + 14} fill={T.textSub} fontSize={10}>QQQ</text>

      {spyEq && <>
        <line x1={PAD.l + 118} y1={PAD.t + 10} x2={PAD.l + 134} y2={PAD.t + 10}
          stroke="#e8883a" strokeWidth="1.5" strokeDasharray="4,3" />
        <text x={PAD.l + 138} y={PAD.t + 14} fill={T.textSub} fontSize={10}>SPY</text>
      </>}
    </svg>
  );
}
