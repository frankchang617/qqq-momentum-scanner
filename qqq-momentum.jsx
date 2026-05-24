import { useState, useCallback, useRef, useMemo, useId, useEffect, Fragment } from "react";
import EtfStrategyTab from "./src/etf/EtfStrategyTab.jsx";

// Nasdaq-100 components (updated May 2026, 101 symbols incl. GOOGL/GOOG dual class)
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

const SORT_OPTS = [
  { key:"score",    label:"综合得分" },
  { key:"ret20",    label:"20日涨幅" },
  { key:"ret50",    label:"50日涨幅" },
  { key:"ret200",   label:"200日涨幅" },
  { key:"sharpe20", label:"20日夏普" },
  { key:"sharpe50", label:"50日夏普" },
];

// ── 主题 ──
const DARK = {
  pageBg:"#070c12", navBg:"linear-gradient(180deg,#0c1520 0%,#070c12 100%)",
  navBorder:"#182030", cardBg:"#0b1320", cardBg2:"#0a1520", theadBg:"#0d1520",
  rowEven:"#09111a", rowTop3:"#0b1a10", rowExp:"#0d1c2e", rowHover:"#0d1828",
  border:"#182030", borderSub:"#253545", borderMuted:"#304050", barTrack:"#141e2a",
  inputBg:"#0a1520", text:"#c0d0e0", textBright:"#dff0ff", textSub:"#7a9aaa",
  textMuted:"#6a8090", textVMuted:"#405870", textPrice:"#8899aa",
  btnActiveBg:"#005bcc22", btnActiveBdr:"#005bcc", btnActiveClr:"#4499ff",
  btnBorder:"#182030", btnColor:"#7a9aaa", scrollBg:"#070c12", scrollThumb:"#182030",
};
const LIGHT = {
  pageBg:"#f2f6fb", navBg:"linear-gradient(180deg,#e4edf7 0%,#f2f6fb 100%)",
  navBorder:"#c4d4e4", cardBg:"#ffffff", cardBg2:"#f5f9fd", theadBg:"#e8f0f8",
  rowEven:"#f8fbff", rowTop3:"#edfff5", rowExp:"#deeeff", rowHover:"#d8e8f8",
  border:"#c4d4e4", borderSub:"#a8bace", borderMuted:"#8aa0b0", barTrack:"#d4e0ec",
  inputBg:"#ffffff", text:"#243444", textBright:"#0c1c2c", textSub:"#4e6070",
  textMuted:"#5e7080", textVMuted:"#7888a0", textPrice:"#4e6070",
  btnActiveBg:"#0055cc18", btnActiveBdr:"#0055cc", btnActiveClr:"#0055cc",
  btnBorder:"#b8c8d8", btnColor:"#4e6070", scrollBg:"#e8f0f8", scrollThumb:"#b0c4d4",
};

function makeColorScale(steps) {
  return (v) => {
    if (v == null || isNaN(v)) return "#444";
    return steps.find(([t]) => v >= t)?.[1] ?? steps.at(-1)[1];
  };
}
const retColor = makeColorScale([
  [20,"#00c96e"],[10,"#22b87a"],[5,"#44a880"],[0,"#6688aa"],
  [-5,"#cc7766"],[-15,"#cc4433"],[-Infinity,"#ee1122"],
]);
const sharpeColor = makeColorScale([
  [1.5,"#00c96e"],[0.8,"#22b87a"],[0.3,"#44a880"],
  [0,"#6688aa"],[-0.5,"#cc7766"],[-Infinity,"#cc4433"],
]);

function fmtNum(v, d=2, suffix="") {
  if (v == null || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(d) + suffix;
}
const fmtPct = (v, d=1) => fmtNum(v, d, "%");
function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtParamLabel(p) {
  const m  = { score:'综合', ret20:'20日', ret50:'50日', ret200:'200日' };
  const f  = { daily:'日调', weekly:'周调', monthly:'月调', quarterly:'季调' };
  const mf = { none:'无滤', ma50:'>MA50', ma100:'>MA100', ma200:'>MA200' };
  const filterLabel = p.marketFilter
    ? (mf[p.marketFilter] ?? '无滤')
    : (p.qqq200Filter ? '>MA200' : '无滤');
  const buf = p.bufferEnabled ? ' 缓冲' : '';
  return `${m[p.sortMetric]||p.sortMetric} Top${p.topN} ${f[p.rebalanceFreq]||'月调'} ${filterLabel}${buf}`;
}

function activeButtonStyle(isActive, T) {
  return {
    background: isActive ? T.btnActiveBg : "transparent",
    border: `1px solid ${isActive ? T.btnActiveBdr : T.btnBorder}`,
    color: isActive ? T.btnActiveClr : T.btnColor,
    borderRadius: 6, fontFamily:"inherit", fontSize:11, cursor:"pointer",
  };
}
const tdStyle = { padding:"10px 10px" };

// ── 扫描器子组件 ──
function Sparkline({ closes, width=100, height=36, days=60 }) {
  const uid = useId();
  if (!closes || closes.length < 5) return (
    <div style={{width, height, display:"flex", alignItems:"center",
      justifyContent:"center", color:"#607080", fontSize:10}}>N/A</div>
  );
  const slice = closes.slice(-days);
  const min = slice.reduce((a,b) => a<b?a:b);
  const max = slice.reduce((a,b) => a>b?a:b);
  const range = max - min || 1;
  const pad = 2, iw = width-pad*2, ih = height-pad*2;
  const pts = slice.map((v,i) => {
    const x = pad + (i/(slice.length-1))*iw;
    const y = pad + ih - ((v-min)/range)*ih;
    return `${x},${y}`;
  }).join(" ");
  const first = slice[0], last = slice[slice.length-1];
  const color = last >= first ? "#00c96e" : "#ee3344";
  const lastX = pad+iw, lastY = pad+ih-((last-min)/range)*ih;
  const id = `sg${uid}`;
  return (
    <svg width={width} height={height} style={{overflow:"visible", display:"block"}}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`${pad},${pad+ih} ${pts} ${pad+iw},${pad+ih}`} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={lastX} cy={lastY} r="2.5" fill={color}/>
    </svg>
  );
}

function MiniBar({ value, maxAbs, colorFn, barTrack }) {
  const color = colorFn(value);
  const pct = Math.min(Math.abs(value??0)/(maxAbs||1),1)*100;
  return (
    <div style={{display:"flex", alignItems:"center", gap:6}}>
      <div style={{width:56, height:5, background:barTrack, borderRadius:3, overflow:"hidden"}}>
        <div style={{width:`${pct}%`, height:"100%", background:color, borderRadius:3}}/>
      </div>
      <span style={{color, fontFamily:"monospace", fontSize:12, minWidth:54, textAlign:"right"}}>
        {fmtPct(value)}
      </span>
    </div>
  );
}

function ScoreBadge({ score }) {
  const c = retColor(score);
  return (
    <div style={{display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth:62, height:26, borderRadius:6, background:c+"1a", border:`1px solid ${c}44`,
      color:c, fontWeight:700, fontSize:12, fontFamily:"monospace"}}>{fmtPct(score,1)}</div>
  );
}

// ── 策略回测图表组件 ──
function EquityCurveChart({ stratEq, qqqEq, timestamps, T }) {
  const W = 700, H = 230;
  const pad = { l:46, r:12, t:14, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const allV = [...stratEq, ...qqqEq];
  const minV = Math.min(...allV) * 0.98, maxV = Math.max(...allV) * 1.02;
  const rng = maxV - minV;
  const n = stratEq.length;
  const tx = i => pad.l + (i / Math.max(n-1, 1)) * iw;
  const ty = v => pad.t + ih - ((v-minV)/rng)*ih;
  const sp = stratEq.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const qp = qqqEq.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const ticks = [minV, minV+rng*0.25, minV+rng*0.5, minV+rng*0.75, maxV];

  // 横轴时间刻度：每年 1 月对应的数据索引
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0] * 1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1] * 1000).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      const targetTs = Date.UTC(yr, 0, 1) / 1000;
      const idx = timestamps.findIndex(ts => ts >= targetTs);
      if (idx >= 0 && idx < n) {
        timeTicks.push({ x: tx(idx), label: String(yr) });
      }
    }
  }

  return (
    <svg width={W} height={H} style={{display:"block"}}>
      {ticks.map((v,i) => (
        <Fragment key={i}>
          <line x1={pad.l} y1={ty(v)} x2={pad.l+iw} y2={ty(v)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3"/>
          <text x={pad.l-4} y={ty(v)+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>{((v-1)*100).toFixed(0)}%</text>
        </Fragment>
      ))}
      {/* 横轴基线 */}
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.borderMuted} strokeWidth="0.5"/>
      {/* 时间刻度 */}
      {timeTicks.map((tick, i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textVMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textVMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
      <polyline points={qp} fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.7"/>
      <polyline points={sp} fill="none" stroke="#4488ee" strokeWidth="2"/>
      <line x1={pad.l+10} y1={pad.t+10} x2={pad.l+26} y2={pad.t+10} stroke="#4488ee" strokeWidth="2"/>
      <text x={pad.l+30} y={pad.t+14} fill={T.textSub} fontSize={10}>策略</text>
      <line x1={pad.l+72} y1={pad.t+10} x2={pad.l+88} y2={pad.t+10} stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3"/>
      <text x={pad.l+92} y={pad.t+14} fill={T.textSub} fontSize={10}>QQQ</text>
    </svg>
  );
}

function DrawdownChart({ drawdowns, timestamps, T }) {
  const W = 700, H = 130;
  const pad = { l:46, r:12, t:10, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const minV = Math.min(...drawdowns, -1) * 1.1;
  const n = drawdowns.length;
  const tx = i => pad.l + (i / Math.max(n-1, 1)) * iw;
  const ty = v => pad.t + (1 - v/minV)*ih;
  const pts = drawdowns.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const fill = `${pad.l},${pad.t} ${pts} ${pad.l+iw},${pad.t}`;

  // 横轴时间刻度
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0] * 1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1] * 1000).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      const targetTs = Date.UTC(yr, 0, 1) / 1000;
      const idx = timestamps.findIndex(ts => ts >= targetTs);
      if (idx >= 0 && idx < n) {
        timeTicks.push({ x: tx(idx), label: String(yr) });
      }
    }
  }

  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <line x1={pad.l} y1={pad.t} x2={pad.l+iw} y2={pad.t} stroke={T.border} strokeWidth="0.5"/>
      <polygon points={fill} fill="#ee334428"/>
      <polyline points={pts} fill="none" stroke="#ee3344" strokeWidth="1.5"/>
      <text x={pad.l-4} y={ty(minV)+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>{minV.toFixed(1)}%</text>
      <text x={pad.l-4} y={pad.t+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>0%</text>
      {/* 横轴基线 */}
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.borderMuted} strokeWidth="0.5"/>
      {/* 时间刻度 */}
      {timeTicks.map((tick, i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textVMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textVMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
    </svg>
  );
}

function AnnualBarsChart({ stratAnnual, qqqAnnual, T }) {
  const W = 700, H = 160;
  const pad = { l:46, r:12, t:14, b:28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const years = [...new Set([...Object.keys(stratAnnual),...Object.keys(qqqAnnual)])].sort();
  const allV = [...Object.values(stratAnnual),...Object.values(qqqAnnual),10,-10];
  const maxAbs = Math.max(Math.abs(Math.min(...allV)), Math.abs(Math.max(...allV)));
  const spacing = iw / years.length;
  const bw = spacing * 0.35;
  const zY = pad.t + ih/2;
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <line x1={pad.l} y1={zY} x2={pad.l+iw} y2={zY} stroke={T.border} strokeWidth="1"/>
      <text x={pad.l-4} y={zY+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>0%</text>
      {years.map((yr, i) => {
        const sv = stratAnnual[yr] ?? 0;
        const qv = qqqAnnual[yr] ?? 0;
        const cx = pad.l + spacing*i + spacing/2;
        const svH = (sv/maxAbs)*(ih/2);
        const qvH = (qv/maxAbs)*(ih/2);
        return (
          <g key={yr}>
            <rect x={cx-bw-1} y={sv>=0?zY-svH:zY} width={bw} height={Math.abs(svH)}
              fill={sv>=0?"#4488ee99":"#ee334488"}/>
            <rect x={cx+1} y={qv>=0?zY-qvH:zY} width={bw} height={Math.abs(qvH)}
              fill={qv>=0?"#88aabb66":"#ee334444"}/>
            <text x={cx} y={H-6} textAnchor="middle" fill={T.textVMuted} fontSize={9}>{yr}</text>
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

function MonthlyHeatmap({ monthlyRets, T }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = Object.keys(monthlyRets).sort();
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"separate", borderSpacing:2, fontSize:10}}>
        <thead>
          <tr>
            <th style={{padding:"3px 8px", color:T.textSub, textAlign:"left", fontWeight:500, whiteSpace:"nowrap"}}></th>
            {months.map((m,i) => (
              <th key={i} style={{padding:"2px 4px", color:T.textSub, textAlign:"center", fontWeight:400}}>{m}</th>
            ))}
            <th style={{padding:"2px 6px", color:T.textSub, textAlign:"center", fontWeight:500}}>年度</th>
          </tr>
        </thead>
        <tbody>
          {years.map(yr => {
            const yd = monthlyRets[yr]||{};
            const annRet = (Object.values(yd).reduce((p,r)=>p*(1+r/100),1)-1)*100;
            return (
              <tr key={yr}>
                <td style={{padding:"2px 8px", color:T.textSub, fontWeight:500}}>{yr}</td>
                {Array.from({length:12},(_,mo)=>{
                  const v = yd[mo];
                  const bg = v==null?T.cardBg2
                    :v>8?"#00aa4466":v>4?"#00aa4444":v>0?"#00aa4422"
                    :v>-4?"#ee334422":v>-8?"#ee334444":"#ee334466";
                  const tc = v==null?T.textVMuted:v>=0?"#00aa44":"#ee3344";
                  return (
                    <td key={mo} style={{padding:"3px 5px", textAlign:"center", borderRadius:3,
                      background:bg, color:tc, fontFamily:"monospace", minWidth:44, whiteSpace:"nowrap"}}>
                      {v==null?"—":(v>=0?"+":"")+v.toFixed(1)+"%"}
                    </td>
                  );
                })}
                <td style={{padding:"2px 8px", textAlign:"center", fontFamily:"monospace", fontWeight:700,
                  color:annRet>=0?"#00aa44":"#ee3344"}}>
                  {(annRet>=0?"+":"")+annRet.toFixed(1)+"%"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 数据获取 ──
async function fetchCandles(symbol, signal) {
  const url = `/api/yahoo?symbol=${symbol}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const q = data?.chart?.result?.[0]?.indicators?.quote?.[0];
      if (!q?.close || q.close.length < 10) return null;
      const rows = [];
      for (let i = 0; i < q.close.length; i++) {
        if (q.close[i]!=null && q.high?.[i]!=null && q.low?.[i]!=null)
          rows.push({ c:q.close[i], h:q.high[i], l:q.low[i] });
      }
      return rows.length >= 10 ? rows : null;
    } catch (e) {
      if (signal.aborted || attempt === 1) throw e;
    }
  }
}

// 单股长周期 OHLCV（adjclose 做收盘，按比例缩放 high/low）
async function fetchCandlesOHLC(symbol, range, signal) {
  const url = `/api/yahoo?symbol=${symbol}&range=${range}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const q   = result.indicators?.quote?.[0];
      const adj = result.indicators?.adjclose?.[0]?.adjclose;
      if (!q?.close || !q.high || !q.low) return null;
      const rows = [];
      for (let i = 0; i < q.close.length; i++) {
        if (q.close[i] == null || q.high[i] == null || q.low[i] == null) continue;
        const adjC  = adj?.[i] ?? q.close[i];
        const scale = q.close[i] > 0 ? adjC / q.close[i] : 1;
        rows.push({ c: adjC, h: q.high[i] * scale, l: q.low[i] * scale });
      }
      return rows.length >= 20 ? rows : null;
    } catch (e) {
      if (signal?.aborted || attempt === 1) throw e;
    }
  }
}

// 扩展历史数据（使用 adjclose，含时间戳）
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
      if (!tss || !adj || adj.length < 20) return null;
      const rows = [];
      for (let i = 0; i < tss.length; i++) {
        if (adj[i] != null && adj[i] > 0) rows.push({ c: adj[i], ts: tss[i] });
      }
      return rows.length >= 20 ? rows : null;
    } catch (e) {
      if (signal.aborted || attempt === 1) throw e;
    }
  }
}

// ── 扫描器计算函数 ──
function calcReturn(closes, days) {
  if (!closes || closes.length <= days) return null;
  const cur = closes.at(-1), past = closes.at(-1-days);
  if (!past) return null;
  return ((cur-past)/past)*100;
}
function calcVol(closes, days) {
  if (!closes || closes.length < days+2) return null;
  const sl = closes.slice(-days-1);
  const rets = sl.slice(1).map((v,i) => Math.log(v/sl[i]));
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const v = rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
  return Math.sqrt(v)*Math.sqrt(252)*100;
}
function calcSharpe(ret, vol) {
  if (ret==null||!vol||vol===0) return null;
  return ret/vol;
}
function maArrFn(closes, period) {
  const arr = new Array(closes.length).fill(null);
  let s = 0;
  for (let k = 0; k < closes.length; k++) {
    s += closes[k];
    if (k >= period) s -= closes[k-period];
    if (k >= period-1) arr[k] = s/period;
  }
  return arr;
}
function emaArrFn(src, period) {
  const arr = new Array(src.length).fill(null);
  const k = 2/(period+1);
  let ema = null, count = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i]==null) continue;
    if (ema===null) {
      count++; ema = (ema??0)*((count-1)/count)+src[i]/count;
      if (count >= period) arr[i] = ema;
    } else { ema = src[i]*k+ema*(1-k); arr[i] = ema; }
  }
  return arr;
}
function atrArrFn(highs, lows, closes, period=14) {
  if (!highs||!lows) return new Array(closes.length).fill(null);
  const arr = new Array(closes.length).fill(null);
  let atr = null, count = 0;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
    if (atr===null) { count++; atr=(atr??0)*((count-1)/count)+tr/count; if(count>=period)arr[i]=atr; }
    else { atr=(atr*(period-1)+tr)/period; arr[i]=atr; }
  }
  return arr;
}
function rsiArrFn(closes, period=14) {
  const arr = new Array(closes.length).fill(null);
  if (closes.length < period+1) return arr;
  let ag=0, al=0;
  for (let i=1;i<=period;i++){const d=closes[i]-closes[i-1];if(d>0)ag+=d;else al-=d;}
  ag/=period; al/=period;
  arr[period] = al===0?100:100-100/(1+ag/al);
  for (let i=period+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(period-1)+Math.max(d,0))/period; al=(al*(period-1)+Math.max(-d,0))/period;
    arr[i]=al===0?100:100-100/(1+ag/al);
  }
  return arr;
}
function macdArraysFn(closes) {
  const ema12=emaArrFn(closes,12), ema26=emaArrFn(closes,26);
  const macdLine=closes.map((_,i)=>ema12[i]!=null&&ema26[i]!=null?ema12[i]-ema26[i]:null);
  const signalArr=emaArrFn(macdLine,9);
  const histArr=closes.map((_,i)=>macdLine[i]!=null&&signalArr[i]!=null?macdLine[i]-signalArr[i]:null);
  return { macdLine, signalArr, histArr };
}
function impulseArrFn(closes) {
  const ema13=emaArrFn(closes,13);
  const { histArr } = macdArraysFn(closes);
  return closes.map((_,i)=>{
    if(!i||ema13[i]==null||ema13[i-1]==null||histArr[i]==null||histArr[i-1]==null) return null;
    const up13=ema13[i]>ema13[i-1], upH=histArr[i]>histArr[i-1];
    return (up13&&upH)?'green':(!up13&&!upH)?'red':'blue';
  });
}
function backtest(closes, highs, lows, maDays, entryMode="touch", exitMode="mabreak", vol20=0) {
  const STOP=0.09, MAX_DAYS=120;
  const dollarTrailPct = vol20>50?0.30:0.20;
  if (!closes||closes.length<maDays+35) return null;
  const maArr=maArrFn(closes,maDays), atrArr=atrArrFn(highs,lows,closes,14);
  const rsiArr=rsiArrFn(closes,14), { histArr }=macdArraysFn(closes), impulse=impulseArrFn(closes);
  const trades=[];
  for (let i=maDays+2;i<closes.length-7;i++){
    const ma=maArr[i],prevMa=maArr[i-1]; if(!ma||!prevMa) continue;
    const cur=closes[i],prev=closes[i-1];
    if(prev<prevMa*1.01) continue;
    if(cur>ma*1.02||cur<ma*0.97) continue;
    if((entryMode==='impulse_touch'||entryMode==='impulse_bounce')&&impulse[i]!=='green') continue;
    let entryIdx;
    if(entryMode==='touch'||entryMode==='impulse_touch'){entryIdx=i+1;}
    else{const nextMa=maArr[i+1];if(!closes[i+1]||!nextMa||closes[i+1]<=nextMa)continue;entryIdx=i+2;}
    if(entryIdx>=closes.length-3) continue;
    const entry=closes[entryIdx]; if(!entry) continue;
    const dollarTrailAmt=entry*dollarTrailPct, atrEntry=atrArr[entryIdx]??atrArr[entryIdx-1]??null;
    let exit=null,exitDay=0,peak=entry;
    const limit=Math.min(MAX_DAYS,closes.length-entryIdx-2);
    for(let j=1;j<=limit;j++){
      const k=entryIdx+j, p=closes[k];
      if(!p){exit=closes[k-1];exitDay=j-1;break;}
      if(p>peak)peak=p;
      if(p<=entry*(1-STOP)){exit=p;exitDay=j;break;}
      let hit=false;
      switch(exitMode){
        case'fixed20':hit=j===20;break;case'mabreak':hit=!!(maArr[k]&&p<maArr[k]);break;
        case'trail7':hit=p<=peak*0.93;break;case'dollar':hit=p<=peak-dollarTrailAmt;break;
        case'atr2':hit=!!(atrEntry&&p<=peak-2*atrEntry);break;
        case'atr3':hit=!!(atrEntry&&p<=peak-3*atrEntry);break;
        case'rsi70':hit=!!(rsiArr[k]!=null&&rsiArr[k]>70);break;
        case'macd':hit=!!(histArr[k]!=null&&histArr[k-1]!=null&&histArr[k]<0&&histArr[k-1]>=0);break;
      }
      if(hit||j===limit){exit=p;exitDay=j;break;}
    }
    if(!exit) continue;
    trades.push({ret:(exit-entry)/entry*100, days:exitDay});
  }
  if(!trades.length) return {n:0};
  const wins=trades.filter(t=>t.ret>0).length;
  // 顺序复利净值曲线
  let eq=1;
  for(const t of trades) eq*=(1+t.ret/100);
  const totalRet=(eq-1)*100;
  const years=closes.length/252;
  const cagr=(Math.pow(eq,1/years)-1)*100;
  // Sharpe（按单笔收益率，按平均持仓天数年化）
  const rets=trades.map(t=>t.ret/100);
  const meanR=rets.reduce((a,b)=>a+b,0)/rets.length;
  const varR=rets.reduce((a,b)=>a+(b-meanR)**2,0)/rets.length;
  const avgDaysNum=trades.reduce((a,t)=>a+t.days,0)/trades.length;
  const sharpe=varR>0?(meanR/Math.sqrt(varR))*Math.sqrt(252/avgDaysNum):0;
  // MDD（从顺序净值曲线）
  let peak=1,mddVal=0,eqCur=1;
  for(const t of trades){eqCur*=(1+t.ret/100);if(eqCur>peak)peak=eqCur;const dd=(peak-eqCur)/peak*100;if(dd>mddVal)mddVal=dd;}
  return { n:trades.length, winRate:wins/trades.length*100,
    avgRet:trades.reduce((a,t)=>a+t.ret,0)/trades.length,
    avgDays:Math.round(trades.reduce((a,t)=>a+t.days,0)/trades.length),
    best:Math.max(...trades.map(t=>t.ret)), worst:Math.min(...trades.map(t=>t.ret)),
    dollarTrailPct, totalRet, cagr, sharpe, mdd:-mddVal };
}

// ── 策略回测核心 ──
// 无未来数据：排名用 t-1 收盘，交易用 t 收盘（无当日开盘数据时的标准近似）
// 使用当前 QQQ 成分股，存在幸存者偏差
function portfolioBacktest(histData, commonTs, qqqCloses, params, rangeStart=0, rangeEnd=null) {
  const { sortMetric, topN, rebalanceFreq, bufferEnabled=false, qqq200Filter, marketFilter } = params;

  // 市场过滤：支持旧版 qqq200Filter(bool) 和新版 marketFilter('none'/'ma50'/'ma100'/'ma200')
  let maFilterDays = 0;
  if      (marketFilter === 'ma50')  maFilterDays = 50;
  else if (marketFilter === 'ma100') maFilterDays = 100;
  else if (marketFilter === 'ma200') maFilterDays = 200;
  else if (qqq200Filter)             maFilterDays = 200; // 旧版兼容

  const bufferN = bufferEnabled ? Math.round(topN * 1.5) : topN;

  // 调仓间隔（交易日）
  const rebalInterval = rebalanceFreq === 'daily' ? 1
    : rebalanceFreq === 'weekly'    ? 5
    : rebalanceFreq === 'quarterly' ? 63
    : 21; // monthly (默认)

  const N = rangeEnd ?? commonTs.length;
  const symbols = [...histData.keys()];
  // 预热期：200日（ret200/score 需要）
  const simStart = Math.max(rangeStart, 205);
  if (simStart >= N - 10) return { equityCurve:[1], timestamps:[], turnoverCount:0, simStart };

  const equityCurve = [];
  let equity = 1.0;
  let holdings = new Set();
  let turnoverCount = 0;

  for (let t = simStart; t < N; t++) {
    const isRebalDay = (t === simStart) || ((t - simStart) % rebalInterval === 0);

    if (isRebalDay) {
      const d = t - 1; // 决策基于前一日数据（无未来数据）

      // 市场过滤：QQQ 收盘 < MAx → 全部转现金
      let inMarket = true;
      if (maFilterDays > 0 && d >= maFilterDays) {
        const slice = qqqCloses.slice(d - maFilterDays, d);
        const maVal = slice.reduce((a,b)=>a+(b??0),0) / slice.filter(Boolean).length;
        inMarket = qqqCloses[d] != null && qqqCloses[d] > maVal;
      }

      if (!inMarket) {
        turnoverCount += holdings.size;
        holdings = new Set();
      } else {
        const ranked = symbols.map(sym => {
          const c = histData.get(sym);
          if (!c || !c[d]) return null;
          let score = null;
          if (sortMetric==='ret20' && d>=20 && c[d-20])
            score = (c[d]-c[d-20])/c[d-20];
          else if (sortMetric==='ret50' && d>=50 && c[d-50])
            score = (c[d]-c[d-50])/c[d-50];
          else if (sortMetric==='ret200' && d>=200 && c[d-200])
            score = (c[d]-c[d-200])/c[d-200];
          else if (sortMetric==='score' && d>=200 && c[d-20] && c[d-50] && c[d-200]) {
            const r20=(c[d]-c[d-20])/c[d-20], r50=(c[d]-c[d-50])/c[d-50], r200=(c[d]-c[d-200])/c[d-200];
            score = r20*0.45+r50*0.35+r200*0.20;
          }
          return score!=null ? { sym, score } : null;
        }).filter(Boolean).sort((a,b)=>b.score-a.score);

        const topSet    = new Set(ranked.slice(0, topN).map(r=>r.sym));
        const bufferSet = new Set(ranked.slice(0, bufferN).map(r=>r.sym));
        const newH = new Set();
        for (const s of holdings) { if (bufferSet.has(s)) newH.add(s); }
        for (const s of topSet) { newH.add(s); }
        for (const s of newH) { if (!holdings.has(s)) turnoverCount++; }
        holdings = newH;
      }
    }

    // 当日组合收益（t vs t-1 收盘价）
    if (t > simStart && holdings.size > 0) {
      let portRet = 0, cnt = 0;
      for (const sym of holdings) {
        const c = histData.get(sym);
        if (!c || !c[t] || !c[t-1]) continue;
        portRet += (c[t]-c[t-1])/c[t-1];
        cnt++;
      }
      if (cnt > 0) equity *= (1 + portRet/cnt);
    }
    equityCurve.push(equity);
  }
  return { equityCurve, timestamps: commonTs.slice(simStart, N), turnoverCount, simStart };
}

function buildQqqEquity(qqqCloses, startIdx, endIdx) {
  const N = endIdx ?? qqqCloses.length;
  const equityCurve = [];
  let equity = 1.0;
  for (let t = startIdx; t < N; t++) {
    if (t > startIdx && qqqCloses[t] && qqqCloses[t-1])
      equity *= qqqCloses[t]/qqqCloses[t-1];
    equityCurve.push(equity);
  }
  return { equityCurve };
}

function calcPortMetrics(equityCurve, timestamps) {
  const n = equityCurve.length;
  if (n < 10 || !timestamps || timestamps.length < 2) return null;
  const years = (timestamps[n-1]-timestamps[0])/(365.25*86400);
  const cagr = years > 0.05 ? (Math.pow(equityCurve[n-1], 1/years)-1)*100 : 0;
  const dailyRets = [];
  for (let i=1;i<n;i++) {
    if (equityCurve[i-1]>0) dailyRets.push(equityCurve[i]/equityCurve[i-1]-1);
  }
  const meanR = dailyRets.reduce((a,b)=>a+b,0)/dailyRets.length;
  const varR  = dailyRets.reduce((a,b)=>a+(b-meanR)**2,0)/dailyRets.length;
  const sharpe = varR>0 ? (meanR/Math.sqrt(varR))*Math.sqrt(252) : 0;
  let peak=equityCurve[0], mdd=0;
  const drawdowns = equityCurve.map(v=>{
    if(v>peak) peak=v;
    const dd=peak>0?(peak-v)/peak*100:0;
    if(dd>mdd) mdd=dd;
    return -dd;
  });
  // Annual returns
  const annualRets={};
  let prevYrStart=equityCurve[0], prevYr=new Date(timestamps[0]*1000).getFullYear();
  for (let i=0;i<n;i++){
    const yr=new Date(timestamps[i]*1000).getFullYear();
    if(yr!==prevYr){ annualRets[prevYr]=(equityCurve[i-1]/prevYrStart-1)*100; prevYrStart=equityCurve[i-1]; prevYr=yr; }
  }
  annualRets[prevYr]=(equityCurve[n-1]/prevYrStart-1)*100;
  // Monthly returns
  const monthlyRets={};
  let prevMoStart=equityCurve[0];
  let { yr:pYr, mo:pMo } = { yr:new Date(timestamps[0]*1000).getFullYear(), mo:new Date(timestamps[0]*1000).getMonth() };
  for (let i=0;i<n;i++){
    const dd=new Date(timestamps[i]*1000), yr=dd.getFullYear(), mo=dd.getMonth();
    if(yr!==pYr||mo!==pMo){
      if(!monthlyRets[pYr]) monthlyRets[pYr]={};
      monthlyRets[pYr][pMo]=(equityCurve[i-1]/prevMoStart-1)*100;
      prevMoStart=equityCurve[i-1]; pYr=yr; pMo=mo;
    }
  }
  if(!monthlyRets[pYr]) monthlyRets[pYr]={};
  monthlyRets[pYr][pMo]=(equityCurve[n-1]/prevMoStart-1)*100;
  return { cagr, sharpe, mdd:-mdd, drawdowns, annualRets, monthlyRets, total:(equityCurve[n-1]-1)*100 };
}

// 遍历所有参数组合（Grid Search）
// 参数空间：4×7×4×4 = 448 种组合
function runAllCombos(histData, commonTs, qqqCloses, rangeStart=0, rangeEnd=null) {
  const results = [];
  for (const sortMetric of ['score','ret20','ret50','ret200']) {         // 动能回看期 × 4
    for (const topN of [3,5,10,15,20,25,30]) {                           // 持仓数 × 7
      for (const rebalanceFreq of ['daily','weekly','monthly','quarterly']) { // 调仓频率 × 4
        for (const marketFilter of ['none','ma50','ma100','ma200']) {     // 市场过滤 × 4
          const params = { sortMetric, topN, rebalanceFreq, bufferEnabled:false, marketFilter };
          const bt = portfolioBacktest(histData, commonTs, qqqCloses, params, rangeStart, rangeEnd);
          const metrics = calcPortMetrics(bt.equityCurve, bt.timestamps);
          if (!metrics) continue;
          results.push({ params, metrics, turnover:bt.turnoverCount });
        }
      }
    }
  }
  return results;
}

// Walk Forward Optimization
// 正确逻辑：
//   1. in-sample 跑 Grid Search(448种) → 按 optMetric 选出最佳参数
//   2. 用该参数固定跑 out-of-sample → 记录绩效
//   3. out-of-sample 结果只用于记录，不参与任何参数选择
//   4. 所有 out-of-sample 串接 → WFO 总绩效
// 窗口设计：70% in-sample / 30% out-of-sample，按 OOS 步长滚动
function runWFO(histData, commonTs, qqqCloses, optMetric='sharpe') {
  const N = commonTs.length;

  // 按可用数据决定窗口尺寸（70/30 原则）
  const inDays  = Math.round(N * 0.70);
  const outDays = N - inDays; // ≈ 30%

  // 至少需要 1年 in-sample + 2个月 out-of-sample
  if (inDays < 252 || outDays < 42) return null;

  // 构建滚动窗口（OOS 不重叠，步长 = outDays）
  const windows = [];
  let pos = 0;
  while (pos + inDays + 42 < N) {
    const outEnd = Math.min(pos + inDays + outDays, N);
    windows.push({ inStart: pos, inEnd: pos + inDays, outStart: pos + inDays, outEnd });
    pos += outDays; // 滚动一个 OOS 区间
  }
  if (!windows.length) return null;

  // 评分函数：in-sample 按哪个指标选最佳参数
  const scoreFn = (m) => {
    if (optMetric === 'cagr')   return m.cagr;
    if (optMetric === 'calmar') return m.cagr / Math.abs(m.mdd || 1);
    return m.sharpe; // 默认：Sharpe
  };

  const windowResults = [];
  let chainMult = 1.0, allOutEquity = [], allOutTs = [];

  for (let wi = 0; wi < windows.length; wi++) {
    const win = windows[wi];

    // ── Step 1: in-sample Grid Search（448种参数组合）──
    const inCombos = runAllCombos(histData, commonTs, qqqCloses, win.inStart, win.inEnd);
    if (!inCombos.length) continue;

    // ── Step 2: in-sample 内按 optMetric 选最佳参数 ──
    inCombos.sort((a, b) => scoreFn(b.metrics) - scoreFn(a.metrics));
    const bestCombo  = inCombos[0];
    const bestParams = bestCombo.params; // ← 唯一用于 OOS 的参数，绝不事后修改

    // ── Step 3: 用固定参数跑 out-of-sample（只记录，不选参数）──
    const outBt      = portfolioBacktest(histData, commonTs, qqqCloses, bestParams, win.outStart, win.outEnd);
    const outMetrics = calcPortMetrics(outBt.equityCurve, outBt.timestamps);

    // QQQ 基准（同 OOS 期间）
    const qqqOut        = buildQqqEquity(qqqCloses, outBt.simStart, win.outEnd);
    const qqqOutMetrics = calcPortMetrics(qqqOut.equityCurve, outBt.timestamps);

    // ── Step 4: 串接 OOS 净值曲线（乘法链接，保持连续性）──
    const chained = outBt.equityCurve.map(v => v * chainMult);
    chainMult = chained[chained.length - 1] ?? chainMult;
    allOutEquity.push(...chained);
    allOutTs.push(...outBt.timestamps);

    windowResults.push({
      winIdx: wi + 1,
      // 时间范围
      inPeriod:  `${fmtDate(commonTs[win.inStart])} ~ ${fmtDate(commonTs[win.inEnd - 1])}`,
      outPeriod: `${fmtDate(commonTs[win.outStart])} ~ ${fmtDate(commonTs[Math.min(win.outEnd, N) - 1])}`,
      // in-sample 选出的最佳参数（这是 out-of-sample 实际使用的参数）
      bestParams,
      // in-sample 该参数的评分（用于审计）
      inSampleScore:    scoreFn(bestCombo.metrics),
      inSampleSharpe:   bestCombo.metrics.sharpe,
      inSampleCAGR:     bestCombo.metrics.cagr,
      inSampleMDD:      bestCombo.metrics.mdd,
      inSampleComboCnt: inCombos.length,
      // out-of-sample 实际绩效（in-sample 选出的参数跑出来的）
      outMetrics,
      qqqOutMetrics,
    });
  }

  if (!allOutEquity.length) return null;

  // ── Step 5: 所有 OOS 串接 → WFO 总绩效 ──
  const combinedMetrics = calcPortMetrics(allOutEquity, allOutTs);

  // QQQ 基准（全 OOS 期间）
  const wfoStart     = windows[0].outStart;
  const wfoEnd       = windows[windows.length - 1].outEnd;
  const qqqWfo       = buildQqqEquity(qqqCloses, Math.max(wfoStart, 205), wfoEnd);
  const qqqWfoEq     = qqqWfo.equityCurve.slice(0, allOutEquity.length);
  const qqqCombinedMetrics = calcPortMetrics(qqqWfoEq, allOutTs.slice(0, qqqWfoEq.length));

  return {
    windowResults, allOutEquity, allOutTs,
    combinedMetrics, qqqCombinedMetrics, qqqWfoEq,
    optMetric,
    totalCombos: 448, // 4×7×4×4
    windowCount: windows.length,
  };
}

// ══════════════════════════════════════════
//  QQQ 成分股轮动 — 当前操作建议卡片
// ══════════════════════════════════════════
function QqqSignalCard({ histData, histTs, params, T, darkMode }) {
  const [capital, setCapital] = useState('10000');

  const signal = useMemo(() => {
    if (!histData || !histTs || histTs.length === 0) return null;
    const { sortMetric='score', topN=5, rebalanceFreq='monthly', marketFilter='none' } = params;
    const N   = histTs.length;
    const d   = N - 1;
    const date = new Date(histTs[d] * 1000).toISOString().slice(0, 10);
    const qqqCloses = histData.get('__QQQ__');

    // 市场过滤
    const maDays = marketFilter==='ma50'?50 : marketFilter==='ma100'?100 : marketFilter==='ma200'?200 : 0;
    if (maDays > 0 && d >= maDays && qqqCloses) {
      const slice = qqqCloses.slice(d - maDays, d).filter(Boolean);
      const ma = slice.length > 0 ? slice.reduce((a,b)=>a+b,0)/slice.length : null;
      const qqqNow = qqqCloses[d];
      if (ma != null && qqqNow != null && qqqNow <= ma) {
        return { date, isDefensive: true, holdings: {}, prices: {},
          reason: `QQQ（$${qqqNow.toFixed(1)}）低于 MA${maDays}（$${ma.toFixed(1)}），市场过滤触发 → 转现金`,
          scores: [], rebalFreq: rebalanceFreq, qqqPrice: qqqNow };
      }
    }

    // 对成分股打分
    const symbols = [...histData.keys()].filter(k => k !== '__QQQ__');
    const ranked = symbols.map(sym => {
      const c = histData.get(sym);
      if (!c || !c[d]) return null;
      let score = null;
      if (sortMetric==='ret20'  && d>=20  && c[d-20])  score=(c[d]-c[d-20])/c[d-20];
      else if (sortMetric==='ret50'  && d>=50  && c[d-50])  score=(c[d]-c[d-50])/c[d-50];
      else if (sortMetric==='ret200' && d>=200 && c[d-200]) score=(c[d]-c[d-200])/c[d-200];
      else if (sortMetric==='score'  && d>=200 && c[d-20] && c[d-50] && c[d-200]) {
        score=(c[d]-c[d-20])/c[d-20]*0.45 + (c[d]-c[d-50])/c[d-50]*0.35 + (c[d]-c[d-200])/c[d-200]*0.20;
      }
      return score!=null ? { sym, score, price: c[d] } : null;
    }).filter(Boolean).sort((a,b)=>b.score-a.score);

    const top = ranked.slice(0, topN);
    const scoreLabel = {score:'综合评分',ret20:'20日涨幅',ret50:'50日涨幅',ret200:'200日涨幅'}[sortMetric]||sortMetric;
    const rfLabel = {daily:'每日',weekly:'每周',monthly:'每月',quarterly:'每季'}[rebalanceFreq]||rebalanceFreq;

    return { date, isDefensive: false,
      holdings: Object.fromEntries(top.map(r=>[r.sym, 1/topN])),
      prices:   Object.fromEntries(top.map(r=>[r.sym, r.price])),
      scores: ranked.slice(0, 10),
      reason: `按${scoreLabel}排名，等权持有前 ${top.length} 只（${rfLabel}调仓）`,
      rebalFreq: rebalanceFreq,
      qqqPrice: qqqCloses?.[d],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histData, histTs, JSON.stringify(params)]);

  if (!signal) return null;
  const cap = parseFloat(capital) || 0;
  const borderColor = signal.isDefensive ? '#e8883a' : '#4fc86e';

  return (
    <div style={{ padding:'14px 18px', background: darkMode?'#0d1f10':'#f0faf2',
      border:`1px solid ${T.border}`, borderLeft:`4px solid ${borderColor}`,
      borderRadius:8, marginBottom:20 }}>

      {/* 标题行 */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
        <span style={{fontSize:12,fontWeight:700,color:T.textBright}}>📡 当前操作建议</span>
        <span style={{fontSize:10,color:T.textMuted}}>{signal.date}</span>
        <span style={{marginLeft:'auto',fontSize:11,fontWeight:700,
          color: signal.isDefensive?'#e8883a':'#4fc86e'}}>
          {signal.isDefensive ? '⚠️ 市场过滤触发，转现金' : `🟢 持仓 Top ${Object.keys(signal.holdings).length}`}
        </span>
      </div>

      {/* 信号依据 */}
      <div style={{fontSize:11,color:T.textSub,marginBottom:12,lineHeight:1.6}}>{signal.reason}</div>

      {/* 当前 Top N 持仓标的 */}
      {!signal.isDefensive && signal.scores.length > 0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:6}}>
            当前排名（前10），✓ 为建议持仓
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {signal.scores.map(({sym,score},i)=>{
              const isIn = signal.holdings[sym]!=null;
              return (
                <div key={sym} style={{
                  padding:'3px 10px', borderRadius:4, fontSize:10, fontFamily:'monospace',
                  fontWeight: isIn?700:400,
                  background: score>=0?'#4fc86e11':'#ee444411',
                  border:`1px solid ${isIn ? borderColor : (score>=0?'#4fc86e44':'#ee444433')}`,
                  color: score>=0?'#4fc86e':'#ee4444',
                }}>
                  #{i+1} {sym} {score>=0?'+':''}{(score*100).toFixed(1)}%{isIn&&<span style={{color:borderColor}}> ✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 投入金额计算器 */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:T.textMuted}}>💰 按投入金额计算：</span>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:12,color:T.textMuted}}>$</span>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)}
              style={{width:100,padding:'3px 8px',background:T.inputBg,
                border:`1px solid ${T.borderSub||T.border}`,borderRadius:4,
                color:T.text,fontFamily:'inherit',fontSize:12}}/>
          </div>
        </div>

        {signal.isDefensive ? (
          <div style={{fontSize:12,color:'#e8883a',padding:'8px 12px',background:'#e8883a14',
            borderRadius:6,border:'1px solid #e8883a33'}}>
            ⚠️ 当前不建议建仓，持现金 ${cap.toLocaleString('en-US',{maximumFractionDigits:0})} 等待市场恢复
          </div>
        ) : (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(signal.holdings).map(([sym,w])=>{
              const amt = cap*w;
              const price = signal.prices[sym];
              const shares = price&&price>0 ? amt/price : null;
              return (
                <div key={sym} style={{padding:'8px 14px',borderRadius:6,minWidth:160,
                  background:T.cardBg,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.textBright,marginBottom:3}}>
                    📈 买入 {sym}
                  </div>
                  <div style={{fontSize:14,color:'#4488ee',fontFamily:'monospace',fontWeight:700}}>
                    ${amt.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  {shares!=null&&(
                    <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>
                      ≈ {shares.toFixed(2)} 股 @ ${price.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 下次检查提示 */}
      <div style={{marginTop:12,fontSize:10,color:T.textVMuted}}>
        {signal.rebalFreq==='daily'   && '⏰ 每日调仓：每个交易日收盘后检查排名，有变化则次日调整'}
        {signal.rebalFreq==='weekly'  && '⏰ 每周调仓：每 5 个交易日检查一次，信号不变则持仓不动'}
        {signal.rebalFreq==='monthly' && '⏰ 月调仓：每 21 个交易日（约 1 个月）检查一次，信号不变无需操作'}
        {signal.rebalFreq==='quarterly'&&'⏰ 季调仓：每 63 个交易日（约 3 个月）检查一次'}
      </div>
    </div>
  );
}

// ── 主组件 ──
export default function App() {
  // 扫描器状态
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [progress,    setProgress]    = useState({done:0,total:0});
  const [sortKey,     setSortKey]     = useState("score");
  const [topN,        setTopN]        = useState(20);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedSym, setExpandedSym] = useState(null);
  const [filters,     setFilters]     = useState({allPositive:false,minRet20:false,minSharpe50:false});
  const [qqqData,     setQqqData]     = useState(null);
  const [costBasis,   setCostBasis]   = useState({});
  const [btMode,      setBtMode]      = useState("mabreak");
  const [btEntry,     setBtEntry]     = useState("touch");
  // 策略回测状态
  const [activeTab,   setActiveTab]   = useState("scanner");
  const [btSubTab,    setBtSubTab]    = useState("qqq"); // 'qqq' | 'etf'
  const [histData,    setHistData]    = useState(null);
  const [histTs,      setHistTs]      = useState(null);
  const [histRange,   setHistRange]   = useState("3y");
  const [histLoading, setHistLoading] = useState(false);
  const [histProg,    setHistProg]    = useState({done:0,total:0});
  const [stratParams, setStratParams] = useState({
    sortMetric:"score", topN:10, rebalanceFreq:"monthly", bufferEnabled:false, marketFilter:"ma200"
  });
  const [stratResult, setStratResult] = useState(null);
  const [optResult,   setOptResult]   = useState(null);
  const [optRunning,  setOptRunning]  = useState(false);
  const [wfoResult,   setWfoResult]   = useState(null);
  const [wfoRunning,  setWfoRunning]  = useState(false);
  const [wfoOptMetric,setWfoOptMetric]= useState("sharpe"); // in-sample 优化指标
  const [showOpt,     setShowOpt]     = useState(false);
  const [showWfo,     setShowWfo]     = useState(false);
  const [darkMode,    setDarkMode]    = useState(true);
  const [initCapital, setInitCapital] = useState("100000");
  const [btCapital,   setBtCapital]   = useState("10000");
  const [btRange,     setBtRange]     = useState("1y");
  const [btLongData,  setBtLongData]  = useState({});
  const [btLongLoading, setBtLongLoading] = useState(false);
  const abortRef    = useRef(null);
  const histAbort   = useRef(null);
  const T = darkMode ? DARK : LIGHT;

  const toggleFilter = useCallback(key => setFilters(f=>({...f,[key]:!f[key]})),[]);

  const runScan = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const { signal } = ctrl;
    setLoading(true); setResults([]); setProgress({done:0,total:QQQ_COMPONENTS.length});
    const all=[], successes=[];
    const BATCH=5;
    for (let i=0;i<QQQ_COMPONENTS.length;i+=BATCH) {
      if(signal.aborted) break;
      const batch=QQQ_COMPONENTS.slice(i,i+BATCH);
      const batchRes=await Promise.all(batch.map(async sym=>{
        try {
          const raw=await fetchCandles(sym,signal);
          if(!raw) return {symbol:sym,error:true};
          const slice=raw.slice(-252), closes=slice.map(d=>d.c), highs=slice.map(d=>d.h), lows=slice.map(d=>d.l);
          const ret20=calcReturn(closes,20),ret50=calcReturn(closes,50),ret200=calcReturn(closes,200);
          const vol20=calcVol(closes,20),vol50=calcVol(closes,50);
          const sharpe20=calcSharpe(ret20,vol20),sharpe50=calcSharpe(ret50,vol50);
          const score=(ret20??0)*0.45+(ret50??0)*0.35+(ret200??0)*0.20;
          return {symbol:sym,closes,highs,lows,ret20,ret50,ret200,vol20,vol50,sharpe20,sharpe50,score,price:slice.at(-1)?.c,error:false};
        } catch(e){ return {symbol:sym,error:true}; }
      }));
      all.push(...batchRes); successes.push(...batchRes.filter(r=>!r.error));
      setProgress({done:i+batch.length,total:QQQ_COMPONENTS.length});
      setResults([...successes]);
      if(i+BATCH<QQQ_COMPONENTS.length&&!signal.aborted) await new Promise(r=>setTimeout(r,300));
    }
    if(!signal.aborted){ setLoading(false); setLastUpdated(new Date()); }
  },[]);

  useEffect(()=>{runScan();},[runScan]);
  useEffect(()=>{
    const ctrl=new AbortController();
    fetchCandles("QQQ",ctrl.signal).then(raw=>{
      if(!raw) return;
      const closes=raw.slice(-202).map(d=>d.c);
      const ma200=closes.slice(-200).reduce((a,b)=>a+b,0)/200, price=closes.at(-1);
      setQqqData({ret20:calcReturn(closes,20),ret200:calcReturn(closes,200),ma200,price,aboveMA200:price>ma200});
    }).catch(()=>{});
    return ()=>ctrl.abort();
  },[]);

  // 加载历史数据（策略回测用）
  const loadHistData = useCallback(async () => {
    histAbort.current?.abort();
    const ctrl = new AbortController(); histAbort.current = ctrl;
    const { signal } = ctrl;
    setHistLoading(true); setHistProg({done:0,total:QQQ_COMPONENTS.length+1});
    setHistData(null); setHistTs(null); setStratResult(null); setOptResult(null); setWfoResult(null);
    try {
      const qqqRaw = await fetchCandlesExtended('QQQ', histRange, signal);
      if (!qqqRaw) { setHistLoading(false); return; }
      const qqqTs = qqqRaw.map(d=>d.ts);
      const qqqAdj = qqqRaw.map(d=>d.c);
      const tsIdx = new Map(qqqTs.map((t,i)=>[t,i]));
      const Nq = qqqTs.length;
      setHistProg({done:1,total:QQQ_COMPONENTS.length+1});

      const rawMap = new Map();
      const BATCH=5;
      for (let i=0;i<QQQ_COMPONENTS.length;i+=BATCH) {
        if(signal.aborted) break;
        await Promise.all(QQQ_COMPONENTS.slice(i,i+BATCH).map(async sym=>{
          try {
            const raw=await fetchCandlesExtended(sym,histRange,signal);
            if(raw) rawMap.set(sym,raw);
          } catch(e){}
        }));
        setHistProg({done:i+BATCH+1,total:QQQ_COMPONENTS.length+1});
        if(i+BATCH<QQQ_COMPONENTS.length&&!signal.aborted) await new Promise(r=>setTimeout(r,300));
      }
      if(signal.aborted) return;

      // 对齐到 QQQ 时间轴
      const aligned = new Map();
      aligned.set('__QQQ__', qqqAdj);
      for (const [sym, rows] of rawMap) {
        const arr = new Array(Nq).fill(null);
        for (const { c, ts } of rows) {
          const idx = tsIdx.get(ts); if(idx!==undefined) arr[idx]=c;
        }
        // 前向填充空值（处理停牌等缺口）
        for (let j=1;j<Nq;j++) { if(arr[j]===null&&arr[j-1]!==null) arr[j]=arr[j-1]; }
        aligned.set(sym, arr);
      }
      setHistData(aligned); setHistTs(qqqTs); setHistLoading(false);
    } catch(e) { if(!signal.aborted){ console.error(e); setHistLoading(false); } }
  },[histRange]);

  // 运行单次策略回测
  const runStratBacktest = useCallback((overrideParams)=>{
    if(!histData||!histTs) return;
    const params = overrideParams ?? stratParams;
    const qqqCloses=histData.get('__QQQ__');
    const stockData=new Map([...histData].filter(([k])=>k!=='__QQQ__'));
    const bt=portfolioBacktest(stockData,histTs,qqqCloses,params);
    const metrics=calcPortMetrics(bt.equityCurve,bt.timestamps);
    const qqqBt=buildQqqEquity(qqqCloses,bt.simStart);
    const qqqEq=qqqBt.equityCurve.slice(0,bt.equityCurve.length);
    const qqqMetrics=calcPortMetrics(qqqEq,bt.timestamps);
    setStratResult({equityCurve:bt.equityCurve,timestamps:bt.timestamps,metrics,qqqEq,qqqMetrics,turnover:bt.turnoverCount});
  },[histData,histTs,stratParams]);

  // 一键优化
  const handleRunOptimize = useCallback(async ()=>{
    if(!histData||!histTs) return;
    setOptRunning(true); setOptResult(null);
    await new Promise(r=>setTimeout(r,50));
    const qqqCloses=histData.get('__QQQ__');
    const stockData=new Map([...histData].filter(([k])=>k!=='__QQQ__'));
    const combos=runAllCombos(stockData,histTs,qqqCloses);
    setOptResult(combos); setOptRunning(false);
  },[histData,histTs]);

  // Walk Forward Optimization (Mode B)
  const handleRunWFO = useCallback(async ()=>{
    if(!histData||!histTs) return;
    setWfoRunning(true); setWfoResult(null);
    await new Promise(r=>setTimeout(r,50));
    const qqqCloses=histData.get('__QQQ__');
    const stockData=new Map([...histData].filter(([k])=>k!=='__QQQ__'));
    const result=runWFO(stockData,histTs,qqqCloses,wfoOptMetric);
    setWfoResult(result); setWfoRunning(false);
  },[histData,histTs,wfoOptMetric]);

  const { sorted, passCount, mAbs20, mAbs50, mAbs200, rankMap } = useMemo(()=>{
    const ret200vals=results.map(r=>r.ret200??0).sort((a,b)=>a-b);
    const p25=ret200vals[Math.floor(ret200vals.length*0.25)]??-Infinity;
    const filterFns=[];
    if(filters.allPositive) filterFns.push(r=>(r.ret20??-1)>0&&(r.ret50??-1)>0&&(r.ret200??-1)>0);
    if(filters.minRet20)    filterFns.push(r=>(r.ret20??0)>=20);
    if(filters.minSharpe50) filterFns.push(r=>(r.sharpe50??0)>=1.0);
    if(filterFns.length>0)  filterFns.push(r=>(r.ret200??0)>p25);
    const base=[...results].filter(r=>r[sortKey]!=null&&!isNaN(r[sortKey]));
    const passCount=filterFns.length?base.filter(r=>filterFns.every(fn=>fn(r))).length:null;
    const sorted=base.filter(r=>filterFns.every(fn=>fn(r))).sort((a,b)=>(b[sortKey]??-999)-(a[sortKey]??-999)).slice(0,topN);
    const allRanked=[...results].filter(r=>!r.error&&r.score!=null).sort((a,b)=>b.score-a.score);
    const rankMap=new Map(allRanked.map((r,i)=>[r.symbol,i+1]));
    let mAbs20=1,mAbs50=1,mAbs200=1;
    for(const r of results){
      const a20=Math.abs(r.ret20??0),a50=Math.abs(r.ret50??0),a200=Math.abs(r.ret200??0);
      if(a20>mAbs20)mAbs20=a20; if(a50>mAbs50)mAbs50=a50; if(a200>mAbs200)mAbs200=a200;
    }
    return {sorted,passCount,mAbs20,mAbs50,mAbs200,rankMap};
  },[results,sortKey,topN,filters]);

  const {breadthPos,breadthNeg,avgRet20}=useMemo(()=>{
    if(!results.length) return {breadthPos:0,breadthNeg:0,avgRet20:0};
    let pos=0,neg=0,sum=0;
    for(const r of results){const v=r.ret20??0;if(v>0)pos++;else if(v<0)neg++;sum+=v;}
    return {breadthPos:pos,breadthNeg:neg,avgRet20:sum/results.length};
  },[results]);

  const pct=progress.total?Math.round(progress.done/progress.total*100):0;
  const histPct=histProg.total?Math.round(histProg.done/histProg.total*100):0;

  // ── 指标卡辅助组件（策略回测用）──
  function MetricCard({ label, strat, qqq, unit="", higherBetter=true, fmtFn=v=>v?.toFixed(2), alwaysRed=false }) {
    const better = strat!=null&&qqq!=null&&(higherBetter ? strat>qqq : strat<qqq);
    const worse  = strat!=null&&qqq!=null&&(higherBetter ? strat<qqq : strat>qqq);
    const valueColor = alwaysRed ? "#ee3344" : better ? "#00aa44" : worse ? "#ee3344" : T.textBright;
    return (
      <div style={{padding:"10px 14px", background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, minWidth:130}}>
        <div style={{fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:4}}>{label}</div>
        <div style={{fontSize:18, fontWeight:700, fontFamily:"monospace", color: valueColor}}>
          {strat!=null?(strat>=0?"+":"")+fmtFn(strat)+unit:"—"}
        </div>
        <div style={{fontSize:10, color:T.textMuted, marginTop:2}}>
          QQQ: {qqq!=null?(qqq>=0?"+":"")+fmtFn(qqq)+unit:"—"}
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh", background:T.pageBg, color:T.text, fontFamily:"'IBM Plex Mono',monospace"}}>

      {/* ── 顶部导航 ── */}
      <div style={{padding:"14px 28px", borderBottom:`1px solid ${T.navBorder}`,
        background:T.navBg, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",
            background:loading?"#00c96e":"#3a5868", boxShadow:loading?"0 0 8px #00c96e":"none",
            animation:loading?"pulse 1s infinite":"none"}}/>
          <span style={{fontSize:17, fontWeight:700, color:T.textBright, letterSpacing:1.5}}>QQQ MOMENTUM SCANNER</span>
          <span style={{fontSize:10, color:T.textMuted, border:`1px solid ${T.navBorder}`, padding:"2px 7px", borderRadius:4, letterSpacing:2}}>20D · 50D · 200D</span>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
          {/* 标签切换 */}
          {[{id:"scanner",label:"扫描器"},{id:"backtest",label:"策略回测"}].map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
              padding:"5px 14px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12,
              background: activeTab===tab.id?T.btnActiveBg:"transparent",
              border:`1px solid ${activeTab===tab.id?T.btnActiveBdr:T.navBorder}`,
              color: activeTab===tab.id?T.btnActiveClr:T.textSub,
            }}>{tab.label}</button>
          ))}
          {lastUpdated&&<span style={{fontSize:11,color:T.textMuted}}>Updated {lastUpdated.toLocaleTimeString()}</span>}
          <button onClick={()=>setDarkMode(d=>!d)} style={{
            padding:"4px 10px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:12,
            background:darkMode?"#1a2a3a":"#e0ecf8", border:`1px solid ${T.navBorder}`, color:T.textSub}}>
            {darkMode?"☀ 亮色":"☾ 暗色"}
          </button>
        </div>
      </div>

      {/* ══════════════ 扫描器标签 ══════════════ */}
      {activeTab === "scanner" && (
        <div style={{padding:"20px 28px"}}>
          {!loading&&results.length===0&&(
            <div style={{maxWidth:560,margin:"64px auto 0",textAlign:"center",color:T.textSub,fontSize:12}}>
              正在连接 Yahoo Finance，准备扫描 {QQQ_COMPONENTS.length} 只成分股…
            </div>
          )}
          {loading&&(
            <div style={{maxWidth:560,margin:"32px auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.textSub,marginBottom:6}}>
                <span>正在扫描… {progress.done} / {progress.total}</span><span>{pct}%</span>
              </div>
              <div style={{height:3,background:T.barTrack,borderRadius:2,overflow:"hidden",marginBottom:6}}>
                <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,#005bcc,#00c96e)",borderRadius:2}}/>
              </div>
              <button onClick={()=>{abortRef.current?.abort();setLoading(false);}}
                style={{marginTop:12,padding:"5px 14px",background:"transparent",
                  border:`1px solid ${T.border}`,borderRadius:6,color:T.textSub,fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>■ STOP</button>
            </div>
          )}
          {results.length>5&&(
            <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
              {[
                {label:"已扫描",val:results.length,unit:"只"},
                {label:"正动能 20D",val:breadthPos,unit:"只",color:"#00c96e"},
                {label:"负动能 20D",val:breadthNeg,unit:"只",color:"#ee3344"},
                {label:"均值 20D涨幅",val:fmtPct(avgRet20),color:retColor(avgRet20)},
              ].map(s=>(
                <div key={s.label} style={{padding:"10px 18px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,minWidth:130}}>
                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:3}}>{s.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:s.color??T.text,fontFamily:"monospace"}}>{s.val}{s.unit??""}</div>
                </div>
              ))}
              {qqqData&&(
                <div style={{padding:"10px 18px",background:T.cardBg,
                  border:`1px solid ${qqqData.aboveMA200?"#00c96e44":"#ee334444"}`,borderRadius:8,minWidth:150}}>
                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:3}}>QQQ 大盘状态</div>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:qqqData.aboveMA200?"#00c96e":"#ee3344"}}>
                    {qqqData.aboveMA200?"▲ 趋势健康":"▼ 趋势偏弱"}
                  </div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>
                    {qqqData.aboveMA200?"价格高于200日均线":"⚠️ 价格低于200日均线，谨慎买入"}
                  </div>
                </div>
              )}
            </div>
          )}
          {results.length>0&&(
            <Fragment>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {SORT_OPTS.map(o=>(
                  <button key={o.key} onClick={()=>setSortKey(o.key)} style={{padding:"5px 12px",...activeButtonStyle(sortKey===o.key,T)}}>{o.label}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:5,marginLeft:"auto",alignItems:"center"}}>
                <span style={{fontSize:11,color:T.textSub}}>Top</span>
                {[10,20,30,50].map(n=>(
                  <button key={n} onClick={()=>setTopN(n)} style={{padding:"4px 10px",...activeButtonStyle(topN===n,T)}}>{n}</button>
                ))}
                {!loading&&<button onClick={()=>runScan()} style={{padding:"4px 12px",background:"transparent",border:"1px solid #005bcc44",borderRadius:6,color:"#4499ff",fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>↻ 刷新</button>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:T.textSub,letterSpacing:1.5,marginRight:4}}>精选筛选</span>
              {[{key:"allPositive",label:"三周期同向",desc:"20/50/200日全为正"},{key:"minRet20",label:"20日 ≥ +20%",desc:"近期动能仍在持续"},{key:"minSharpe50",label:"夏普50 ≥ 1.0",desc:"风险调整后收益达标"}].map(({key,label,desc})=>{
                const on=filters[key];
                return (
                  <button key={key} onClick={()=>toggleFilter(key)} title={desc} style={{padding:"4px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit",borderRadius:6,transition:"all 0.15s",
                    background:on?(darkMode?"#003a1a":"#d0ffea"):"transparent",
                    border:`1px solid ${on?"#00aa55":T.borderMuted}`,color:on?"#00aa55":T.textSub}}>
                    {on?"✓ ":""}{label}
                  </button>
                );
              })}
              {passCount!==null&&<span style={{fontSize:11,color:"#00aa55",marginLeft:4}}>→ {passCount} 只通过</span>}
              {Object.values(filters).some(Boolean)&&(
                <button onClick={()=>setFilters({allPositive:false,minRet20:false,minSharpe50:false})}
                  style={{fontSize:10,color:T.textSub,background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"2px 6px"}}>清除</button>
              )}
            </div>
            </Fragment>
          )}
          {sorted.length>0&&(
            <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"70vh",border:`1px solid ${T.border}`,borderRadius:8}}>
              <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:12}}>
                <thead>
                  <tr>
                    {["#","代码","现价","60日走势","综合得分","信号","一致性","20日涨幅","50日涨幅","200日涨幅","20日夏普","50日夏普"].map(h=>(
                      <th key={h} style={{padding:"9px 10px",textAlign:"left",color:T.textSub,fontWeight:500,fontSize:10,letterSpacing:1.2,whiteSpace:"nowrap",
                        position:"sticky",top:0,zIndex:10,background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row,i)=>{
                    const isExp=expandedSym===row.symbol;
                    const medal=["🥇","🥈","🥉"][i]??null;
                    const bdrB=`1px solid ${T.border}`;
                    return (
                      <Fragment key={row.symbol}>
                        <tr onClick={()=>setExpandedSym(isExp?null:row.symbol)} className="data-row"
                          style={{background:isExp?T.rowExp:i<3?T.rowTop3:i%2===0?T.rowEven:"transparent",
                            cursor:"pointer",transition:"background 0.15s","--hover-bg":T.rowHover}}>
                          <td style={{...tdStyle,color:i<3?"#00c96e":T.textMuted,fontWeight:700,fontSize:11,borderBottom:bdrB}}>{medal??(i+1)}</td>
                          <td style={{...tdStyle,borderBottom:bdrB}}><span style={{fontWeight:700,color:T.textBright,fontSize:13,letterSpacing:1}}>{row.symbol}</span></td>
                          <td style={{...tdStyle,color:T.textPrice,fontFamily:"monospace",borderBottom:bdrB}}>${row.price?.toFixed(2)??"—"}</td>
                          <td style={{padding:"6px 10px",borderBottom:bdrB}}><Sparkline closes={row.closes} width={100} height={34} days={60}/></td>
                          <td style={{...tdStyle,borderBottom:bdrB}}><ScoreBadge score={row.score}/></td>
                          <td style={{...tdStyle,borderBottom:bdrB}}>{(()=>{
                            const rank=rankMap.get(row.symbol)??999;
                            const allPos=(row.ret20??-1)>0&&(row.ret50??-1)>0&&(row.ret200??-1)>0;
                            const buyOK=rank<=15&&allPos&&(row.sharpe50??0)>=1.0&&(row.ret20??0)<=60;
                            const avoidOK=(row.ret200??0)>200||!allPos;
                            if(buyOK) return <span style={{padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:darkMode?"#003a1a":"#d0ffea",border:"1px solid #00aa55",color:"#00aa55",whiteSpace:"nowrap"}}>买入参考</span>;
                            if(avoidOK) return <span style={{padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:700,background:darkMode?"#2a1000":"#fff3e0",border:"1px solid #cc6600",color:"#cc6600",whiteSpace:"nowrap"}}>观望</span>;
                            return <span style={{color:T.textVMuted,fontSize:11}}>—</span>;
                          })()}</td>
                          <td style={{...tdStyle,whiteSpace:"nowrap",borderBottom:bdrB}}>
                            {[row.ret20,row.ret50,row.ret200].map((v,di)=>(
                              <span key={di} title={["20D","50D","200D"][di]} style={{fontSize:14,marginRight:1,color:v==null?T.borderMuted:v>0?"#00c96e":"#ee3344"}}>●</span>
                            ))}
                          </td>
                          <td style={{...tdStyle,borderBottom:bdrB}}><MiniBar value={row.ret20} maxAbs={mAbs20} colorFn={retColor} barTrack={T.barTrack}/></td>
                          <td style={{...tdStyle,borderBottom:bdrB}}><MiniBar value={row.ret50} maxAbs={mAbs50} colorFn={retColor} barTrack={T.barTrack}/></td>
                          <td style={{...tdStyle,borderBottom:bdrB}}><MiniBar value={row.ret200} maxAbs={mAbs200} colorFn={retColor} barTrack={T.barTrack}/></td>
                          <td style={{...tdStyle,color:sharpeColor(row.sharpe20),fontFamily:"monospace",borderBottom:bdrB}}>{fmtNum(row.sharpe20)}</td>
                          <td style={{...tdStyle,color:sharpeColor(row.sharpe50),fontFamily:"monospace",borderBottom:bdrB}}>{fmtNum(row.sharpe50)}</td>
                        </tr>
                        {isExp&&(
                          <tr style={{background:T.rowExp}}>
                            <td colSpan={12} style={{padding:"20px 24px",borderBottom:bdrB}}>
                              <div style={{display:"flex",gap:32,flexWrap:"wrap",alignItems:"flex-start"}}>
                                <div>
                                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>{row.symbol} · 200日价格走势</div>
                                  <Sparkline closes={row.closes} width={340} height={90} days={200}/>
                                  <div style={{fontSize:10,color:T.textMuted,marginTop:4,display:"flex",justifyContent:"space-between",width:340}}>
                                    <span>200日前</span><span>今日</span>
                                  </div>
                                </div>
                                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,flex:1,minWidth:260}}>
                                  {[
                                    {label:"20日涨幅",val:fmtPct(row.ret20),color:retColor(row.ret20)},
                                    {label:"50日涨幅",val:fmtPct(row.ret50),color:retColor(row.ret50)},
                                    {label:"200日涨幅",val:fmtPct(row.ret200),color:retColor(row.ret200)},
                                    {label:"20日波动率",val:fmtNum(row.vol20,1,"%"),color:T.textPrice},
                                    {label:"50日波动率",val:fmtNum(row.vol50,1,"%"),color:T.textPrice},
                                    {label:"综合得分",val:fmtPct(row.score,1),color:retColor(row.score)},
                                    {label:"20日夏普",val:fmtNum(row.sharpe20),color:sharpeColor(row.sharpe20)},
                                    {label:"50日夏普",val:fmtNum(row.sharpe50),color:sharpeColor(row.sharpe50)},
                                    {label:"现价",val:"$"+(row.price?.toFixed(2)??"—"),color:T.textBright},
                                  ].map(s=>(
                                    <div key={s.label} style={{padding:"10px 12px",background:T.cardBg2,border:`1px solid ${T.border}`,borderRadius:7}}>
                                      <div style={{fontSize:10,color:T.textSub,marginBottom:3}}>{s.label}</div>
                                      <div style={{fontSize:15,fontWeight:700,color:s.color,fontFamily:"monospace"}}>{s.val}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* 回测面板 */}
                              <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1.2,marginBottom:6}}>回测 · 止损-9%常驻</div>
                                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                                    <span style={{fontSize:10,color:T.textVMuted,minWidth:36}}>入场</span>
                                    {[{id:"touch",label:"触线即买"},{id:"bounce",label:"反弹确认再买"},{id:"impulse_touch",label:"冲量+触线"},{id:"impulse_bounce",label:"冲量+反弹确认"}].map(({id,label})=>(
                                      <button key={id} onClick={e=>{e.stopPropagation();setBtEntry(id);}} style={{padding:"3px 9px",fontSize:10,cursor:"pointer",fontFamily:"inherit",borderRadius:5,
                                        background:btEntry===id?(darkMode?"#1a0040":"#ede8ff"):"transparent",
                                        border:`1px solid ${btEntry===id?"#9966ee":T.borderSub}`,
                                        color:btEntry===id?"#9966ee":T.textMuted}}>{label}</button>
                                    ))}
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                    <span style={{fontSize:10,color:T.textVMuted,minWidth:36}}>出场</span>
                                    {[{id:"mabreak",label:"均线破位"},{id:"dollar",label:"固定金额追踪"},{id:"atr2",label:"ATR×2"},{id:"atr3",label:"ATR×3"},{id:"rsi70",label:"RSI>70"},{id:"macd",label:"MACD死叉"},{id:"trail7",label:"追踪7%"},{id:"fixed20",label:"固定20日"}].map(({id,label})=>(
                                      <button key={id} onClick={e=>{e.stopPropagation();setBtMode(id);}} style={{padding:"3px 9px",fontSize:10,cursor:"pointer",fontFamily:"inherit",borderRadius:5,
                                        background:btMode===id?(darkMode?"#001a4a":"#e0eaff"):"transparent",
                                        border:`1px solid ${btMode===id?"#4488ee":T.borderSub}`,
                                        color:btMode===id?"#4488ee":T.textMuted}}>{label}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* 回测控制栏 */}
                                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{fontSize:11,color:T.textSub}}>回测期间</span>
                                    {["1y","2y","3y","5y"].map(rng=>(
                                      <button key={rng} onClick={e=>{e.stopPropagation();setBtRange(rng);}} style={{padding:"3px 9px",fontSize:10,cursor:"pointer",fontFamily:"inherit",borderRadius:5,
                                        background:btRange===rng?(darkMode?"#001a4a":"#e0eaff"):"transparent",
                                        border:`1px solid ${btRange===rng?"#4488ee":T.borderSub}`,color:btRange===rng?"#4488ee":T.textMuted}}>
                                        {rng.replace("y","年")}
                                      </button>
                                    ))}
                                    {btRange!=="1y"&&!btLongData[`${row.symbol}_${btRange}`]&&(
                                      <button disabled={btLongLoading} onClick={async e=>{
                                        e.stopPropagation();
                                        setBtLongLoading(true);
                                        try{
                                          const d=await fetchCandlesOHLC(row.symbol,btRange,new AbortController().signal);
                                          if(d) setBtLongData(prev=>({...prev,[`${row.symbol}_${btRange}`]:d}));
                                        }catch(e){}
                                        setBtLongLoading(false);
                                      }} style={{padding:"3px 12px",fontSize:10,cursor:btLongLoading?"not-allowed":"pointer",fontFamily:"inherit",borderRadius:5,
                                        background:"transparent",border:`1px solid #9966ee`,color:"#cc99ff",opacity:btLongLoading?0.6:1}}>
                                        {btLongLoading?"加载中…":"↓ 加载历史数据"}
                                      </button>
                                    )}
                                    {btRange!=="1y"&&btLongData[`${row.symbol}_${btRange}`]&&(
                                      <span style={{fontSize:10,color:T.textVMuted}}>{btLongData[`${row.symbol}_${btRange}`].length} 日</span>
                                    )}
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                                    <span style={{fontSize:11,color:T.textSub}}>每笔入场</span>
                                    <span style={{fontSize:11,color:T.textMuted}}>$</span>
                                    <input type="number" value={btCapital} onChange={e=>{e.stopPropagation();setBtCapital(e.target.value);}} onClick={e=>e.stopPropagation()}
                                      style={{width:100,padding:"3px 8px",background:T.inputBg,border:`1px solid ${T.borderSub}`,borderRadius:4,color:T.text,fontFamily:"inherit",fontSize:12}}/>
                                  </div>
                                </div>
                                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                  {[5,10,20,50,200].map(ma=>{
                                    const longKey=`${row.symbol}_${btRange}`;
                                    const candles=btRange!=="1y"&&btLongData[longKey]?btLongData[longKey]:null;
                                    const closes=candles?candles.map(d=>d.c):row.closes;
                                    const highs=candles?candles.map(d=>d.h):row.highs;
                                    const lows=candles?candles.map(d=>d.l):row.lows;
                                    const vol20=candles&&closes.length>=21?calcVol(closes,20):row.vol20??0;
                                    const r=backtest(closes,highs,lows,ma,btEntry,btMode,vol20);
                                    const hasData=r&&r.n>0;
                                    const cap=parseFloat(btCapital)||0;
                                    const qqqRet1Y=qqqData?.closes?.length>1?((qqqData.closes.at(-1)-qqqData.closes[0])/qqqData.closes[0]*100):null;
                                    return (
                                      <div key={ma} style={{padding:"10px 14px",background:T.cardBg2,border:`1px solid ${hasData?T.borderSub:T.border}`,borderRadius:7,minWidth:150}}>
                                        <div style={{fontSize:10,color:"#4488ee",letterSpacing:1,marginBottom:6,fontWeight:600}}>
                                          {ma}日均线{btMode==="dollar"&&hasData&&<span style={{marginLeft:6,color:T.textSub,fontWeight:400}}>追踪{(r.dollarTrailPct*100).toFixed(0)}%</span>}
                                        </div>
                                        {!hasData?<div style={{fontSize:11,color:T.textVMuted}}>{r?"无触发信号":"数据不足"}</div>:(
                                          <>
                                            <div style={{fontSize:11,color:T.textMuted,marginBottom:4}}>触发 <span style={{color:T.text,fontWeight:600}}>{r.n}</span> 次 · 均持 {r.avgDays}日</div>
                                            <div style={{fontSize:16,fontWeight:700,fontFamily:"monospace",color:r.avgRet>=0?"#00c96e":"#ee3344"}}>{fmtPct(r.avgRet)}</div>
                                            <div style={{fontSize:10,color:T.textMuted,marginTop:2,marginBottom:6}}>平均收益</div>
                                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 10px",fontSize:10,marginBottom:6}}>
                                              <span style={{color:T.textVMuted}}>CAGR</span>
                                              <span style={{fontFamily:"monospace",color:r.cagr>=0?"#00aa44":"#ee3344"}}>{fmtPct(r.cagr,1)}</span>
                                              <span style={{color:T.textVMuted}}>Sharpe</span>
                                              <span style={{fontFamily:"monospace",color:r.sharpe>=1?"#00aa44":r.sharpe>=0?"#aaaa33":"#ee3344"}}>{r.sharpe.toFixed(2)}</span>
                                              <span style={{color:T.textVMuted}}>MDD</span>
                                              <span style={{fontFamily:"monospace",color:"#ee3344"}}>{r.mdd.toFixed(1)}%</span>
                                              {qqqRet1Y!=null&&<><span style={{color:T.textVMuted}}>vs QQQ</span>
                                              <span style={{fontFamily:"monospace",color:(r.cagr-qqqRet1Y)>=0?"#00aa44":"#ee3344"}}>{fmtPct(r.cagr-qqqRet1Y,1)}</span></>}
                                            </div>
                                            <div style={{fontSize:11,color:r.winRate>=60?"#00aa44":r.winRate>=45?"#aaaa33":"#ee5522",marginBottom:4}}>胜率 {r.winRate.toFixed(0)}%</div>
                                            <div style={{fontSize:10,color:T.textVMuted,marginBottom:cap>0?6:0}}>最好 <span style={{color:"#00c96e"}}>{fmtPct(r.best)}</span> · 最差 <span style={{color:"#ee3344"}}>{fmtPct(r.worst)}</span></div>
                                            {cap>0&&(()=>{
                                              const pnl=cap*r.totalRet/100;
                                              return <div style={{paddingTop:6,borderTop:`1px solid ${T.border}`,fontSize:11,color:T.textMuted}}>
                                                每笔${(cap/1000).toFixed(0)}K → 总盈亏 <span style={{fontFamily:"monospace",fontWeight:700,color:pnl>=0?"#00aa44":"#ee3344"}}>{pnl>=0?"+":""}{pnl>=1000?`$${(pnl/1000).toFixed(1)}K`:`$${pnl.toFixed(0)}`}</span>
                                              </div>;
                                            })()}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div style={{fontSize:10,color:T.textVMuted,marginTop:8}}>CAGR/Sharpe/MDD 基于顺序复利净值曲线（{btRange.replace("y","年")}） · vs QQQ 为扫描器1年涨幅差 · 不含手续费 · 仅供参考</div>
                              </div>
                              {/* 止损计算器 */}
                              <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                                <div style={{fontSize:10,color:T.textSub,letterSpacing:1.2,marginBottom:8}}>止损参考 — 输入你的买入价格</div>
                                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:T.textMuted}}>买入价 $</span>
                                  <input type="number" placeholder="例如 150.00" value={costBasis[row.symbol]??""} onChange={e=>setCostBasis(cb=>({...cb,[row.symbol]:e.target.value}))} onClick={e=>e.stopPropagation()} style={{width:110,padding:"4px 8px",background:T.inputBg,border:`1px solid ${T.borderSub}`,borderRadius:4,color:T.text,fontFamily:"inherit",fontSize:12}}/>
                                  {costBasis[row.symbol]&&(()=>{
                                    const buy=parseFloat(costBasis[row.symbol]);
                                    if(!buy||isNaN(buy)) return null;
                                    const stopPrice=buy*0.91, cur=row.price??0, pctFromBuy=((cur-buy)/buy)*100, triggered=cur>0&&cur<=stopPrice;
                                    return (
                                      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",fontSize:11}}>
                                        <span style={{color:T.textMuted}}>止损价: <span style={{color:"#ee5522",fontFamily:"monospace"}}>${stopPrice.toFixed(2)}</span></span>
                                        <span style={{color:T.textMuted}}>现价距买入: <span style={{fontFamily:"monospace",color:pctFromBuy>=0?"#00c96e":"#ee3344"}}>{fmtPct(pctFromBuy)}</span></span>
                                        {triggered?<span style={{padding:"2px 10px",borderRadius:4,background:darkMode?"#3a0000":"#fff0f0",border:"1px solid #ee3344",color:"#ee3344",fontWeight:700}}>⚠ 止损触发，建议卖出</span>:<span style={{padding:"2px 10px",borderRadius:4,background:darkMode?"#003a1a":"#d0ffea",border:"1px solid #00aa55",color:"#00aa55"}}>持有中</span>}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div style={{fontSize:10,color:T.textVMuted,marginTop:6}}>止损线 = 买入价 × 91%（-9%触发）· 仅供参考，不构成投资建议</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ 策略回测标签 ══════════════ */}
      {activeTab === "backtest" && (
        <div>
          {/* 二级 Tab：QQQ成分股轮动 | ETF跨资产策略 */}
          <div style={{
            display:"flex", gap:8, padding:"10px 28px 0",
            borderBottom:`1px solid ${T.navBorder}`, background:T.cardBg,
          }}>
            {[{id:"qqq",label:"QQQ 成分股轮动"},{id:"etf",label:"ETF 跨资产策略"}].map(sub=>(
              <button key={sub.id} onClick={()=>setBtSubTab(sub.id)} style={{
                padding:"7px 18px", borderRadius:"6px 6px 0 0",
                cursor:"pointer", fontFamily:"inherit", fontSize:12,
                background: btSubTab===sub.id ? T.pageBg : "transparent",
                border:`1px solid ${btSubTab===sub.id ? T.navBorder : "transparent"}`,
                borderBottom: btSubTab===sub.id ? `1px solid ${T.pageBg}` : "none",
                marginBottom: btSubTab===sub.id ? -1 : 0,
                color: btSubTab===sub.id ? T.textBright : T.textSub,
                fontWeight: btSubTab===sub.id ? 600 : 400,
              }}>{sub.label}</button>
            ))}
          </div>

          {/* ETF 跨资产策略内容 */}
          {btSubTab === "etf" && <EtfStrategyTab T={T} darkMode={darkMode} />}

          {/* QQQ 成分股轮动内容 */}
          {btSubTab === "qqq" && <div style={{padding:"20px 28px"}}>

          {/* 免责声明 */}
          <div style={{padding:"8px 14px",background:darkMode?"#1a1200":"#fffbe6",border:`1px solid #cc880044`,borderRadius:6,marginBottom:20,fontSize:11,color:"#cc8800"}}>
            ⚠️ 使用当前 QQQ 成分股回测，存在<strong>幸存者偏差</strong>（历史上被剔除的股票未计入）。结果仅供参考，不构成投资建议。不含交易成本。
          </div>

          {/* 加载数据区 */}
          <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:20}}>
            <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:10}}>STEP 1 · 加载历史数据</div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:histLoading?12:0}}>
              <span style={{fontSize:11,color:T.textMuted}}>历史深度</span>
              {["2y","3y","5y"].map(r=>(
                <button key={r} disabled={histLoading} onClick={()=>setHistRange(r)} style={{padding:"4px 12px",...activeButtonStyle(histRange===r,T)}}>{r==="2y"?"2年":r==="3y"?"3年":"5年"}</button>
              ))}
              <button disabled={histLoading} onClick={loadHistData} style={{
                padding:"5px 16px",borderRadius:6,cursor:histLoading?"not-allowed":"pointer",
                fontFamily:"inherit",fontSize:11,
                background:darkMode?"#004488":"#0055cc",
                border:"1px solid #4488ee",color:darkMode?"#88ccff":"#ffffff",
                opacity:histLoading?0.6:1}}>
                {histLoading?"加载中…":"加载历史数据"}
              </button>
              {histData&&!histLoading&&(
                <span style={{fontSize:11,color:"#00aa44"}}>
                  ✓ 已加载 {histData.size-1} 只股票 × {histRange==="2y"?"2年":histRange==="3y"?"3年":"5年"}数据
                </span>
              )}
            </div>
            {histLoading&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.textSub,marginBottom:4}}>
                  <span>正在拉取 {histProg.done} / {histProg.total}</span><span>{histPct}%</span>
                </div>
                <div style={{height:3,background:T.barTrack,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${histPct}%`,height:"100%",background:"linear-gradient(90deg,#005bcc,#00c96e)",borderRadius:2}}/>
                </div>
              </div>
            )}
          </div>

          {/* 当前操作建议（信号面板） */}
          {histData&&(
            <QqqSignalCard histData={histData} histTs={histTs} params={stratParams} T={T} darkMode={darkMode}/>
          )}

          {/* Mode A · Fixed Parameter Backtest（固定参数回测） */}
          {histData&&(
            <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:20}}>
              {/* 标题 */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <span style={{background:"#005bcc",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,letterSpacing:1}}>MODE A</span>
                <span style={{fontSize:12,color:T.textBright,fontWeight:600}}>Fixed Parameter Backtest</span>
                <span style={{fontSize:10,color:T.textVMuted}}>— 固定参数全程回测，不做优化</span>
              </div>

              <div style={{display:"flex",flexWrap:"wrap",gap:16,alignItems:"flex-start"}}>
                {/* 排名指标（动能回看期） */}
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>动能回看期</div>
                  <div style={{display:"flex",gap:4}}>
                    {[{v:"score",l:"综合"},{v:"ret20",l:"20日"},{v:"ret50",l:"50日"},{v:"ret200",l:"200日"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setStratParams(p=>({...p,sortMetric:v}))}
                        style={{padding:"4px 10px",...activeButtonStyle(stratParams.sortMetric===v,T)}}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* 持仓数量（TopN） */}
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>持仓数量 (TopN)</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {[3,5,10,15,20,25,30].map(n=>(
                      <button key={n} onClick={()=>setStratParams(p=>({...p,topN:n}))}
                        style={{padding:"4px 8px",...activeButtonStyle(stratParams.topN===n,T)}}>Top {n}</button>
                    ))}
                  </div>
                </div>

                {/* 调仓频率 */}
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>调仓频率</div>
                  <div style={{display:"flex",gap:4}}>
                    {[{v:"daily",l:"每日"},{v:"weekly",l:"每周"},{v:"monthly",l:"每月"},{v:"quarterly",l:"每季"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setStratParams(p=>({...p,rebalanceFreq:v}))}
                        style={{padding:"4px 10px",...activeButtonStyle(stratParams.rebalanceFreq===v,T)}}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* 市场过滤（QQQ 均线） */}
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>市场过滤（QQQ 跌破均线 → 转现金）</div>
                  <div style={{display:"flex",gap:4}}>
                    {[{v:"none",l:"不过滤"},{v:"ma50",l:">MA50"},{v:"ma100",l:">MA100"},{v:"ma200",l:">MA200"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setStratParams(p=>({...p,marketFilter:v}))}
                        style={{padding:"4px 10px",...activeButtonStyle(stratParams.marketFilter===v,T)}}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{marginTop:14,display:"flex",alignItems:"center",gap:12}}>
                <button onClick={()=>runStratBacktest()} style={{padding:"6px 20px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:12,
                  background:darkMode?"#004488":"#0055cc",border:"1px solid #4488ee",color:darkMode?"#88ccff":"#ffffff"}}>
                  ▶ 运行固定参数回测
                </button>
                <span style={{fontSize:10,color:T.textVMuted}}>当前：{fmtParamLabel(stratParams)}</span>
              </div>
            </div>
          )}

          {/* 回测结果 */}
          {stratResult?.metrics&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:12}}>绩效对比</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
                <MetricCard label="CAGR（年化收益）" strat={stratResult.metrics.cagr} qqq={stratResult.qqqMetrics?.cagr} unit="%" fmtFn={v=>v.toFixed(1)}/>
                <MetricCard label="Sharpe Ratio" strat={stratResult.metrics.sharpe} qqq={stratResult.qqqMetrics?.sharpe} fmtFn={v=>v.toFixed(2)}/>
                <MetricCard label="最大回撤 MDD" strat={stratResult.metrics.mdd} qqq={stratResult.qqqMetrics?.mdd} unit="%" higherBetter={true} fmtFn={v=>v.toFixed(1)} alwaysRed={true}/>
                <MetricCard label="累积收益" strat={stratResult.metrics.total} qqq={stratResult.qqqMetrics?.total} unit="%" fmtFn={v=>v.toFixed(1)}/>
                <div style={{padding:"10px 14px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,minWidth:130}}>
                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:4}}>换股次数</div>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:T.textBright}}>{stratResult.turnover}</div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>含买入操作</div>
                </div>
              </div>
              {/* 资金模拟 */}
              {(()=>{
                const c=parseFloat(initCapital);
                const eq=stratResult.equityCurve;
                const qEq=stratResult.qqqEq;
                const finalStrat=!isNaN(c)&&eq?.length?c*eq[eq.length-1]:null;
                const finalQQQ=!isNaN(c)&&qEq?.length?c*qEq[qEq.length-1]:null;
                const fmtM=v=>v>=1e6?`${(v/1e6).toFixed(2)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:`${v.toFixed(0)}`;
                return (
                  <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:16,padding:"10px 16px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8}}>
                    <span style={{fontSize:11,color:T.textSub,whiteSpace:"nowrap"}}>起始资金</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:12,color:T.textMuted}}>$</span>
                      <input type="number" value={initCapital} onChange={e=>setInitCapital(e.target.value)}
                        style={{width:110,padding:"4px 8px",background:T.inputBg,border:`1px solid ${T.borderSub}`,borderRadius:4,color:T.text,fontFamily:"inherit",fontSize:12}}/>
                    </div>
                    {finalStrat!=null&&(
                      <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:12,color:T.textMuted}}>策略最终:&nbsp;<span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:finalStrat>=c?"#00aa44":"#ee3344"}}>${fmtM(finalStrat)}</span></span>
                        <span style={{fontSize:12,color:T.textMuted}}>QQQ最终:&nbsp;<span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:finalQQQ!=null&&finalQQQ>=c?"#00aa44":"#ee3344"}}>{finalQQQ!=null?`$${fmtM(finalQQQ)}`:"—"}</span></span>
                        <span style={{fontSize:11,color:finalStrat>=c?"#00aa44":"#ee3344",fontFamily:"monospace"}}>{finalStrat>=c?"▲":"▼"} {finalQQQ!=null?fmtPct((finalStrat-finalQQQ)/finalQQQ*100):"—"} vs QQQ</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 净值曲线 */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>净值曲线（策略 vs QQQ）</div>
                <EquityCurveChart stratEq={stratResult.equityCurve} qqqEq={stratResult.qqqEq} timestamps={stratResult.timestamps} T={T}/>
              </div>

              {/* Drawdown */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>回撤曲线</div>
                <DrawdownChart drawdowns={stratResult.metrics.drawdowns} timestamps={stratResult.timestamps} T={T}/>
              </div>

              {/* 年度收益 */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>年度收益对比</div>
                <AnnualBarsChart stratAnnual={stratResult.metrics.annualRets} qqqAnnual={stratResult.qqqMetrics?.annualRets??{}} T={T}/>
              </div>

              {/* 月度热图 */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:10}}>月度收益热图（策略）</div>
                <MonthlyHeatmap monthlyRets={stratResult.metrics.monthlyRets} T={T}/>
              </div>
            </div>
          )}

          {/* 一键优化（Full Grid Search on full data） */}
          {histData&&(
            <div style={{marginBottom:20}}>
              <button onClick={()=>setShowOpt(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
                background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
                color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
                <span style={{color:"#4488ee",fontWeight:700}}>{showOpt?"▼":"▶"}</span>
                参数全量扫描（Grid Search，448 种组合）
                {optResult&&<span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
              </button>
              {showOpt&&(
                <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:4}}>
                    动能回看期×4 · TopN×7 · 调仓频率×4 · 市场过滤×4 = 448 种组合（全量历史数据）
                  </div>
                  <div style={{fontSize:10,color:"#cc8800",marginBottom:12}}>
                    ⚠️ 注意：此处是在全量数据上选参，结果存在 in-sample 过拟合风险。如需无偏验证，请使用下方 Walk Forward Optimization。
                  </div>
                  <button disabled={optRunning} onClick={handleRunOptimize} style={{padding:"5px 18px",borderRadius:6,cursor:optRunning?"not-allowed":"pointer",
                    fontFamily:"inherit",fontSize:11,background:darkMode?"#004488":"#0055cc",
                    border:"1px solid #4488ee",color:darkMode?"#88ccff":"#ffffff",opacity:optRunning?0.6:1,marginBottom:14}}>
                    {optRunning?"⏳ 优化中…":"▶ 开始优化"}
                  </button>
                  {optResult&&(()=>{
                    const bySharpe=[...optResult].sort((a,b)=>b.metrics.sharpe-a.metrics.sharpe).slice(0,5);
                    const byCagr  =[...optResult].sort((a,b)=>b.metrics.cagr-a.metrics.cagr).slice(0,5);
                    const byMdd   =[...optResult].sort((a,b)=>b.metrics.mdd-a.metrics.mdd).slice(0,5);
                    const byRatio =[...optResult].sort((a,b)=>(b.metrics.cagr/Math.abs(b.metrics.mdd||1))-(a.metrics.cagr/Math.abs(a.metrics.mdd||1))).slice(0,5);
                    const sections=[
                      {title:"Sharpe 最高",data:bySharpe,key:"sharpe",fmt:v=>v.toFixed(2)},
                      {title:"CAGR 最高",data:byCagr,key:"cagr",fmt:v=>v.toFixed(1)+"%"},
                      {title:"MDD 最低",data:byMdd,key:"mdd",fmt:v=>v.toFixed(1)+"%"},
                      {title:"CAGR/MDD 最优",data:byRatio,key:"cagr",fmt:v=>v.toFixed(1)+"%"},
                    ];
                    return (
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                        {sections.map(sec=>(
                          <div key={sec.title} style={{border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden"}}>
                            <div style={{padding:"7px 12px",background:T.theadBg,fontSize:10,color:T.textSub,letterSpacing:1}}>{sec.title}</div>
                            <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10}}>
                              <thead>
                                <tr>
                                  <th style={{padding:"5px 10px",textAlign:"left",color:T.textVMuted,fontWeight:400}}>参数</th>
                                  <th style={{padding:"5px 10px",textAlign:"right",color:T.textVMuted,fontWeight:400}}>{sec.title.split(" ")[0]}</th>
                                  <th style={{padding:"5px 10px",textAlign:"right",color:T.textVMuted,fontWeight:400}}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {sec.data.map((r,i)=>(
                                  <tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                                    <td style={{padding:"5px 10px",color:T.text}}>{fmtParamLabel(r.params)}</td>
                                    <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"monospace",
                                      color:sec.key==="mdd"?"#ee3344":"#00aa44"}}>
                                      {sec.fmt(r.metrics[sec.key])}
                                    </td>
                                    <td style={{padding:"5px 8px"}}>
                                      <button onClick={()=>{const p={...r.params};setStratParams(p);runStratBacktest(p);}} style={{padding:"2px 8px",fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:4,
                                        background:"transparent",border:`1px solid ${T.borderSub}`,color:T.textSub}}>应用并回测</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Mode B · Walk Forward Optimization */}
          {histData&&(
            <div style={{marginBottom:20}}>
              <button onClick={()=>setShowWfo(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
                background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
                color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
                <span style={{color:"#aa66ff",fontWeight:700}}>{showWfo?"▼":"▶"}</span>
                <span style={{background:"#5522aa",color:darkMode?"#ddb8ff":"#ffffff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,letterSpacing:1}}>MODE B</span>
                Walk Forward Optimization（滚动验证，无未来数据）
                {wfoResult&&<span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
              </button>

              {showWfo&&(
                <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>

                  {/* 说明 */}
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:10,lineHeight:1.6}}>
                    <b style={{color:T.textSub}}>正确 WFO 逻辑</b>：① in-sample 跑 Grid Search(448种) → ② 按优化指标选最佳参数 →
                    ③ <b style={{color:"#88bbff"}}>固定该参数</b>跑 out-of-sample → ④ 记录绩效（不重新选参）→ ⑤ 串接所有 OOS 得总绩效。
                    窗口比例：in-sample 70% / out-of-sample 30%。
                    <span style={{color:"#88bbff",marginLeft:6}}>
                      🔒 <b>IS / OOS 参数严格一致</b>：OOS 期使用的参数 = IS 期 Grid Search 选出的最优参数，绝不事后调整。
                    </span>
                  </div>

                  {/* 优化指标选择 */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <span style={{fontSize:10,color:T.textSub,whiteSpace:"nowrap"}}>in-sample 优化指标：</span>
                    {[{v:"sharpe",l:"Sharpe（推荐）"},{v:"cagr",l:"CAGR"},{v:"calmar",l:"Calmar (CAGR/MDD)"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setWfoOptMetric(v)}
                        style={{padding:"4px 10px",fontSize:10,...activeButtonStyle(wfoOptMetric===v,T)}}>{l}</button>
                    ))}
                  </div>

                  <button disabled={wfoRunning} onClick={handleRunWFO} style={{padding:"6px 20px",borderRadius:6,cursor:wfoRunning?"not-allowed":"pointer",
                    fontFamily:"inherit",fontSize:12,background:darkMode?"#220044":"#5522aa",
                    border:"1px solid #9966ee",color:darkMode?"#cc99ff":"#ffffff",opacity:wfoRunning?0.6:1,marginBottom:16}}>
                    {wfoRunning?"⏳ 运行中（448种×窗口数）…":"▶ 运行 Walk Forward Optimization"}
                  </button>

                  {wfoResult&&(()=>{
                    const cm=wfoResult.combinedMetrics, qm=wfoResult.qqqCombinedMetrics;
                    const optLabel = {sharpe:"Sharpe",cagr:"CAGR",calmar:"Calmar"}[wfoResult.optMetric]||wfoResult.optMetric;
                    return (
                      <>
                        {/* 运行摘要 */}
                        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14,padding:"10px 14px",
                          background:T.cardBg2,border:`1px solid ${T.border}`,borderRadius:7,fontSize:10}}>
                          <span style={{color:T.textSub}}>窗口数：<b style={{color:T.textBright}}>{wfoResult.windowCount}</b></span>
                          <span style={{color:T.textSub}}>参数组合数/窗口：<b style={{color:T.textBright}}>{wfoResult.totalCombos}</b></span>
                          <span style={{color:T.textSub}}>in-sample 优化指标：<b style={{color:"#cc99ff"}}>{optLabel}</b></span>
                          <span style={{color:T.textSub}}>OOS 总数据点：<b style={{color:T.textBright}}>{wfoResult.allOutEquity.length}</b> 天</span>
                        </div>

                        {/* ── 逐窗口明细表 ── */}
                        <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:6}}>
                          逐窗口明细（in-sample 选参 → out-of-sample 验证）
                        </div>
                        {/* IS = OOS 参数一致性说明 */}
                        <div style={{
                          padding:"8px 12px",marginBottom:10,
                          background:"#4488ee14",border:"1px solid #4488ee40",
                          borderRadius:6,fontSize:10,color:T.textSub,lineHeight:1.6,
                        }}>
                          ⚡ <b style={{color:"#88bbff"}}>参数一致性保证</b>：每个窗口的 OOS 期间
                          严格使用 IS 期选出的最佳参数，<b style={{color:T.textBright}}>不重新优化、不事后调参</b>。
                          下表各参数列（紫色）同时标注 IS 选参结果 = OOS 实际使用参数。
                        </div>
                        <div style={{overflowX:"auto",marginBottom:20}}>
                          <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10,minWidth:900}}>
                            <thead>
                              <tr>
                                {[
                                  {h:"#",note:""},
                                  {h:"In-Sample 时间",note:"训练期"},
                                  {h:"Out-of-Sample 时间",note:"验证期"},
                                  {h:"选出 TopN",note:"IS→OOS（一致）"},
                                  {h:"动能回看期",note:"IS→OOS（一致）"},
                                  {h:"调仓频率",note:"IS→OOS（一致）"},
                                  {h:"市场过滤",note:"IS→OOS（一致）"},
                                  {h:`IS ${optLabel}`,note:"in-sample 得分"},
                                  {h:"OOS CAGR",note:""},
                                  {h:"OOS Sharpe",note:""},
                                  {h:"OOS MDD",note:""},
                                  {h:"OOS 总收益",note:""},
                                  {h:"QQQ CAGR",note:"同期基准"},
                                ].map(({h,note})=>(
                                  <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:500,fontSize:9,
                                    background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`,whiteSpace:"nowrap",
                                    color:T.textSub}}>
                                    {h}
                                    {note&&<div style={{fontSize:8,color:T.textVMuted,fontWeight:400}}>{note}</div>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {wfoResult.windowResults.map((w,i)=>{
                                const bp=w.bestParams;
                                const mfLabel={none:"不过滤",ma50:">MA50",ma100:">MA100",ma200:">MA200"}[bp.marketFilter]||"—";
                                const rfLabel={daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季"}[bp.rebalanceFreq]||bp.rebalanceFreq;
                                const smLabel={score:"综合",ret20:"20日",ret50:"50日",ret200:"200日"}[bp.sortMetric]||bp.sortMetric;
                                const isScore=wfoResult.optMetric==='cagr'?w.inSampleCAGR:w.inSampleSharpe;
                                return (
                                  <tr key={i} style={{background:i%2===0?T.cardBg:T.cardBg2}}>
                                    <td style={{padding:"7px 10px",color:T.textVMuted,textAlign:"center",fontWeight:700}}>{w.winIdx}</td>
                                    <td style={{padding:"7px 10px",color:T.textMuted,whiteSpace:"nowrap"}}>{w.inPeriod}</td>
                                    <td style={{padding:"7px 10px",color:T.textBright,whiteSpace:"nowrap",fontWeight:600}}>{w.outPeriod}</td>
                                    {/* ── in-sample 选出的参数 ── */}
                                    <td style={{padding:"7px 10px",color:"#cc99ff",fontFamily:"monospace",fontWeight:700}}>Top {bp.topN}</td>
                                    <td style={{padding:"7px 10px",color:"#cc99ff"}}>{smLabel}</td>
                                    <td style={{padding:"7px 10px",color:"#cc99ff"}}>{rfLabel}</td>
                                    <td style={{padding:"7px 10px",color:"#cc99ff",whiteSpace:"nowrap"}}>{mfLabel}</td>
                                    {/* in-sample 评分 */}
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",color:T.textSub}}>{isScore!=null?isScore.toFixed(2):"—"}</td>
                                    {/* ── out-of-sample 实际绩效 ── */}
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",fontWeight:700,
                                      color:w.outMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>
                                      {w.outMetrics?fmtPct(w.outMetrics.cagr,1):"—"}
                                    </td>
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",color:T.text}}>
                                      {w.outMetrics?w.outMetrics.sharpe.toFixed(2):"—"}
                                    </td>
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#ee3344"}}>
                                      {w.outMetrics?fmtPct(w.outMetrics.mdd,1):"—"}
                                    </td>
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",
                                      color:w.outMetrics?.total>=0?"#00aa44":"#ee3344"}}>
                                      {w.outMetrics?fmtPct(w.outMetrics.total,1):"—"}
                                    </td>
                                    <td style={{padding:"7px 10px",fontFamily:"monospace",
                                      color:w.qqqOutMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>
                                      {w.qqqOutMetrics?fmtPct(w.qqqOutMetrics.cagr,1):"—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* ── WFO 总绩效（所有 OOS 串接）── */}
                        <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>
                          Mode B · WFO Combined OOS 绩效（所有 out-of-sample 串接，无事后挑选）
                        </div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                          {cm&&[
                            {label:"Combined OOS CAGR",   strat:cm.cagr,  qqq:qm?.cagr,  unit:"%", fmtFn:v=>v.toFixed(1)},
                            {label:"Combined OOS Sharpe", strat:cm.sharpe,qqq:qm?.sharpe,unit:"",  fmtFn:v=>v.toFixed(2)},
                            {label:"Combined OOS MDD",    strat:cm.mdd,   qqq:qm?.mdd,   unit:"%", higherBetter:true,fmtFn:v=>v.toFixed(1), alwaysRed:true},
                            {label:"Combined OOS 总收益", strat:cm.total, qqq:qm?.total,  unit:"%", fmtFn:v=>v.toFixed(1)},
                          ].map((s,i)=><MetricCard key={i} {...s}/>)}
                        </div>

                        {/* WFO OOS 净值曲线 */}
                        {wfoResult.allOutEquity.length>10&&(
                          <div style={{background:T.cardBg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",overflowX:"auto",marginBottom:12}}>
                            <div style={{fontSize:10,color:T.textSub,marginBottom:8}}>
                              WFO Combined OOS 净值曲线（策略 蓝线 vs QQQ 灰虚线）
                            </div>
                            <EquityCurveChart stratEq={wfoResult.allOutEquity} qqqEq={wfoResult.qqqWfoEq} timestamps={wfoResult.allOutTs} T={T}/>
                          </div>
                        )}

                        {/* Mode A vs Mode B 对比卡 */}
                        {stratResult?.metrics&&cm&&(()=>{
                          const sa=stratResult.metrics, qa=stratResult.qqqMetrics;
                          const rows=[
                            {mode:"Mode A · Fixed Param Backtest（全量数据，含 in-sample）",cagr:sa.cagr,sharpe:sa.sharpe,mdd:sa.mdd,total:sa.total},
                            {mode:"Mode B · WFO Combined OOS（纯 out-of-sample，无事后挑参）",cagr:cm.cagr,sharpe:cm.sharpe,mdd:cm.mdd,total:cm.total},
                            {mode:"QQQ Buy & Hold（同 OOS 期间基准）",cagr:qm?.cagr,sharpe:qm?.sharpe,mdd:qm?.mdd,total:qm?.total},
                          ];
                          return (
                            <div style={{marginTop:8}}>
                              <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>Mode A vs Mode B 最终对比</div>
                              <div style={{overflowX:"auto"}}>
                                <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10,minWidth:600}}>
                                  <thead>
                                    <tr>
                                      {["模式","CAGR","Sharpe","MDD","累积收益"].map(h=>(
                                        <th key={h} style={{padding:"6px 12px",textAlign:"left",fontWeight:500,fontSize:9,
                                          background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`,color:T.textSub}}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r,i)=>(
                                      <tr key={i} style={{background:i===1?(darkMode?"#1a0033":"#f3eeff"):i===2?(darkMode?"#111":"#f5f5f5"):T.cardBg}}>
                                        <td style={{padding:"7px 12px",color:i===1?"#cc99ff":i===2?"#888":T.textSub,fontSize:10}}>{r.mode}</td>
                                        <td style={{padding:"7px 12px",fontFamily:"monospace",fontWeight:700,color:r.cagr>=0?"#00aa44":"#ee3344"}}>{r.cagr!=null?fmtPct(r.cagr,1):"—"}</td>
                                        <td style={{padding:"7px 12px",fontFamily:"monospace",color:T.text}}>{r.sharpe!=null?r.sharpe.toFixed(2):"—"}</td>
                                        <td style={{padding:"7px 12px",fontFamily:"monospace",color:"#ee3344"}}>{r.mdd!=null?fmtPct(r.mdd,1):"—"}</td>
                                        <td style={{padding:"7px 12px",fontFamily:"monospace",color:r.total>=0?"#00aa44":"#ee3344"}}>{r.total!=null?fmtPct(r.total,1):"—"}</td>
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
          )}

          </div>}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px;background:${T.scrollBg}}
        ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:3px}
        .data-row:hover td{background:${T.rowHover}!important}
        button:hover{opacity:0.8}
        input:focus{border-color:#005bcc!important;outline:none}
      `}</style>
    </div>
  );
}
