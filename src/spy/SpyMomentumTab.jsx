import { useState, useCallback, useRef, useMemo, useEffect, Fragment } from 'react';
import WfoSummaryTable from '../shared/WfoSummaryTable.jsx';

// S&P 500 全量成分股（468只，11个GICS行业，2025年6月版本）
const SPY_COMPONENTS = [
  // 信息技术 Information Technology
  "AAPL","MSFT","NVDA","AVGO","CRM","ORCL","NOW","ADBE","CSCO","INTU",
  "IBM","AMAT","AMD","QCOM","TXN","PANW","KLAC","SNPS","CDNS","LRCX",
  "MU","INTC","MSI","FTNT","MCHP","MPWR","NXPI","ANSS","KEYS","SWKS",
  "TER","EPAM","STX","WDC","NTAP","HPQ","HPE","ACN","IT","CDW",
  "GDDY","TYL","CTSH","APH","ON","ANET","FFIV","AKAM","GEN","SMCI",
  "APP","TEL","GLW","ADP","PAYC","PAYX","JKHY","FIS","GPN","BR",
  "QRVO","ARM","FICO","PTC","TRMB","ENPH","CPAY",
  // 通信服务 Communication Services
  "GOOGL","GOOG","META","NFLX","DIS","T","VZ","CMCSA","CHTR","TMUS",
  "TTWO","EA","OMC","IPG","WBD","PARA","NWSA","NWS","FOXA","FOX","LYV",
  // 非必需消费品 Consumer Discretionary
  "AMZN","TSLA","HD","MCD","NKE","LOW","SBUX","BKNG","TJX","ORLY",
  "YUM","CMG","DLTR","DG","ROST","DHI","PHM","LEN","LVS","WYNN",
  "MGM","RCL","NCLH","CCL","LUV","UAL","DAL","EBAY","LULU","RL",
  "TPR","HAS","BBY","APTV","F","GM","CPRT","AZO","KMX","CZR",
  "DECK","POOL","TSCO","NVR","MHK","BWA","GRMN","MAR","HLT","EXPE",
  "LKQ","H","DRI","BBWI","PVH","UBER","CVNA",
  // 必需消费品 Consumer Staples
  "WMT","COST","PG","KO","PEP","PM","MO","MDLZ","CL","KMB",
  "GIS","KR","SYY","CAG","HRL","MKC","CHD","CLX","K","STZ",
  "TAP","CPB","SJM","WBA","MNST","KDP","TSN","BG","EL","KVUE",
  // 能源 Energy
  "XOM","CVX","COP","EOG","SLB","OXY","MPC","PSX","VLO","HES",
  "DVN","FANG","APA","TRGP","OKE","WMB","KMI","BKR","HAL","EQT",
  "CTRA","MRO","TPL","NRG","VST","CEG",
  // 金融 Financials
  "JPM","BAC","WFC","GS","MS","C","AXP","BRK-B","SPGI","CME",
  "BLK","SCHW","COF","CB","MCO","AIG","PRU","MET","AFL","TRV",
  "ALL","PNC","USB","TFC","FITB","KEY","HBAN","RF","MTB","CFG",
  "STT","BK","NTRS","ICE","NDAQ","CBOE","RJF","AMP","IVZ","BEN",
  "PFG","GL","AIZ","WRB","EG","CINF","HIG","ACGL","MMC","AON",
  "AJG","WTW","KKR","BX","FI","SYF","DFS","ALLY","TROW","V","MA",
  // 医疗保健 Health Care
  "UNH","LLY","JNJ","ABBV","MRK","TMO","ABT","DHR","SYK","ISRG",
  "AMGN","GILD","VRTX","REGN","ZTS","BMY","CI","ELV","CNC","MOH",
  "HUM","HCA","BSX","MDT","EW","BDX","IDXX","HOLX","DGX","LH",
  "RMD","DXCM","PODD","MRNA","IQV","CRL","WAT","BIIB","INCY","ALGN",
  "STE","TFX","WST","RVTY","COO","DVA","VTRS","MCK","CAH","COR",
  "BAX","GEHC","SOLV","ZBH","HSIC","MTD","A","BIO","VLTO","PFE",
  // 工业 Industrials
  "GE","GEV","CAT","RTX","HON","ETN","DE","GD","UPS","CSX",
  "CTAS","UNP","NSC","BA","MMM","EMR","ITW","GWW","NOC","LMT",
  "HII","TDG","PWR","EXPD","JBHT","CHRW","LDOS","LHX","SWK","PH",
  "ROK","DOV","HUBB","IR","AME","FTV","IEX","GNRC","XYL","OTIS",
  "CARR","WAB","ODFL","URI","RSG","WM","PCAR","FAST","J","BLDR",
  "AXON","HWM","TT","OC","GPC","AOS","PNR","ROL","ROP","TDY",
  "VRSK","EFX","NUE","STLD","PKG","IP","BALL","AVY","AMCR","L",
  "SAIC","MLM","VMC","JCI",
  // 材料 Materials
  "LIN","APD","SHW","ECL","PPG","NEM","FCX","DD","DOW","LYB",
  "ALB","EMN","CE","IFF","FMC","MOS","CF","SW",
  // 房地产 Real Estate
  "AMT","PLD","EQIX","CCI","PSA","WELL","DLR","EXR","SPG","O",
  "VICI","AVB","EQR","ESS","UDR","CPT","MAA","IRM","ARE","SBAC",
  "BXP","VTR","REG","KIM","FRT","HST","INVH","ELS","SUI","CSGP",
  // 公用事业 Utilities
  "NEE","SO","DUK","D","AEP","EXC","SRE","PCG","ED","ES",
  "XEL","ETR","LNT","PPL","CNP","EIX","CMS","AEE","NI","EVRG",
  "PNW","ATO","PEG","FE","AWK",
];

const BATCH = 20;
const BATCH_DELAY = 200;

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
          const scale    = rawClose > 0 ? adj[i] / rawClose : 1;
          const adjOpen  = rawOpen != null ? rawOpen * scale : adj[i];
          rows.push({ c: adj[i], o: adjOpen, ts: tss[i] });
        }
      }
      return rows.length >= 20 ? rows : null;
    } catch (e) {
      if (signal.aborted || attempt === 1) throw e;
    }
  }
}

// ── 工具函数 ──
const fmtPct = (v, d=1) => v == null || isNaN(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
function fmtParamLabel(p) {
  const sm = { score:"综合", ret20:"20日", ret50:"50日", ret200:"200日" }[p.sortMetric] || p.sortMetric;
  const rf = { daily:"每日", weekly:"每周", monthly:"每月", quarterly:"每季" }[p.rebalanceFreq] || p.rebalanceFreq;
  const mf = { none:"不过滤", ma50:">MA50", ma100:">MA100", ma200:">MA200" }[p.marketFilter] || "—";
  return `${sm} · Top${p.topN} · ${rf} · ${mf}`;
}
function activeButtonStyle(isActive, T) {
  return {
    borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
    background:   isActive ? T.btnActiveBg   : "transparent",
    border:       `1px solid ${isActive ? T.btnActiveBdr : T.btnBorder}`,
    color:        isActive ? T.btnActiveClr  : T.btnColor,
  };
}

// ── 净值曲线图 ──
function EquityCurveChart({ stratEq, spyEq, timestamps, T }) {
  const W = 700, H = 230;
  const pad = { l:46, r:12, t:14, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const allV = [...stratEq, ...(spyEq || [])];
  const minV = Math.min(...allV) * 0.98, maxV = Math.max(...allV) * 1.02;
  const rng = maxV - minV || 1;
  const n = stratEq.length;
  const tx = i => pad.l + (i / Math.max(n-1, 1)) * iw;
  const ty = v => pad.t + ih - ((v - minV) / rng) * ih;
  const sp = stratEq.map((v, i) => `${tx(i)},${ty(v)}`).join(" ");
  const bp = (spyEq || []).map((v, i) => `${tx(i)},${ty(v)}`).join(" ");
  const ticks = [minV, minV+rng*0.25, minV+rng*0.5, minV+rng*0.75, maxV];
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0] * 1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1] * 1000).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      const idx = timestamps.findIndex(ts => ts >= Date.UTC(yr, 0, 1) / 1000);
      if (idx >= 0 && idx < n) timeTicks.push({ x: tx(idx), label: String(yr) });
    }
  }
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      {ticks.map((v, i) => (
        <Fragment key={i}>
          <line x1={pad.l} y1={ty(v)} x2={pad.l+iw} y2={ty(v)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3"/>
          <text x={pad.l-4} y={ty(v)+4} textAnchor="end" fill={T.textMuted} fontSize={9}>{((v-1)*100).toFixed(0)}%</text>
        </Fragment>
      ))}
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.borderMuted} strokeWidth="0.5"/>
      {timeTicks.map((tick, i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
      {bp && <polyline points={bp} fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.7"/>}
      <polyline points={sp} fill="none" stroke="#4488ee" strokeWidth="2"/>
      <line x1={pad.l+10} y1={pad.t+10} x2={pad.l+26} y2={pad.t+10} stroke="#4488ee" strokeWidth="2"/>
      <text x={pad.l+30} y={pad.t+14} fill={T.textSub} fontSize={10}>策略</text>
      <line x1={pad.l+72} y1={pad.t+10} x2={pad.l+88} y2={pad.t+10} stroke={T.textMuted} strokeWidth="1.5" strokeDasharray="5,3"/>
      <text x={pad.l+92} y={pad.t+14} fill={T.textSub} fontSize={10}>SPY</text>
    </svg>
  );
}

// ── 回撤曲线图 ──
function DrawdownChart({ drawdowns, timestamps, T }) {
  const W = 700, H = 130;
  const pad = { l:46, r:12, t:10, b:34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const minV = Math.min(...drawdowns, -1) * 1.1;
  const n = drawdowns.length;
  const tx = i => pad.l + (i / Math.max(n-1, 1)) * iw;
  const ty = v => pad.t + (1 - v / minV) * ih;
  const pts = drawdowns.map((v, i) => `${tx(i)},${ty(v)}`).join(" ");
  const fill = `${pad.l},${pad.t} ${pts} ${pad.l+iw},${pad.t}`;
  const timeTicks = [];
  if (timestamps && timestamps.length > 1) {
    const startYear = new Date(timestamps[0] * 1000).getFullYear();
    const endYear   = new Date(timestamps[timestamps.length-1] * 1000).getFullYear();
    for (let yr = startYear; yr <= endYear + 1; yr++) {
      const idx = timestamps.findIndex(ts => ts >= Date.UTC(yr, 0, 1) / 1000);
      if (idx >= 0 && idx < n) timeTicks.push({ x: tx(idx), label: String(yr) });
    }
  }
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <line x1={pad.l} y1={pad.t} x2={pad.l+iw} y2={pad.t} stroke={T.border} strokeWidth="0.5"/>
      <polygon points={fill} fill="#ee334428"/>
      <polyline points={pts} fill="none" stroke="#ee3344" strokeWidth="1.5"/>
      <text x={pad.l-4} y={ty(minV)+4} textAnchor="end" fill={T.textMuted} fontSize={9}>{minV.toFixed(1)}%</text>
      <text x={pad.l-4} y={pad.t+4} textAnchor="end" fill={T.textMuted} fontSize={9}>0%</text>
      <line x1={pad.l} y1={pad.t+ih} x2={pad.l+iw} y2={pad.t+ih} stroke={T.borderMuted} strokeWidth="0.5"/>
      {timeTicks.map((tick, i) => (
        <Fragment key={i}>
          <line x1={tick.x} y1={pad.t+ih} x2={tick.x} y2={pad.t+ih+5} stroke={T.textMuted} strokeWidth="0.5"/>
          <text x={tick.x} y={pad.t+ih+16} textAnchor="middle" fill={T.textMuted} fontSize={9}>{tick.label}</text>
        </Fragment>
      ))}
    </svg>
  );
}

// ── 年度收益柱状图 ──
function AnnualBarsChart({ stratAnnual, spyAnnual, T }) {
  const W = 700, H = 160;
  const pad = { l:46, r:12, t:14, b:28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const years = [...new Set([...Object.keys(stratAnnual), ...Object.keys(spyAnnual || {})])].sort();
  const allV = [...Object.values(stratAnnual), ...Object.values(spyAnnual || {}), 10, -10];
  const maxAbs = Math.max(Math.abs(Math.min(...allV)), Math.abs(Math.max(...allV)));
  const spacing = iw / Math.max(years.length, 1);
  const bw = spacing * 0.35;
  const zY = pad.t + ih / 2;
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <line x1={pad.l} y1={zY} x2={pad.l+iw} y2={zY} stroke={T.border} strokeWidth="1"/>
      <text x={pad.l-4} y={zY+4} textAnchor="end" fill={T.textMuted} fontSize={9}>0%</text>
      {years.map((yr, i) => {
        const sv = stratAnnual[yr] ?? 0;
        const bv = (spyAnnual || {})[yr] ?? 0;
        const cx = pad.l + spacing * i + spacing / 2;
        const svH = (sv / maxAbs) * (ih / 2);
        const bvH = (bv / maxAbs) * (ih / 2);
        return (
          <g key={yr}>
            <rect x={cx-bw-1} y={sv>=0?zY-svH:zY} width={bw} height={Math.abs(svH)} fill={sv>=0?"#4488ee99":"#ee334488"}/>
            <rect x={cx+1} y={bv>=0?zY-bvH:zY} width={bw} height={Math.abs(bvH)} fill={bv>=0?"#88aabb66":"#ee334444"}/>
            <text x={cx} y={H-6} textAnchor="middle" fill={T.textMuted} fontSize={9}>{yr}</text>
          </g>
        );
      })}
      <rect x={pad.l+10} y={pad.t} width={10} height={8} fill="#4488ee99"/>
      <text x={pad.l+24} y={pad.t+8} fill={T.textSub} fontSize={9}>策略</text>
      <rect x={pad.l+62} y={pad.t} width={10} height={8} fill="#88aabb66"/>
      <text x={pad.l+76} y={pad.t+8} fill={T.textSub} fontSize={9}>SPY</text>
    </svg>
  );
}

// ── 月度收益热图 ──
function MonthlyHeatmap({ monthlyRets, T }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = Object.keys(monthlyRets).sort();
  const cellColor = v => {
    if (v == null) return T.cardBg2;
    if (v >= 10) return "#00aa44cc"; if (v >= 5) return "#22aa6688"; if (v >= 2) return "#44aa8844";
    if (v >= 0)  return "#4488ee22"; if (v >= -2) return "#ee884422"; if (v >= -5) return "#ee334444";
    return "#ee334488";
  };
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"separate", borderSpacing:2, fontSize:10}}>
        <thead>
          <tr>
            <th style={{padding:"3px 8px", color:T.textSub, textAlign:"left", fontWeight:500}}></th>
            {months.map((m, i) => (
              <th key={i} style={{padding:"2px 4px", color:T.textSub, textAlign:"center", fontWeight:400, minWidth:36}}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map(yr => (
            <tr key={yr}>
              <td style={{padding:"3px 8px", color:T.textSub, fontWeight:600, whiteSpace:"nowrap"}}>{yr}</td>
              {months.map((_, i) => {
                const v = monthlyRets[yr]?.[i];
                return (
                  <td key={i} style={{padding:"3px 4px", borderRadius:3, background:cellColor(v), textAlign:"center",
                    fontFamily:"monospace", color: v == null ? T.textMuted : v >= 0 ? "#00cc66" : "#ee3344",
                    minWidth:36}}>
                    {v != null ? (v >= 0 ? "+" : "") + v.toFixed(1) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 指标卡 ──
function MetricCard({ label, strat, bench, unit="", higherBetter=true, fmtFn=v=>v?.toFixed(2), alwaysRed=false, T }) {
  const better = strat != null && bench != null && (higherBetter ? strat > bench : strat < bench);
  const worse  = strat != null && bench != null && (higherBetter ? strat < bench : strat > bench);
  const valueColor = alwaysRed ? "#ee3344" : better ? "#00aa44" : worse ? "#ee3344" : T.textBright;
  return (
    <div style={{padding:"10px 14px", background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, minWidth:130}}>
      <div style={{fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:4}}>{label}</div>
      <div style={{fontSize:18, fontWeight:700, fontFamily:"monospace", color: valueColor}}>
        {strat != null ? (strat >= 0 ? "+" : "") + fmtFn(strat) + unit : "—"}
      </div>
      {bench != null && (
        <div style={{fontSize:10, color:T.textMuted, marginTop:2}}>
          SPY: <span style={{fontFamily:"monospace"}}>{(bench >= 0 ? "+" : "") + fmtFn(bench) + unit}</span>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  回测引擎（T-1信号 / T执行MOO，无前视偏差）
// ══════════════════════════════════════════
function portfolioBacktest(histData, commonTs, spyCloses, params, rangeStart=0, rangeEnd=null) {
  const { sortMetric, topN, rebalanceFreq, bufferEnabled=false, marketFilter } = params;
  let maFilterDays = 0;
  if      (marketFilter === 'ma50')  maFilterDays = 50;
  else if (marketFilter === 'ma100') maFilterDays = 100;
  else if (marketFilter === 'ma200') maFilterDays = 200;

  const bufferN = bufferEnabled ? Math.round(topN * 1.5) : topN;
  const rebalInterval = rebalanceFreq === 'daily' ? 1
    : rebalanceFreq === 'weekly' ? 5
    : rebalanceFreq === 'quarterly' ? 63
    : 21;

  const N = rangeEnd ?? commonTs.length;
  const symbols = [...histData.keys()];
  const simStart = Math.max(rangeStart, 205);
  if (simStart >= N - 10) return { equityCurve:[1], timestamps:[], turnoverCount:0, simStart };

  const symCloses = new Map();
  const symOpens  = new Map();
  for (const sym of symbols) {
    const d = histData.get(sym);
    if (d && d.closes) { symCloses.set(sym, d.closes); symOpens.set(sym, d.opens ?? null); }
    else               { symCloses.set(sym, d);        symOpens.set(sym, null); }
  }

  const equityCurve = [];
  let equity = 1.0;
  let holdings = new Set();
  let turnoverCount = 0;

  for (let t = simStart; t < N; t++) {
    const isRebalDay = (t === simStart) || ((t - simStart) % rebalInterval === 0);

    if (isRebalDay) {
      if (t > simStart && holdings.size > 0) {
        let portRet = 0, cnt = 0;
        for (const sym of holdings) {
          const cl = symCloses.get(sym), op = symOpens.get(sym);
          if (op?.[t] != null && cl?.[t-1] != null)      { portRet += op[t] / cl[t-1] - 1; cnt++; }
          else if (cl?.[t] != null && cl?.[t-1] != null) { portRet += cl[t] / cl[t-1] - 1; cnt++; }
        }
        if (cnt > 0) equity *= (1 + portRet / cnt);
      }

      const d = t - 1;
      let inMarket = true;
      if (maFilterDays > 0 && d >= maFilterDays) {
        const slice = spyCloses.slice(d - maFilterDays, d);
        const maVal = slice.reduce((a,b) => a + (b ?? 0), 0) / slice.filter(Boolean).length;
        inMarket = spyCloses[d] != null && spyCloses[d] > maVal;
      }

      if (!inMarket) {
        turnoverCount += holdings.size;
        holdings = new Set();
      } else {
        const ranked = symbols.map(sym => {
          const cl = symCloses.get(sym);
          if (!cl || !cl[d]) return null;
          let score = null;
          if (sortMetric==='ret20'  && d>=20  && cl[d-20])  score=(cl[d]-cl[d-20])/cl[d-20];
          else if (sortMetric==='ret50'  && d>=50  && cl[d-50])  score=(cl[d]-cl[d-50])/cl[d-50];
          else if (sortMetric==='ret200' && d>=200 && cl[d-200]) score=(cl[d]-cl[d-200])/cl[d-200];
          else if (sortMetric==='score'  && d>=200 && cl[d-20] && cl[d-50] && cl[d-200]) {
            const r20=(cl[d]-cl[d-20])/cl[d-20], r50=(cl[d]-cl[d-50])/cl[d-50], r200=(cl[d]-cl[d-200])/cl[d-200];
            score = r20*0.45 + r50*0.35 + r200*0.20;
          }
          return score != null ? { sym, score } : null;
        }).filter(Boolean).sort((a,b) => b.score - a.score);

        const topSet    = new Set(ranked.slice(0, topN).map(r => r.sym));
        const bufferSet = new Set(ranked.slice(0, bufferN).map(r => r.sym));
        const newH = new Set();
        for (const s of holdings) { if (bufferSet.has(s)) newH.add(s); }
        for (const s of topSet)   { newH.add(s); }
        for (const s of newH)     { if (!holdings.has(s)) turnoverCount++; }
        holdings = newH;
      }

      if (holdings.size > 0) {
        let portRet = 0, cnt = 0;
        for (const sym of holdings) {
          const cl = symCloses.get(sym), op = symOpens.get(sym);
          if (op?.[t] != null && cl?.[t] != null)        { portRet += cl[t] / op[t] - 1; cnt++; }
          else if (cl?.[t] != null && cl?.[t-1] != null) { portRet += cl[t] / cl[t-1] - 1; cnt++; }
        }
        if (cnt > 0) equity *= (1 + portRet / cnt);
      }
    } else {
      if (t > simStart && holdings.size > 0) {
        let portRet = 0, cnt = 0;
        for (const sym of holdings) {
          const cl = symCloses.get(sym);
          if (!cl?.[t] || !cl?.[t-1]) continue;
          portRet += cl[t] / cl[t-1] - 1;
          cnt++;
        }
        if (cnt > 0) equity *= (1 + portRet / cnt);
      }
    }
    equityCurve.push(equity);
  }
  return { equityCurve, timestamps: commonTs.slice(simStart, N), turnoverCount, simStart };
}

function buildSpyEquity(spyCloses, startIdx, endIdx) {
  const N = endIdx ?? spyCloses.length;
  const equityCurve = [];
  let equity = 1.0;
  for (let t = startIdx; t < N; t++) {
    if (t > startIdx && spyCloses[t] && spyCloses[t-1])
      equity *= spyCloses[t] / spyCloses[t-1];
    equityCurve.push(equity);
  }
  return { equityCurve };
}

function calcPortMetrics(equityCurve, timestamps) {
  const n = equityCurve.length;
  if (n < 10 || !timestamps || timestamps.length < 2) return null;
  const years = (timestamps[n-1] - timestamps[0]) / (365.25 * 86400);
  const cagr = years > 0.05 ? (Math.pow(equityCurve[n-1], 1/years) - 1) * 100 : 0;
  const dailyRets = [];
  for (let i=1; i<n; i++) {
    if (equityCurve[i-1] > 0) dailyRets.push(equityCurve[i] / equityCurve[i-1] - 1);
  }
  const meanR = dailyRets.reduce((a,b) => a+b, 0) / dailyRets.length;
  const varR  = dailyRets.reduce((a,b) => a+(b-meanR)**2, 0) / dailyRets.length;
  const sharpe = varR > 0 ? (meanR / Math.sqrt(varR)) * Math.sqrt(252) : 0;
  let peak = equityCurve[0], mdd = 0;
  const drawdowns = equityCurve.map(v => {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak * 100 : 0;
    if (dd > mdd) mdd = dd;
    return -dd;
  });
  const annualRets = {};
  let prevYrStart = equityCurve[0], prevYr = new Date(timestamps[0]*1000).getFullYear();
  for (let i=0; i<n; i++) {
    const yr = new Date(timestamps[i]*1000).getFullYear();
    if (yr !== prevYr) { annualRets[prevYr] = (equityCurve[i-1]/prevYrStart - 1)*100; prevYrStart = equityCurve[i-1]; prevYr = yr; }
  }
  annualRets[prevYr] = (equityCurve[n-1]/prevYrStart - 1)*100;
  const monthlyRets = {};
  let prevMoStart = equityCurve[0];
  let { yr:pYr, mo:pMo } = { yr: new Date(timestamps[0]*1000).getFullYear(), mo: new Date(timestamps[0]*1000).getMonth() };
  for (let i=0; i<n; i++) {
    const dd = new Date(timestamps[i]*1000), yr = dd.getFullYear(), mo = dd.getMonth();
    if (yr !== pYr || mo !== pMo) {
      if (!monthlyRets[pYr]) monthlyRets[pYr] = {};
      monthlyRets[pYr][pMo] = (equityCurve[i-1]/prevMoStart - 1)*100;
      prevMoStart = equityCurve[i-1]; pYr = yr; pMo = mo;
    }
  }
  if (!monthlyRets[pYr]) monthlyRets[pYr] = {};
  monthlyRets[pYr][pMo] = (equityCurve[n-1]/prevMoStart - 1)*100;
  return { cagr, sharpe, mdd: -mdd, drawdowns, annualRets, monthlyRets, total: (equityCurve[n-1]-1)*100 };
}

// Grid Search（4×7×4×4 = 448 种组合）
function runAllCombos(histData, commonTs, spyCloses, rangeStart=0, rangeEnd=null) {
  const results = [];
  for (const sortMetric of ['score','ret20','ret50','ret200']) {
    for (const topN of [3,5,10,15,20,25,30]) {
      for (const rebalanceFreq of ['daily','weekly','monthly','quarterly']) {
        for (const marketFilter of ['none','ma50','ma100','ma200']) {
          const params = { sortMetric, topN, rebalanceFreq, bufferEnabled:false, marketFilter };
          const bt = portfolioBacktest(histData, commonTs, spyCloses, params, rangeStart, rangeEnd);
          const metrics = calcPortMetrics(bt.equityCurve, bt.timestamps);
          if (!metrics) continue;
          results.push({ params, metrics, turnover: bt.turnoverCount });
        }
      }
    }
  }
  return results;
}

// Walk Forward Optimization（单窗口 70%IS / 30%OOS）
function runWFO(histData, commonTs, spyCloses, optMetric='sharpe', fixedParams=null) {
  const N = commonTs.length;
  const isFixedMode = fixedParams != null;
  const inEnd  = Math.round(N * 0.70);
  const inDays  = inEnd;
  const outDays = N - inEnd;
  if (inDays < 252 || outDays < 42) return null;

  const scoreFn = m => {
    if (optMetric === 'cagr')   return m.cagr;
    if (optMetric === 'calmar') return m.cagr / Math.abs(m.mdd || 1);
    return m.sharpe;
  };

  let bestParams, inSampleScore=null, inSampleSharpe=null, inSampleCAGR=null, inSampleMDD=null, inSampleComboCnt=0;

  if (isFixedMode) {
    bestParams = fixedParams;
    try {
      const isBt = portfolioBacktest(histData, commonTs, spyCloses, fixedParams, 0, inEnd);
      const isM  = calcPortMetrics(isBt.equityCurve, isBt.timestamps);
      if (isM) { inSampleSharpe = isM.sharpe; inSampleCAGR = isM.cagr; inSampleMDD = isM.mdd; }
    } catch(e) {}
  } else {
    const inCombos = runAllCombos(histData, commonTs, spyCloses, 0, inEnd);
    if (!inCombos.length) return null;
    inCombos.sort((a,b) => scoreFn(b.metrics) - scoreFn(a.metrics));
    const bestCombo = inCombos[0];
    bestParams = bestCombo.params;
    inSampleScore    = scoreFn(bestCombo.metrics);
    inSampleSharpe   = bestCombo.metrics.sharpe;
    inSampleCAGR     = bestCombo.metrics.cagr;
    inSampleMDD      = bestCombo.metrics.mdd;
    inSampleComboCnt = inCombos.length;
  }

  const outBt      = portfolioBacktest(histData, commonTs, spyCloses, bestParams, inEnd, N);
  const outMetrics = calcPortMetrics(outBt.equityCurve, outBt.timestamps);
  const spyOut        = buildSpyEquity(spyCloses, outBt.simStart, N);
  const spyOutMetrics = calcPortMetrics(spyOut.equityCurve, outBt.timestamps);

  const windowResult = {
    winIdx:1, isFixedMode,
    inTsStart:  commonTs[0],        inTsEnd:    commonTs[inEnd - 1],
    outTsStart: commonTs[inEnd],     outTsEnd:   commonTs[N - 1],
    bestParams, inSampleScore, inSampleSharpe, inSampleCAGR, inSampleMDD, inSampleComboCnt,
    outMetrics, spyOutMetrics,
  };

  const allOutEquity = outBt.equityCurve.slice();
  const allOutTs     = outBt.timestamps.slice();
  const combinedMetrics = calcPortMetrics(allOutEquity, allOutTs);
  const spyWfo = buildSpyEquity(spyCloses, Math.max(inEnd, 205), N);
  const spyWfoEq = spyWfo.equityCurve.slice(0, allOutEquity.length);
  const spyCombinedMetrics = calcPortMetrics(spyWfoEq, allOutTs.slice(0, spyWfoEq.length));

  return {
    isFixedMode, fixedParams: isFixedMode ? fixedParams : null,
    windowResults: [windowResult], allOutEquity, allOutTs,
    combinedMetrics, spyCombinedMetrics, spyWfoEq, optMetric,
    totalCombos: isFixedMode ? 1 : 448, windowCount: 1, inDays, outDays,
  };
}

// ══════════════════════════════════════════
//  SPY 成分股轮动 — 调仓指令面板
// ══════════════════════════════════════════
function SpySignalCard({ histData, histTs, params, T, darkMode }) {
  const [capital, setCapital] = useState('10000');

  const [myHoldings, setMyHoldings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('spy_momentum_holdings') || 'null'); }
    catch { return null; }
  });
  useEffect(() => {
    if (myHoldings !== null) localStorage.setItem('spy_momentum_holdings', JSON.stringify(myHoldings));
    else localStorage.removeItem('spy_momentum_holdings');
  }, [myHoldings]);

  const signal = useMemo(() => {
    if (!histData || !histTs || histTs.length === 0) return null;
    const { sortMetric='score', topN=5, rebalanceFreq='monthly', marketFilter='none', bufferEnabled=false } = params;
    const bufferN = bufferEnabled ? Math.round(topN * 1.5) : topN;
    const N   = histTs.length;
    const d   = N - 1;
    const date = new Date(histTs[d] * 1000).toISOString().slice(0, 10);
    const spyCloses = histData.get('__SPY__').closes;

    const maDays = marketFilter==='ma50'?50 : marketFilter==='ma100'?100 : marketFilter==='ma200'?200 : 0;
    if (maDays > 0 && d >= maDays && spyCloses) {
      const slice = spyCloses.slice(d - maDays, d).filter(Boolean);
      const ma = slice.length > 0 ? slice.reduce((a,b) => a+b, 0) / slice.length : null;
      const spyNow = spyCloses[d];
      if (ma != null && spyNow != null && spyNow <= ma) {
        return { date, isDefensive: true, holdings: {}, bufferHoldings: {}, prices: {},
          reason: `SPY（$${spyNow.toFixed(1)}）低于 MA${maDays}（$${ma.toFixed(1)}），市场过滤触发 → 转现金`,
          scores: [], rebalFreq: rebalanceFreq, spyPrice: spyNow, maDays, bufferEnabled, bufferN };
      }
    }

    const symbols = [...histData.keys()].filter(k => k !== '__SPY__');
    const ranked = symbols.map(sym => {
      const raw = histData.get(sym);
      const c = raw?.closes ?? raw;
      if (!c || !c[d]) return null;
      let score = null;
      if      (sortMetric==='ret20'  && d>=20  && c[d-20])  score=(c[d]-c[d-20])/c[d-20];
      else if (sortMetric==='ret50'  && d>=50  && c[d-50])  score=(c[d]-c[d-50])/c[d-50];
      else if (sortMetric==='ret200' && d>=200 && c[d-200]) score=(c[d]-c[d-200])/c[d-200];
      else if (sortMetric==='score'  && d>=200 && c[d-20] && c[d-50] && c[d-200]) {
        score=(c[d]-c[d-20])/c[d-20]*0.45 + (c[d]-c[d-50])/c[d-50]*0.35 + (c[d]-c[d-200])/c[d-200]*0.20;
      }
      return score != null ? { sym, score, price: c[d] } : null;
    }).filter(Boolean).sort((a,b) => b.score - a.score);

    const top = ranked.slice(0, topN);
    const buffer = bufferEnabled ? ranked.slice(topN, bufferN) : [];
    const scoreLabel = {score:'综合评分',ret20:'20日涨幅',ret50:'50日涨幅',ret200:'200日涨幅'}[sortMetric]||sortMetric;
    const rfLabel = {daily:'每日',weekly:'每周',monthly:'每月',quarterly:'每季'}[rebalanceFreq]||rebalanceFreq;

    return { date, isDefensive: false,
      holdings:       Object.fromEntries(top.map(r => [r.sym, 1/topN])),
      bufferHoldings: Object.fromEntries(buffer.map(r => [r.sym, r.score])),
      prices:         Object.fromEntries([...top, ...buffer].map(r => [r.sym, r.price])),
      scores: ranked.slice(0, Math.max(10, bufferN)),
      reason: `按${scoreLabel}排名，等权持有前 ${top.length} 只（${rfLabel}调仓）`,
      rebalFreq: rebalanceFreq, spyPrice: spyCloses?.[d], bufferEnabled, bufferN, topN,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histData, histTs, JSON.stringify(params)]);

  const confirmTrades = () => {
    if (!signal) return;
    setMyHoldings({
      holdings:       signal.holdings       || {},
      bufferHoldings: signal.bufferHoldings || {},
      isDefensive:    signal.isDefensive,
      prices:         signal.prices         || {},
      date:           signal.date,
    });
  };

  const prevSignal = myHoldings;
  const isFirstSignal = !prevSignal || (Object.keys(prevSignal.holdings||{}).length===0 && Object.keys(prevSignal.bufferHoldings||{}).length===0 && !prevSignal.isDefensive);

  let sellList=[], buyList=[], holdList=[], bufferList=[];
  if (signal && prevSignal && !isFirstSignal) {
    const prevAllSyms = new Set([...Object.keys(prevSignal.holdings||{}), ...Object.keys(prevSignal.bufferHoldings||{})]);
    const currCoreSyms   = new Set(Object.keys(signal.holdings));
    const currBufferSyms = new Set(Object.keys(signal.bufferHoldings||{}));
    const currAllSyms    = new Set([...currCoreSyms, ...currBufferSyms]);
    const wasDefensive = prevSignal.isDefensive;
    const isDefensive  = signal.isDefensive;

    if (!wasDefensive && isDefensive) {
      for (const sym of prevAllSyms) sellList.push({ sym, reason: '市场过滤触发 → 全仓转现金', price: prevSignal.prices?.[sym] });
    }
    if (wasDefensive && !isDefensive) {
      sellList.push({ sym: 'CASH', reason: '市场恢复，退出防御模式', price: null });
    }
    if (!wasDefensive && !isDefensive) {
      for (const sym of prevAllSyms) {
        if (currCoreSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym===sym);
          const rank = se ? signal.scores.indexOf(se)+1 : '?';
          holdList.push({ sym, reason: `仍在Top${signal.topN}(#${rank})`, price: signal.prices?.[sym] });
        } else if (currBufferSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym===sym);
          const rank = se ? signal.scores.indexOf(se)+1 : '?';
          bufferList.push({ sym, reason: `跌出Top${signal.topN}，仍在缓冲区Top${signal.bufferN}内(#${rank})，保留观察`, price: signal.prices?.[sym] });
        } else {
          const se = signal.scores?.find(s => s.sym===sym);
          const reason = se ? (se.score<=0?'动能转负':`跌出缓冲区(#${signal.scores.indexOf(se)+1} > Top${signal.bufferN})`) : '数据缺失';
          sellList.push({ sym, reason, price: prevSignal.prices?.[sym] });
        }
      }
      for (const sym of currAllSyms) {
        if (!prevAllSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym===sym);
          const rank = se ? signal.scores.indexOf(se)+1 : '?';
          const isCore = currCoreSyms.has(sym);
          if (isCore) buyList.push({ sym, reason: `新进Top${signal.topN}(#${rank}，+${se?(se.score*100).toFixed(1):'?'}%)`, price: signal.prices?.[sym] });
          else bufferList.push({ sym, reason: `新进缓冲区Top${signal.bufferN}(#${rank})`, price: signal.prices?.[sym] });
        }
      }
    }
  }

  const cap = parseFloat(capital) || 0;
  let sellTotal=0, buyTotal=0;
  if (cap>0 && sellList.length>0 && prevSignal) {
    const allPrev = { ...(prevSignal.holdings||{}), ...(prevSignal.bufferHoldings||{}) };
    sellTotal = sellList.reduce((s,x) => s + cap*(allPrev[x.sym]??0), 0);
  }
  if (cap>0 && buyList.length>0)
    buyTotal = buyList.reduce((s,x) => s + cap*(signal?.holdings?.[x.sym]??0), 0);
  const netFlow = sellTotal - buyTotal;

  if (!signal) return null;
  const borderColor = signal.isDefensive ? '#e8883a' : '#4fc86e';

  const tagRow = (list, clr, bg) => list.map(({sym,reason,price}) => (
    <div key={sym} style={{padding:'5px 10px',borderRadius:4,fontSize:10,background:bg,border:`1px solid ${clr}33`}}>
      <span style={{fontWeight:700,color:clr,fontFamily:'monospace'}}>{sym}</span>
      {price!=null && <span style={{color:T.textMuted,marginLeft:4}}>${price.toFixed(1)}</span>}
      <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{reason}</div>
    </div>
  ));

  return (
    <div style={{padding:'14px 18px',background:darkMode?'#0d1f10':'#f0faf2',
      border:`1px solid ${T.border}`,borderLeft:`4px solid ${borderColor}`,borderRadius:8,marginBottom:20}}>

      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <span style={{fontSize:12,fontWeight:700,color:T.textBright}}>📡 调仓指令</span>
        <span style={{fontSize:10,color:T.textMuted}}>{signal.date}</span>
        <span style={{marginLeft:'auto',fontSize:11,fontWeight:700,color:signal.isDefensive?'#e8883a':'#4fc86e'}}>
          {signal.isDefensive ? '⚠️ 市场过滤触发，转现金' : `🟢 持仓 Top ${Object.keys(signal.holdings).length}`}
        </span>
      </div>

      <div style={{fontSize:11,color:T.textSub,marginBottom:10,lineHeight:1.6}}>{signal.reason}</div>

      {isFirstSignal && !signal.isDefensive && (
        <div style={{fontSize:11,color:'#4fc86e',marginBottom:12,padding:'8px 12px',background:'#4fc86e14',borderRadius:6,border:'1px solid #4fc86e33'}}>
          🟢 <b>初始建仓</b> — 首次信号，按以下目标持仓等权买入
        </div>
      )}
      {isFirstSignal && signal.isDefensive && (
        <div style={{fontSize:11,color:'#e8883a',marginBottom:12,padding:'8px 12px',background:'#e8883a14',borderRadius:6,border:'1px solid #e8883a33'}}>
          ⚠️ <b>市场过滤触发</b> — 首次信号即处于防御模式，建议持现金等待
        </div>
      )}

      {!isFirstSignal && (sellList.length>0 || buyList.length>0 || bufferList.length>0) && (
        <div style={{marginBottom:14}}>
          {sellList.length>0 && (<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:'#ee3344',fontWeight:700,marginBottom:4}}>🔴 卖出（{sellList.length}只）</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tagRow(sellList,'#ee3344','#ee334411')}</div>
          </div>)}
          {buyList.length>0 && (<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:'#4fc86e',fontWeight:700,marginBottom:4}}>🟢 买入（{buyList.length}只）</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tagRow(buyList,'#4fc86e','#4fc86e11')}</div>
          </div>)}
          {holdList.length>0 && (<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:'#4488ee',fontWeight:700,marginBottom:4}}>🔵 继续持有（{holdList.length}只）</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tagRow(holdList,'#4488ee','#4488ee11')}</div>
          </div>)}
          {bufferList.length>0 && (<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:'#e8a020',fontWeight:700,marginBottom:4}}>🟡 缓冲区保留（{bufferList.length}只）</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>{tagRow(bufferList,'#e8a020','#e8a02011')}</div>
          </div>)}
        </div>
      )}

      {!isFirstSignal && cap>0 && (sellList.length>0 || buyList.length>0) && (
        <div style={{padding:'8px 12px',marginBottom:12,borderRadius:6,background:T.cardBg,border:`1px solid ${T.border}`,fontSize:11,color:T.textSub,lineHeight:1.8}}>
          <div style={{fontWeight:700,marginBottom:2,color:T.textBright}}>💰 资金流转摘要</div>
          {sellList.length>0 && <div>🔴 卖出回收：<b style={{color:'#ee3344',fontFamily:'monospace'}}>${Math.round(sellTotal).toLocaleString()}</b></div>}
          {buyList.length>0  && <div>🟢 买入需要：<b style={{color:'#4fc86e',fontFamily:'monospace'}}>${Math.round(buyTotal).toLocaleString()}</b></div>}
          <div>{netFlow>0.5
            ? <span>净回笼现金：<b style={{color:'#e8883a',fontFamily:'monospace'}}>${Math.round(netFlow).toLocaleString()}</b>（可保留或按比例再分配）</span>
            : netFlow<-0.5
            ? <span>净追加投入：<b style={{color:'#4fc86e',fontFamily:'monospace'}}>${Math.round(Math.abs(netFlow)).toLocaleString()}</b></span>
            : <span>资金平衡，无需额外操作</span>}
          </div>
        </div>
      )}

      {!signal.isDefensive && signal.scores.length>0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:6}}>
            当前排名（前{Math.min(signal.scores.length,10)}），✓ 为Top{signal.topN}持仓
            {signal.bufferEnabled && <span style={{color:'#e8a020'}}> · ◉ 缓冲区（Top{signal.bufferN}）</span>}
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {signal.scores.slice(0,10).map(({sym,score},i) => {
              const inCore   = signal.holdings[sym]!=null;
              const inBuffer = signal.bufferHoldings?.[sym]!=null;
              const isIn = inCore || inBuffer;
              const tagClr = inCore?borderColor : inBuffer?'#e8a020' : (score>=0?'#4fc86e44':'#ee444433');
              const tagBg  = inCore?'#4fc86e22' : inBuffer?'#e8a02022' : (score>=0?'#4fc86e11':'#ee444411');
              return (
                <div key={sym} style={{padding:'3px 10px',borderRadius:4,fontSize:10,fontFamily:'monospace',
                  fontWeight:isIn?700:400, background:tagBg, border:`1px solid ${tagClr}`,
                  color:score>=0?'#4fc86e':'#ee4444'}}>
                  #{i+1} {sym} {score>=0?'+':''}{(score*100).toFixed(1)}%
                  {inCore&&<span style={{color:borderColor}}> ✓</span>}
                  {inBuffer&&<span style={{color:'#e8a020'}}> ◉</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:T.textMuted}}>💰 按投入金额计算：</span>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontSize:12,color:T.textMuted}}>$</span>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)}
              style={{width:100,padding:'3px 8px',background:T.inputBg,border:`1px solid ${T.borderSub||T.border}`,
                borderRadius:4,color:T.text,fontFamily:'inherit',fontSize:12}}/>
          </div>
        </div>
        {signal.isDefensive ? (
          <div style={{fontSize:12,color:'#e8883a',padding:'8px 12px',background:'#e8883a14',borderRadius:6,border:'1px solid #e8883a33'}}>
            ⚠️ 当前不建议建仓，持现金 ${cap.toLocaleString('en-US',{maximumFractionDigits:0})} 等待市场恢复
          </div>
        ) : (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {Object.entries(signal.holdings).map(([sym,w]) => {
              const amt = cap*w;
              const price = signal.prices[sym];
              const shares = price&&price>0 ? amt/price : null;
              return (
                <div key={sym} style={{padding:'8px 14px',borderRadius:6,minWidth:160,background:T.cardBg,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.textBright,marginBottom:3}}>📈 买入 {sym}</div>
                  <div style={{fontSize:14,color:'#4488ee',fontFamily:'monospace',fontWeight:700}}>
                    ${amt.toLocaleString('en-US',{maximumFractionDigits:0})}
                  </div>
                  {shares!=null && <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>≈ {shares.toFixed(2)} 股 @ ${price.toFixed(2)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{marginTop:12,fontSize:10,color:T.textMuted}}>
        {signal.rebalFreq==='daily'    && '⏰ 每日调仓：每个交易日收盘后检查排名，有变化则次日调整'}
        {signal.rebalFreq==='weekly'   && '⏰ 每周调仓：每 5 个交易日检查一次，信号不变则持仓不动'}
        {signal.rebalFreq==='monthly'  && '⏰ 月调仓：每 21 个交易日（约 1 个月）检查一次，信号不变无需操作'}
        {signal.rebalFreq==='quarterly'&& '⏰ 季调仓：每 63 个交易日（约 3 个月）检查一次'}
      </div>

      <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <button onClick={confirmTrades} style={{padding:'7px 18px',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
          background:'linear-gradient(135deg,#00aa44,#00cc55)',border:'none',color:'#fff',boxShadow:'0 2px 8px #00aa4444'}}>
          ✅ 我已完成调仓
        </button>
        {myHoldings && (
          <div style={{fontSize:10,color:T.textMuted,flex:1}}>
            📌 上次确认：<b style={{color:T.textSub}}>{myHoldings.date}</b>
            {myHoldings.isDefensive
              ? <span>，防御模式（现金）</span>
              : <span>，持有 {Object.keys(myHoldings.holdings||{}).join(' / ')}</span>}
          </div>
        )}
        {myHoldings && (
          <button onClick={()=>setMyHoldings(null)} style={{padding:'5px 12px',borderRadius:6,cursor:'pointer',
            fontFamily:'inherit',fontSize:10,fontWeight:600,background:'transparent',border:`1px solid ${T.border}`,color:T.textMuted}}>
            🗑 清除记录
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  SPY 成分股轮动 — 策略规则卡
// ══════════════════════════════════════════
function SpyMomentumRuleCard({ T, darkMode, stratParams }) {
  const [open, setOpen] = useState(false);
  const { sortMetric='score', topN=10, rebalanceFreq='monthly', bufferEnabled=false, marketFilter='none' } = stratParams;
  const metricLabel = { score:'综合评分(20D×0.45+50D×0.35+200D×0.20)', ret20:'20日涨幅', ret50:'50日涨幅', ret200:'200日涨幅' }[sortMetric]||sortMetric;
  const freqLabel   = { daily:'每日', weekly:'每周(5日)', monthly:'每月(21日)', quarterly:'每季(63日)' }[rebalanceFreq]||rebalanceFreq;
  const filterLabel = marketFilter==='none'?'无过滤':marketFilter==='ma50'?'SPY<MA50→现金':marketFilter==='ma100'?'SPY<MA100→现金':'SPY<MA200→现金';
  const bufferN = bufferEnabled ? Math.round(topN * 1.5) : topN;

  return (
    <div style={{marginBottom:20}}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',width:'100%',textAlign:'left',
        background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:open?'8px 8px 0 0':8,cursor:'pointer',fontFamily:'inherit',fontSize:11,color:T.textSub}}>
        <span style={{color:'#4488ee',fontWeight:700}}>{open?'▼':'▶'}</span>
        <span style={{fontWeight:600}}>策略规则</span>
        <span style={{color:T.textMuted,marginLeft:8}}>
          {metricLabel} · Top{topN} · {freqLabel} · {filterLabel}{bufferEnabled?` · 缓冲区(Top${bufferN})`:''}
        </span>
      </button>
      {open && (
        <div style={{padding:'14px 18px',background:T.cardBg,border:`1px solid ${T.border}`,borderTop:'none',
          borderRadius:'0 0 8px 8px',fontSize:11,lineHeight:1.9,color:T.textSub}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 24px'}}>
            <div>
              <div style={{fontWeight:700,color:'#4fc86e',marginBottom:6,fontSize:12}}>入场条件</div>
              <div>· 对 S&P 500 全量成分股（{SPY_COMPONENTS.length}只）按指定动能指标计算得分并排名</div>
              <div>· 动能指标：<b style={{color:T.textBright}}>{metricLabel}</b></div>
              <div>· 选取排名前 <b style={{color:T.textBright}}>Top {topN}</b> 名，等权配置</div>
              {bufferEnabled && <div>· 缓冲区：持仓跌出 Top{topN} 但仍在 <b style={{color:'#e8a020'}}>Top{bufferN}</b> 内，保留不动</div>}
            </div>
            <div>
              <div style={{fontWeight:700,color:'#ee3344',marginBottom:6,fontSize:12}}>出场条件</div>
              <div>· 调仓日重新排名，跌出<b style={{color:'#ee3344'}}>缓冲区</b>的持仓卖出</div>
              {bufferEnabled && <div>· 缓冲区 = Top{topN} × 1.5 = <b style={{color:'#e8a020'}}>Top{bufferN}</b>，降低换手率</div>}
              <div>· 动能转负 → 调仓日不再入选</div>
              <div>· 无独立止损 / 止盈 / 移动止损</div>
            </div>
            <div>
              <div style={{fontWeight:700,color:'#e8883a',marginBottom:6,fontSize:12}}>防御机制</div>
              <div>· 市场过滤：<b style={{color:T.textBright}}>{filterLabel}</b></div>
              <div>· 过滤触发后一次性清仓，全部持现金等待</div>
            </div>
            <div>
              <div style={{fontWeight:700,color:'#88bbff',marginBottom:6,fontSize:12}}>执行方式</div>
              <div>· T 日收盘信号 → T+1 日开盘执行（MOO 模型）</div>
              <div>· 调仓频率：<b style={{color:T.textBright}}>{freqLabel}</b></div>
              <div>· 不含交易成本和滑点</div>
              <div>· 回测使用当前 SPY 成分股，存在幸存者偏差</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  主组件
// ══════════════════════════════════════════
export default function SpyMomentumTab({ T, darkMode }) {
  const [histData,     setHistData]     = useState(null);
  const [histTs,       setHistTs]       = useState(null);
  const [histRange,    setHistRange]    = useState("3y");
  const [histLoading,  setHistLoading]  = useState(false);
  const [histProg,     setHistProg]     = useState({done:0,total:0});
  const [stratParams,  setStratParams]  = useState({sortMetric:"score",topN:10,rebalanceFreq:"monthly",bufferEnabled:false,marketFilter:"ma200"});
  const [stratResult,  setStratResult]  = useState(null);
  const [optResult,    setOptResult]    = useState(null);
  const [optRunning,   setOptRunning]   = useState(false);
  const [wfoResult,    setWfoResult]    = useState(null);
  const [wfoRunning,   setWfoRunning]   = useState(false);
  const [wfoOptMetric, setWfoOptMetric] = useState("sharpe");
  const [wfoMode,      setWfoMode]      = useState("auto");
  const [appliedParams,setAppliedParams]= useState(null);
  const [showOpt,      setShowOpt]      = useState(false);
  const [showWfo,      setShowWfo]      = useState(false);
  const [initCapital,  setInitCapital]  = useState("100000");
  const histAbort = useRef(null);

  const histPct = histProg.total ? Math.round(histProg.done / histProg.total * 100) : 0;

  // ── 加载历史数据 ──
  const loadHistData = useCallback(async () => {
    histAbort.current?.abort();
    const ctrl = new AbortController(); histAbort.current = ctrl;
    const { signal } = ctrl;
    setHistLoading(true); setHistProg({done:0, total:SPY_COMPONENTS.length+1});
    setHistData(null); setHistTs(null); setStratResult(null); setOptResult(null); setWfoResult(null);
    try {
      const spyRaw = await fetchCandlesExtended('SPY', histRange, signal);
      if (!spyRaw) { setHistLoading(false); return; }
      const spyTs      = spyRaw.map(d => d.ts);
      const spyAdj     = spyRaw.map(d => d.c);
      const spyAdjOpen = spyRaw.map(d => d.o);
      const tsIdx = new Map(spyTs.map((t,i) => [t,i]));
      const Nq = spyTs.length;
      setHistProg({done:1, total:SPY_COMPONENTS.length+1});

      const rawMap = new Map();
      for (let i=0; i<SPY_COMPONENTS.length; i+=BATCH) {
        if (signal.aborted) break;
        await Promise.all(SPY_COMPONENTS.slice(i, i+BATCH).map(async sym => {
          try {
            const raw = await fetchCandlesExtended(sym, histRange, signal);
            if (raw) rawMap.set(sym, raw);
          } catch(e) {}
        }));
        setHistProg({done: i+BATCH+1, total:SPY_COMPONENTS.length+1});
        if (i+BATCH < SPY_COMPONENTS.length && !signal.aborted)
          await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
      if (signal.aborted) return;

      const aligned = new Map();
      aligned.set('__SPY__', { closes: spyAdj, opens: spyAdjOpen });
      for (const [sym, rows] of rawMap) {
        const closesArr = new Array(Nq).fill(null);
        const opensArr  = new Array(Nq).fill(null);
        for (const { c, o, ts } of rows) {
          const idx = tsIdx.get(ts);
          if (idx !== undefined) { closesArr[idx] = c; opensArr[idx] = o; }
        }
        for (let j=1; j<Nq; j++) {
          if (closesArr[j]===null && closesArr[j-1]!==null) closesArr[j]=closesArr[j-1];
          if (opensArr[j]===null  && opensArr[j-1]!==null)  opensArr[j]=opensArr[j-1];
        }
        aligned.set(sym, { closes: closesArr, opens: opensArr });
      }
      setHistData(aligned); setHistTs(spyTs); setHistLoading(false);
    } catch(e) { if (!signal.aborted) { console.error(e); setHistLoading(false); } }
  }, [histRange]);

  // ── 运行固定参数回测 ──
  const runStratBacktest = useCallback((overrideParams) => {
    if (!histData || !histTs) return;
    const params = overrideParams ?? stratParams;
    setAppliedParams({...params});
    setWfoMode('fixed');
    const spyCloses  = histData.get('__SPY__').closes;
    const stockData  = new Map([...histData].filter(([k]) => k !== '__SPY__'));
    const bt         = portfolioBacktest(stockData, histTs, spyCloses, params);
    const metrics    = calcPortMetrics(bt.equityCurve, bt.timestamps);
    const spyBt      = buildSpyEquity(spyCloses, bt.simStart);
    const spyEq      = spyBt.equityCurve.slice(0, bt.equityCurve.length);
    const spyMetrics = calcPortMetrics(spyEq, bt.timestamps);
    setStratResult({ equityCurve:bt.equityCurve, timestamps:bt.timestamps, metrics, spyEq, spyMetrics, turnover:bt.turnoverCount });
  }, [histData, histTs, stratParams]);

  // ── Grid Search ──
  const handleRunOptimize = useCallback(async () => {
    if (!histData || !histTs) return;
    setOptRunning(true); setOptResult(null);
    await new Promise(r => setTimeout(r, 50));
    const spyCloses = histData.get('__SPY__').closes;
    const stockData = new Map([...histData].filter(([k]) => k !== '__SPY__'));
    const combos = runAllCombos(stockData, histTs, spyCloses);
    setOptResult(combos); setOptRunning(false);
  }, [histData, histTs]);

  // ── WFO ──
  const handleRunWFO = useCallback(async () => {
    if (!histData || !histTs) return;
    setWfoRunning(true); setWfoResult(null);
    await new Promise(r => setTimeout(r, 50));
    const spyCloses = histData.get('__SPY__').closes;
    const stockData = new Map([...histData].filter(([k]) => k !== '__SPY__'));
    const fixedArg  = wfoMode === 'fixed' ? appliedParams : null;
    const result    = runWFO(stockData, histTs, spyCloses, wfoOptMetric, fixedArg);
    setWfoResult(result); setWfoRunning(false);
  }, [histData, histTs, wfoOptMetric, wfoMode, appliedParams]);

  return (
    <div style={{padding:"20px 28px"}}>

      {/* 免责声明 */}
      <div style={{padding:"8px 14px",background:darkMode?"#1a1200":"#fffbe6",border:`1px solid #cc880044`,borderRadius:6,marginBottom:20,fontSize:11,color:"#cc8800"}}>
        ⚠️ 使用当前 SPY 成分股回测，存在<strong>幸存者偏差</strong>（历史上被剔除的股票未计入）。结果仅供参考，不构成投资建议。不含交易成本。
      </div>

      {/* STEP 1 · 加载数据 */}
      <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:20}}>
        <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:10}}>STEP 1 · 加载历史数据</div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:histLoading?12:0}}>
          <span style={{fontSize:11,color:T.textMuted}}>历史深度</span>
          {["2y","3y","5y","10y"].map(r => (
            <button key={r} disabled={histLoading} onClick={()=>setHistRange(r)} style={{padding:"4px 12px",...activeButtonStyle(histRange===r,T)}}>
              {r==="2y"?"2年":r==="3y"?"3年":r==="5y"?"5年":"10年"}
              {r==="10y" && <span style={{fontSize:8,marginLeft:3,color:"#aa66ff",fontWeight:700}}>WFO</span>}
            </button>
          ))}
          <button disabled={histLoading} onClick={loadHistData} style={{padding:"5px 16px",borderRadius:6,cursor:histLoading?"not-allowed":"pointer",
            fontFamily:"inherit",fontSize:11,background:darkMode?"#004488":"#0055cc",border:"1px solid #4488ee",
            color:darkMode?"#88ccff":"#ffffff",opacity:histLoading?0.6:1}}>
            {histLoading ? "加载中…" : "加载历史数据"}
          </button>
          {histData && !histLoading && (
            <span style={{fontSize:11,color:"#00aa44"}}>
              ✓ 已加载 {histData.size-1} 只股票 × {histRange==="2y"?"2年":histRange==="3y"?"3年":histRange==="5y"?"5年":"10年"}数据
            </span>
          )}
        </div>
        {histLoading && (
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

      {/* 策略规则卡 */}
      <SpyMomentumRuleCard T={T} darkMode={darkMode} stratParams={stratParams}/>

      {/* 调仓信号面板 */}
      {histData && <SpySignalCard histData={histData} histTs={histTs} params={stratParams} T={T} darkMode={darkMode}/>}

      {/* MODE A · Fixed Parameter Backtest */}
      {histData && (
        <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={{background:"#005bcc",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,letterSpacing:1}}>MODE A</span>
            <span style={{fontSize:12,color:T.textBright,fontWeight:600}}>Fixed Parameter Backtest</span>
            <span style={{fontSize:10,color:T.textMuted}}>— 固定参数全程回测，不做优化</span>
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:16,alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:5}}>动能回看期</div>
              <div style={{display:"flex",gap:4}}>
                {[{v:"score",l:"综合"},{v:"ret20",l:"20日"},{v:"ret50",l:"50日"},{v:"ret200",l:"200日"}].map(({v,l}) => (
                  <button key={v} onClick={()=>setStratParams(p=>({...p,sortMetric:v}))}
                    style={{padding:"4px 10px",...activeButtonStyle(stratParams.sortMetric===v,T)}}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:5}}>持仓数量 (TopN)</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[3,5,10,15,20,25,30].map(n => (
                  <button key={n} onClick={()=>setStratParams(p=>({...p,topN:n}))}
                    style={{padding:"4px 8px",...activeButtonStyle(stratParams.topN===n,T)}}>Top {n}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:5}}>调仓频率</div>
              <div style={{display:"flex",gap:4}}>
                {[{v:"daily",l:"每日"},{v:"weekly",l:"每周"},{v:"monthly",l:"每月"},{v:"quarterly",l:"每季"}].map(({v,l}) => (
                  <button key={v} onClick={()=>setStratParams(p=>({...p,rebalanceFreq:v}))}
                    style={{padding:"4px 10px",...activeButtonStyle(stratParams.rebalanceFreq===v,T)}}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:5}}>市场过滤（SPY 跌破均线 → 转现金）</div>
              <div style={{display:"flex",gap:4}}>
                {[{v:"none",l:"不过滤"},{v:"ma50",l:">MA50"},{v:"ma100",l:">MA100"},{v:"ma200",l:">MA200"}].map(({v,l}) => (
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
            <span style={{fontSize:10,color:T.textSub}}>当前：{fmtParamLabel(stratParams)}</span>
          </div>
        </div>
      )}

      {/* 回测结果 */}
      {stratResult?.metrics && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:12}}>绩效对比</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
            <MetricCard T={T} label="CAGR（年化收益）" strat={stratResult.metrics.cagr} bench={stratResult.spyMetrics?.cagr} unit="%" fmtFn={v=>v.toFixed(1)}/>
            <MetricCard T={T} label="Sharpe Ratio"   strat={stratResult.metrics.sharpe} bench={stratResult.spyMetrics?.sharpe} fmtFn={v=>v.toFixed(2)}/>
            <MetricCard T={T} label="最大回撤 MDD" strat={stratResult.metrics.mdd} bench={stratResult.spyMetrics?.mdd} unit="%" higherBetter={false} fmtFn={v=>v.toFixed(1)} alwaysRed={true}/>
            <MetricCard T={T} label="累积收益"     strat={stratResult.metrics.total} bench={stratResult.spyMetrics?.total} unit="%" fmtFn={v=>v.toFixed(1)}/>
            <div style={{padding:"10px 14px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,minWidth:130}}>
              <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:4}}>换股次数</div>
              <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:T.textBright}}>{stratResult.turnover}</div>
              <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>含买入操作</div>
            </div>
          </div>

          {/* 资金模拟 */}
          {(()=>{
            const c = parseFloat(initCapital);
            const eq = stratResult.equityCurve, qEq = stratResult.spyEq;
            const finalStrat = !isNaN(c)&&eq?.length ? c*eq[eq.length-1] : null;
            const finalSPY   = !isNaN(c)&&qEq?.length ? c*qEq[qEq.length-1] : null;
            const fmtM = v => v>=1e6?`${(v/1e6).toFixed(2)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:`${v.toFixed(0)}`;
            return (
              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:16,padding:"10px 16px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8}}>
                <span style={{fontSize:11,color:T.textSub,whiteSpace:"nowrap"}}>起始资金</span>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{fontSize:12,color:T.textMuted}}>$</span>
                  <input type="number" value={initCapital} onChange={e=>setInitCapital(e.target.value)}
                    style={{width:110,padding:"4px 8px",background:T.inputBg,border:`1px solid ${T.borderSub||T.border}`,borderRadius:4,color:T.text,fontFamily:"inherit",fontSize:12}}/>
                </div>
                {finalStrat!=null && (
                  <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:12,color:T.textMuted}}>策略最终:&nbsp;<span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:finalStrat>=c?"#00aa44":"#ee3344"}}>${fmtM(finalStrat)}</span></span>
                    <span style={{fontSize:12,color:T.textMuted}}>SPY最终:&nbsp;<span style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:finalSPY!=null&&finalSPY>=c?"#00aa44":"#ee3344"}}>{finalSPY!=null?`$${fmtM(finalSPY)}`:"—"}</span></span>
                    {finalSPY!=null && <span style={{fontSize:11,color:finalStrat>=finalSPY?"#00aa44":"#ee3344",fontFamily:"monospace"}}>{finalStrat>=finalSPY?"▲":"▼"} {fmtPct((finalStrat-finalSPY)/finalSPY*100)} vs SPY</span>}
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
            <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>净值曲线（策略 vs SPY）</div>
            <EquityCurveChart stratEq={stratResult.equityCurve} spyEq={stratResult.spyEq} timestamps={stratResult.timestamps} T={T}/>
          </div>
          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
            <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>回撤曲线</div>
            <DrawdownChart drawdowns={stratResult.metrics.drawdowns} timestamps={stratResult.timestamps} T={T}/>
          </div>
          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
            <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>年度收益对比</div>
            <AnnualBarsChart stratAnnual={stratResult.metrics.annualRets} spyAnnual={stratResult.spyMetrics?.annualRets??{}} T={T}/>
          </div>
          <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12}}>
            <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:10}}>月度收益热图（策略）</div>
            <MonthlyHeatmap monthlyRets={stratResult.metrics.monthlyRets} T={T}/>
          </div>
        </div>
      )}

      {/* Grid Search */}
      {histData && (
        <div style={{marginBottom:20}}>
          <button onClick={()=>setShowOpt(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
            background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
            color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
            <span style={{color:"#4488ee",fontWeight:700}}>{showOpt?"▼":"▶"}</span>
            参数全量扫描（Grid Search，448 种组合）
            {optResult && <span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
          </button>
          {showOpt && (
            <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:4}}>动能回看期×4 · TopN×7 · 调仓频率×4 · 市场过滤×4 = 448 种组合（全量历史数据）</div>
              <div style={{fontSize:10,color:"#cc8800",marginBottom:12}}>
                ⚠️ 注意：此处是在全量数据上选参，结果存在 in-sample 过拟合风险。如需无偏验证，请使用下方 Walk Forward Optimization。
              </div>
              <button disabled={optRunning} onClick={handleRunOptimize} style={{padding:"5px 18px",borderRadius:6,cursor:optRunning?"not-allowed":"pointer",
                fontFamily:"inherit",fontSize:11,background:darkMode?"#004488":"#0055cc",
                border:"1px solid #4488ee",color:darkMode?"#88ccff":"#ffffff",opacity:optRunning?0.6:1,marginBottom:14}}>
                {optRunning ? "⏳ 优化中…" : "▶ 开始优化"}
              </button>
              {optResult && (()=>{
                const bySharpe = [...optResult].sort((a,b) => b.metrics.sharpe-a.metrics.sharpe).slice(0,5);
                const byCagr   = [...optResult].sort((a,b) => b.metrics.cagr-a.metrics.cagr).slice(0,5);
                const byMdd    = [...optResult].sort((a,b) => b.metrics.mdd-a.metrics.mdd).slice(0,5);
                const byRatio  = [...optResult].sort((a,b) => (b.metrics.cagr/Math.abs(b.metrics.mdd||1))-(a.metrics.cagr/Math.abs(a.metrics.mdd||1))).slice(0,5);
                const sections = [
                  {title:"Sharpe 最高",data:bySharpe,key:"sharpe",fmt:v=>v.toFixed(2)},
                  {title:"CAGR 最高",  data:byCagr,  key:"cagr",  fmt:v=>v.toFixed(1)+"%"},
                  {title:"MDD 最低",   data:byMdd,   key:"mdd",   fmt:v=>v.toFixed(1)+"%"},
                  {title:"CAGR/MDD 最优",data:byRatio,key:"cagr",fmt:v=>v.toFixed(1)+"%"},
                ];
                return (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                    {sections.map(sec => (
                      <div key={sec.title} style={{border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden"}}>
                        <div style={{padding:"7px 12px",background:T.theadBg,fontSize:10,color:T.textSub,letterSpacing:1}}>{sec.title}</div>
                        <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10}}>
                          <thead>
                            <tr>
                              <th style={{padding:"5px 10px",textAlign:"left",color:T.textSub,fontWeight:400}}>参数</th>
                              <th style={{padding:"5px 10px",textAlign:"right",color:T.textSub,fontWeight:400}}>{sec.title.split(" ")[0]}</th>
                              <th style={{padding:"5px 10px",textAlign:"right",color:T.textSub,fontWeight:400}}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.data.map((r,i) => (
                              <tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                                <td style={{padding:"5px 10px",color:T.text}}>{fmtParamLabel(r.params)}</td>
                                <td style={{padding:"5px 10px",textAlign:"right",fontFamily:"monospace",color:sec.key==="mdd"?"#ee3344":"#00aa44"}}>
                                  {sec.fmt(r.metrics[sec.key])}
                                </td>
                                <td style={{padding:"5px 8px"}}>
                                  <button onClick={()=>{const p={...r.params};setStratParams(p);runStratBacktest(p);}}
                                    style={{padding:"2px 8px",fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:4,
                                      background:"transparent",border:`1px solid ${T.borderSub||T.border}`,color:T.textSub}}>
                                    应用并回测
                                  </button>
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

      {/* MODE B · Walk Forward Optimization */}
      {histData && (
        <div style={{marginBottom:20}}>
          <button onClick={()=>setShowWfo(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
            background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
            color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
            <span style={{color:"#aa66ff",fontWeight:700}}>{showWfo?"▼":"▶"}</span>
            <span style={{background:"#5522aa",color:darkMode?"#ddb8ff":"#ffffff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,letterSpacing:1}}>MODE B</span>
            Walk Forward Optimization（单窗口：前 70% IS 训练 → 后 30% OOS 验证）
            {wfoResult && <span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
          </button>

          {showWfo && (
            <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>

              {/* 双模式切换 */}
              <div style={{display:"flex",gap:0,marginBottom:14,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",width:"fit-content"}}>
                {[{id:"fixed",icon:"📌",label:"固定参数 OOS 验证",desc:"用已选参数跑样本外"},
                  {id:"auto", icon:"🔍",label:"自动寻优 WFO",     desc:"IS Grid Search 选最优"}].map(({id,icon,label,desc}) => (
                  <button key={id} onClick={()=>setWfoMode(id)} style={{padding:"8px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:11,
                    background:wfoMode===id?(darkMode?"#2a1a44":"#f0eaff"):"transparent",
                    borderRight:`1px solid ${T.border}`,border:"none",
                    color:wfoMode===id?(darkMode?"#cc99ff":"#5522aa"):T.textSub,fontWeight:wfoMode===id?600:400}}>
                    {icon} {label}
                    <div style={{fontSize:9,color:T.textMuted,marginTop:1}}>{desc}</div>
                  </button>
                ))}
              </div>

              {/* 固定参数模式提示 */}
              {wfoMode==="fixed" && (
                <div style={{marginBottom:14,padding:"10px 14px",background:darkMode?"#0a2a0a":"#f0fff0",border:`1px solid ${darkMode?"#1a5a1a":"#88cc88"}`,borderRadius:7}}>
                  {appliedParams ? (
                    <>
                      <div style={{fontSize:10,color:darkMode?"#88cc88":"#226622",marginBottom:4}}>
                        📌 已选参数（将用于 OOS 验证，IS 期只计算参考绩效）
                      </div>
                      <div style={{fontFamily:"monospace",fontSize:11,color:darkMode?"#aaffaa":"#004400"}}>
                        {[`动能：${{score:"综合",ret20:"20日",ret50:"50日",ret200:"200日"}[appliedParams.sortMetric]||appliedParams.sortMetric}`,
                          `Top ${appliedParams.topN}`,
                          `调仓：${{daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季"}[appliedParams.rebalanceFreq]||appliedParams.rebalanceFreq}`,
                          `过滤：${{none:"不过滤",ma50:"MA50",ma100:"MA100",ma200:"MA200"}[appliedParams.marketFilter]||"—"}`,
                        ].join("  |  ")}
                      </div>
                    </>
                  ) : (
                    <div style={{fontSize:10,color:darkMode?"#cc8800":"#886600"}}>
                      ⚠ 尚未运行过回测，请先在上方「▶ 运行固定参数回测」或「应用并回测」后再使用此模式
                    </div>
                  )}
                </div>
              )}

              {/* 自动寻优模式 */}
              {wfoMode==="auto" && (
                <>
                  <div style={{fontSize:10,color:T.textMuted,marginBottom:10,lineHeight:1.6}}>
                    前 70% 数据做 in-sample，跑 Grid Search（<b style={{color:T.textBright}}>448种组合</b>）→
                    按优化指标选最佳参数 → <b style={{color:"#88bbff"}}>固定该参数</b>跑后 30% out-of-sample。
                    <span style={{color:"#88bbff",marginLeft:4}}>🔒 IS / OOS 参数严格一致，不事后调参。</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <span style={{fontSize:10,color:T.textSub,whiteSpace:"nowrap"}}>in-sample 优化指标：</span>
                    {[{v:"sharpe",l:"Sharpe（推荐）"},{v:"cagr",l:"CAGR"},{v:"calmar",l:"Calmar"}].map(({v,l}) => (
                      <button key={v} onClick={()=>setWfoOptMetric(v)}
                        style={{padding:"4px 10px",fontSize:10,...activeButtonStyle(wfoOptMetric===v,T)}}>{l}</button>
                    ))}
                  </div>
                </>
              )}

              <button disabled={wfoRunning||(wfoMode==="fixed"&&!appliedParams)} onClick={handleRunWFO}
                style={{padding:"6px 20px",borderRadius:6,fontFamily:"inherit",fontSize:12,
                  cursor:(wfoRunning||(wfoMode==="fixed"&&!appliedParams))?"not-allowed":"pointer",
                  background:darkMode?"#220044":"#5522aa",border:"1px solid #9966ee",color:darkMode?"#cc99ff":"#ffffff",
                  opacity:(wfoRunning||(wfoMode==="fixed"&&!appliedParams))?0.6:1,marginBottom:16}}>
                {wfoRunning
                  ? (wfoMode==="fixed"?"⏳ 固定参数 OOS 验证中…":"⏳ 运行中（448种参数组合）…")
                  : (wfoMode==="fixed"?"▶ 运行固定参数 OOS 验证":"▶ 运行 Walk Forward Optimization")}
              </button>

              {wfoResult && (()=>{
                const cm = wfoResult.combinedMetrics, qm = wfoResult.spyCombinedMetrics;
                const optLabel = {sharpe:"Sharpe",cagr:"CAGR",calmar:"Calmar"}[wfoResult.optMetric]||wfoResult.optMetric;
                const isFixed  = wfoResult.isFixedMode;
                return (
                  <>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:14,padding:"10px 14px",
                      background:T.cardBg2||T.cardBg,border:`1px solid ${T.border}`,borderRadius:7,fontSize:10}}>
                      <span style={{color:T.textSub}}>模式：<b style={{color:isFixed?"#88cc88":"#cc99ff"}}>
                        {isFixed?"📌 固定参数 OOS 验证":"🔍 自动寻优 WFO（单窗口 70% IS / 30% OOS）"}
                      </b></span>
                      <span style={{color:T.textSub}}>IS 天数：<b style={{color:T.textBright}}>{wfoResult.inDays}</b></span>
                      <span style={{color:T.textSub}}>OOS 天数：<b style={{color:T.textBright}}>{wfoResult.outDays}</b></span>
                      {!isFixed && <span style={{color:T.textSub}}>Grid Search 参数组合：<b style={{color:T.textBright}}>{wfoResult.totalCombos}</b> 种</span>}
                      {!isFixed && <span style={{color:T.textSub}}>IS 优化指标：<b style={{color:"#cc99ff"}}>{optLabel}</b></span>}
                    </div>

                    <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:6}}>
                      {isFixed?"逐窗口明细（固定参数 IS 参考绩效 + OOS 验证）":"逐窗口明细（in-sample 选参 → out-of-sample 验证）"}
                    </div>
                    <div style={{overflowX:"auto",marginBottom:20}}>
                      <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10,minWidth:isFixed?900:1100}}>
                        <thead>
                          <tr>
                            {[
                              {h:"#",group:""},{h:"IS 开始",group:"is"},{h:"IS 结束",group:"is"},
                              {h:"OOS 开始",group:"oos"},{h:"OOS 结束",group:"oos"},
                              {h:"TopN",group:"param"},{h:"动能回看",group:"param"},
                              {h:"调仓频率",group:"param"},{h:"市场过滤",group:"param"},
                              ...(!isFixed?[{h:`IS ${optLabel}`,group:""}]:[]),
                              {h:"IS CAGR",group:"is"},{h:"IS Sharpe",group:"is"},
                              {h:"OOS CAGR",group:"oos"},{h:"OOS Sharpe",group:"oos"},{h:"OOS MDD",group:"oos"},
                              {h:"SPY CAGR",group:""},{h:"操作",group:""},
                            ].map(({h,group}) => (
                              <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:500,fontSize:9,
                                background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`,whiteSpace:"nowrap",
                                color:group==="param"?"#cc99ff":group==="oos"?"#88bbff":group==="is"?"#aaaaaa":T.textSub}}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wfoResult.windowResults.map((w,i) => {
                            const bp = w.bestParams;
                            const mfLabel = {none:"不过滤",ma50:">MA50",ma100:">MA100",ma200:">MA200"}[bp.marketFilter]||"—";
                            const rfLabel = {daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季"}[bp.rebalanceFreq]||bp.rebalanceFreq;
                            const smLabel = {score:"综合",ret20:"20日",ret50:"50日",ret200:"200日"}[bp.sortMetric]||bp.sortMetric;
                            const isScore = wfoResult.optMetric==='cagr'?w.inSampleCAGR:w.inSampleSharpe;
                            return (
                              <tr key={i} style={{background:i%2===0?T.cardBg:T.cardBg2||T.cardBg}}>
                                <td style={{padding:"7px 10px",color:T.textSub,textAlign:"center",fontWeight:700}}>{w.winIdx}</td>
                                <td style={{padding:"7px 10px",color:T.textMuted,whiteSpace:"nowrap"}}>{fmtDate(w.inTsStart)}</td>
                                <td style={{padding:"7px 10px",color:T.textMuted,whiteSpace:"nowrap"}}>{fmtDate(w.inTsEnd)}</td>
                                <td style={{padding:"7px 10px",color:T.textBright,whiteSpace:"nowrap",fontWeight:600}}>{fmtDate(w.outTsStart)}</td>
                                <td style={{padding:"7px 10px",color:T.textBright,whiteSpace:"nowrap",fontWeight:600}}>{fmtDate(w.outTsEnd)}</td>
                                <td style={{padding:"7px 10px",color:"#cc99ff",fontFamily:"monospace",fontWeight:700}}>Top {bp.topN}</td>
                                <td style={{padding:"7px 10px",color:"#cc99ff"}}>{smLabel}</td>
                                <td style={{padding:"7px 10px",color:"#cc99ff"}}>{rfLabel}</td>
                                <td style={{padding:"7px 10px",color:"#cc99ff",whiteSpace:"nowrap"}}>{mfLabel}</td>
                                {!isFixed && <td style={{padding:"7px 10px",fontFamily:"monospace",color:T.textSub}}>{isScore!=null?isScore.toFixed(2):"—"}</td>}
                                <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#888888"}}>{w.inSampleCAGR!=null?fmtPct(w.inSampleCAGR,1):"—"}</td>
                                <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#888888"}}>{w.inSampleSharpe!=null?w.inSampleSharpe.toFixed(2):"—"}</td>
                                <td style={{padding:"7px 10px",fontFamily:"monospace",fontWeight:700,color:w.outMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>
                                  {w.outMetrics?fmtPct(w.outMetrics.cagr,1):"—"}
                                </td>
                                <td style={{padding:"7px 10px",fontFamily:"monospace",color:T.text}}>{w.outMetrics?w.outMetrics.sharpe.toFixed(2):"—"}</td>
                                <td style={{padding:"7px 10px",fontFamily:"monospace",color:"#ee3344"}}>{w.outMetrics?fmtPct(w.outMetrics.mdd,1):"—"}</td>
                                <td style={{padding:"7px 10px",fontFamily:"monospace",color:w.spyOutMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>
                                  {w.spyOutMetrics?fmtPct(w.spyOutMetrics.cagr,1):"—"}
                                </td>
                                <td style={{padding:"5px 8px"}}>
                                  <button onClick={()=>{const p={...bp};setStratParams(p);runStratBacktest(p);}}
                                    style={{padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,
                                      background:darkMode?"#004488":"#0055cc",border:"1px solid #4488ee",color:"#fff",whiteSpace:"nowrap"}}>
                                    应用并回测
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {wfoResult.allOutEquity.length>10 && (
                      <div style={{background:T.cardBg2||T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",overflowX:"auto",marginBottom:12}}>
                        <div style={{fontSize:10,color:T.textSub,marginBottom:8}}>WFO Combined OOS 净值曲线（策略 蓝线 vs SPY 灰虚线）</div>
                        <EquityCurveChart stratEq={wfoResult.allOutEquity} spyEq={wfoResult.spyWfoEq} timestamps={wfoResult.allOutTs} T={T}/>
                      </div>
                    )}

                    {cm && (()=>{
                      const normCm = { cagr:cm.cagr/100, sharpe:cm.sharpe, mdd:cm.mdd/100, totalReturn:cm.total/100 };
                      const normQm = qm ? { cagr:qm.cagr/100, sharpe:qm.sharpe, mdd:qm.mdd/100, totalReturn:qm.total/100 } : null;
                      return (
                        <WfoSummaryTable cm={normCm} benchmarks={normQm?[{label:'SPY 基准',metrics:normQm}]:[]} T={T} darkMode={darkMode}/>
                      );
                    })()}

                    {stratResult?.metrics && cm && (()=>{
                      const sa=stratResult.metrics, qa=stratResult.spyMetrics;
                      const rows=[
                        {mode:"Mode A · Fixed Param Backtest（全量数据，含 in-sample）",cagr:sa.cagr,sharpe:sa.sharpe,mdd:sa.mdd,total:sa.total},
                        {mode:"Mode B · WFO Combined OOS（纯 out-of-sample，无事后挑参）",cagr:cm.cagr,sharpe:cm.sharpe,mdd:cm.mdd,total:cm.total},
                        {mode:"SPY Buy & Hold（同 OOS 期间基准）",cagr:qm?.cagr,sharpe:qm?.sharpe,mdd:qm?.mdd,total:qm?.total},
                      ];
                      return (
                        <div style={{marginTop:8}}>
                          <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>Mode A vs Mode B 最终对比</div>
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:10,minWidth:600}}>
                              <thead>
                                <tr>
                                  {["模式","CAGR","Sharpe","MDD","累积收益"].map(h => (
                                    <th key={h} style={{padding:"6px 12px",textAlign:"left",fontWeight:500,fontSize:9,
                                      background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`,color:T.textSub}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r,i) => (
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
    </div>
  );
}
