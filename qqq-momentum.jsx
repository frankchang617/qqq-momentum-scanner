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
  const m = { score:'综合', ret20:'20日', ret50:'50日', ret200:'200日' };
  const f = { weekly:'周调', monthly:'月调' };
  return `${m[p.sortMetric]} Top${p.topN} ${f[p.rebalanceFreq]}${p.bufferEnabled?' 缓冲':''}${p.qqq200Filter?' 均线':''}`;
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
function EquityCurveChart({ stratEq, qqqEq, T }) {
  const W = 700, H = 220;
  const pad = { l:46, r:12, t:14, b:24 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const allV = [...stratEq, ...qqqEq];
  const minV = Math.min(...allV) * 0.98, maxV = Math.max(...allV) * 1.02;
  const rng = maxV - minV;
  const n = stratEq.length;
  const tx = i => pad.l + (i/(n-1))*iw;
  const ty = v => pad.t + ih - ((v-minV)/rng)*ih;
  const sp = stratEq.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const qp = qqqEq.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const ticks = [minV, minV+rng*0.25, minV+rng*0.5, minV+rng*0.75, maxV];
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      {ticks.map((v,i) => (
        <Fragment key={i}>
          <line x1={pad.l} y1={ty(v)} x2={pad.l+iw} y2={ty(v)} stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3"/>
          <text x={pad.l-4} y={ty(v)+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>{((v-1)*100).toFixed(0)}%</text>
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

function DrawdownChart({ drawdowns, T }) {
  const W = 700, H = 120;
  const pad = { l:46, r:12, t:10, b:24 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const minV = Math.min(...drawdowns, -1) * 1.1;
  const n = drawdowns.length;
  const tx = i => pad.l + (i/(n-1))*iw;
  const ty = v => pad.t + (1 - v/minV)*ih;
  const pts = drawdowns.map((v,i) => `${tx(i)},${ty(v)}`).join(" ");
  const fill = `${pad.l},${pad.t} ${pts} ${pad.l+iw},${pad.t}`;
  return (
    <svg width={W} height={H} style={{display:"block"}}>
      <line x1={pad.l} y1={pad.t} x2={pad.l+iw} y2={pad.t} stroke={T.border} strokeWidth="0.5"/>
      <polygon points={fill} fill="#ee334428"/>
      <polyline points={pts} fill="none" stroke="#ee3344" strokeWidth="1.5"/>
      <text x={pad.l-4} y={ty(minV)+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>{minV.toFixed(1)}%</text>
      <text x={pad.l-4} y={pad.t+4} textAnchor="end" fill={T.textVMuted} fontSize={9}>0%</text>
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
  return { n:trades.length, winRate:wins/trades.length*100,
    avgRet:trades.reduce((a,t)=>a+t.ret,0)/trades.length,
    avgDays:Math.round(trades.reduce((a,t)=>a+t.days,0)/trades.length),
    best:Math.max(...trades.map(t=>t.ret)), worst:Math.min(...trades.map(t=>t.ret)), dollarTrailPct };
}

// ── 策略回测核心 ──
// 无未来数据：排名用 t-1 收盘，交易用 t 收盘（无当日开盘数据时的标准近似）
// 使用当前 QQQ 成分股，存在幸存者偏差
function portfolioBacktest(histData, commonTs, qqqCloses, params, rangeStart=0, rangeEnd=null) {
  const { sortMetric, topN, rebalanceFreq, bufferEnabled, qqq200Filter } = params;
  const bufferN = bufferEnabled ? Math.round(topN * 1.5) : topN;
  const rebalInterval = rebalanceFreq === 'weekly' ? 5 : 21;
  const N = rangeEnd ?? commonTs.length;
  const symbols = [...histData.keys()];
  // 确保有足够的回望数据（200日均线）
  const simStart = Math.max(rangeStart, 205);
  if (simStart >= N - 10) return { equityCurve:[1], timestamps:[], turnoverCount:0, simStart };

  const equityCurve = [];
  let equity = 1.0;
  let holdings = new Set();
  let turnoverCount = 0;

  for (let t = simStart; t < N; t++) {
    const isRebalDay = (t === simStart) || ((t - simStart) % rebalInterval === 0);

    if (isRebalDay) {
      const d = t - 1; // 决策基于前一日数据

      // QQQ 200日均线滤网
      let inMarket = true;
      if (qqq200Filter && d >= 200) {
        const slice = qqqCloses.slice(d-200, d);
        const ma200 = slice.reduce((a,b)=>a+(b??0),0) / slice.filter(Boolean).length;
        inMarket = qqqCloses[d] != null && qqqCloses[d] > ma200;
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
  return { cagr, sharpe, mdd, drawdowns, annualRets, monthlyRets, total:(equityCurve[n-1]-1)*100 };
}

// 遍历所有参数组合
function runAllCombos(histData, commonTs, qqqCloses, rangeStart=0, rangeEnd=null) {
  const results = [];
  for (const sortMetric of ['score','ret20','ret50','ret200']) {
    for (const topN of [5,10,20]) {
      for (const rebalanceFreq of ['weekly','monthly']) {
        for (const bufferEnabled of [true,false]) {
          for (const qqq200Filter of [true,false]) {
            const params = { sortMetric, topN, rebalanceFreq, bufferEnabled, qqq200Filter };
            const bt = portfolioBacktest(histData, commonTs, qqqCloses, params, rangeStart, rangeEnd);
            const metrics = calcPortMetrics(bt.equityCurve, bt.timestamps);
            if (!metrics) continue;
            results.push({ params, metrics, turnover:bt.turnoverCount });
          }
        }
      }
    }
  }
  return results;
}

// Walk Forward Optimization（前 X 年找最佳参数，下 Y 年测试，逐步滚动）
function runWFO(histData, commonTs, qqqCloses) {
  const N = commonTs.length;
  let inDays, outDays;
  if (N >= 252*4)      { inDays=252*3; outDays=252; }
  else if (N >= 252*2) { inDays=Math.round(N*0.6); outDays=Math.round(N*0.2); }
  else return null;

  const windows=[];
  let pos=0;
  while (pos+inDays+outDays <= N) {
    windows.push({ inStart:pos, inEnd:pos+inDays, outStart:pos+inDays, outEnd:Math.min(pos+inDays+outDays,N) });
    pos+=outDays;
  }
  if (!windows.length) return null;

  const windowResults=[];
  let chainMult=1.0, allOutEquity=[], allOutTs=[];

  for (const win of windows) {
    const inCombos = runAllCombos(histData, commonTs, qqqCloses, win.inStart, win.inEnd);
    inCombos.sort((a,b)=>b.metrics.sharpe-a.metrics.sharpe);
    const bestParams = inCombos[0].params;

    const outBt = portfolioBacktest(histData, commonTs, qqqCloses, bestParams, win.outStart, win.outEnd);
    const outMetrics = calcPortMetrics(outBt.equityCurve, outBt.timestamps);

    const qqqOut = buildQqqEquity(qqqCloses, outBt.simStart, win.outEnd);
    const qqqOutMetrics = calcPortMetrics(qqqOut.equityCurve, outBt.timestamps);

    const chained = outBt.equityCurve.map(v=>v*chainMult);
    chainMult = chained[chained.length-1] ?? chainMult;
    allOutEquity.push(...chained);
    allOutTs.push(...outBt.timestamps);

    windowResults.push({
      inPeriod: `${fmtDate(commonTs[win.inStart])} ~ ${fmtDate(commonTs[win.inEnd-1])}`,
      outPeriod: `${fmtDate(commonTs[win.outStart])} ~ ${fmtDate(commonTs[win.outEnd-1])}`,
      bestParams, outMetrics, qqqOutMetrics,
    });
  }

  const combinedMetrics = calcPortMetrics(allOutEquity, allOutTs);

  // QQQ benchmark for full WFO out-sample period
  const wfoStart = windows[0].outStart;
  const wfoEnd   = windows[windows.length-1].outEnd;
  const qqqWfo   = buildQqqEquity(qqqCloses, Math.max(wfoStart,205), wfoEnd);
  // align length
  const qqqWfoEq = qqqWfo.equityCurve.slice(0, allOutEquity.length);
  const qqqCombinedMetrics = calcPortMetrics(qqqWfoEq, allOutTs.slice(0, qqqWfoEq.length));

  return { windowResults, allOutEquity, allOutTs, combinedMetrics, qqqCombinedMetrics, qqqWfoEq };
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
  const [histData,    setHistData]    = useState(null);
  const [histTs,      setHistTs]      = useState(null);
  const [histRange,   setHistRange]   = useState("3y");
  const [histLoading, setHistLoading] = useState(false);
  const [histProg,    setHistProg]    = useState({done:0,total:0});
  const [stratParams, setStratParams] = useState({
    sortMetric:"score", topN:10, rebalanceFreq:"monthly", bufferEnabled:true, qqq200Filter:true
  });
  const [stratResult, setStratResult] = useState(null);
  const [optResult,   setOptResult]   = useState(null);
  const [optRunning,  setOptRunning]  = useState(false);
  const [wfoResult,   setWfoResult]   = useState(null);
  const [wfoRunning,  setWfoRunning]  = useState(false);
  const [showOpt,     setShowOpt]     = useState(false);
  const [showWfo,     setShowWfo]     = useState(false);
  const [darkMode,    setDarkMode]    = useState(true);
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

  // Walk Forward
  const handleRunWFO = useCallback(async ()=>{
    if(!histData||!histTs) return;
    setWfoRunning(true); setWfoResult(null);
    await new Promise(r=>setTimeout(r,50));
    const qqqCloses=histData.get('__QQQ__');
    const stockData=new Map([...histData].filter(([k])=>k!=='__QQQ__'));
    const result=runWFO(stockData,histTs,qqqCloses);
    setWfoResult(result); setWfoRunning(false);
  },[histData,histTs]);

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
  function MetricCard({ label, strat, qqq, unit="", higherBetter=true, fmtFn=v=>v?.toFixed(2) }) {
    const better = strat!=null&&qqq!=null&&(higherBetter ? strat>qqq : strat<qqq);
    const worse  = strat!=null&&qqq!=null&&(higherBetter ? strat<qqq : strat>qqq);
    return (
      <div style={{padding:"10px 14px", background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, minWidth:130}}>
        <div style={{fontSize:10, color:T.textSub, letterSpacing:1, marginBottom:4}}>{label}</div>
        <div style={{fontSize:18, fontWeight:700, fontFamily:"monospace",
          color: better?"#00aa44":worse?"#ee3344":T.textBright}}>
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
                                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                  {[5,10,20,50,200].map(ma=>{
                                    const r=backtest(row.closes,row.highs,row.lows,ma,btEntry,btMode,row.vol20??0);
                                    const hasData=r&&r.n>0;
                                    return (
                                      <div key={ma} style={{padding:"10px 16px",background:T.cardBg2,border:`1px solid ${hasData?T.borderSub:T.border}`,borderRadius:7,minWidth:128}}>
                                        <div style={{fontSize:10,color:"#4488ee",letterSpacing:1,marginBottom:6,fontWeight:600}}>
                                          {ma}日均线{btMode==="dollar"&&hasData&&<span style={{marginLeft:6,color:T.textSub,fontWeight:400}}>追踪{(r.dollarTrailPct*100).toFixed(0)}%</span>}
                                        </div>
                                        {!hasData?<div style={{fontSize:11,color:T.textVMuted}}>{r?"无触发信号":"数据不足"}</div>:(
                                          <>
                                            <div style={{fontSize:11,color:T.textMuted,marginBottom:4}}>触发 <span style={{color:T.text,fontWeight:600}}>{r.n}</span> 次<span style={{marginLeft:6,color:T.textVMuted}}>均持 {r.avgDays}日</span></div>
                                            <div style={{fontSize:16,fontWeight:700,fontFamily:"monospace",color:r.avgRet>=0?"#00c96e":"#ee3344"}}>{fmtPct(r.avgRet)}</div>
                                            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>平均收益</div>
                                            <div style={{marginTop:6,fontSize:11,color:r.winRate>=60?"#00aa44":r.winRate>=45?"#aaaa33":"#ee5522"}}>胜率 {r.winRate.toFixed(0)}%</div>
                                            <div style={{fontSize:10,color:T.textVMuted,marginTop:4}}>最好 <span style={{color:"#00c96e"}}>{fmtPct(r.best)}</span> · 最差 <span style={{color:"#ee3344"}}>{fmtPct(r.worst)}</span></div>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div style={{fontSize:10,color:T.textVMuted,marginTop:8}}>冲量确认 = Elder冲量系统绿色信号 · ATR = 14日真实波幅 · 不含手续费 · 仅供参考</div>
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
        <div style={{padding:"20px 28px"}}>

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
                background: histLoading?"transparent":(darkMode?"#004488":"#0055cc"),
                border:"1px solid #4488ee", color:"#88ccff", opacity:histLoading?0.6:1}}>
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

          {/* 策略参数区（数据加载后才显示） */}
          {histData&&(
            <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:20}}>
              <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:12}}>STEP 2 · 策略参数</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:16,alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>排名指标</div>
                  <div style={{display:"flex",gap:4}}>
                    {[{v:"score",l:"综合评分"},{v:"ret20",l:"20日"},{v:"ret50",l:"50日"},{v:"ret200",l:"200日"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setStratParams(p=>({...p,sortMetric:v}))} style={{padding:"4px 10px",...activeButtonStyle(stratParams.sortMetric===v,T)}}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>持仓数量</div>
                  <div style={{display:"flex",gap:4}}>
                    {[5,10,20].map(n=>(
                      <button key={n} onClick={()=>setStratParams(p=>({...p,topN:n}))} style={{padding:"4px 10px",...activeButtonStyle(stratParams.topN===n,T)}}>Top {n}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:5}}>调仓频率</div>
                  <div style={{display:"flex",gap:4}}>
                    {[{v:"weekly",l:"每周"},{v:"monthly",l:"每月"}].map(({v,l})=>(
                      <button key={v} onClick={()=>setStratParams(p=>({...p,rebalanceFreq:v}))} style={{padding:"4px 10px",...activeButtonStyle(stratParams.rebalanceFreq===v,T)}}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                  <button onClick={()=>setStratParams(p=>({...p,bufferEnabled:!p.bufferEnabled}))} style={{padding:"4px 12px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,
                    background:stratParams.bufferEnabled?(darkMode?"#003a1a":"#d0ffea"):"transparent",
                    border:`1px solid ${stratParams.bufferEnabled?"#00aa55":T.borderMuted}`,
                    color:stratParams.bufferEnabled?"#00aa55":T.textSub}}>
                    {stratParams.bufferEnabled?"✓ ":""}缓冲换股
                  </button>
                  <button onClick={()=>setStratParams(p=>({...p,qqq200Filter:!p.qqq200Filter}))} style={{padding:"4px 12px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,
                    background:stratParams.qqq200Filter?(darkMode?"#003a1a":"#d0ffea"):"transparent",
                    border:`1px solid ${stratParams.qqq200Filter?"#00aa55":T.borderMuted}`,
                    color:stratParams.qqq200Filter?"#00aa55":T.textSub}}>
                    {stratParams.qqq200Filter?"✓ ":""}QQQ均线滤网
                  </button>
                </div>
              </div>
              {stratParams.bufferEnabled&&(
                <div style={{marginTop:8,fontSize:10,color:T.textVMuted}}>
                  缓冲区：Top {stratParams.topN} 买入 / 跌出 Top {Math.round(stratParams.topN*1.5)} 才卖出
                </div>
              )}
              <div style={{marginTop:14}}>
                <button onClick={()=>runStratBacktest()} style={{padding:"6px 20px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:12,
                  background:darkMode?"#004488":"#0055cc",border:"1px solid #4488ee",color:"#88ccff"}}>
                  ▶ 运行回测
                </button>
              </div>
            </div>
          )}

          {/* 回测结果 */}
          {stratResult?.metrics&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:T.textSub,letterSpacing:1,marginBottom:12}}>绩效对比</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
                <MetricCard label="CAGR（年化收益）" strat={stratResult.metrics.cagr} qqq={stratResult.qqqMetrics?.cagr} unit="%" fmtFn={v=>v.toFixed(1)}/>
                <MetricCard label="Sharpe Ratio" strat={stratResult.metrics.sharpe} qqq={stratResult.qqqMetrics?.sharpe} fmtFn={v=>v.toFixed(2)}/>
                <MetricCard label="最大回撤 MDD" strat={stratResult.metrics.mdd} qqq={stratResult.qqqMetrics?.mdd} unit="%" higherBetter={false} fmtFn={v=>v.toFixed(1)}/>
                <MetricCard label="累积收益" strat={stratResult.metrics.total} qqq={stratResult.qqqMetrics?.total} unit="%" fmtFn={v=>v.toFixed(1)}/>
                <div style={{padding:"10px 14px",background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,minWidth:130}}>
                  <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:4}}>换股次数</div>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:T.textBright}}>{stratResult.turnover}</div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>含买入操作</div>
                </div>
              </div>

              {/* 净值曲线 */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>净值曲线（策略 vs QQQ）</div>
                <EquityCurveChart stratEq={stratResult.equityCurve} qqqEq={stratResult.qqqEq} T={T}/>
              </div>

              {/* Drawdown */}
              <div style={{background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,overflowX:"auto"}}>
                <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>回撤曲线</div>
                <DrawdownChart drawdowns={stratResult.metrics.drawdowns} T={T}/>
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

          {/* 一键优化 */}
          {histData&&(
            <div style={{marginBottom:20}}>
              <button onClick={()=>setShowOpt(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
                background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
                color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
                <span style={{color:"#4488ee",fontWeight:700}}>{showOpt?"▼":"▶"}</span>
                一键优化 — 自动遍历所有参数组合 (96种)
                {optResult&&<span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
              </button>
              {showOpt&&(
                <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:12}}>
                    遍历：排名指标×4 · Top N×3 · 调仓频率×2 · 缓冲换股×2 · QQQ均线滤网×2 = 96种组合
                  </div>
                  <button disabled={optRunning} onClick={handleRunOptimize} style={{padding:"5px 18px",borderRadius:6,cursor:optRunning?"not-allowed":"pointer",
                    fontFamily:"inherit",fontSize:11,background:darkMode?"#004488":"#0055cc",
                    border:"1px solid #4488ee",color:"#88ccff",opacity:optRunning?0.6:1,marginBottom:14}}>
                    {optRunning?"⏳ 优化中…":"▶ 开始优化"}
                  </button>
                  {optResult&&(()=>{
                    const bySharpe=[...optResult].sort((a,b)=>b.metrics.sharpe-a.metrics.sharpe).slice(0,5);
                    const byCagr  =[...optResult].sort((a,b)=>b.metrics.cagr-a.metrics.cagr).slice(0,5);
                    const byMdd   =[...optResult].sort((a,b)=>a.metrics.mdd-b.metrics.mdd).slice(0,5);
                    const byRatio =[...optResult].sort((a,b)=>(b.metrics.cagr/(b.metrics.mdd||1))-(a.metrics.cagr/(a.metrics.mdd||1))).slice(0,5);
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

          {/* Walk Forward Optimization */}
          {histData&&(
            <div style={{marginBottom:20}}>
              <button onClick={()=>setShowWfo(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
                background:T.cardBg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",
                color:T.textSub,fontFamily:"inherit",fontSize:11,width:"100%",textAlign:"left"}}>
                <span style={{color:"#aa66ff",fontWeight:700}}>{showWfo?"▼":"▶"}</span>
                Walk Forward Optimization（滚动验证）
                {wfoResult&&<span style={{marginLeft:"auto",color:"#00aa44",fontSize:10}}>✓ 已完成</span>}
              </button>
              {showWfo&&(
                <div style={{padding:"16px 20px",background:T.cardBg,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 8px 8px"}}>
                  <div style={{fontSize:10,color:T.textVMuted,marginBottom:12}}>
                    前 N 年找最佳参数（in-sample），下一年验证（out-of-sample），逐年滚动。串接所有 out-sample 结果与 QQQ 对比。
                  </div>
                  <button disabled={wfoRunning} onClick={handleRunWFO} style={{padding:"5px 18px",borderRadius:6,cursor:wfoRunning?"not-allowed":"pointer",
                    fontFamily:"inherit",fontSize:11,background:darkMode?"#220044":"#5522aa",
                    border:"1px solid #9966ee",color:"#cc99ff",opacity:wfoRunning?0.6:1,marginBottom:14}}>
                    {wfoRunning?"⏳ 运行中…":"▶ 运行 Walk Forward"}
                  </button>
                  {wfoResult&&(()=>{
                    const cm=wfoResult.combinedMetrics, qm=wfoResult.qqqCombinedMetrics;
                    return (
                      <>
                        {/* 每窗口结果 */}
                        <div style={{overflowX:"auto",marginBottom:16}}>
                          <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:11}}>
                            <thead>
                              <tr>
                                {["In-sample期间","Out-sample期间","最佳参数","out-CAGR","out-Sharpe","out-MDD","QQQ-CAGR"].map(h=>(
                                  <th key={h} style={{padding:"6px 10px",textAlign:"left",color:T.textSub,fontWeight:400,fontSize:10,
                                    background:T.theadBg,boxShadow:`0 1px 0 ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {wfoResult.windowResults.map((w,i)=>(
                                <tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                                  <td style={{padding:"6px 10px",color:T.textMuted,fontSize:10}}>{w.inPeriod}</td>
                                  <td style={{padding:"6px 10px",color:T.textBright,fontSize:10}}>{w.outPeriod}</td>
                                  <td style={{padding:"6px 10px",color:T.textSub,fontSize:10}}>{fmtParamLabel(w.bestParams)}</td>
                                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:w.outMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>{w.outMetrics?fmtPct(w.outMetrics.cagr,1):"—"}</td>
                                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:T.text}}>{w.outMetrics?w.outMetrics.sharpe.toFixed(2):"—"}</td>
                                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:"#ee3344"}}>{w.outMetrics?fmtPct(w.outMetrics.mdd,1):"—"}</td>
                                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:w.qqqOutMetrics?.cagr>=0?"#00aa44":"#ee3344"}}>{w.qqqOutMetrics?fmtPct(w.qqqOutMetrics.cagr,1):"—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* 汇总对比 */}
                        <div style={{fontSize:10,color:T.textSub,letterSpacing:1,marginBottom:8}}>串接 Out-sample 汇总</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                          {cm&&[
                            {label:"WFO CAGR",strat:cm.cagr,qqq:qm?.cagr,unit:"%",fmtFn:v=>v.toFixed(1)},
                            {label:"WFO Sharpe",strat:cm.sharpe,qqq:qm?.sharpe,unit:"",fmtFn:v=>v.toFixed(2)},
                            {label:"WFO MDD",strat:cm.mdd,qqq:qm?.mdd,unit:"%",higherBetter:false,fmtFn:v=>v.toFixed(1)},
                          ].map((s,i)=><MetricCard key={i} {...s}/>)}
                        </div>
                        {/* WFO 净值曲线 */}
                        {wfoResult.allOutEquity.length>10&&(
                          <div style={{background:T.cardBg2,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",overflowX:"auto"}}>
                            <div style={{fontSize:10,color:T.textSub,marginBottom:8}}>WFO Out-sample 净值曲线</div>
                            <EquityCurveChart stratEq={wfoResult.allOutEquity} qqqEq={wfoResult.qqqWfoEq} T={T}/>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

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
