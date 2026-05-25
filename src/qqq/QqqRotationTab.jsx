/**
 * QqqRotationTab.jsx — QQQ 成分股轮转策略
 *
 * Props:
 *   _data  : Map<sym, {closes, opens}>（从父组件传入，已加载）
 *   _ts    : number[]（对齐时间戳）
 *   T         : 主题色对象
 *   darkMode  : boolean
 */

import React, { useState, useCallback, useMemo, useRef, Fragment } from 'react';
import { backtestQqqRotation, buildQqqBenchmark, paramLabelQqq } from './strategies/qqqRotation.js';
import { runQqqGridSearch } from './optimization/qqqGridSearch.js';
import { runQqqWFO } from './optimization/qqqWfo.js';
import { calcMetrics } from '../etf/strategies/metrics.js';

// Nasdaq-100 components (updated May 2026)
const QQQ_COMPONENTS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","AVGO","COST",
  "NFLX","PLTR","AMD","ADBE","PEP","CSCO","QCOM","INTC","TXN","INTU",
  "AMGN","AMAT","HON","BKNG","ISRG","VRTX","ADI","REGN","PANW","LRCX",
  "KLAC","MDLZ","ADP","SBUX","GILD","MELI","MU","SNPS","CDNS","FTNT",
  "ORLY","ASML","CTAS","CRWD","ABNB","MAR","PAYX","MNST","KDP","ROST",
  "PCAR","CEG","CHTR","ODFL","FAST","DXCM","IDXX","VRSK","CTSH","ZS",
  "MCHP","GEHC","CPRT","CSX","NXPI","EA","PYPL","PDD","WDAY","DDOG",
  "TTWO","CCEP","APP","ARM","ADSK","AXON","BKR","CMCSA","DASH","EXC",
  "FANG","INSM","KHC","LIN","MRVL","MSTR","MPWR","SHOP","TMUS","WMT",
  "WBD","SNDK","STX","WDC","ALNY","AEP","ROP","XEL","FER","LITE","TRI"
];

// ── 数据获取 ──
async function fetchCandlesExtended(symbol, range, signal) {
  const url = `/api/yahoo?symbol=${symbol}&range=${range}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const tss = result.timestamp;
      const adj = result.indicators?.adjclose?.[0]?.adjclose;
      const q   = result.indicators?.quote?.[0];
      if (!tss || !adj || adj.length < 20) return null;
      const rows = [];
      for (let i = 0; i < tss.length; i++) {
        if (adj[i] != null && adj[i] > 0) {
          const rawClose = q?.close?.[i];
          const rawOpen  = q?.open?.[i];
          const scale   = rawClose > 0 ? adj[i] / rawClose : 1;
          const adjOpen = rawOpen != null ? rawOpen * scale : adj[i];
          rows.push({ c: adj[i], o: adjOpen, ts: tss[i] });
        }
      }
      return rows.length >= 20 ? rows : null;
    } catch (e) {
      if (signal.aborted || attempt === 1) throw e;
    }
  }
}

// ─── 净值曲线图（与 QQQ成分股轮动 一致）────────────────────────────────────────
function EquityCurveChart({ stratEq, qqqEq, timestamps, T }) {
  const W = 700, H = 230;
  const pad = { l:46, r:12, t:14, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const allV = [...stratEq, ...(qqqEq || [])];
  const minV = Math.min(...allV) * 0.98, maxV = Math.max(...allV) * 1.02;
  const rng = maxV - minV || 1;
  const n = stratEq.length;
  const tx = i => pad.l + (i / Math.max(n-1,1)) * iw;
  const ty = v => pad.t + ih - ((v-minV)/rng)*ih;
  const sp = stratEq.map((v,i) => `${tx(i)},${ty(v)}`).join(' ');
  const qp = (qqqEq||[]).map((v,i) => `${tx(i)},${ty(v)}`).join(' ');
  const ticks = [minV, minV+rng*0.25, minV+rng*0.5, minV+rng*0.75, maxV];
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0]*1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1]*1000).getFullYear();
    for (let yr = startYear; yr <= endYear+1; yr++) {
      const targetTs = Date.UTC(yr,0,1)/1000;
      const idx = timestamps.findIndex(ts => ts >= targetTs);
      if (idx >= 0 && idx < n) timeTicks.push({ x: tx(idx), label: String(yr) });
    }
  }
  return (
    <svg width={W} height={H} style={{ display:'block' }}>
      {ticks.map((v,i) => (
        <Fragment key={i}>
          <line x1={pad.l} y1={ty(v)} x2={pad.l+iw} y2={ty(v)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3"/>
          <text x={pad.l-4} y={ty(v)+4} textAnchor="end" fill={T.textMuted} fontSize={9}>{((v-1)*100).toFixed(0)}%</text>
        </Fragment>
      ))}
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.border} strokeWidth="0.5"/>
      {timeTicks.map((tick,i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
      {qqqEq && qqqEq.length > 0 && <polyline points={qp} fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.7"/>}
      <polyline points={sp} fill="none" stroke="#4488ee" strokeWidth="2"/>
      <line x1={pad.l+10} y1={pad.t+10} x2={pad.l+26} y2={pad.t+10} stroke="#4488ee" strokeWidth="2"/>
      <text x={pad.l+30} y={pad.t+14} fill={T.textSub} fontSize={10}>策略</text>
      {qqqEq && qqqEq.length > 0 && <>
        <line x1={pad.l+72} y1={pad.t+10} x2={pad.l+88} y2={pad.t+10} stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3"/>
        <text x={pad.l+92} y={pad.t+14} fill={T.textSub} fontSize={10}>QQQ</text>
      </>}
    </svg>
  );
}

// ─── 回撤曲线图 ────────────────────────────────────────────────────────────────
function DrawdownChart({ drawdowns, timestamps, T }) {
  const W = 700, H = 130;
  const pad = { l:46, r:12, t:10, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const minV = Math.min(...drawdowns, -1) * 1.1;
  const n = drawdowns.length;
  const tx = i => pad.l + (i / Math.max(n-1,1)) * iw;
  const ty = v => pad.t + (1 - v/minV)*ih;
  const pts = drawdowns.map((v,i) => `${tx(i)},${ty(v)}`).join(' ');
  const fill = `${pad.l},${pad.t} ${pts} ${pad.l+iw},${pad.t}`;
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0]*1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1]*1000).getFullYear();
    for (let yr = startYear; yr <= endYear+1; yr++) {
      const targetTs = Date.UTC(yr,0,1)/1000;
      const idx = timestamps.findIndex(ts => ts >= targetTs);
      if (idx >= 0 && idx < n) timeTicks.push({ x: tx(idx), label: String(yr) });
    }
  }
  return (
    <svg width={W} height={H} style={{ display:'block' }}>
      <line x1={pad.l} y1={pad.t} x2={pad.l+iw} y2={pad.t} stroke={T.border} strokeWidth="0.5"/>
      <polygon points={fill} fill="#ee334428"/>
      <polyline points={pts} fill="none" stroke="#ee3344" strokeWidth="1.5"/>
      <text x={pad.l-4} y={ty(minV)+4} textAnchor="end" fill={T.textMuted} fontSize={9}>{minV.toFixed(1)}%</text>
      <text x={pad.l-4} y={pad.t+4}    textAnchor="end" fill={T.textMuted} fontSize={9}>0%</text>
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.border} strokeWidth="0.5"/>
      {timeTicks.map((tick,i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
    </svg>
  );
}

// ─── 年度收益柱状图 ────────────────────────────────────────────────────────────
function AnnualBarsChart({ stratAnnual, qqqAnnual, T }) {
  const W = 700, H = 160;
  const pad = { l:46, r:12, t:14, b:28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const years = [...new Set([...Object.keys(stratAnnual), ...Object.keys(qqqAnnual)])].sort();
  const allV = [...Object.values(stratAnnual), ...Object.values(qqqAnnual), 10, -10];
  const maxAbs = Math.max(Math.abs(Math.min(...allV)), Math.abs(Math.max(...allV)));
  const spacing = iw / years.length;
  const bw = spacing * 0.35;
  const zY = pad.t + ih/2;
  return (
    <svg width={W} height={H} style={{ display:'block' }}>
      <line x1={pad.l} y1={zY} x2={pad.l+iw} y2={zY} stroke={T.border} strokeWidth="1"/>
      <text x={pad.l-4} y={zY+4} textAnchor="end" fill={T.textMuted} fontSize={9}>0%</text>
      {years.map((yr, i) => {
        const sv = stratAnnual[yr] ?? 0;
        const qv = qqqAnnual[yr] ?? 0;
        const cx = pad.l + spacing*i + spacing/2;
        const svH = (sv/maxAbs)*(ih/2);
        const qvH = (qv/maxAbs)*(ih/2);
        return (
          <g key={yr}>
            <rect x={cx-bw-1} y={sv>=0?zY-svH:zY} width={bw} height={Math.abs(svH)} fill={sv>=0?'#4488ee99':'#ee334488'}/>
            <rect x={cx+1}   y={qv>=0?zY-qvH:zY} width={bw} height={Math.abs(qvH)} fill={qv>=0?'#88aabb66':'#ee334444'}/>
            <text x={cx} y={H-6} textAnchor="middle" fill={T.textMuted} fontSize={9}>{yr}</text>
          </g>
        );
      })}
      <rect x={pad.l+10} y={pad.t} width={10} height={8} fill="#4488ee99"/>
      <text x={pad.l+24} y={pad.t+8} fill={T.textSub} fontSize={9}>策略</text>
      <rect x={pad.l+62} y={pad.t} width={10} height={8} fill="#88aabb66"/>
      <text x={pad.l+76} y={pad.t+8} fill={T.textSub} fontSize={9}>QQQ</text>
    </svg>
  );
}

// ─── 月度收益热图 ──────────────────────────────────────────────────────────────
function MonthlyHeatmap({ monthlyRets, T }) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = Object.keys(monthlyRets).sort();
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ borderCollapse:'separate', borderSpacing:2, fontSize:10 }}>
        <thead>
          <tr>
            <th style={{ padding:'3px 8px', color:T.textSub, textAlign:'left', fontWeight:500 }}></th>
            {months.map((m,i) => <th key={i} style={{ padding:'2px 4px', color:T.textSub, textAlign:'center', fontWeight:400 }}>{m}</th>)}
            <th style={{ padding:'2px 6px', color:T.textSub, textAlign:'center', fontWeight:500 }}>年度</th>
          </tr>
        </thead>
        <tbody>
          {years.map(yr => {
            const yd = monthlyRets[yr] || {};
            const annRet = (Object.values(yd).reduce((p,r) => p*(1+r/100), 1)-1)*100;
            return (
              <tr key={yr}>
                <td style={{ padding:'2px 8px', color:T.textSub, fontWeight:500 }}>{yr}</td>
                {Array.from({length:12}, (_,mo) => {
                  const v = yd[mo];
                  const bg = v==null ? T.pageBg
                    : v>8?'#00aa4466':v>4?'#00aa4444':v>0?'#00aa4422'
                    : v>-4?'#ee334422':v>-8?'#ee334444':'#ee334466';
                  const tc = v==null ? T.textMuted : v>=0 ? '#00aa44' : '#ee3344';
                  return (
                    <td key={mo} style={{ padding:'3px 5px', textAlign:'center', borderRadius:3,
                      background:bg, color:tc, fontFamily:'monospace', minWidth:44, whiteSpace:'nowrap' }}>
                      {v==null ? '—' : (v>=0?'+':'')+v.toFixed(1)+'%'}
                    </td>
                  );
                })}
                <td style={{ padding:'2px 8px', textAlign:'center', fontFamily:'monospace', fontWeight:700,
                  color:annRet>=0?'#00aa44':'#ee3344' }}>
                  {(annRet>=0?'+':'')+annRet.toFixed(1)+'%'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 迷你折线图（SVG）────────────────────────────────────────────────────────
function MiniLineChart({ series, width = 480, height = 120, T }) {
  if (!series || series.length === 0 || series[0].data.length < 2) return null;

  const allVals = series.flatMap(s => s.data);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const n = series[0].data.length;

  const toX = i => (i / (n - 1)) * width;
  const toY = v => height - ((v - minV) / range) * height * 0.88 - height * 0.06;

  const polyline = data =>
    data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {/* 基准线 y=1 */}
      <line
        x1={0} y1={toY(1).toFixed(1)}
        x2={width} y2={toY(1).toFixed(1)}
        stroke={T.textMuted} strokeWidth={0.5} strokeDasharray="4,4"
      />
      {series.map((s, si) => (
        <polyline
          key={si}
          points={polyline(s.data)}
          fill="none"
          stroke={s.color}
          strokeWidth={si === 0 ? 1.8 : 1.2}
          strokeDasharray={si === 0 ? undefined : '5,3'}
          opacity={0.9}
        />
      ))}
      {/* 图例 */}
      {series.map((s, si) => (
        <g key={`lg-${si}`} transform={`translate(${si * 120}, ${height - 4})`}>
          <line x1={0} y1={0} x2={14} y2={0} stroke={s.color} strokeWidth={2} strokeDasharray={si > 0 ? '4,2' : undefined} />
          <text x={18} y={4} fontSize={9} fill={T.textSub}>{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── 简单指标卡（WFO 区域用）────────────────────────────────────────────────
function SimpleMetricCard({ label, value, sub, color, T }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 90 }}>
      <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? T.textBright, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── 双值对比指标卡（回测结果用，与 QQQ成分股轮动 一致）──────────────────────
function DualMetricCard({ label, strat, qqq, unit='', higherBetter=true, fmtFn=v=>v?.toFixed(2), alwaysRed=false, T }) {
  const good = alwaysRed ? false : higherBetter ? (strat??0) >= (qqq??strat??0) : (strat??0) <= (qqq??strat??0);
  return (
    <div style={{ padding:'10px 14px', background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, minWidth:130 }}>
      <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:good?'#00aa44':'#ee3344' }}>
        {strat != null ? fmtFn(strat)+unit : '—'}
      </div>
      {qqq != null && (
        <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>QQQ {fmtFn(qqq)}{unit}</div>
      )}
    </div>
  );
}

// ─── calcMetrics（小数）→ calcPortMetrics（百分比）格式转换 ──────────────────
function toPortMetrics(m) {
  if (!m) return null;
  const annualRets = {};
  for (const [yr, v] of Object.entries(m.annualReturns ?? {})) annualRets[yr] = v * 100;
  const monthlyRets = {};
  for (const [key, v] of Object.entries(m.monthlyReturns ?? {})) {
    const [yr, mo] = key.split('-');
    if (!monthlyRets[yr]) monthlyRets[yr] = {};
    monthlyRets[yr][parseInt(mo) - 1] = v * 100;
  }
  return {
    cagr:      (m.cagr      ?? 0) * 100,
    sharpe:     m.sharpe    ?? 0,
    mdd:       (m.mdd       ?? 0) * 100,
    total:     (m.totalReturn ?? 0) * 100,
    annualRets,
    monthlyRets,
    drawdowns: (m.drawdownCurve ?? []).map(v => v * 100),
  };
}

// ─── 参数选择器行 ─────────────────────────────────────────────────────────────
function ParamRow({ label, options, value, onChange, T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: T.textSub, minWidth: 70 }}>{label}</span>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11,
            background: value === opt.value ? (document.documentElement.style.colorScheme === 'light' ? '#0055cc' : '#005bcc') : 'transparent',
            border: `1px solid ${value === opt.value ? '#4488ee' : '#444'}`,
            color: value === opt.value ? '#fff' : T.textSub,
            fontWeight: value === opt.value ? 600 : 400,
          }}
        >{opt.label}</button>
      ))}
    </div>
  );
}

// ─── 格式化工具 ───────────────────────────────────────────────────────────────
const pct  = (v, d = 1) => v == null ? '—' : `${(v * 100).toFixed(d)}%`;
const fmt2 = v => v == null ? '—' : v.toFixed(2);
const fmtMoney = v => v == null ? '—' : `$${Math.round(v).toLocaleString()}`;

// ─── 策略规则卡（可折叠，默认收起）──────────────────────────────────────────
function StrategyRuleCard({ T, darkMode, params }) {
  const [open, setOpen] = useState(false);
  const freqLabel = { 5: '每周（5日）', 10: '每两周（10日）', 21: '每月（21日）' }[params.rebalFreq] || `${params.rebalFreq}日`;
  const lookbackLabel = { 20: '20日', 21: '1个月（21日）', 50: '50日', 63: '3个月（63日）', 126: '6个月（126日）', 200: '200日' }[params.lookback] || `${params.lookback}日`;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', width: '100%', textAlign: 'left',
          background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: T.textSub,
        }}
      >
        <span style={{ color: '#4488ee', fontWeight: 700 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 600 }}>策略规则</span>
        <span style={{ color: T.textMuted, marginLeft: 8 }}>
          回看{lookbackLabel} · Top{params.topN} · {freqLabel}
          {params.marketFilter ? ` · SMA200过滤→${params.defensiveAsset}` : ' · 无市场过滤'}
        </span>
      </button>
      {open && (
        <div style={{
          padding: '14px 18px', background: T.cardBg, border: `1px solid ${T.border}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', fontSize: 11, lineHeight: 1.9, color: T.textSub,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
            {/* 入场条件 */}
            <div>
              <div style={{ fontWeight: 700, color: '#4fc86e', marginBottom: 6, fontSize: 12 }}>入场条件</div>
              <div>· 对 QQQ 全部成分股（约90只）按单一回看期计算动能</div>
              <div>· 动能 = 当日收盘 / N日前收盘 − 1</div>
              <div>· 选排名前 <b style={{ color: T.textBright }}>Top {params.topN}</b>，等权持有</div>
              <div>· 仅入选动能为正的股票（ret &gt; 0）</div>
            </div>
            {/* 出场条件 */}
            <div>
              <div style={{ fontWeight: 700, color: '#ee3344', marginBottom: 6, fontSize: 12 }}>出场条件</div>
              <div>· 调仓日重新排名，不在 Top{params.topN} 的持仓<b style={{ color: '#ee3344' }}>全部清仓</b>（无缓冲区）</div>
              <div>· 个股动能转负 → 调仓日不再入选</div>
              <div>· 所有成分股动能均为负 → 全仓切换防御资产</div>
              <div>· 无独立止损 / 止盈 / 移动止损</div>
            </div>
            {/* 防御机制 */}
            <div>
              <div style={{ fontWeight: 700, color: '#e8883a', marginBottom: 6, fontSize: 12 }}>防御机制</div>
              <div>· 市场过滤：QQQ 收盘 &lt; SMA200 → 全仓切换至 <b style={{ color: '#e8883a' }}>{params.defensiveAsset}</b></div>
              <div>· 防御资产可选：CASH（现金）/ QQQ（买入持有）/ SHY（短期国债）</div>
            </div>
            {/* 执行方式 */}
            <div>
              <div style={{ fontWeight: 700, color: '#88bbff', marginBottom: 6, fontSize: 12 }}>执行方式</div>
              <div>· T 日收盘信号 → T+1 日开盘执行（MOO 模型）</div>
              <div>· 调仓频率：<b style={{ color: T.textBright }}>{freqLabel}</b></div>
              <div>· 回看窗口：<b style={{ color: T.textBright }}>{lookbackLabel}</b></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function QqqRotationTab({ histData, histTs, T, darkMode }) {

  // ── 手动回测参数 ──
  const [params, setParams] = useState({
    lookback: 63, topN: 5, rebalFreq: 21, marketFilter: true, defensiveAsset: 'SHY',
  });
  const [btResult,  setBtResult]  = useState(null);
  const [btRunning, setBtRunning] = useState(false);

  // ── 资金模拟 ──
  const [initCapital, setInitCapital] = useState('10000');

  // ── 网格搜索 ──
  const [gsResult,   setGsResult]   = useState(null);
  const [gsRunning,  setGsRunning]  = useState(false);
  const [gsProgress, setGsProgress] = useState({ done: 0, total: 288 });
  const [investAmount, setInvestAmount] = useState('10000');

  // ── WFO ──
  const [wfoResult,    setWfoResult]    = useState(null);
  const [wfoRunning,   setWfoRunning]   = useState(false);
  const [wfoOptMetric, setWfoOptMetric] = useState('sharpe');
  const [showWfo,      setShowWfo]      = useState(false);
  const [wfoPhase,     setWfoPhase]     = useState('');

  // ── 本地数据加载 ──
  const histAbortRef = useRef(null);
  const [histDataLocal, setHistDataLocal] = useState(null);
  const [histTsLocal,   setHistTsLocal]   = useState(null);
  const [histRange,     setHistRange]     = useState('3y');
  const [histLoading,   setHistLoading]   = useState(false);
  const [histProg,      setHistProg]      = useState({ done: 0, total: 0 });

  const loadHistData = useCallback(async () => {
    histAbortRef.current?.abort();
    const ctrl = new AbortController(); histAbortRef.current = ctrl;
    const { signal } = ctrl;
    setHistLoading(true); setHistProg({ done: 0, total: QQQ_COMPONENTS.length + 1 });
    setHistDataLocal(null); setHistTsLocal(null);
    setBtResult(null); setGsResult(null); setWfoResult(null);
    try {
      const qqqRaw = await fetchCandlesExtended('QQQ', histRange, signal);
      if (!qqqRaw) { setHistLoading(false); return; }
      const qqqTs  = qqqRaw.map(d => d.ts);
      const qqqAdj = qqqRaw.map(d => d.c);
      const qqqAdjOpen = qqqRaw.map(d => d.o);
      const tsIdx = new Map(qqqTs.map((t, i) => [t, i]));
      const Nq = qqqTs.length;
      setHistProg({ done: 1, total: QQQ_COMPONENTS.length + 1 });

      const rawMap = new Map();
      const BATCH = 5;
      for (let i = 0; i < QQQ_COMPONENTS.length; i += BATCH) {
        if (signal.aborted) break;
        await Promise.all(QQQ_COMPONENTS.slice(i, i + BATCH).map(async sym => {
          try {
            const raw = await fetchCandlesExtended(sym, histRange, signal);
            if (raw) rawMap.set(sym, raw);
          } catch (e) {}
        }));
        setHistProg({ done: i + BATCH + 1, total: QQQ_COMPONENTS.length + 1 });
        if (i + BATCH < QQQ_COMPONENTS.length && !signal.aborted) await new Promise(r => setTimeout(r, 300));
      }
      if (signal.aborted) return;

      const aligned = new Map();
      aligned.set('__QQQ__', { closes: qqqAdj, opens: qqqAdjOpen });
      for (const [sym, rows] of rawMap) {
        const closesArr = new Array(Nq).fill(null);
        const opensArr  = new Array(Nq).fill(null);
        for (const { c, o, ts: t } of rows) {
          const idx = tsIdx.get(t);
          if (idx !== undefined) { closesArr[idx] = c; opensArr[idx] = o; }
        }
        for (let j = 1; j < Nq; j++) {
          if (closesArr[j] === null && closesArr[j - 1] !== null) closesArr[j] = closesArr[j - 1];
          if (opensArr[j]  === null && opensArr[j - 1]  !== null) opensArr[j]  = opensArr[j - 1];
        }
        aligned.set(sym, { closes: closesArr, opens: opensArr });
      }
      try {
        const shyRaw = await fetchCandlesExtended('SHY', histRange, signal);
        if (shyRaw) {
          const shyClosesArr = new Array(Nq).fill(null);
          const shyOpensArr  = new Array(Nq).fill(null);
          for (const { c, o, ts: t } of shyRaw) {
            const idx = tsIdx.get(t);
            if (idx !== undefined) { shyClosesArr[idx] = c; shyOpensArr[idx] = o; }
          }
          for (let j = 1; j < Nq; j++) {
            if (shyClosesArr[j] === null && shyClosesArr[j - 1] !== null) shyClosesArr[j] = shyClosesArr[j - 1];
            if (shyOpensArr[j]  === null && shyOpensArr[j - 1]  !== null) shyOpensArr[j]  = shyOpensArr[j - 1];
          }
          aligned.set('SHY', { closes: shyClosesArr, opens: shyOpensArr });
        }
      } catch (e) { /* SHY 加载失败不影响整体 */ }

      setHistDataLocal(aligned); setHistTsLocal(qqqTs); setHistLoading(false);
    } catch (e) { if (!signal.aborted) { console.error(e); setHistLoading(false); } }
  }, [histRange]);

  // 使用本地数据优先，回退到 props
  const _data = histDataLocal || histData;
  const _ts   = histTsLocal   || histTs;

  // ── 数据未加载 ──
  if (!_data || !_ts || _ts.length === 0) {
    const histPct = histProg.total > 0 ? Math.round(histProg.done / histProg.total * 100) : 0;
    return (
      <div style={{ padding: '20px 28px' }}>
        <div style={{
          padding: '8px 14px', borderRadius: 6, marginBottom: 20, fontSize: 11, color: '#cc8800',
          background: darkMode ? '#1a1200' : '#fffbe6', border: '1px solid #cc880044',
        }}>
          ⚠️ 使用当前 QQQ 成分股回测，存在<strong>幸存者偏差</strong>（历史被剔除股票未计入）。结果仅供参考，不构成投资建议。不含交易成本。
        </div>

        <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 10 }}>STEP 0 · 加载历史数据</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: histLoading ? 12 : 0 }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>历史深度</span>
            {['2y', '3y', '5y', '10y'].map(r => (
              <button key={r} disabled={histLoading} onClick={() => setHistRange(r)} style={{
                padding: '4px 12px', borderRadius: 4, cursor: histLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: 11,
                background: histRange === r ? (darkMode ? '#005bcc' : '#0055cc') : 'transparent',
                border: `1px solid ${histRange === r ? '#4488ee' : T.btnBorder}`,
                color: histRange === r ? '#fff' : T.btnColor,
                fontWeight: histRange === r ? 600 : 400,
              }}>
                {r === '2y' ? '2年' : r === '3y' ? '3年' : r === '5y' ? '5年' : '10年'}
                {r === '10y' && <span style={{ fontSize: 8, marginLeft: 3, color: '#aa66ff', fontWeight: 700 }}>WFO</span>}
              </button>
            ))}
            <button disabled={histLoading} onClick={loadHistData} style={{
              padding: '5px 16px', borderRadius: 6, cursor: histLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 11,
              background: darkMode ? '#004488' : '#0055cc',
              border: '1px solid #4488ee', color: darkMode ? '#88ccff' : '#ffffff',
              opacity: histLoading ? 0.6 : 1,
            }}>
              {histLoading ? '加载中…' : '↓ 加载历史数据'}
            </button>
            {_data && !histLoading && (
              <span style={{ fontSize: 11, color: '#00aa44' }}>
                ✓ 已加载 {_data.size - 1} 只股票 × {histRange === '2y' ? '2年' : histRange === '3y' ? '3年' : histRange === '5y' ? '5年' : '10年'}数据
              </span>
            )}
          </div>
          {histLoading && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textSub, marginBottom: 4 }}>
                <span>正在拉取 {histProg.done} / {histProg.total}</span>
                <span>{histPct}%</span>
              </div>
              <div style={{ height: 3, background: T.barTrack ?? '#333', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${histPct}%`, height: '100%', background: 'linear-gradient(90deg,#005bcc,#00c96e)', borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>
        {!histLoading && (
          <div style={{ padding: '48px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 14, color: T.textBright, marginBottom: 8 }}>请先加载历史数据</div>
            <div style={{ fontSize: 11, color: T.textSub }}>
              选择历史深度后点击「加载历史数据」，或切换到「QQQ 成分股轮动」标签页加载
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 运行手动回测 ──
  const handleRunBacktest = useCallback(() => {
    setBtRunning(true);
    setBtResult(null);
    setTimeout(() => {
      try {
        const bt = backtestQqqRotation(_data, _ts, params);
        if (!bt) { setBtRunning(false); return; }
        const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
        if (!metrics) { setBtRunning(false); return; }

        // QQQ 买入持有基准
        const qqqCloses = _data.get('__QQQ__')?.closes ?? _data.get('__QQQ__');
        const startOffset = _ts.indexOf(bt.timestamps[0]);
        const qqqEq = buildQqqBenchmark(qqqCloses, startOffset, startOffset + bt.timestamps.length);
        const qqqMetrics = calcMetrics(qqqEq, bt.timestamps);

        setBtResult({ ...bt, metrics, portMetrics: toPortMetrics(metrics), qqqEq, qqqMetrics, qqqPortMetrics: toPortMetrics(qqqMetrics) });
      } catch (e) { console.error('QQQ rotation backtest error:', e); }
      setBtRunning(false);
    }, 50);
  }, [_data, _ts, params]);

  // ── 应用参数并立即运行回测（Step 2 表格行按钮用）──
  const handleApplyAndBacktest = useCallback((rowParams) => {
    setParams({ ...rowParams });
    setBtRunning(true);
    setBtResult(null);
    setTimeout(() => {
      try {
        const bt = backtestQqqRotation(_data, _ts, rowParams);
        if (!bt) { setBtRunning(false); return; }
        const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
        if (!metrics) { setBtRunning(false); return; }
        const qqqCloses = _data.get('__QQQ__')?.closes ?? _data.get('__QQQ__');
        const startOffset = _ts.indexOf(bt.timestamps[0]);
        const qqqEq = buildQqqBenchmark(qqqCloses, startOffset, startOffset + bt.timestamps.length);
        const qqqMetrics = calcMetrics(qqqEq, bt.timestamps);
        setBtResult({ ...bt, metrics, portMetrics: toPortMetrics(metrics), qqqEq, qqqMetrics, qqqPortMetrics: toPortMetrics(qqqMetrics) });
      } catch (e) { console.error('QQQ rotation backtest error:', e); }
      setBtRunning(false);
    }, 50);
  }, [_data, _ts]);

  // ── 运行网格搜索 ──
  const handleRunGridSearch = useCallback(async () => {
    setGsRunning(true);
    setGsResult(null);
    setGsProgress({ done: 0, total: 288 });
    try {
      const res = await runQqqGridSearch(
        _data, _ts, 0, null,
        (done, total) => setGsProgress({ done, total })
      );
      setGsResult(res);
    } catch (e) { console.error('QQQ grid search error:', e); }
    setGsRunning(false);
  }, [_data, _ts]);

  // ── 运行 WFO ──
  const handleRunWFO = useCallback(async () => {
    setWfoRunning(true);
    setWfoResult(null);
    setWfoPhase('IS Grid Search 运行中…');
    try {
      const res = await runQqqWFO(
        _data, _ts, wfoOptMetric,
        (phase, done, total) => {
          if (phase === 'is') setWfoPhase(`IS Grid Search ${done}/${total}…`);
          else                setWfoPhase('OOS 验证中…');
        }
      );
      setWfoResult(res);
    } catch (e) { console.error('QQQ WFO error:', e); }
    setWfoRunning(false);
    setWfoPhase('');
  }, [_data, _ts, wfoOptMetric]);

  // ── 当前操作信号（基于手动回测参数）──
  const signal = useMemo(() => {
    if (!_data || !_ts) return null;
    const N       = _ts.length;
    const sigIdx  = N - 1;
    const date    = new Date(_ts[sigIdx] * 1000).toISOString().slice(0, 10);

    const qqqData   = _data.get('__QQQ__');
    const qqqCloses = qqqData?.closes ?? qqqData;
    const shyData   = _data.get('SHY');
    const shyCloses = shyData?.closes ?? shyData ?? null;
    const symbols   = [..._data.keys()].filter(k => k !== '__QQQ__' && k !== 'SHY');

    const symCloses = new Map();
    for (const sym of symbols) {
      const d = _data.get(sym);
      symCloses.set(sym, d?.closes ?? d);
    }

    // 市场过滤检查
    let isDefensive = false, sma200 = null, qqqNow = qqqCloses?.[sigIdx];
    if (params.marketFilter && sigIdx >= 200) {
      let sum = 0, cnt = 0;
      for (let k = sigIdx - 199; k <= sigIdx; k++) {
        if (qqqCloses[k] != null) { sum += qqqCloses[k]; cnt++; }
      }
      sma200 = cnt === 200 ? sum / 200 : null;
      if (sma200 !== null && qqqNow < sma200) isDefensive = true;
    }

    if (isDefensive) {
      return { date, isDefensive: true, holdings: {}, prices: {}, qqqNow, sma200,
        defensiveAsset: params.defensiveAsset };
    }

    // 动能排名
    const scores = [];
    for (const [sym, closes] of symCloses.entries()) {
      if (!closes || sigIdx < params.lookback) continue;
      const curr = closes[sigIdx], prev = closes[sigIdx - params.lookback];
      if (curr == null || prev == null || prev === 0) continue;
      scores.push({ sym, ret: curr / prev - 1, price: closes[sigIdx] });
    }
    scores.sort((a, b) => b.ret - a.ret);
    const top = scores.slice(0, params.topN).filter(s => s.ret > 0);

    return {
      date, isDefensive: false, qqqNow, sma200,
      holdings: Object.fromEntries(top.map(r => [r.sym, 1 / top.length])),
      prices:   Object.fromEntries(top.map(r => [r.sym, r.price])),
      scores:   scores.slice(0, 10),
    };
  }, [_data, _ts, params]);

  // ── 持仓对比：上一期目标持仓 vs 本期目标持仓 ──
  const prevSignalRef = useRef(null);
  const prevSignal = prevSignalRef.current;
  const isFirstSignal = !prevSignal || Object.keys(prevSignal.holdings).length === 0;

  let sellList = [], buyList = [], holdList = [];

  if (signal && prevSignal && !isFirstSignal) {
    const prevSyms = new Set(Object.keys(prevSignal.holdings));
    const currSyms = new Set(Object.keys(signal.holdings));

    // 防御切换：从正常→防御 或 防御→正常 或 防御→另一防御
    const wasDefensive = prevSignal.isDefensive;
    const isDefensive  = signal.isDefensive;

    if (wasDefensive && !isDefensive) {
      // 从防御切回正常持仓
      const defSym = prevSignal.defensiveAsset || 'CASH';
      sellList.push({ sym: defSym, reason: '市场恢复，退出防御模式', price: null });
    }

    if (!wasDefensive && isDefensive) {
      // 触发防御：全部卖出
      for (const sym of prevSyms) {
        sellList.push({ sym, reason: '市场过滤触发 → 全仓切换防御', price: prevSignal.prices?.[sym] });
      }
    }

    if (!wasDefensive && !isDefensive) {
      // 正常调仓对比
      for (const sym of prevSyms) {
        if (currSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym === sym);
          const rank = se ? signal.scores.indexOf(se) + 1 : '?';
          holdList.push({ sym, reason: `仍在Top${params.topN}内(#${rank}，+${se ? (se.ret*100).toFixed(1) : '?'}%)`, price: signal.prices?.[sym] });
        } else {
          const se = signal.scores?.find(s => s.sym === sym);
          const reason = se
            ? (se.ret <= 0 ? '动能转负' : `跌出Top${params.topN}(#${signal.scores.indexOf(se)+1})`)
            : '数据缺失';
          sellList.push({ sym, reason, price: prevSignal.prices?.[sym] });
        }
      }
      for (const sym of currSyms) {
        if (!prevSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym === sym);
          const rank = se ? signal.scores.indexOf(se) + 1 : '?';
          buyList.push({ sym, reason: `新进Top${params.topN}(#${rank}，+${se ? (se.ret*100).toFixed(1) : '?'}%)`, price: signal.prices?.[sym] });
        }
      }
    } else if (wasDefensive && isDefensive) {
      // 防御未变
      const defSym = signal.defensiveAsset || 'CASH';
      holdList.push({ sym: defSym, reason: '继续防御', price: null });
    }

    if (isDefensive && !wasDefensive) {
      // 买入防御资产
      const defSym = signal.defensiveAsset || 'CASH';
      buyList.push({ sym: defSym, reason: '市场过滤触发 → 切换防御资产', price: null });
    }
  }

  // 更新 ref
  prevSignalRef.current = signal;

  // ── 资金流转摘要 ──
  let sellTotal = 0, buyTotal = 0;
  if (cap > 0 && sellList.length > 0) {
    sellTotal = sellList.reduce((s, x) => {
      const w = prevSignal?.holdings?.[x.sym] ?? 0;
      return s + cap * w;
    }, 0);
  }
  if (cap > 0 && buyList.length > 0) {
    buyTotal = buyList.reduce((s, x) => {
      const w = signal?.holdings?.[x.sym] ?? 0;
      return s + cap * w;
    }, 0);
  }
  const netFlow = sellTotal - buyTotal;

  const cap = parseFloat(investAmount) || 0;
  const gsPct = gsProgress.total > 0 ? Math.round(gsProgress.done / gsProgress.total * 100) : 0;

  // ── 日期格式化 ──
  const fmtDate = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';

  return (
    <div style={{ padding: '20px 28px' }}>

      {/* 免责声明 */}
      <div style={{
        padding: '8px 14px', borderRadius: 6, marginBottom: 20, fontSize: 11, color: '#cc8800',
        background: darkMode ? '#1a1200' : '#fffbe6', border: '1px solid #cc880044',
      }}>
        ⚠️ 使用当前 QQQ 成分股回测，存在<strong>幸存者偏差</strong>（历史被剔除股票未计入）。结果仅供参考，不构成投资建议。不含交易成本。
      </div>

      {/* ═══════ 策略规则卡（可折叠，默认收起）═══════ */}
      <StrategyRuleCard T={T} darkMode={darkMode} params={params} />

      {/* ═══════ STEP 1：固定参数回测 ═══════ */}
      <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 14 }}>STEP 1 · 固定参数回测</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <ParamRow label="动能回看期" T={T} value={params.lookback} onChange={v => setParams(p => ({ ...p, lookback: v }))}
            options={[{ value: 20, label: '20日' }, { value: 21, label: '1个月' }, { value: 50, label: '50日' }, { value: 63, label: '3个月' }, { value: 126, label: '6个月' }, { value: 200, label: '200日' }]} />
          <ParamRow label="持仓数量" T={T} value={params.topN} onChange={v => setParams(p => ({ ...p, topN: v }))}
            options={[{ value: 1, label: 'Top 1' }, { value: 3, label: 'Top 3' }, { value: 5, label: 'Top 5' }, { value: 10, label: 'Top 10' }]} />
          <ParamRow label="调仓频率" T={T} value={params.rebalFreq} onChange={v => setParams(p => ({ ...p, rebalFreq: v }))}
            options={[{ value: 5, label: '每周' }, { value: 10, label: '每两周' }, { value: 21, label: '每月' }]} />
          <ParamRow label="市场过滤" T={T} value={params.marketFilter} onChange={v => setParams(p => ({ ...p, marketFilter: v }))}
            options={[{ value: false, label: '关闭' }, { value: true, label: 'QQQ < SMA200' }]} />
          {params.marketFilter && (
            <ParamRow label="防御资产" T={T} value={params.defensiveAsset} onChange={v => setParams(p => ({ ...p, defensiveAsset: v }))}
              options={[{ value: 'CASH', label: '现金' }, { value: 'QQQ', label: 'QQQ' }, { value: 'SHY', label: 'SHY' }]} />
          )}
        </div>

        <button
          onClick={handleRunBacktest}
          disabled={btRunning}
          style={{
            padding: '6px 20px', borderRadius: 6, cursor: btRunning ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            background: darkMode ? '#004488' : '#0055cc',
            border: '1px solid #4488ee', color: '#fff',
            opacity: btRunning ? 0.6 : 1,
          }}
        >
          {btRunning ? '回测中…' : '▶ 运行回测'}
        </button>

        {/* 回测结果 */}
        {btResult && btResult.portMetrics && (
          <div style={{ marginTop: 20 }}>
            {/* 指标行：双值对比 */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <DualMetricCard label="CAGR（年化收益）" strat={btResult.portMetrics.cagr} qqq={btResult.qqqPortMetrics?.cagr} unit="%" fmtFn={v=>v.toFixed(1)} T={T}/>
              <DualMetricCard label="Sharpe Ratio" strat={btResult.portMetrics.sharpe} qqq={btResult.qqqPortMetrics?.sharpe} fmtFn={v=>v.toFixed(2)} T={T}/>
              <DualMetricCard label="最大回撤 MDD" strat={btResult.portMetrics.mdd} qqq={btResult.qqqPortMetrics?.mdd} unit="%" higherBetter={false} alwaysRed fmtFn={v=>v.toFixed(1)} T={T}/>
              <DualMetricCard label="累积收益" strat={btResult.portMetrics.total} qqq={btResult.qqqPortMetrics?.total} unit="%" fmtFn={v=>v.toFixed(1)} T={T}/>
              <div style={{ padding:'10px 14px', background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, minWidth:120 }}>
                <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:4 }}>换仓次数</div>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:T.textBright }}>{btResult.tradeLog?.length ?? '—'}</div>
                <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>含买入操作</div>
              </div>
            </div>

            {/* 资金模拟 */}
            {(() => {
              const c = parseFloat(initCapital);
              const eq = btResult.equityCurve;
              const qEq = btResult.qqqEq;
              const finalStrat = !isNaN(c) && eq?.length ? c * eq[eq.length-1] : null;
              const finalQQQ   = !isNaN(c) && qEq?.length ? c * qEq[qEq.length-1] : null;
              const fmtM = v => v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : `${v.toFixed(0)}`;
              return (
                <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:16, padding:'10px 16px', background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8 }}>
                  <span style={{ fontSize:11, color:T.textSub, whiteSpace:'nowrap' }}>起始资金</span>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize:12, color:T.textMuted }}>$</span>
                    <input type="number" value={initCapital} onChange={e => setInitCapital(e.target.value)}
                      style={{ width:110, padding:'4px 8px', background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:4, color:T.textBright, fontFamily:'inherit', fontSize:12 }}/>
                  </div>
                  {finalStrat != null && (
                    <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:T.textMuted }}>策略最终:&nbsp;
                        <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:14, color:finalStrat>=c?'#00aa44':'#ee3344' }}>${fmtM(finalStrat)}</span>
                      </span>
                      <span style={{ fontSize:12, color:T.textMuted }}>QQQ最终:&nbsp;
                        <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:14, color:finalQQQ!=null&&finalQQQ>=c?'#00aa44':'#ee3344' }}>{finalQQQ!=null?`$${fmtM(finalQQQ)}`:'—'}</span>
                      </span>
                      {finalQQQ != null && <span style={{ fontSize:11, fontFamily:'monospace', color:finalStrat>=finalQQQ?'#00aa44':'#ee3344' }}>
                        {finalStrat>=finalQQQ?'▲':'▼'} {((finalStrat-finalQQQ)/finalQQQ*100).toFixed(1)}% vs QQQ
                      </span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 净值曲线 */}
            <div style={{ background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:12, overflowX:'auto' }}>
              <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:8 }}>净值曲线（策略 vs QQQ）</div>
              <EquityCurveChart stratEq={btResult.equityCurve} qqqEq={btResult.qqqEq} timestamps={btResult.timestamps} T={T}/>
            </div>

            {/* 回撤曲线 */}
            <div style={{ background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:12, overflowX:'auto' }}>
              <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:8 }}>回撤曲线</div>
              <DrawdownChart drawdowns={btResult.portMetrics.drawdowns} timestamps={btResult.timestamps} T={T}/>
            </div>

            {/* 年度收益柱状图 */}
            <div style={{ background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:12, overflowX:'auto' }}>
              <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:8 }}>年度收益对比</div>
              <AnnualBarsChart stratAnnual={btResult.portMetrics.annualRets} qqqAnnual={btResult.qqqPortMetrics?.annualRets ?? {}} T={T}/>
            </div>

            {/* 月度收益热图 */}
            <div style={{ background:T.pageBg, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:12 }}>
              <div style={{ fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:10 }}>月度收益热图（策略）</div>
              <MonthlyHeatmap monthlyRets={btResult.portMetrics.monthlyRets} T={T}/>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ 调仓指令面板 ═══════ */}
      {signal && (
        <div style={{
          padding: '14px 18px', borderRadius: 8, marginBottom: 20,
          background: darkMode ? '#0d1f10' : '#f0faf2',
          border: `1px solid ${T.border}`,
          borderLeft: `4px solid ${signal.isDefensive ? '#e8883a' : '#4fc86e'}`,
        }}>
          {/* 标题行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>📡 调仓指令</span>
            <span style={{ fontSize: 10, color: T.textMuted }}>{signal.date}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: signal.isDefensive ? '#e8883a' : '#4fc86e' }}>
              {signal.isDefensive
                ? `⚠️ 防御模式 → ${signal.defensiveAsset}`
                : `🟢 持仓 Top ${Object.keys(signal.holdings).length}`}
            </span>
          </div>

          {/* 市场状态 */}
          {params.marketFilter && signal.qqqNow != null && signal.sma200 != null && (
            <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10 }}>
              QQQ <strong style={{ color: T.textBright }}>${signal.qqqNow.toFixed(1)}</strong>
              {' vs SMA200 '}<strong style={{ color: T.textBright }}>${signal.sma200.toFixed(1)}</strong>
              {' — '}
              <span style={{ color: signal.isDefensive ? '#e8883a' : '#4fc86e', fontWeight: 600 }}>
                {signal.isDefensive ? '低于均线，切换防御' : '高于均线，正常持仓'}
              </span>
            </div>
          )}

          {/* ── 操作清单 ── */}
          {isFirstSignal && !signal.isDefensive && (
            <div style={{ fontSize: 11, color: '#4fc86e', marginBottom: 12, padding: '8px 12px', background: '#4fc86e14', borderRadius: 6, border: '1px solid #4fc86e33' }}>
              🟢 <b>初始建仓</b> — 首次信号，按以下目标持仓等权买入
            </div>
          )}
          {isFirstSignal && signal.isDefensive && (
            <div style={{ fontSize: 11, color: '#e8883a', marginBottom: 12, padding: '8px 12px', background: '#e8883a14', borderRadius: 6, border: '1px solid #e8883a33' }}>
              ⚠️ <b>市场过滤触发</b> — 首次信号即处于防御模式，建议持现金等待
            </div>
          )}

          {!isFirstSignal && (sellList.length > 0 || buyList.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              {/* 卖出清单 */}
              {sellList.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#ee3344', fontWeight: 700, marginBottom: 4 }}>
                    🔴 卖出（{sellList.length}只）
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {sellList.map(({ sym, reason, price }) => (
                      <div key={sym} style={{
                        padding: '5px 10px', borderRadius: 4, fontSize: 10,
                        background: '#ee334411', border: '1px solid #ee334433',
                      }}>
                        <span style={{ fontWeight: 700, color: '#ee3344', fontFamily: 'monospace' }}>{sym}</span>
                        {price != null && <span style={{ color: T.textMuted, marginLeft: 4 }}>${price.toFixed(1)}</span>}
                        <div style={{ color: T.textMuted, fontSize: 9, marginTop: 1 }}>{reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 买入清单 */}
              {buyList.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#4fc86e', fontWeight: 700, marginBottom: 4 }}>
                    🟢 买入（{buyList.length}只）
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {buyList.map(({ sym, reason, price }) => (
                      <div key={sym} style={{
                        padding: '5px 10px', borderRadius: 4, fontSize: 10,
                        background: '#4fc86e11', border: '1px solid #4fc86e33',
                      }}>
                        <span style={{ fontWeight: 700, color: '#4fc86e', fontFamily: 'monospace' }}>{sym}</span>
                        {price != null && <span style={{ color: T.textMuted, marginLeft: 4 }}>${price.toFixed(1)}</span>}
                        <div style={{ color: T.textMuted, fontSize: 9, marginTop: 1 }}>{reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 继续持有清单 */}
              {holdList.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#4488ee', fontWeight: 700, marginBottom: 4 }}>
                    🔵 继续持有（{holdList.length}只）
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {holdList.map(({ sym, reason, price }) => (
                      <div key={sym} style={{
                        padding: '5px 10px', borderRadius: 4, fontSize: 10,
                        background: '#4488ee11', border: '1px solid #4488ee33',
                      }}>
                        <span style={{ fontWeight: 700, color: '#4488ee', fontFamily: 'monospace' }}>{sym}</span>
                        {price != null && <span style={{ color: T.textMuted, marginLeft: 4 }}>${price.toFixed(1)}</span>}
                        <div style={{ color: T.textMuted, fontSize: 9, marginTop: 1 }}>{reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 资金流转摘要 ── */}
          {!isFirstSignal && cap > 0 && (sellList.length > 0 || buyList.length > 0) && (
            <div style={{
              padding: '8px 12px', marginBottom: 12, borderRadius: 6,
              background: T.pageBg, border: `1px solid ${T.border}`,
              fontSize: 11, color: T.textSub, lineHeight: 1.8,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 2, color: T.textBright }}>💰 资金流转摘要</div>
              {sellList.length > 0 && (
                <div>🔴 卖出回收：<b style={{ color: '#ee3344', fontFamily: 'monospace' }}>{fmtMoney(sellTotal)}</b></div>
              )}
              {buyList.length > 0 && (
                <div>🟢 买入需要：<b style={{ color: '#4fc86e', fontFamily: 'monospace' }}>{fmtMoney(buyTotal)}</b></div>
              )}
              <div>
                {netFlow > 0.005 ? (
                  <span>净回笼现金：<b style={{ color: '#e8883a', fontFamily: 'monospace' }}>{fmtMoney(netFlow)}</b>（可保留或按比例再分配）</span>
                ) : netFlow < -0.005 ? (
                  <span>净追加投入：<b style={{ color: '#4fc86e', fontFamily: 'monospace' }}>{fmtMoney(Math.abs(netFlow))}</b></span>
                ) : (
                  <span>资金平衡，无需额外操作</span>
                )}
              </div>
            </div>
          )}

          {/* ── 投入金额 ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: T.textSub }}>投入金额</span>
            <span style={{ fontSize: 11, color: T.textSub }}>$</span>
            <input
              type="number" value={investAmount} min={0} step={1000}
              onChange={e => setInvestAmount(e.target.value)}
              style={{
                width: 100, padding: '4px 8px', borderRadius: 4,
                background: T.pageBg, border: `1px solid ${T.border}`,
                color: T.textBright, fontSize: 12, fontFamily: 'inherit',
              }}
            />
          </div>

          {/* ── 目标持仓明细 ── */}
          {!signal.isDefensive && Object.keys(signal.holdings).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6 }}>
                目标持仓 · 等权持有 · 每只 {pct(Object.values(signal.holdings)[0])}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(signal.holdings).map(([sym, w]) => {
                  const price   = signal.prices[sym];
                  const alloc   = cap * w;
                  const shares  = price > 0 ? alloc / price : 0;
                  return (
                    <div key={sym} style={{
                      padding: '8px 12px', borderRadius: 6, minWidth: 110,
                      background: T.pageBg, border: `1px solid ${T.border}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.textBright, marginBottom: 2 }}>{sym}</div>
                      {price != null && <div style={{ fontSize: 10, color: T.textMuted }}>现价 ${price.toFixed(2)}</div>}
                      {cap > 0 && (
                        <>
                          <div style={{ fontSize: 11, color: '#4fc86e', fontWeight: 600 }}>{fmtMoney(alloc)}</div>
                          <div style={{ fontSize: 10, color: T.textMuted }}>≈ {shares.toFixed(2)} 股</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 防御模式目标 */}
          {signal.isDefensive && (
            <div style={{ fontSize: 12, color: '#e8883a', padding: '8px 12px', background: '#e8883a14', borderRadius: 6, border: '1px solid #e8883a33' }}>
              目标持仓：<b>{signal.defensiveAsset}</b>
              {cap > 0 && <span>，共 {fmtMoney(cap)}</span>}
            </div>
          )}
        </div>
      )}


      {/* ═══════ STEP 2：一键优化 ═══════ */}
      <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 10 }}>STEP 2 · 一键优化（288种参数组合）</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: gsRunning ? 12 : 0 }}>
          <button
            onClick={handleRunGridSearch}
            disabled={gsRunning}
            style={{
              padding: '6px 20px', borderRadius: 6, cursor: gsRunning ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: gsRunning ? (darkMode ? '#333' : '#ccc') : (darkMode ? '#440088' : '#6600cc'),
              border: `1px solid ${gsRunning ? '#555' : '#8844ee'}`,
              color: gsRunning ? T.textMuted : '#fff',
              opacity: gsRunning ? 0.7 : 1,
            }}
          >
            {gsRunning ? `优化中… ${gsPct}%` : '⚡ 一键优化'}
          </button>

          {/* 投入金额（网格搜索专用输入）*/}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: T.textSub }}>模拟投入</span>
            <span style={{ fontSize: 11, color: T.textSub }}>$</span>
            <input
              type="number" value={investAmount} min={0} step={1000}
              onChange={e => setInvestAmount(e.target.value)}
              style={{
                width: 100, padding: '4px 8px', borderRadius: 4,
                background: T.pageBg, border: `1px solid ${T.border}`,
                color: T.textBright, fontSize: 12, fontFamily: 'inherit',
              }}
            />
          </div>

          {gsResult && !gsRunning && (
            <span style={{ fontSize: 11, color: '#00aa44' }}>
              ✓ 完成 {gsResult.length} 种有效组合
            </span>
          )}
        </div>

        {/* 进度条 */}
        {gsRunning && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textSub, marginBottom: 4 }}>
              <span>{gsProgress.done} / {gsProgress.total} 组合</span>
              <span>{gsPct}%</span>
            </div>
            <div style={{ height: 3, background: T.barTrack ?? '#333', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${gsPct}%`, height: '100%', background: 'linear-gradient(90deg,#6600cc,#00c96e)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* 结果表格 */}
        {gsResult && gsResult.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: T.textSub, marginBottom: 8 }}>
              按综合评分排序（Sharpe×40% + MDD×35% + CAGR×25%）
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
                <thead>
                  <tr style={{ background: T.pageBg }}>
                    {['排名', '参数组合', '夏普', 'CAGR', 'MDD', '总收益', `$${(parseFloat(investAmount)||10000).toLocaleString()} → 最终金额`, '综合评分', '操作'].map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', textAlign: i <= 1 || i === 8 ? 'left' : 'right', fontWeight: 600, color: T.textSub, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gsResult.slice(0, 30).map((r, i) => {
                    const inv = parseFloat(investAmount) || 10000;
                    const finalAmt = inv * (1 + r.totalReturn);
                    const isTop = i === 0;
                    return (
                      <tr
                        key={i}
                        style={{ background: isTop ? (darkMode ? '#001a00' : '#f0fff0') : 'transparent', cursor: 'pointer' }}
                        onClick={() => setParams({ ...r.params })}
                      >
                        <td style={{ padding: '5px 10px', color: isTop ? '#4fc86e' : T.textMuted, fontWeight: isTop ? 700 : 400, borderBottom: `1px solid ${T.border}44` }}>
                          {isTop ? '🏆' : `#${i + 1}`}
                        </td>
                        <td style={{ padding: '5px 10px', color: T.textBright, borderBottom: `1px solid ${T.border}44`, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {paramLabelQqq(r.params)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: r.sharpe > 1 ? '#4fc86e' : r.sharpe > 0.5 ? '#f0c040' : '#e05050', borderBottom: `1px solid ${T.border}44` }}>
                          {fmt2(r.sharpe)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: r.cagr > 0 ? '#4fc86e' : '#e05050', borderBottom: `1px solid ${T.border}44` }}>
                          {pct(r.cagr)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: r.mdd > -0.2 ? '#4fc86e' : r.mdd > -0.35 ? '#f0c040' : '#e05050', borderBottom: `1px solid ${T.border}44` }}>
                          {pct(r.mdd)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: r.totalReturn > 0 ? '#4fc86e' : '#e05050', borderBottom: `1px solid ${T.border}44` }}>
                          {pct(r.totalReturn, 0)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: isTop ? 700 : 400, color: finalAmt > inv ? '#4fc86e' : '#e05050', borderBottom: `1px solid ${T.border}44` }}>
                          {fmtMoney(finalAmt)}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: T.textSub, borderBottom: `1px solid ${T.border}44` }}>
                          {(r.compositeScore * 100).toFixed(0)}
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}44` }}>
                          <button
                            onClick={e => { e.stopPropagation(); handleApplyAndBacktest(r.params); }}
                            style={{
                              padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                              background: darkMode ? '#004488' : '#0055cc',
                              border: '1px solid #4488ee', color: '#fff',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            应用并回测
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
              点击「应用并回测」→ 参数载入 Step 1 并立即运行回测 · 点击任意行仅载入参数
            </div>
          </div>
        )}
      </div>

      {/* ═══════ STEP 3：Walk Forward Optimization ═══════ */}
      <div style={{ marginBottom: 20 }}>
        {/* 折叠按钮 */}
        <button
          onClick={() => setShowWfo(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', width: '100%', textAlign: 'left',
            background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: showWfo ? '8px 8px 0 0' : 8,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, color: T.textSub,
          }}
        >
          <span style={{ color: '#aa66ff', fontWeight: 700 }}>{showWfo ? '▼' : '▶'}</span>
          <span style={{ background: '#5522aa', color: '#ddb8ff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: 1 }}>MODE B</span>
          Walk Forward Optimization（单窗口：前 70% IS 训练 → 后 30% OOS 验证）
          {wfoResult && <span style={{ marginLeft: 'auto', color: '#00aa44', fontSize: 10 }}>✓ 已完成</span>}
        </button>

        {showWfo && (
          <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px' }}>

            {/* 说明 */}
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 10, lineHeight: 1.7 }}>
              <b style={{ color: T.textSub }}>单窗口 WFO 逻辑</b>（推荐先加载 10 年数据）：
              ① 前 70% 数据做 in-sample，跑 Grid Search（288 种组合）→
              ② 按优化指标选最佳参数 →
              ③ <b style={{ color: '#88bbff' }}>固定该参数</b>跑后 30% out-of-sample →
              ④ 记录 OOS 绩效（不重新选参，不事后调整）。
              <span style={{ color: '#88bbff', marginLeft: 6 }}>
                🔒 <b>IS / OOS 参数严格一致</b>：OOS 使用的参数 = IS Grid Search 选出的最优参数。
              </span>
            </div>

            {/* IS 优化指标选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: T.textSub, whiteSpace: 'nowrap' }}>in-sample 优化指标：</span>
              {[{ v: 'sharpe', l: 'Sharpe（推荐）' }, { v: 'cagr', l: 'CAGR' }, { v: 'calmar', l: 'Calmar (CAGR/MDD)' }].map(({ v, l }) => (
                <button key={v} onClick={() => setWfoOptMetric(v)} style={{
                  padding: '4px 10px', fontSize: 10, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                  background: wfoOptMetric === v ? (darkMode ? '#004488' : '#0055cc') : 'transparent',
                  border: `1px solid ${wfoOptMetric === v ? '#4488ee' : T.border}`,
                  color: wfoOptMetric === v ? '#fff' : T.textSub,
                  fontWeight: wfoOptMetric === v ? 600 : 400,
                }}>{l}</button>
              ))}
            </div>

            {/* 运行按钮 */}
            <button
              disabled={wfoRunning}
              onClick={handleRunWFO}
              style={{
                padding: '6px 20px', borderRadius: 6, cursor: wfoRunning ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: darkMode ? '#220044' : '#5522aa',
                border: '1px solid #9966ee', color: darkMode ? '#cc99ff' : '#fff',
                opacity: wfoRunning ? 0.6 : 1, marginBottom: 16,
              }}
            >
              {wfoRunning ? `⏳ ${wfoPhase || '运行中（288种参数组合）…'}` : '▶ 运行 Walk Forward Optimization'}
            </button>

            {/* WFO 结果 */}
            {wfoResult && (() => {
              const cm = wfoResult.combinedMetrics;
              const qm = wfoResult.qqqCombinedMetrics;
              const optLabel = { sharpe: 'Sharpe', cagr: 'CAGR', calmar: 'Calmar' }[wfoResult.optMetric] || wfoResult.optMetric;

              const lbLabel  = p => ({ 20: '20D', 21: '1M', 50: '50D', 63: '3M', 126: '6M', 200: '200D' }[p.lookback] ?? `${p.lookback}D`);
              const rfLabel  = p => ({ 5: '每周', 10: '每两周', 21: '每月' }[p.rebalFreq] ?? `${p.rebalFreq}D`);
              const mfLabel  = p => p.marketFilter ? `SMA200→${p.defensiveAsset}` : '无过滤';
              const fmtDate  = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';
              const fmtPct   = (v, d = 1) => v == null ? '—' : `${(v * 100).toFixed(d)}%`;

              return (
                <>
                  {/* 运行摘要 */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, padding: '10px 14px', background: T.pageBg, border: `1px solid ${T.border}`, borderRadius: 7, fontSize: 10 }}>
                    <span style={{ color: T.textSub }}>模式：<b style={{ color: '#cc99ff' }}>单窗口 70% IS / 30% OOS</b></span>
                    <span style={{ color: T.textSub }}>IS 天数：<b style={{ color: T.textBright }}>{wfoResult.inDays}</b></span>
                    <span style={{ color: T.textSub }}>OOS 天数：<b style={{ color: T.textBright }}>{wfoResult.outDays}</b></span>
                    <span style={{ color: T.textSub }}>Grid Search：<b style={{ color: T.textBright }}>{wfoResult.totalCombos}</b> 种组合</span>
                    <span style={{ color: T.textSub }}>IS 优化指标：<b style={{ color: '#cc99ff' }}>{optLabel}</b></span>
                  </div>

                  {/* 参数一致性说明 */}
                  <div style={{ padding: '8px 12px', marginBottom: 10, background: '#4488ee14', border: '1px solid #4488ee40', borderRadius: 6, fontSize: 10, color: T.textSub, lineHeight: 1.6 }}>
                    ⚡ <b style={{ color: '#88bbff' }}>参数一致性保证</b>：OOS 期间严格使用 IS 期选出的最佳参数，
                    <b style={{ color: T.textBright }}>不重新优化、不事后调参</b>。
                    下表参数列（紫色）同时标注 IS 选参结果 = OOS 实际使用参数。
                  </div>

                  {/* 窗口明细表 */}
                  <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 10, minWidth: 1000 }}>
                      <thead>
                        <tr>
                          {[
                            { h: '#',                    group: '' },
                            { h: 'IS 开始',              group: 'is',    note: 'In-Sample Start' },
                            { h: 'IS 结束',              group: 'is',    note: 'In-Sample End' },
                            { h: 'OOS 开始',             group: 'oos',   note: 'Out-of-Sample Start' },
                            { h: 'OOS 结束',             group: 'oos',   note: 'Out-of-Sample End' },
                            { h: 'Selected Lookback',    group: 'param', note: 'IS→OOS 参数一致' },
                            { h: 'Selected TopN',        group: 'param', note: 'IS→OOS 参数一致' },
                            { h: 'Selected Rebalance',   group: 'param', note: 'IS→OOS 参数一致' },
                            { h: 'Selected Filter',      group: 'param', note: 'IS→OOS 参数一致' },
                            { h: `IS ${optLabel} Score`, group: '',      note: 'in-sample 优化得分' },
                            { h: 'OOS CAGR',             group: 'oos',   note: 'Out-of-Sample' },
                            { h: 'OOS Sharpe',           group: 'oos',   note: 'Out-of-Sample' },
                            { h: 'OOS MDD',              group: 'oos',   note: 'Out-of-Sample' },
                            { h: 'OOS Total Ret',        group: 'oos',   note: 'Out-of-Sample' },
                            { h: 'QQQ CAGR',             group: '',      note: '同期基准' },
                            { h: '操作',                 group: '',      note: '' },
                          ].map(({ h, group, note }) => (
                            <th key={h} style={{
                              padding: '6px 10px', textAlign: 'left', fontWeight: 500, fontSize: 9,
                              background: T.pageBg, boxShadow: `0 1px 0 ${T.border}`, whiteSpace: 'nowrap',
                              color: group === 'param' ? '#cc99ff' : group === 'oos' ? '#88bbff' : T.textSub,
                            }}>
                              {h}
                              {note && <div style={{ fontSize: 8, color: T.textMuted, fontWeight: 400 }}>{note}</div>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wfoResult.windowResults.map((w, i) => {
                          const bp = w.bestParams;
                          const isScore = wfoResult.optMetric === 'cagr' ? w.inSampleCAGR : w.inSampleSharpe;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? T.cardBg : T.pageBg }}>
                              <td style={{ padding: '7px 10px', color: T.textMuted, textAlign: 'center', fontWeight: 700 }}>{w.winIdx}</td>
                              <td style={{ padding: '7px 10px', color: T.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(w.inTsStart)}</td>
                              <td style={{ padding: '7px 10px', color: T.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(w.inTsEnd)}</td>
                              <td style={{ padding: '7px 10px', color: T.textBright, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(w.outTsStart)}</td>
                              <td style={{ padding: '7px 10px', color: T.textBright, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(w.outTsEnd)}</td>
                              <td style={{ padding: '7px 10px', color: '#cc99ff', fontWeight: 700 }}>{lbLabel(bp)}</td>
                              <td style={{ padding: '7px 10px', color: '#cc99ff', fontWeight: 700 }}>Top {bp.topN}</td>
                              <td style={{ padding: '7px 10px', color: '#cc99ff' }}>{rfLabel(bp)}</td>
                              <td style={{ padding: '7px 10px', color: '#cc99ff', whiteSpace: 'nowrap' }}>{mfLabel(bp)}</td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: T.textSub }}>{isScore != null ? isScore.toFixed(2) : '—'}</td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: (w.outMetrics?.cagr ?? 0) >= 0 ? '#00aa44' : '#ee3344' }}>
                                {w.outMetrics ? fmtPct(w.outMetrics.cagr) : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: T.textBright }}>
                                {w.outMetrics ? w.outMetrics.sharpe.toFixed(2) : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#ee3344' }}>
                                {w.outMetrics ? fmtPct(w.outMetrics.mdd) : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: (w.outMetrics?.totalReturn ?? 0) >= 0 ? '#00aa44' : '#ee3344' }}>
                                {w.outMetrics ? fmtPct(w.outMetrics.totalReturn) : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: (w.qqqOutMetrics?.cagr ?? 0) >= 0 ? '#00aa44' : '#ee3344' }}>
                                {w.qqqOutMetrics ? fmtPct(w.qqqOutMetrics.cagr) : '—'}
                              </td>
                              <td style={{ padding: '5px 8px' }}>
                                <button
                                  onClick={() => handleApplyAndBacktest(bp)}
                                  style={{
                                    padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                                    fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                                    background: darkMode ? '#004488' : '#0055cc',
                                    border: '1px solid #4488ee', color: '#fff',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  应用并回测
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* OOS 总绩效指标 */}
                  <div style={{ fontSize: 10, color: T.textSub, letterSpacing: 1, marginBottom: 8 }}>
                    Mode B · WFO OOS 绩效（out-of-sample，无事后挑选）
                  </div>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                    {cm && [
                      { label: 'OOS CAGR',   value: fmtPct(cm.cagr),         sub: qm ? `QQQ ${fmtPct(qm.cagr)}` : null,   color: cm.cagr >= 0 ? '#4fc86e' : '#e05050' },
                      { label: 'OOS Sharpe', value: cm.sharpe.toFixed(2),     sub: qm ? `QQQ ${qm.sharpe.toFixed(2)}` : null, color: cm.sharpe > 1 ? '#4fc86e' : cm.sharpe > 0.5 ? '#f0c040' : '#e05050' },
                      { label: 'OOS MDD',    value: fmtPct(cm.mdd),           sub: qm ? `QQQ ${fmtPct(qm.mdd)}` : null,   color: cm.mdd > -0.2 ? '#4fc86e' : cm.mdd > -0.35 ? '#f0c040' : '#e05050' },
                      { label: 'OOS 总收益', value: fmtPct(cm.totalReturn),   sub: qm ? `QQQ ${fmtPct(qm.totalReturn)}` : null, color: cm.totalReturn >= 0 ? '#4fc86e' : '#e05050' },
                    ].map((m, i) => <SimpleMetricCard key={i} label={m.label} value={m.value} sub={m.sub} color={m.color} T={T} />)}
                  </div>

                  {/* OOS 净值曲线 */}
                  {wfoResult.allOutEquity.length > 10 && (
                    <div style={{ background: T.pageBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 16px', overflowX: 'auto', marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: T.textSub, marginBottom: 8 }}>
                        WFO OOS 净值曲线（策略 实线 vs QQQ 虚线）
                      </div>
                      <MiniLineChart
                        T={T}
                        series={[
                          { data: wfoResult.allOutEquity, color: '#4fc86e', label: 'OOS 策略' },
                          ...(wfoResult.qqqWfoEq?.length > 1 ? [{ data: wfoResult.qqqWfoEq, color: '#5588cc', label: 'QQQ 基准' }] : []),
                        ]}
                        width={560} height={130}
                      />
                    </div>
                  )}

                  {/* Mode A vs Mode B 对比表 */}
                  {btResult?.metrics && cm && (() => {
                    const sa = btResult.metrics;
                    const rows = [
                      { mode: 'Mode A · Fixed Param Backtest（全量数据，含 in-sample）',        cagr: sa.cagr,  sharpe: sa.sharpe,  mdd: sa.mdd,  total: sa.totalReturn },
                      { mode: 'Mode B · WFO OOS（纯 out-of-sample，无事后挑参）',               cagr: cm.cagr,  sharpe: cm.sharpe,  mdd: cm.mdd,  total: cm.totalReturn },
                      { mode: 'QQQ Buy & Hold（同 OOS 期间基准）',                             cagr: qm?.cagr, sharpe: qm?.sharpe, mdd: qm?.mdd, total: qm?.totalReturn },
                    ];
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: T.textSub, letterSpacing: 1, marginBottom: 8 }}>Mode A vs Mode B 最终对比</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 10, minWidth: 580 }}>
                            <thead>
                              <tr>
                                {['模式', 'CAGR', 'Sharpe', 'MDD', '累积收益'].map(h => (
                                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, fontSize: 9, background: T.pageBg, boxShadow: `0 1px 0 ${T.border}`, color: T.textSub }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} style={{ background: i === 1 ? (darkMode ? '#1a0033' : '#f3eeff') : i === 2 ? (darkMode ? '#111' : '#f5f5f5') : T.cardBg }}>
                                  <td style={{ padding: '7px 12px', color: i === 1 ? '#cc99ff' : i === 2 ? T.textMuted : T.textSub, fontSize: 10 }}>{r.mode}</td>
                                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 700, color: (r.cagr ?? 0) >= 0 ? '#00aa44' : '#ee3344' }}>{r.cagr != null ? fmtPct(r.cagr) : '—'}</td>
                                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: T.textBright }}>{r.sharpe != null ? r.sharpe.toFixed(2) : '—'}</td>
                                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#ee3344' }}>{r.mdd != null ? fmtPct(r.mdd) : '—'}</td>
                                  <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: (r.total ?? 0) >= 0 ? '#00aa44' : '#ee3344' }}>{r.total != null ? fmtPct(r.total) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}
      </div>

    </div>
  );
}
