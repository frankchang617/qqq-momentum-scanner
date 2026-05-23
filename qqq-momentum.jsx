import { useState, useCallback, useRef, useMemo, useId, useEffect, Fragment } from "react";

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

// Threshold arrays must be in descending order
function makeColorScale(steps) {
  return (v) => {
    if (v == null || isNaN(v)) return "#444";
    return steps.find(([t]) => v >= t)?.[1] ?? steps.at(-1)[1];
  };
}
const retColor = makeColorScale([
  [20,"#00ff88"],[10,"#33dd99"],[5,"#66cc99"],[0,"#88aabb"],
  [-5,"#cc8877"],[-15,"#dd5544"],[-Infinity,"#ff2233"],
]);
const sharpeColor = makeColorScale([
  [1.5,"#00ff88"],[0.8,"#33dd99"],[0.3,"#66cc99"],
  [0,"#88aabb"],[-0.5,"#cc8877"],[-Infinity,"#dd5544"],
]);

function fmtNum(v, d=2, suffix="") {
  if (v == null || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(d) + suffix;
}
const fmtPct = (v, d=1) => fmtNum(v, d, "%");

function activeButtonStyle(isActive) {
  return {
    background: isActive ? "#005bcc22" : "transparent",
    border: `1px solid ${isActive ? "#005bcc" : "#182030"}`,
    color: isActive ? "#4499ff" : "#7a9aaa",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 11,
    cursor: "pointer",
  };
}

const tdStyle = { padding: "10px 10px" };

function Sparkline({ closes, width=100, height=36, days=60 }) {
  const uid = useId();
  if (!closes || closes.length < 5) return (
    <div style={{width, height, display:"flex", alignItems:"center",
      justifyContent:"center", color:"#607080", fontSize:10}}>N/A</div>
  );
  const slice = closes.slice(-days);
  const min = slice.reduce((a, b) => a < b ? a : b);
  const max = slice.reduce((a, b) => a > b ? a : b);
  const range = max - min || 1;
  const pad = 2;
  const iw = width - pad*2, ih = height - pad*2;
  const pts = slice.map((v, i) => {
    const x = pad + (i / (slice.length - 1)) * iw;
    const y = pad + ih - ((v - min) / range) * ih;
    return `${x},${y}`;
  }).join(" ");
  const first = slice[0], last = slice[slice.length - 1];
  const color = last >= first ? "#00ff88" : "#ff3344";
  const lastX = pad + iw, lastY = pad + ih - ((last - min) / range) * ih;
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
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={lastX} cy={lastY} r="2.5" fill={color}/>
    </svg>
  );
}

function MiniBar({ value, maxAbs, colorFn }) {
  const color = colorFn(value);
  const pct = Math.min(Math.abs(value ?? 0) / (maxAbs || 1), 1) * 100;
  return (
    <div style={{display:"flex", alignItems:"center", gap:6}}>
      <div style={{width:56, height:5, background:"#141e2a", borderRadius:3, overflow:"hidden"}}>
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
    <div style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth:62, height:26, borderRadius:6,
      background: c+"1a", border:`1px solid ${c}44`,
      color:c, fontWeight:700, fontSize:12, fontFamily:"monospace"
    }}>{fmtPct(score, 1)}</div>
  );
}

async function fetchCandles(symbol, signal) {
  const url = `/api/yahoo?symbol=${symbol}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (!closes || closes.length < 10) return null;
      return closes.filter(v => v != null);
    } catch (e) {
      if (signal.aborted || attempt === 1) throw e;
    }
  }
}

function calcReturn(closes, days) {
  if (!closes || closes.length <= days) return null;
  const cur = closes.at(-1), past = closes.at(-1 - days);
  if (!past) return null;
  return ((cur - past) / past) * 100;
}

function calcVol(closes, days) {
  if (!closes || closes.length < days + 2) return null;
  const sl = closes.slice(-days - 1);
  const rets = sl.slice(1).map((v, i) => Math.log(v / sl[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

function calcSharpe(ret, vol) {
  if (ret == null || !vol || vol === 0) return null;
  return ret / vol;
}

// 回测：回调至 maDays 均线买入，三种出场模式
// exitMode: "mabreak"=均线破位出 | "trail7"=追踪止损7% | "fixed20"=固定20日
function backtest(closes, maDays, exitMode = "mabreak") {
  const STOP = 0.09, MAX_DAYS = 120, TRAIL = 0.07;
  if (!closes || closes.length < maDays + 20 + 5) return null;

  // O(n) 预计算 MA 数组
  const maArr = new Array(closes.length).fill(null);
  let sum = 0;
  for (let k = 0; k < closes.length; k++) {
    sum += closes[k];
    if (k >= maDays) sum -= closes[k - maDays];
    if (k >= maDays - 1) maArr[k] = sum / maDays;
  }

  const trades = [];
  for (let i = maDays + 1; i < closes.length - 5; i++) {
    const ma = maArr[i], prevMa = maArr[i - 1];
    if (!ma || !prevMa) continue;
    const cur = closes[i], prev = closes[i - 1];
    // 入场：前一天在均线上方 1%，当天拉回至均线 ±2%
    if (prev < prevMa * 1.01) continue;
    if (cur > ma * 1.02 || cur < ma * 0.97) continue;

    const entry = closes[i + 1];
    if (!entry) continue;

    let exit = null, exitDay = 0, peak = entry;
    const limit = Math.min(MAX_DAYS, closes.length - i - 3);

    for (let j = 1; j <= limit; j++) {
      const k = i + 1 + j;
      const p = closes[k];
      if (!p) { exit = closes[k - 1]; exitDay = j - 1; break; }
      if (p > peak) peak = p;
      if (p <= entry * (1 - STOP))                           { exit = p; exitDay = j; break; }
      if (exitMode === "fixed20"  && j === 20)               { exit = p; exitDay = j; break; }
      if (exitMode === "mabreak"  && maArr[k] && p < maArr[k]) { exit = p; exitDay = j; break; }
      if (exitMode === "trail7"   && p <= peak * (1 - TRAIL)){ exit = p; exitDay = j; break; }
      if (j === limit)                                        { exit = p; exitDay = j; }
    }

    if (!exit) continue;
    trades.push({ ret: (exit - entry) / entry * 100, days: exitDay });
  }

  if (!trades.length) return { n: 0 };
  const wins = trades.filter(t => t.ret > 0).length;
  return {
    n:       trades.length,
    winRate: wins / trades.length * 100,
    avgRet:  trades.reduce((a, t) => a + t.ret, 0) / trades.length,
    avgDays: Math.round(trades.reduce((a, t) => a + t.days, 0) / trades.length),
    best:    Math.max(...trades.map(t => t.ret)),
    worst:   Math.min(...trades.map(t => t.ret)),
  };
}

export default function App() {
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [progress,    setProgress]    = useState({done:0, total:0});
  const [sortKey,     setSortKey]     = useState("score");
  const [topN,        setTopN]        = useState(20);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedSym, setExpandedSym] = useState(null);
  const [filters,     setFilters]     = useState({ allPositive:false, minRet20:false, minSharpe50:false });
  const [qqqData,     setQqqData]     = useState(null);
  const [costBasis,   setCostBasis]   = useState({});
  const [btMode,      setBtMode]      = useState("mabreak");
  const abortRef   = useRef(null);

  const toggleFilter = useCallback(key =>
    setFilters(f => ({ ...f, [key]: !f[key] })), []);

  const runScan = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true); setResults([]);
    setProgress({done:0, total:QQQ_COMPONENTS.length});

    const all = [], successes = [];
    const BATCH = 5;
    for (let i = 0; i < QQQ_COMPONENTS.length; i += BATCH) {
      if (signal.aborted) break;
      const batch = QQQ_COMPONENTS.slice(i, i + BATCH);
      const batchRes = await Promise.all(batch.map(async sym => {
        try {
          const raw = await fetchCandles(sym, signal);
          if (!raw) return { symbol:sym, error:true };
          // Keep full year — 252 days for backtest coverage + 200D metrics
          const closes = raw.slice(-252);
          const ret20    = calcReturn(closes, 20);
          const ret50    = calcReturn(closes, 50);
          const ret200   = calcReturn(closes, 200);
          const vol20    = calcVol(closes, 20);
          const vol50    = calcVol(closes, 50);
          const sharpe20 = calcSharpe(ret20, vol20);
          const sharpe50 = calcSharpe(ret50, vol50);
          const score    = (ret20??0)*0.45 + (ret50??0)*0.35 + (ret200??0)*0.20;
          return { symbol:sym, closes, ret20, ret50, ret200, vol20, vol50,
                   sharpe20, sharpe50, score, price:raw.at(-1), error:false };
        } catch(e) {
          return { symbol:sym, error:true };
        }
      }));
      all.push(...batchRes);
      successes.push(...batchRes.filter(r => !r.error));
      setProgress({done:i + batch.length, total:QQQ_COMPONENTS.length});
      setResults([...successes]);
      if (i + BATCH < QQQ_COMPONENTS.length && !signal.aborted) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    if (!signal.aborted) {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    runScan();
  }, [runScan]);

  // 单独获取 QQQ 自身数据作为大盘指标
  useEffect(() => {
    const controller = new AbortController();
    fetchCandles("QQQ", controller.signal).then(raw => {
      if (!raw) return;
      const closes = raw.slice(-202);
      const ret20  = calcReturn(closes, 20);
      const ret200 = calcReturn(closes, 200);
      const ma200  = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
      const price  = closes.at(-1);
      setQqqData({ ret20, ret200, ma200, price, aboveMA200: price > ma200 });
    }).catch(() => {});
    return () => controller.abort();
  }, []);


  const { sorted, passCount, mAbs20, mAbs50, mAbs200, rankMap } = useMemo(() => {
    // 200日涨幅第25百分位（用于极端尾部判断）
    const ret200vals = results.map(r => r.ret200 ?? 0).sort((a,b) => a-b);
    const p25 = ret200vals[Math.floor(ret200vals.length * 0.25)] ?? -Infinity;

    const filterFns = [];
    if (filters.allPositive) filterFns.push(r => (r.ret20??-1)>0 && (r.ret50??-1)>0 && (r.ret200??-1)>0);
    if (filters.minRet20)    filterFns.push(r => (r.ret20??0) >= 20);
    if (filters.minSharpe50) filterFns.push(r => (r.sharpe50??0) >= 1.0);
    if (filterFns.length > 0) filterFns.push(r => (r.ret200??0) > p25);

    const base = [...results].filter(r => r[sortKey] != null && !isNaN(r[sortKey]));
    const passCount = filterFns.length ? base.filter(r => filterFns.every(fn=>fn(r))).length : null;
    const sorted = base
      .filter(r => filterFns.every(fn => fn(r)))
      .sort((a, b) => (b[sortKey] ?? -999) - (a[sortKey] ?? -999))
      .slice(0, topN);

    // 全量按综合得分排名（不受过滤器影响，用于判断买入条件）
    const allRanked = [...results]
      .filter(r => !r.error && r.score != null)
      .sort((a, b) => b.score - a.score);
    const rankMap = new Map(allRanked.map((r, i) => [r.symbol, i + 1]));

    let mAbs20 = 1, mAbs50 = 1, mAbs200 = 1;
    for (const r of results) {
      const a20 = Math.abs(r.ret20 ?? 0);
      const a50 = Math.abs(r.ret50 ?? 0);
      const a200 = Math.abs(r.ret200 ?? 0);
      if (a20  > mAbs20)  mAbs20  = a20;
      if (a50  > mAbs50)  mAbs50  = a50;
      if (a200 > mAbs200) mAbs200 = a200;
    }
    return { sorted, passCount, mAbs20, mAbs50, mAbs200, rankMap };
  }, [results, sortKey, topN, filters]);

  const { breadthPos, breadthNeg, avgRet20 } = useMemo(() => {
    if (!results.length) return { breadthPos:0, breadthNeg:0, avgRet20:0 };
    let pos = 0, neg = 0, sum = 0;
    for (const r of results) {
      const v = r.ret20 ?? 0;
      if (v > 0) pos++; else if (v < 0) neg++;
      sum += v;
    }
    return { breadthPos:pos, breadthNeg:neg, avgRet20:sum / results.length };
  }, [results]);

  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0;

  return (
    <div style={{minHeight:"100vh", background:"#070c12", color:"#c0d0e0",
      fontFamily:"'IBM Plex Mono',monospace"}}>

      <div style={{padding:"16px 28px", borderBottom:"1px solid #182030",
        background:"linear-gradient(180deg,#0c1520 0%,#070c12 100%)",
        display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <div style={{width:8, height:8, borderRadius:"50%",
            background:loading?"#00ff88":"#3a5868",
            boxShadow:loading?"0 0 8px #00ff88":"none",
            animation:loading?"pulse 1s infinite":"none"}}/>
          <span style={{fontSize:18, fontWeight:700, color:"#dff0ff", letterSpacing:1.5}}>
            QQQ MOMENTUM SCANNER
          </span>
          <span style={{fontSize:10, color:"#6a8090", border:"1px solid #1e2c3e",
            padding:"2px 7px", borderRadius:4, letterSpacing:2}}>
            20D · 50D · 200D
          </span>
        </div>
        {lastUpdated && (
          <span style={{fontSize:11, color:"#6a8090"}}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div style={{padding:"20px 28px"}}>

        {!loading && results.length === 0 && (
          <div style={{maxWidth:560, margin:"64px auto 0", textAlign:"center", color:"#7a9aaa", fontSize:12}}>
            正在连接 Yahoo Finance，准备扫描 {QQQ_COMPONENTS.length} 只成分股…
          </div>
        )}

        {loading && (
          <div style={{maxWidth:560, margin:"32px auto"}}>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"#7a9aaa", marginBottom:6}}>
              <span>SCANNING QQQ COMPONENTS</span>
              <span>{progress.done} / {progress.total} · {pct}%</span>
            </div>
            <div style={{height:3, background:"#141e2a", borderRadius:2, overflow:"hidden", marginBottom:6}}>
              <div style={{width:`${pct}%`, height:"100%",
                background:"linear-gradient(90deg,#005bcc,#00ff88)", transition:"width 0.4s ease"}}/>
            </div>
            <div style={{fontSize:11, color:"#6a8090"}}>
              {results.length > 0 && `${results.length} stocks loaded — updating live ↓`}
            </div>
            <button onClick={() => { abortRef.current?.abort(); setLoading(false); }}
              style={{marginTop:12, padding:"5px 14px", background:"transparent",
                border:"1px solid #223", borderRadius:6, color:"#7a9aaa",
                fontFamily:"inherit", fontSize:11, cursor:"pointer"}}>■ STOP</button>
          </div>
        )}

        {results.length > 5 && (
          <div style={{display:"flex", gap:12, marginBottom:20, flexWrap:"wrap"}}>
            {[
              {label:"已扫描",       val:results.length,      unit:"只"},
              {label:"正动能 20D",   val:breadthPos,          unit:"只", color:"#00ff88"},
              {label:"负动能 20D",   val:breadthNeg,          unit:"只", color:"#ff3344"},
              {label:"均值 20D涨幅", val:fmtPct(avgRet20),               color:retColor(avgRet20)},
            ].map(s => (
              <div key={s.label} style={{padding:"10px 18px", background:"#0b1320",
                border:"1px solid #182030", borderRadius:8, minWidth:130}}>
                <div style={{fontSize:10, color:"#7a9aaa", letterSpacing:1, marginBottom:3}}>{s.label}</div>
                <div style={{fontSize:22, fontWeight:700, color:s.color??"#c0d0e0", fontFamily:"monospace"}}>
                  {s.val}{s.unit??""}
                </div>
              </div>
            ))}
            {qqqData && (
              <div style={{padding:"10px 18px", background:"#0b1320",
                border:`1px solid ${qqqData.aboveMA200 ? "#00ff8844" : "#ff334444"}`, borderRadius:8, minWidth:150}}>
                <div style={{fontSize:10, color:"#7a9aaa", letterSpacing:1, marginBottom:3}}>QQQ 大盘状态</div>
                <div style={{fontSize:18, fontWeight:700, fontFamily:"monospace",
                  color: qqqData.aboveMA200 ? "#00ff88" : "#ff3344"}}>
                  {qqqData.aboveMA200 ? "▲ 趋势健康" : "▼ 趋势偏弱"}
                </div>
                <div style={{fontSize:10, color:"#6a8090", marginTop:2}}>
                  {qqqData.aboveMA200 ? "价格高于200日均线" : "⚠️ 价格低于200日均线，谨慎买入"}
                </div>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <Fragment>
          <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
            <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
              {SORT_OPTS.map(o => (
                <button key={o.key} onClick={() => setSortKey(o.key)}
                  style={{padding:"5px 12px", ...activeButtonStyle(sortKey === o.key)}}>
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{display:"flex", gap:5, marginLeft:"auto", alignItems:"center"}}>
              <span style={{fontSize:11, color:"#7a9aaa"}}>Top</span>
              {[10,20,30,50].map(n => (
                <button key={n} onClick={() => setTopN(n)}
                  style={{padding:"4px 10px", ...activeButtonStyle(topN === n)}}>
                  {n}
                </button>
              ))}
              {!loading && (
                <button onClick={() => runScan()} style={{
                  padding:"4px 12px", background:"transparent",
                  border:"1px solid #005bcc44", borderRadius:6, color:"#4499ff",
                  fontFamily:"inherit", fontSize:11, cursor:"pointer"}}>↻ 刷新</button>
              )}
            </div>
          </div>

          {/* 精选过滤面板 */}
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap"}}>
            <span style={{fontSize:10, color:"#7a9aaa", letterSpacing:1.5, marginRight:4}}>精选筛选</span>
            {[
              { key:"allPositive", label:"三周期同向",  desc:"20/50/200日全为正" },
              { key:"minRet20",    label:"20日 ≥ +20%", desc:"近期动能仍在持续" },
              { key:"minSharpe50", label:"夏普50 ≥ 1.0",desc:"风险调整后收益达标" },
            ].map(({ key, label, desc }) => {
              const on = filters[key];
              return (
                <button key={key} onClick={() => toggleFilter(key)} title={desc} style={{
                  padding:"4px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
                  borderRadius:6, transition:"all 0.15s",
                  background: on ? "#003a1a" : "transparent",
                  border: `1px solid ${on ? "#00cc66" : "#304050"}`,
                  color: on ? "#00ff88" : "#7a9aaa",
                }}>
                  {on ? "✓ " : ""}{label}
                </button>
              );
            })}
            {passCount !== null && (
              <span style={{fontSize:11, color:"#00cc66", marginLeft:4}}>
                → {passCount} 只通过
              </span>
            )}
            {Object.values(filters).some(Boolean) && (
              <button onClick={() => setFilters({allPositive:false,minRet20:false,minSharpe50:false})}
                style={{fontSize:10, color:"#7a9aaa", background:"transparent", border:"none",
                  cursor:"pointer", fontFamily:"inherit", padding:"2px 6px"}}>
                清除
              </button>
            )}
          </div>
          </Fragment>
        )}

        {sorted.length > 0 && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #182030"}}>
                  {["#","代码","现价","60日走势","综合得分","信号","一致性","20日涨幅","50日涨幅","200日涨幅","20日夏普","50日夏普"].map(h => (
                    <th key={h} style={{padding:"9px 10px", textAlign:"left", color:"#7a9aaa",
                      fontWeight:500, fontSize:10, letterSpacing:1.2, whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const isExp = expandedSym === row.symbol;
                  const medal = ["🥇","🥈","🥉"][i] ?? null;
                  return (
                    <Fragment key={row.symbol}>
                      <tr
                        onClick={() => setExpandedSym(isExp ? null : row.symbol)}
                        style={{
                          borderBottom: isExp ? "none" : "1px solid #10181f",
                          background: isExp ? "#0d1c2e" : i < 3 ? "#0b1a10" : i%2===0 ? "#09111a" : "transparent",
                          cursor:"pointer", transition:"background 0.15s"
                        }}>
                        <td style={{...tdStyle, color:i<3?"#00ff88":"#6a8090", fontWeight:700, fontSize:11}}>
                          {medal ?? (i+1)}
                        </td>
                        <td style={tdStyle}>
                          <span style={{fontWeight:700, color:"#dff0ff", fontSize:13, letterSpacing:1}}>
                            {row.symbol}
                          </span>
                        </td>
                        <td style={{...tdStyle, color:"#8899aa", fontFamily:"monospace"}}>
                          ${row.price?.toFixed(2) ?? "—"}
                        </td>
                        <td style={{padding:"6px 10px"}}>
                          <Sparkline closes={row.closes} width={100} height={34} days={60}/>
                        </td>
                        <td style={tdStyle}><ScoreBadge score={row.score}/></td>
                        <td style={tdStyle}>{(() => {
                          const rank = rankMap.get(row.symbol) ?? 999;
                          const allPos = (row.ret20??-1)>0 && (row.ret50??-1)>0 && (row.ret200??-1)>0;
                          const buyOK = rank <= 15 && allPos && (row.sharpe50??0) >= 1.0 && (row.ret20??0) <= 60;
                          const avoidOK = (row.ret200??0) > 200 || !allPos;
                          if (buyOK) return (
                            <span style={{padding:"3px 8px", borderRadius:4, fontSize:10, fontWeight:700,
                              background:"#003a1a", border:"1px solid #00cc66", color:"#00ff88", whiteSpace:"nowrap"}}>
                              买入参考
                            </span>
                          );
                          if (avoidOK) return (
                            <span style={{padding:"3px 8px", borderRadius:4, fontSize:10, fontWeight:700,
                              background:"#2a1000", border:"1px solid #cc6600", color:"#ff9944", whiteSpace:"nowrap"}}>
                              观望
                            </span>
                          );
                          return <span style={{color:"#405870", fontSize:11}}>—</span>;
                        })()}</td>
                        <td style={{...tdStyle, whiteSpace:"nowrap"}}>
                          {[row.ret20, row.ret50, row.ret200].map((v, di) => (
                            <span key={di} title={["20D","50D","200D"][di]}
                              style={{fontSize:14, marginRight:1,
                                color: v == null ? "#304050" : v > 0 ? "#00ff88" : "#ff3344"}}>●</span>
                          ))}
                        </td>
                        <td style={tdStyle}><MiniBar value={row.ret20}  maxAbs={mAbs20}  colorFn={retColor}/></td>
                        <td style={tdStyle}><MiniBar value={row.ret50}  maxAbs={mAbs50}  colorFn={retColor}/></td>
                        <td style={tdStyle}><MiniBar value={row.ret200} maxAbs={mAbs200} colorFn={retColor}/></td>
                        <td style={{...tdStyle, color:sharpeColor(row.sharpe20), fontFamily:"monospace"}}>
                          {fmtNum(row.sharpe20)}
                        </td>
                        <td style={{...tdStyle, color:sharpeColor(row.sharpe50), fontFamily:"monospace"}}>
                          {fmtNum(row.sharpe50)}
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{background:"#0d1c2e", borderBottom:"1px solid #182030"}}>
                          <td colSpan={12} style={{padding:"20px 24px"}}>
                            <div style={{display:"flex", gap:32, flexWrap:"wrap", alignItems:"flex-start"}}>
                              <div>
                                <div style={{fontSize:10, color:"#7a9aaa", letterSpacing:1, marginBottom:8}}>
                                  {row.symbol} · 200日价格走势
                                </div>
                                <Sparkline closes={row.closes} width={340} height={90} days={200}/>
                                <div style={{fontSize:10, color:"#6a8090", marginTop:4, display:"flex",
                                  justifyContent:"space-between", width:340}}>
                                  <span>200日前</span><span>今日</span>
                                </div>
                              </div>
                              <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, flex:1, minWidth:260}}>
                                {[
                                  {label:"20日涨幅",   val:fmtPct(row.ret20),        color:retColor(row.ret20)},
                                  {label:"50日涨幅",   val:fmtPct(row.ret50),        color:retColor(row.ret50)},
                                  {label:"200日涨幅",  val:fmtPct(row.ret200),       color:retColor(row.ret200)},
                                  {label:"20日波动率", val:fmtNum(row.vol20,1,"%"),  color:"#8899aa"},
                                  {label:"50日波动率", val:fmtNum(row.vol50,1,"%"),  color:"#8899aa"},
                                  {label:"综合得分",   val:fmtPct(row.score,1),      color:retColor(row.score)},
                                  {label:"20日夏普",   val:fmtNum(row.sharpe20),     color:sharpeColor(row.sharpe20)},
                                  {label:"50日夏普",   val:fmtNum(row.sharpe50),     color:sharpeColor(row.sharpe50)},
                                  {label:"现价",       val:"$"+(row.price?.toFixed(2)??"—"), color:"#dff0ff"},
                                ].map(s => (
                                  <div key={s.label} style={{padding:"10px 12px",
                                    background:"#0a1520", border:"1px solid #182030", borderRadius:7}}>
                                    <div style={{fontSize:10, color:"#7a9aaa", marginBottom:3}}>{s.label}</div>
                                    <div style={{fontSize:15, fontWeight:700, color:s.color, fontFamily:"monospace"}}>{s.val}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* 回测面板 */}
                            <div style={{marginTop:16, paddingTop:14, borderTop:"1px solid #182030"}}>
                              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap"}}>
                                <span style={{fontSize:10, color:"#7a9aaa", letterSpacing:1.2}}>
                                  回测 — 回调至均线买入 · 止损-9%
                                </span>
                                <div style={{display:"flex", gap:5}}>
                                  {[
                                    { id:"mabreak",  label:"均线破位出" },
                                    { id:"trail7",   label:"追踪止损7%" },
                                    { id:"fixed20",  label:"固定20日"   },
                                  ].map(({ id, label }) => (
                                    <button key={id}
                                      onClick={e => { e.stopPropagation(); setBtMode(id); }}
                                      style={{padding:"3px 10px", fontSize:10, cursor:"pointer",
                                        fontFamily:"inherit", borderRadius:5,
                                        background: btMode===id ? "#001a4a" : "transparent",
                                        border:`1px solid ${btMode===id ? "#4499ff" : "#253545"}`,
                                        color: btMode===id ? "#4499ff" : "#6a8090"}}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                                {[5, 20, 50, 200].map(ma => {
                                  const r = backtest(row.closes, ma, btMode);
                                  const hasData = r && r.n > 0;
                                  return (
                                    <div key={ma} style={{padding:"10px 16px", background:"#0a1520",
                                      border:`1px solid ${hasData ? "#253545" : "#182030"}`,
                                      borderRadius:7, minWidth:128}}>
                                      <div style={{fontSize:10, color:"#4499ff", letterSpacing:1, marginBottom:6, fontWeight:600}}>
                                        {ma}日均线
                                      </div>
                                      {!hasData ? (
                                        <div style={{fontSize:11, color:"#405870"}}>
                                          {r ? "无触发信号" : "数据不足"}
                                        </div>
                                      ) : (<>
                                        <div style={{fontSize:11, color:"#6a8090", marginBottom:4}}>
                                          触发 <span style={{color:"#c0d0e0", fontWeight:600}}>{r.n}</span> 次
                                          <span style={{marginLeft:6, color:"#405870"}}>均持 {r.avgDays}日</span>
                                        </div>
                                        <div style={{fontSize:16, fontWeight:700, fontFamily:"monospace",
                                          color: r.avgRet >= 0 ? "#00ff88" : "#ff3344"}}>
                                          {fmtPct(r.avgRet)}
                                        </div>
                                        <div style={{fontSize:10, color:"#6a8090", marginTop:2}}>平均收益</div>
                                        <div style={{marginTop:6, fontSize:11,
                                          color: r.winRate >= 60 ? "#00cc66" : r.winRate >= 45 ? "#aaaa44" : "#ff6633"}}>
                                          胜率 {r.winRate.toFixed(0)}%
                                        </div>
                                        <div style={{fontSize:10, color:"#405870", marginTop:4}}>
                                          最好 <span style={{color:"#00ff88"}}>{fmtPct(r.best)}</span>
                                          {" · "}
                                          最差 <span style={{color:"#ff3344"}}>{fmtPct(r.worst)}</span>
                                        </div>
                                      </>)}
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{fontSize:10, color:"#405870", marginTop:8}}>
                                均线破位出 = 价格跌破入场均线时平仓 · 追踪止损 = 从阶段高点回落7%平仓 · 不含手续费 · 仅供参考
                              </div>
                            </div>

                            {/* 止损计算器 */}
                            <div style={{marginTop:16, paddingTop:14, borderTop:"1px solid #182030"}}>
                              <div style={{fontSize:10, color:"#7a9aaa", letterSpacing:1.2, marginBottom:8}}>
                                止损参考 — 输入你的买入价格
                              </div>
                              <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
                                <span style={{fontSize:11, color:"#6a8090"}}>买入价 $</span>
                                <input
                                  type="number"
                                  placeholder="例如 150.00"
                                  value={costBasis[row.symbol] ?? ""}
                                  onChange={e => setCostBasis(cb => ({...cb, [row.symbol]: e.target.value}))}
                                  onClick={e => e.stopPropagation()}
                                  style={{width:110, padding:"4px 8px", background:"#0a1520",
                                    border:"1px solid #253545", borderRadius:4,
                                    color:"#c0d0e0", fontFamily:"inherit", fontSize:12}}
                                />
                                {costBasis[row.symbol] && (() => {
                                  const buy = parseFloat(costBasis[row.symbol]);
                                  if (!buy || isNaN(buy)) return null;
                                  const stopPrice = buy * 0.91;
                                  const cur = row.price ?? 0;
                                  const pctFromBuy = ((cur - buy) / buy) * 100;
                                  const triggered = cur > 0 && cur <= stopPrice;
                                  return (
                                    <div style={{display:"flex", gap:16, alignItems:"center", flexWrap:"wrap", fontSize:11}}>
                                      <span style={{color:"#6a8090"}}>
                                        止损价: <span style={{color:"#ff6633", fontFamily:"monospace"}}>${stopPrice.toFixed(2)}</span>
                                      </span>
                                      <span style={{color:"#6a8090"}}>
                                        现价距买入: <span style={{fontFamily:"monospace",
                                          color: pctFromBuy >= 0 ? "#00ff88" : "#ff3344"}}>
                                          {fmtPct(pctFromBuy)}
                                        </span>
                                      </span>
                                      {triggered ? (
                                        <span style={{padding:"2px 10px", borderRadius:4,
                                          background:"#3a0000", border:"1px solid #ff3344",
                                          color:"#ff3344", fontWeight:700}}>
                                          ⚠ 止损触发，建议卖出
                                        </span>
                                      ) : (
                                        <span style={{padding:"2px 10px", borderRadius:4,
                                          background:"#003a1a", border:"1px solid #00cc66", color:"#00ff88"}}>
                                          持有中
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div style={{fontSize:10, color:"#405870", marginTop:6}}>
                                止损线 = 买入价 × 91%（-9%触发）· 仅供参考，不构成投资建议
                              </div>
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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px;background:#070c12}
        ::-webkit-scrollbar-thumb{background:#182030;border-radius:3px}
        tbody tr:hover td{background:#0d1828!important}
        button:hover{opacity:0.8}
        input:focus{border-color:#005bcc!important}
      `}</style>
    </div>
  );
}
