/**
 * QqqRotationTab.jsx — QQQ 成分股轮转策略
 *
 * Props:
 *   histData  : Map<sym, {closes, opens}>（从父组件传入，已加载）
 *   histTs    : number[]（对齐时间戳）
 *   T         : 主题色对象
 *   darkMode  : boolean
 */

import React, { useState, useCallback, useMemo } from 'react';
import { backtestQqqRotation, buildQqqBenchmark, paramLabelQqq } from './strategies/qqqRotation.js';
import { runQqqGridSearch } from './optimization/qqqGridSearch.js';
import { runQqqWFO } from './optimization/qqqWfo.js';
import { calcMetrics } from '../etf/strategies/metrics.js';

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

// ─── 指标卡片 ──────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, T }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 90 }}>
      <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? T.textBright, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
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

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function QqqRotationTab({ histData, histTs, T, darkMode }) {

  // ── 手动回测参数 ──
  const [params, setParams] = useState({
    lookback: 63, topN: 5, rebalFreq: 21, marketFilter: true, defensiveAsset: 'SHY',
  });
  const [btResult,  setBtResult]  = useState(null);
  const [btRunning, setBtRunning] = useState(false);

  // ── 网格搜索 ──
  const [gsResult,   setGsResult]   = useState(null);
  const [gsRunning,  setGsRunning]  = useState(false);
  const [gsProgress, setGsProgress] = useState({ done: 0, total: 144 });
  const [investAmount, setInvestAmount] = useState('10000');

  // ── WFO ──
  const [wfoResult,    setWfoResult]    = useState(null);
  const [wfoRunning,   setWfoRunning]   = useState(false);
  const [wfoOptMetric, setWfoOptMetric] = useState('sharpe');
  const [showWfo,      setShowWfo]      = useState(false);
  const [wfoPhase,     setWfoPhase]     = useState('');

  // ── 数据未加载 ──
  if (!histData || !histTs || histTs.length === 0) {
    return (
      <div style={{ padding: '48px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 14, color: T.textBright, marginBottom: 8 }}>请先加载历史数据</div>
        <div style={{ fontSize: 11, color: T.textSub }}>
          切换到「QQQ 成分股轮动」标签页，选择 <strong>10年</strong> 数据并点击「加载历史数据」
        </div>
      </div>
    );
  }

  // ── 运行手动回测 ──
  const handleRunBacktest = useCallback(() => {
    setBtRunning(true);
    setBtResult(null);
    setTimeout(() => {
      try {
        const bt = backtestQqqRotation(histData, histTs, params);
        if (!bt) { setBtRunning(false); return; }
        const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
        if (!metrics) { setBtRunning(false); return; }

        // QQQ 买入持有基准
        const qqqCloses = histData.get('__QQQ__')?.closes ?? histData.get('__QQQ__');
        const startOffset = histTs.indexOf(bt.timestamps[0]);
        const qqqEq = buildQqqBenchmark(qqqCloses, startOffset, startOffset + bt.timestamps.length);
        const qqqMetrics = calcMetrics(qqqEq, bt.timestamps);

        setBtResult({ ...bt, metrics, qqqEq, qqqMetrics });
      } catch (e) { console.error('QQQ rotation backtest error:', e); }
      setBtRunning(false);
    }, 50);
  }, [histData, histTs, params]);

  // ── 运行网格搜索 ──
  const handleRunGridSearch = useCallback(async () => {
    setGsRunning(true);
    setGsResult(null);
    setGsProgress({ done: 0, total: 144 });
    try {
      const res = await runQqqGridSearch(
        histData, histTs, 0, null,
        (done, total) => setGsProgress({ done, total })
      );
      setGsResult(res);
    } catch (e) { console.error('QQQ grid search error:', e); }
    setGsRunning(false);
  }, [histData, histTs]);

  // ── 运行 WFO ──
  const handleRunWFO = useCallback(async () => {
    setWfoRunning(true);
    setWfoResult(null);
    setWfoPhase('IS Grid Search 运行中…');
    try {
      const res = await runQqqWFO(
        histData, histTs, wfoOptMetric,
        (phase, done, total) => {
          if (phase === 'is') setWfoPhase(`IS Grid Search ${done}/${total}…`);
          else                setWfoPhase('OOS 验证中…');
        }
      );
      setWfoResult(res);
    } catch (e) { console.error('QQQ WFO error:', e); }
    setWfoRunning(false);
    setWfoPhase('');
  }, [histData, histTs, wfoOptMetric]);

  // ── 当前操作信号（基于手动回测参数）──
  const signal = useMemo(() => {
    if (!histData || !histTs) return null;
    const N       = histTs.length;
    const sigIdx  = N - 1;
    const date    = new Date(histTs[sigIdx] * 1000).toISOString().slice(0, 10);

    const qqqData   = histData.get('__QQQ__');
    const qqqCloses = qqqData?.closes ?? qqqData;
    const shyData   = histData.get('SHY');
    const shyCloses = shyData?.closes ?? shyData ?? null;
    const symbols   = [...histData.keys()].filter(k => k !== '__QQQ__' && k !== 'SHY');

    const symCloses = new Map();
    for (const sym of symbols) {
      const d = histData.get(sym);
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
  }, [histData, histTs, params]);

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

      {/* ═══════ STEP 1：固定参数回测 ═══════ */}
      <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 14 }}>STEP 1 · 固定参数回测</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <ParamRow label="动能回看期" T={T} value={params.lookback} onChange={v => setParams(p => ({ ...p, lookback: v }))}
            options={[{ value: 21, label: '1个月' }, { value: 63, label: '3个月' }, { value: 126, label: '6个月' }]} />
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
        {btResult && btResult.metrics && (
          <div style={{ marginTop: 20 }}>
            {/* 指标行 */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 0', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
              <MetricCard label="夏普比率" value={fmt2(btResult.metrics.sharpe)} T={T}
                color={btResult.metrics.sharpe > 1 ? '#4fc86e' : btResult.metrics.sharpe > 0.5 ? '#f0c040' : '#e05050'} />
              <MetricCard label="年化收益 CAGR" value={pct(btResult.metrics.cagr)} T={T}
                color={btResult.metrics.cagr > 0 ? '#4fc86e' : '#e05050'} />
              <MetricCard label="最大回撤 MDD" value={pct(btResult.metrics.mdd)} T={T}
                color={btResult.metrics.mdd > -0.2 ? '#4fc86e' : btResult.metrics.mdd > -0.35 ? '#f0c040' : '#e05050'} />
              <MetricCard label="总收益" value={pct(btResult.metrics.totalReturn)} T={T} />
              <MetricCard label="回测天数" value={`${btResult.timestamps.length}天`} T={T} sub={`${fmtDate(btResult.timestamps[0])} ~ ${fmtDate(btResult.timestamps.at(-1))}`} />
              {btResult.qqqMetrics && (
                <MetricCard label="QQQ 基准 Sharpe" value={fmt2(btResult.qqqMetrics.sharpe)} T={T}
                  color={T.textMuted} sub={`CAGR ${pct(btResult.qqqMetrics.cagr)}`} />
              )}
            </div>

            {/* 净值曲线 */}
            <div style={{ overflowX: 'auto' }}>
              <MiniLineChart
                T={T}
                series={[
                  { data: btResult.equityCurve, color: '#4fc86e', label: '策略净值' },
                  ...(btResult.qqqEq ? [{ data: btResult.qqqEq, color: '#5588cc', label: 'QQQ 买入持有' }] : []),
                ]}
                width={560}
                height={130}
              />
            </div>

            {/* 年度收益对比 */}
            {btResult.metrics.annualReturns && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6 }}>年度收益</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(btResult.metrics.annualReturns).map(([yr, ret]) => {
                    const qqqRet = btResult.qqqMetrics?.annualReturns?.[yr];
                    return (
                      <div key={yr} style={{ textAlign: 'center', minWidth: 56, padding: '4px 6px', background: T.pageBg, borderRadius: 4, border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 9, color: T.textMuted }}>{yr}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: ret >= 0 ? '#4fc86e' : '#e05050' }}>{pct(ret, 0)}</div>
                        {qqqRet != null && <div style={{ fontSize: 9, color: T.textMuted }}>{pct(qqqRet, 0)}</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4 }}>上行：策略 · 下行：QQQ</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ 操作建议信号面板 ═══════ */}
      {signal && (
        <div style={{
          padding: '14px 18px', borderRadius: 8, marginBottom: 20,
          background: darkMode ? '#0d1f10' : '#f0faf2',
          border: `1px solid ${T.border}`,
          borderLeft: `4px solid ${signal.isDefensive ? '#e8883a' : '#4fc86e'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>📡 当前操作建议</span>
            <span style={{ fontSize: 10, color: T.textMuted }}>{signal.date}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: signal.isDefensive ? '#e8883a' : '#4fc86e' }}>
              {signal.isDefensive
                ? `⚠️ 市场过滤触发 → ${signal.defensiveAsset}`
                : `🟢 持仓 Top ${Object.keys(signal.holdings).length}`}
            </span>
          </div>

          {/* 市场状态 */}
          {params.marketFilter && signal.qqqNow != null && signal.sma200 != null && (
            <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10 }}>
              QQQ <strong>${signal.qqqNow.toFixed(1)}</strong>
              {' vs SMA200 '}<strong>${signal.sma200.toFixed(1)}</strong>
              {' — '}
              <span style={{ color: signal.isDefensive ? '#e8883a' : '#4fc86e', fontWeight: 600 }}>
                {signal.isDefensive ? '低于均线，切换防御' : '高于均线，正常持仓'}
              </span>
            </div>
          )}

          {/* 投入金额 */}
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

          {/* 持仓明细 */}
          {!signal.isDefensive && Object.keys(signal.holdings).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6 }}>
                等权持有 · 每只 {pct(Object.values(signal.holdings)[0])}
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

          {/* 防御模式 */}
          {signal.isDefensive && (
            <div style={{ fontSize: 12, color: '#e8883a' }}>
              建议持有 <strong>{signal.defensiveAsset}</strong>
              {cap > 0 && <span>，共 {fmtMoney(cap)}</span>}
            </div>
          )}
        </div>
      )}

      {/* ═══════ STEP 2：一键优化 ═══════ */}
      <div style={{ padding: '16px 20px', background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 10 }}>STEP 2 · 一键优化（144种参数组合）</div>

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
                    {['排名', '参数组合', '夏普', 'CAGR', 'MDD', '总收益', `$${(parseFloat(investAmount)||10000).toLocaleString()} → 最终金额`, '综合评分'].map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', textAlign: i <= 1 ? 'left' : 'right', fontWeight: 600, color: T.textSub, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
              点击任意行可将该参数加载到 Step 1 手动回测
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
              ① 前 70% 数据做 in-sample，跑 Grid Search（144 种组合）→
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
              {wfoRunning ? `⏳ ${wfoPhase || '运行中（144种参数组合）…'}` : '▶ 运行 Walk Forward Optimization'}
            </button>

            {/* WFO 结果 */}
            {wfoResult && (() => {
              const cm = wfoResult.combinedMetrics;
              const qm = wfoResult.qqqCombinedMetrics;
              const optLabel = { sharpe: 'Sharpe', cagr: 'CAGR', calmar: 'Calmar' }[wfoResult.optMetric] || wfoResult.optMetric;

              const lbLabel  = p => ({ 21: '1M', 63: '3M', 126: '6M' }[p.lookback] ?? `${p.lookback}D`);
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
                    ].map((m, i) => <MetricCard key={i} label={m.label} value={m.value} sub={m.sub} color={m.color} T={T} />)}
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
