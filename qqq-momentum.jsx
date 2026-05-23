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
  const url = `/yahoo/v8/finance/chart/${symbol}?interval=1d&range=1y`;
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

export default function App() {
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [progress,    setProgress]    = useState({done:0, total:0});
  const [sortKey,     setSortKey]     = useState("score");
  const [topN,        setTopN]        = useState(20);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedSym, setExpandedSym] = useState(null);
  const abortRef   = useRef(null);

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
          // Keep only 202 days — enough for 200D metrics and 60D sparkline
          const closes = raw.slice(-202);
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


  const { sorted, mAbs20, mAbs50, mAbs200 } = useMemo(() => {
    const sorted = [...results]
      .filter(r => r[sortKey] != null && !isNaN(r[sortKey]))
      .sort((a, b) => (b[sortKey] ?? -999) - (a[sortKey] ?? -999))
      .slice(0, topN);
    let mAbs20 = 1, mAbs50 = 1, mAbs200 = 1;
    for (const r of results) {
      const a20 = Math.abs(r.ret20 ?? 0);
      const a50 = Math.abs(r.ret50 ?? 0);
      const a200 = Math.abs(r.ret200 ?? 0);
      if (a20  > mAbs20)  mAbs20  = a20;
      if (a50  > mAbs50)  mAbs50  = a50;
      if (a200 > mAbs200) mAbs200 = a200;
    }
    return { sorted, mAbs20, mAbs50, mAbs200 };
  }, [results, sortKey, topN]);

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
          </div>
        )}

        {results.length > 0 && (
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
        )}

        {sorted.length > 0 && (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #182030"}}>
                  {["#","代码","现价","60日走势","综合得分","20日涨幅","50日涨幅","200日涨幅","20日夏普","50日夏普"].map(h => (
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
                          <td colSpan={10} style={{padding:"20px 24px"}}>
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
