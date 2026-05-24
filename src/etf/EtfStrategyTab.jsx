/**
 * EtfStrategyTab.jsx — ETF 跨资产策略主容器
 *
 * 布局（方案A二级 Tab）：
 *   顶部：[ 强势轮动 ] [ 双动能 ] [ 波动率控管 ] [ 一键优化 ] [ Walk Forward ]
 *   内容区：根据选中 Tab 渲染对应面板
 *
 * 数据：
 *   - etfData 加载一次，所有策略共享
 *   - 每个策略有独立的 params / result state
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// 数据层
import { fetchEtfData, ETF_SYMBOLS } from './data/fetchEtfData.js';

// 策略回测
import { backtestMomentum, MOMENTUM_PARAM_GRID } from './strategies/momentum.js';
import { backtestDualMomentum, DUAL_MOMENTUM_PARAM_GRID } from './strategies/dualMomentum.js';
import { backtestVolControl, getVolControlParams } from './strategies/volControl.js';
import { calcMetrics, calcBenchmark } from './strategies/metrics.js';

// 优化
import { runGridSearch, extractBest, paramLabel } from './optimization/gridSearch.js';
import { runWFO } from './optimization/wfo.js';

// 图表
import EtfEquityChart    from './ui/charts/EtfEquityChart.jsx';
import EtfDrawdownChart  from './ui/charts/EtfDrawdownChart.jsx';
import EtfAnnualBar      from './ui/charts/EtfAnnualBar.jsx';
import EtfMonthlyHeatmap from './ui/charts/EtfMonthlyHeatmap.jsx';
import ParamHeatmap      from './ui/charts/ParamHeatmap.jsx';
import StrategyRanking   from './ui/charts/StrategyRanking.jsx';
import TradeLog          from './ui/charts/TradeLog.jsx';

// ── 工具函数 ──
const fmtPct = (v, d = 1) =>
  v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const fmtNum = (v, d = 2) =>
  v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d);

function MetricCard({ label, value, fmt = 'pct', alwaysRed = false, T }) {
  const display = fmt === 'pct' ? fmtPct(value) : fmtNum(value);
  const color = alwaysRed ? '#ee4444'
    : value == null ? '#777'
    : value >= 0 ? '#4fc86e' : '#ee4444';
  return (
    <div style={{
      background: T.cardBg2, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: '12px 16px', minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{display}</div>
    </div>
  );
}

// ── 参数选择器通用组件 ──
function ParamBtn({ label, active, onClick, T }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: 5, fontSize: 11,
      cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#4488ee22' : 'transparent',
      border: `1px solid ${active ? '#4488ee' : T.btnBorder}`,
      color: active ? '#4488ee' : T.btnColor,
    }}>{label}</button>
  );
}

// ── 绩效面板（策略运行后展示）──
function ResultsPanel({ result, qqqMetrics, spyMetrics, T }) {
  const [section, setSection] = useState('equity');
  if (!result) return null;

  const tabs = [
    { id: 'equity',   label: '净值曲线' },
    { id: 'drawdown', label: '回撤曲线' },
    { id: 'annual',   label: '年度收益' },
    { id: 'monthly',  label: '月度热图' },
    { id: 'trades',   label: '交易记录' },
  ];

  return (
    <div style={{ marginTop: 20 }}>
      {/* 指标卡 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <MetricCard label="CAGR（年化）"    value={result.cagr}        fmt="pct" T={T} />
        <MetricCard label="Sharpe Ratio"    value={result.sharpe}      fmt="num" T={T} />
        <MetricCard label="最大回撤 MDD"    value={result.mdd}         fmt="pct" alwaysRed T={T} />
        <MetricCard label="累积收益"        value={result.totalReturn} fmt="pct" T={T} />
        {qqqMetrics && <MetricCard label="QQQ CAGR（对比）" value={qqqMetrics.cagr} fmt="pct" T={T} />}
        {spyMetrics && <MetricCard label="SPY CAGR（对比）" value={spyMetrics.cagr} fmt="pct" T={T} />}
      </div>

      {/* 子 Tab */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSection(t.id)} style={{
            padding: '4px 12px', borderRadius: 5, fontSize: 11,
            cursor: 'pointer', fontFamily: 'inherit',
            background: section === t.id ? '#4488ee22' : 'transparent',
            border: `1px solid ${section === t.id ? '#4488ee' : T.btnBorder}`,
            color: section === t.id ? '#4488ee' : T.btnColor,
          }}>{t.label}</button>
        ))}
      </div>

      {section === 'equity' && (
        <EtfEquityChart
          stratEq={result.equityCurve}
          qqqEq={qqqMetrics?.equityCurve}
          spyEq={spyMetrics?.equityCurve}
          timestamps={result.timestamps}
          T={T}
        />
      )}
      {section === 'drawdown' && (
        <EtfDrawdownChart
          drawdowns={result.drawdownCurve}
          qqqDrawdowns={qqqMetrics?.drawdownCurve}
          timestamps={result.timestamps}
          T={T}
        />
      )}
      {section === 'annual' && (
        <EtfAnnualBar
          stratAnnual={result.annualReturns}
          qqqAnnual={qqqMetrics?.annualReturns}
          spyAnnual={spyMetrics?.annualReturns}
          T={T}
        />
      )}
      {section === 'monthly' && (
        <EtfMonthlyHeatmap monthlyReturns={result.monthlyReturns} T={T} />
      )}
      {section === 'trades' && (
        <TradeLog tradeLog={result.tradeLog} T={T} />
      )}
    </div>
  );
}

// ── 策略1面板：强势轮动 ──
function MomentumPanel({ etfData, T, pendingOverride }) {
  const LOOKBACK_OPTS = [
    { val: 21, label: '1M（21日）' },
    { val: 63, label: '3M（63日）' },
    { val: 126, label: '6M（126日）' },
    { val: 252, label: '12M（252日）' },
  ];
  const [params, setParams] = useState({ lookback: 63, topN: 1, defensiveAsset: 'SHY' });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [qqqMetrics, setQqqMetrics] = useState(null);
  const [spyMetrics, setSpyMetrics] = useState(null);
  const lastOverrideTs = useRef(0);

  // 核心：接受显式参数运行（绕过 state 异步更新，与 QQQ 同款）
  const runWithParams = useCallback((p) => {
    if (!etfData) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const bt = backtestMomentum(etfData.closes, etfData.timestamps, p);
        const m = calcMetrics(bt.equityCurve, bt.timestamps);
        const startIdx = etfData.timestamps.indexOf(bt.timestamps[0]);
        const endIdx = startIdx + bt.timestamps.length;
        const qm = calcBenchmark(etfData.closes, etfData.timestamps, 'QQQ', startIdx, endIdx);
        const sm = calcBenchmark(etfData.closes, etfData.timestamps, 'SPY', startIdx, endIdx);
        setResult({ ...m, tradeLog: bt.tradeLog });
        setQqqMetrics(qm);
        setSpyMetrics(sm);
      } catch (e) {
        console.error('Momentum backtest error:', e);
      }
      setRunning(false);
    }, 0);
  }, [etfData]);

  const run = useCallback(() => runWithParams(params), [params, runWithParams]);

  // 监听外部「应用并回测」指令
  useEffect(() => {
    if (!pendingOverride || pendingOverride.params.strategy !== 'momentum') return;
    if (pendingOverride.ts <= lastOverrideTs.current) return;
    lastOverrideTs.current = pendingOverride.ts;
    const p = {
      lookback: pendingOverride.params.lookback,
      topN: pendingOverride.params.topN,
      defensiveAsset: pendingOverride.params.defensiveAsset,
    };
    setParams(p);
    runWithParams(p);
  }, [pendingOverride, runWithParams]);

  return (
    <div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        每月从 <strong style={{ color: T.textBright }}>QQQ / SPY / XLK / DXJ / TLT / GLD / SHY / TSM / SOXX</strong> 中选动能最强的 ETF 持有。
        所有 ETF 动能均为负时切换防御资产。
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>回看期</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {LOOKBACK_OPTS.map(o => (
              <ParamBtn key={o.val} label={o.label} T={T}
                active={params.lookback === o.val}
                onClick={() => setParams(p => ({ ...p, lookback: o.val }))} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>持仓数量</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map(n => (
              <ParamBtn key={n} label={`Top ${n}`} T={T}
                active={params.topN === n}
                onClick={() => setParams(p => ({ ...p, topN: n }))} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>防御资产</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['SHY', 'GLD', 'CASH'].map(a => (
              <ParamBtn key={a} label={a} T={T}
                active={params.defensiveAsset === a}
                onClick={() => setParams(p => ({ ...p, defensiveAsset: a }))} />
            ))}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={!etfData || running} style={{
        padding: '8px 22px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12,
        cursor: etfData && !running ? 'pointer' : 'not-allowed',
        background: '#4488ee', color: '#fff', border: 'none',
        opacity: (!etfData || running) ? 0.6 : 1,
      }}>
        {running ? '回测中…' : '▶ 运行回测'}
      </button>

      <ResultsPanel result={result} qqqMetrics={qqqMetrics} spyMetrics={spyMetrics} T={T} />
    </div>
  );
}

// ── 策略2面板：双动能 ──
function DualMomentumPanel({ etfData, T, pendingOverride }) {
  const [params, setParams] = useState({ lookback: 126, maFilter: 200, defensiveAsset: 'SHY' });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [qqqMetrics, setQqqMetrics] = useState(null);
  const [spyMetrics, setSpyMetrics] = useState(null);
  const lastOverrideTs = useRef(0);

  const runWithParams = useCallback((p) => {
    if (!etfData) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const bt = backtestDualMomentum(etfData.closes, etfData.timestamps, p);
        const m = calcMetrics(bt.equityCurve, bt.timestamps);
        const startIdx = etfData.timestamps.indexOf(bt.timestamps[0]);
        const endIdx = startIdx + bt.timestamps.length;
        const qm = calcBenchmark(etfData.closes, etfData.timestamps, 'QQQ', startIdx, endIdx);
        const sm = calcBenchmark(etfData.closes, etfData.timestamps, 'SPY', startIdx, endIdx);
        setResult({ ...m, tradeLog: bt.tradeLog });
        setQqqMetrics(qm);
        setSpyMetrics(sm);
      } catch (e) { console.error(e); }
      setRunning(false);
    }, 0);
  }, [etfData]);

  const run = useCallback(() => runWithParams(params), [params, runWithParams]);

  useEffect(() => {
    if (!pendingOverride || pendingOverride.params.strategy !== 'dualMomentum') return;
    if (pendingOverride.ts <= lastOverrideTs.current) return;
    lastOverrideTs.current = pendingOverride.ts;
    const p = {
      lookback: pendingOverride.params.lookback,
      maFilter: pendingOverride.params.maFilter,
      defensiveAsset: pendingOverride.params.defensiveAsset,
    };
    setParams(p);
    runWithParams(p);
  }, [pendingOverride, runWithParams]);

  return (
    <div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        选最强 ETF，并确认其价格高于均线（趋势过滤）。跌破均线改持防御资产。
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>回看期</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{val:63,label:'3M'},{val:126,label:'6M'},{val:252,label:'12M'}].map(o => (
              <ParamBtn key={o.val} label={o.label} T={T}
                active={params.lookback === o.val}
                onClick={() => setParams(p => ({ ...p, lookback: o.val }))} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>趋势过滤均线</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[100, 200].map(n => (
              <ParamBtn key={n} label={`MA${n}`} T={T}
                active={params.maFilter === n}
                onClick={() => setParams(p => ({ ...p, maFilter: n }))} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>防御资产</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['SHY', 'GLD', 'CASH'].map(a => (
              <ParamBtn key={a} label={a} T={T}
                active={params.defensiveAsset === a}
                onClick={() => setParams(p => ({ ...p, defensiveAsset: a }))} />
            ))}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={!etfData || running} style={{
        padding: '8px 22px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12,
        cursor: etfData && !running ? 'pointer' : 'not-allowed',
        background: '#4488ee', color: '#fff', border: 'none',
        opacity: (!etfData || running) ? 0.6 : 1,
      }}>
        {running ? '回测中…' : '▶ 运行回测'}
      </button>

      <ResultsPanel result={result} qqqMetrics={qqqMetrics} spyMetrics={spyMetrics} T={T} />
    </div>
  );
}

// ── 策略3面板：波动率控管 ──
function VolControlPanel({ etfData, T, pendingOverride }) {
  const [params, setParams] = useState({
    volSource: 'REALIZED', lowThreshold: 20, highThreshold: 30, defensiveAsset: 'SHY',
  });
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [qqqMetrics, setQqqMetrics] = useState(null);
  const [spyMetrics, setSpyMetrics] = useState(null);
  const lastOverrideTs = useRef(0);

  const runWithParams = useCallback((p) => {
    if (!etfData) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const bt = backtestVolControl(
          etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20, p
        );
        const m = calcMetrics(bt.equityCurve, bt.timestamps);
        const startIdx = etfData.timestamps.indexOf(bt.timestamps[0]);
        const endIdx = startIdx + bt.timestamps.length;
        const qm = calcBenchmark(etfData.closes, etfData.timestamps, 'QQQ', startIdx, endIdx);
        const sm = calcBenchmark(etfData.closes, etfData.timestamps, 'SPY', startIdx, endIdx);
        setResult({ ...m, tradeLog: bt.tradeLog });
        setQqqMetrics(qm);
        setSpyMetrics(sm);
      } catch (e) { console.error(e); }
      setRunning(false);
    }, 0);
  }, [etfData]);

  const run = useCallback(() => {
    if (params.lowThreshold >= params.highThreshold) {
      alert('低阈值必须小于高阈值');
      return;
    }
    runWithParams(params);
  }, [params, runWithParams]);

  useEffect(() => {
    if (!pendingOverride || pendingOverride.params.strategy !== 'volControl') return;
    if (pendingOverride.ts <= lastOverrideTs.current) return;
    lastOverrideTs.current = pendingOverride.ts;
    const p = {
      volSource:      pendingOverride.params.volSource      ?? 'REALIZED',
      lowThreshold:   pendingOverride.params.lowThreshold   ?? 20,
      highThreshold:  pendingOverride.params.highThreshold  ?? 30,
      defensiveAsset: pendingOverride.params.defensiveAsset ?? 'SHY',
    };
    setParams(p);
    runWithParams(p);
  }, [pendingOverride, runWithParams]);

  return (
    <div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        根据市场波动率动态调整 QQQ 仓位：低波动满仓，中波动半仓，高波动切防御。
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>波动率来源</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <ParamBtn label="真实 VIX" T={T}
              active={params.volSource === 'VIX'}
              onClick={() => setParams(p => ({ ...p, volSource: 'VIX' }))} />
            <ParamBtn label="QQQ 20日实现波动率" T={T}
              active={params.volSource === 'REALIZED'}
              onClick={() => setParams(p => ({ ...p, volSource: 'REALIZED' }))} />
          </div>
          {params.volSource === 'VIX' && !etfData?.vixLoaded && (
            <div style={{ fontSize: 11, color: '#e8883a', marginTop: 4 }}>
              ⚠ VIX 数据未加载，将自动回退至实现波动率
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>低波动阈值（%）</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[15, 20, 25].map(v => (
              <ParamBtn key={v} label={`${v}%`} T={T}
                active={params.lowThreshold === v}
                onClick={() => setParams(p => ({ ...p, lowThreshold: v }))} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>高波动阈值（%）</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[25, 30, 35].map(v => (
              <ParamBtn key={v} label={`${v}%`} T={T}
                active={params.highThreshold === v}
                onClick={() => setParams(p => ({ ...p, highThreshold: v }))} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>防御资产</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['SHY', 'CASH'].map(a => (
              <ParamBtn key={a} label={a} T={T}
                active={params.defensiveAsset === a}
                onClick={() => setParams(p => ({ ...p, defensiveAsset: a }))} />
            ))}
          </div>
        </div>
      </div>

      {/* 当前 Regime 说明 */}
      <div style={{
        fontSize: 11, color: T.textMuted, marginBottom: 14,
        padding: '8px 12px', background: T.cardBg2, borderRadius: 6,
        border: `1px solid ${T.border}`,
      }}>
        低于 <strong style={{ color: '#4fc86e' }}>{params.lowThreshold}%</strong> → 100% QQQ &ensp;|&ensp;
        {params.lowThreshold}% ~ {params.highThreshold}% → 50% QQQ + 50% {params.defensiveAsset} &ensp;|&ensp;
        高于 <strong style={{ color: '#ee4444' }}>{params.highThreshold}%</strong> → 100% {params.defensiveAsset}
      </div>

      <button onClick={run} disabled={!etfData || running} style={{
        padding: '8px 22px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12,
        cursor: etfData && !running ? 'pointer' : 'not-allowed',
        background: '#4488ee', color: '#fff', border: 'none',
        opacity: (!etfData || running) ? 0.6 : 1,
      }}>
        {running ? '回测中…' : '▶ 运行回测'}
      </button>

      <ResultsPanel result={result} qqqMetrics={qqqMetrics} spyMetrics={spyMetrics} T={T} />
    </div>
  );
}

// ── 一键优化面板 ──
function OptimizePanel({ etfData, T, darkMode, onApply }) {
  const [results, setResults]       = useState([]);
  const [running, setRunning]       = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 86 });
  const [best, setBest]             = useState(null);
  const [section, setSection]       = useState('ranking');
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe');
  const abortRef = useRef(false);

  const run = useCallback(async () => {
    if (!etfData || running) return;
    abortRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: 86 });
    setResults([]);
    setBest(null);

    try {
      const res = await runGridSearch(
        etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
        0, null,
        (done, total) => setProgress({ done, total })
      );
      setResults(res);
      setBest(extractBest(res));
    } catch (e) {
      console.error('Grid search error:', e);
    }
    setRunning(false);
  }, [etfData, running]);

  const sectionTabs = [
    { id: 'ranking',  label: '策略排名' },
    { id: 'heatmap',  label: '参数热图' },
    { id: 'best5',    label: '五维最优' },
  ];

  return (
    <div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        一键遍历全部 <strong style={{ color: T.textBright }}>86 种</strong> 参数组合（三策略合并），
        按百分位综合评分（Sharpe×40% + MDD×35% + CAGR×25%）排名。
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={run} disabled={!etfData || running} style={{
          padding: '9px 26px', borderRadius: 6, fontFamily: 'inherit', fontSize: 13,
          cursor: etfData && !running ? 'pointer' : 'not-allowed',
          background: '#4488ee', color: '#fff', border: 'none',
          opacity: (!etfData || running) ? 0.6 : 1, fontWeight: 600,
        }}>
          {running ? `优化中… (${progress.done}/${progress.total})` : '⚡ 一键优化'}
        </button>
        {running && (
          <div style={{ flex: 1, maxWidth: 300 }}>
            <div style={{
              height: 6, background: T.barTrack, borderRadius: 3, overflow: 'hidden',
            }}>
              <div style={{
                width: `${(progress.done / progress.total) * 100}%`,
                height: '100%', background: '#4488ee', borderRadius: 3,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {sectionTabs.map(t => (
              <button key={t.id} onClick={() => setSection(t.id)} style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit',
                background: section === t.id ? '#4488ee22' : 'transparent',
                border: `1px solid ${section === t.id ? '#4488ee' : T.btnBorder}`,
                color: section === t.id ? '#4488ee' : T.btnColor,
              }}>{t.label}</button>
            ))}
          </div>

          {section === 'ranking' && (
            <StrategyRanking results={results} topN={20} T={T} onApply={onApply} />
          )}

          {section === 'heatmap' && (
            <div>
              <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>颜色指标：</span>
                {['sharpe','cagr','mdd','compositeScore'].map(m => (
                  <ParamBtn key={m}
                    label={{ sharpe:'Sharpe', cagr:'CAGR', mdd:'|MDD|', compositeScore:'综合' }[m]}
                    active={heatmapMetric === m} T={T}
                    onClick={() => setHeatmapMetric(m)} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
                仅展示策略1（强势轮动）的 lookback × topN 热图
              </div>
              <ParamHeatmap
                results={results.filter(r => r.params.strategy === 'momentum')}
                xParam="lookback" yParam="topN"
                colorMetric={heatmapMetric} T={T}
              />
            </div>
          )}

          {section === 'best5' && best && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'bestComposite', label: '🏆 综合最优', color: '#f0c040' },
                { key: 'bestSharpe',    label: '📈 Sharpe 最高', color: '#4fc86e' },
                { key: 'bestCagr',      label: '🚀 CAGR 最高', color: '#4488ee' },
                { key: 'bestMdd',       label: '🛡 MDD 最低', color: '#ee8844' },
                { key: 'bestCalmar',    label: '⚖ CAGR/MDD 最优', color: '#aa66ff' },
              ].map(({ key, label, color }) => {
                const r = best[key];
                if (!r) return null;
                return (
                  <div key={key} style={{
                    background: T.cardBg2, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: '12px 16px',
                    borderLeft: `3px solid ${color}`,
                  }}>
                    <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 11, color: T.textBright, marginBottom: 8 }}>
                      {paramLabel(r.params)}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[
                        ['CAGR', fmtPct(r.cagr)],
                        ['Sharpe', fmtNum(r.sharpe)],
                        ['MDD', fmtPct(r.mdd)],
                        ['综合评分', r.compositeScore != null ? (r.compositeScore*100).toFixed(1) : '—'],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ fontSize: 11 }}>
                          <span style={{ color: T.textMuted }}>{lbl}：</span>
                          <span style={{ color: T.textBright, fontFamily: 'monospace' }}>{val}</span>
                        </div>
                      ))}
                      {onApply && (
                        <button onClick={() => onApply(r)} style={{
                          marginLeft: 'auto', padding: '3px 10px', fontSize: 10,
                          borderRadius: 4, cursor: 'pointer',
                          background: '#4488ee22', border: '1px solid #4488ee66',
                          color: '#4488ee', fontFamily: 'inherit',
                        }}>
                          应用并回测
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Walk Forward 面板 ──
function WfoPanel({ etfData, T }) {
  const [optMetric, setOptMetric] = useState('sharpe');
  const [wfoResult, setWfoResult] = useState(null);
  const [running, setRunning]     = useState(false);
  const [phase, setPhase]         = useState('');

  const run = useCallback(async () => {
    if (!etfData || running) return;
    setRunning(true);
    setWfoResult(null);
    try {
      const res = await runWFO(
        etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
        optMetric,
        (done, total, ph) => setPhase(`窗口 ${done + 1}/${total} · ${ph === 'is' ? 'IS优化' : 'OOS验证'}`)
      );
      setWfoResult(res);
    } catch (e) {
      console.error('WFO error:', e);
    }
    setRunning(false);
    setPhase('');
  }, [etfData, optMetric, running]);

  const s = wfoResult?.stability;

  return (
    <div>
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        用前 3 年找最佳参数，用后 1 年验证，每年滚动一次。串接所有 OOS 结果得到无偏绩效估计。
        <br />
        <span style={{ color: '#e8883a', fontSize: 11 }}>
          ⚠ 10年数据约 6～7 个窗口，每窗口内 IS 跑 86 种组合，耗时约 1～2 分钟。
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>IS 优化目标</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { val: 'sharpe',    label: 'Sharpe（推荐）' },
              { val: 'cagr',      label: 'CAGR' },
              { val: 'calmar',    label: 'Calmar' },
              { val: 'composite', label: '综合评分' },
            ].map(o => (
              <ParamBtn key={o.val} label={o.label} T={T}
                active={optMetric === o.val}
                onClick={() => setOptMetric(o.val)} />
            ))}
          </div>
        </div>

        <button onClick={run} disabled={!etfData || running} style={{
          padding: '9px 26px', borderRadius: 6, fontFamily: 'inherit', fontSize: 13,
          cursor: etfData && !running ? 'pointer' : 'not-allowed',
          background: '#9944ee', color: '#fff', border: 'none',
          opacity: (!etfData || running) ? 0.6 : 1, fontWeight: 600,
        }}>
          {running ? `运行中… ${phase}` : '🔄 运行 Walk Forward'}
        </button>
      </div>

      {wfoResult?.error && (
        <div style={{ color: '#ee4444', fontSize: 12, padding: 12, background: '#ee444422', borderRadius: 6 }}>
          {wfoResult.error}
        </div>
      )}

      {wfoResult && !wfoResult.error && (
        <>
          {/* OOS 总绩效 */}
          {wfoResult.combinedMetrics && (
            <div>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
                串接 OOS 总绩效（{wfoResult.windowCount} 个窗口）
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <MetricCard label="OOS CAGR"   value={wfoResult.combinedMetrics.cagr}   fmt="pct" T={T} />
                <MetricCard label="OOS Sharpe"  value={wfoResult.combinedMetrics.sharpe} fmt="num" T={T} />
                <MetricCard label="OOS MDD"     value={wfoResult.combinedMetrics.mdd}    fmt="pct" alwaysRed T={T} />
                <MetricCard label="OOS 总收益"  value={wfoResult.combinedMetrics.totalReturn} fmt="pct" T={T} />
              </div>

              <EtfEquityChart
                stratEq={wfoResult.combinedOosEquity}
                timestamps={wfoResult.combinedOosTs}
                T={T}
              />
            </div>
          )}

          {/* WFO 稳定性 */}
          {s && (
            <div style={{
              marginTop: 16, padding: '12px 16px',
              background: T.cardBg2, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, marginBottom: 10 }}>
                WFO 稳定性指标
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11 }}>
                {[
                  ['窗口数', s.windowCount],
                  ['正收益窗口', `${s.positiveOosWindows}/${s.windowCount} (${(s.positiveOosRate*100).toFixed(0)}%)`],
                  ['平均 OOS CAGR', fmtPct(s.avgOosCagr)],
                  ['平均 OOS Sharpe', fmtNum(s.avgOosSharpe)],
                  ['OOS CAGR 标准差', fmtPct(s.stdOosCagr)],
                  ['IS/OOS Sharpe 比', s.isOosSharpeRatio?.toFixed(2)],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ color: T.textMuted, marginBottom: 2 }}>{lbl}</div>
                    <div style={{ color: T.textBright, fontFamily: 'monospace', fontWeight: 600 }}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
                IS/OOS Sharpe 比：接近 1 = 无过拟合；低于 0.5 = 存在严重过拟合
              </div>
            </div>
          )}

          {/* 窗口明细表 */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, marginBottom: 8 }}>
              窗口明细
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    {['窗口', 'IS 期间', 'OOS 期间', 'IS 最优策略', 'OOS CAGR', 'OOS Sharpe', 'OOS MDD'].map(h => (
                      <th key={h} style={{
                        padding: '7px 10px', textAlign: 'left',
                        color: T.textMuted, fontWeight: 600,
                        borderBottom: `1px solid ${T.border}`, background: T.theadBg,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wfoResult.windowResults.map((w, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? T.rowEven : T.cardBg }}>
                      <td style={{ padding: '6px 10px', color: T.textMuted }}>#{w.window}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: T.textSub, fontSize: 10 }}>
                        {w.isStart} → {w.isEnd}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: T.textSub, fontSize: 10 }}>
                        {w.oosStart} → {w.oosEnd}
                      </td>
                      <td style={{ padding: '6px 10px', color: T.textBright, fontSize: 10, maxWidth: 200 }}>
                        {paramLabel(w.isBestParams)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace',
                        color: (w.oosCagr ?? 0) >= 0 ? '#4fc86e' : '#ee4444' }}>
                        {fmtPct(w.oosCagr)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace',
                        color: (w.oosSharpe ?? 0) >= 0 ? '#4fc86e' : '#ee4444' }}>
                        {fmtNum(w.oosSharpe)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#ee4444' }}>
                        {fmtPct(w.oosMdd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  主组件：EtfStrategyTab
// ══════════════════════════════════════════
export default function EtfStrategyTab({ T, darkMode }) {
  const [etfData, setEtfData]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 11 });
  const [loadError, setLoadError]   = useState(null);
  const [activeStrat, setActiveStrat] = useState('momentum');
  const [showOpt, setShowOpt]       = useState(false);
  const [showWfo, setShowWfo]       = useState(false);
  const [pendingOverride, setPendingOverride] = useState(null);
  const abortRef = useRef(null);

  // 一键优化「应用并回测」：切换到对应策略 Tab + 触发参数应用
  const handleApplyAndRun = useCallback((result) => {
    const tabMap = { momentum: 'momentum', dualMomentum: 'dual', volControl: 'volControl' };
    const tab = tabMap[result.params.strategy] || 'momentum';
    setActiveStrat(tab);
    setShowOpt(false); // 折叠一键优化面板
    setPendingOverride({ params: result.params, ts: Date.now() });
  }, []);

  // ── 加载数据 ──
  const handleLoad = useCallback(async () => {
    if (loading) return;
    abortRef.current = new AbortController();
    setLoading(true);
    setLoadError(null);
    setLoadProgress({ done: 0, total: 11 });

    try {
      const data = await fetchEtfData(
        abortRef.current.signal,
        (done, total, sym) => setLoadProgress({ done, total, sym })
      );
      setEtfData(data);
    } catch (e) {
      if (e.message !== 'aborted') {
        setLoadError(e.message);
      }
    }
    setLoading(false);
  }, [loading]);

  const stratTabs = [
    { id: 'momentum',   label: '强势轮动' },
    { id: 'dual',       label: '双动能' },
    { id: 'volControl', label: '波动率控管' },
  ];

  return (
    <div style={{ padding: '20px 28px' }}>

      {/* ── Step 1：数据加载区 ── */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 10 }}>
          STEP 1 · 加载历史数据（10年）
        </div>

        {!etfData ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: loading ? 12 : 0 }}>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                标的：QQQ / SPY / XLK / DXJ / TLT / GLD / SHY / TSM / SOXX + ^VIX
              </div>
              <button onClick={handleLoad} disabled={loading} style={{
                padding: '5px 16px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: darkMode ? '#004488' : '#0055cc',
                border: '1px solid #4488ee',
                color: darkMode ? '#88ccff' : '#ffffff',
                opacity: loading ? 0.6 : 1,
              }}>
                {loading
                  ? `加载中… (${loadProgress.done}/${loadProgress.total}${loadProgress.sym ? ' · ' + loadProgress.sym : ''})`
                  : '↓ 加载历史数据'}
              </button>
            </div>

            {loading && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textSub, marginBottom: 4 }}>
                  <span>正在拉取 {loadProgress.done} / {loadProgress.total}</span>
                  <span>{Math.round((loadProgress.done / loadProgress.total) * 100)}%</span>
                </div>
                <div style={{ height: 3, background: T.barTrack, borderRadius: 2, overflow: 'hidden', maxWidth: 300 }}>
                  <div style={{
                    width: `${(loadProgress.done / loadProgress.total) * 100}%`,
                    height: '100%', background: 'linear-gradient(90deg,#005bcc,#00c96e)', borderRadius: 2,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}

            {loadError && (
              <div style={{ color: '#ee4444', fontSize: 12, marginTop: 8 }}>
                加载失败：{loadError}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#00aa44' }}>
              ✓ 已加载 {etfData.symbols.length} 个标的 × 10年数据
            </span>
            <span style={{ fontSize: 11, color: T.textMuted }}>
              {etfData.dataRange.start} ~ {etfData.dataRange.end} &ensp;·&ensp;
              {etfData.dataRange.days} 个交易日
              {etfData.vixLoaded ? ' + VIX' : ' (VIX 未加载)'}
            </span>
            {etfData.loadErrors.length > 0 && (
              <span style={{ fontSize: 11, color: '#e8883a' }}>
                加载失败：{etfData.loadErrors.join(', ')}
              </span>
            )}
            <button onClick={handleLoad} disabled={loading} style={{
              padding: '4px 12px', borderRadius: 5, fontFamily: 'inherit', fontSize: 11,
              cursor: 'pointer', background: 'transparent',
              border: `1px solid ${T.btnBorder}`, color: T.btnColor,
            }}>
              重新加载
            </button>
          </div>
        )}
      </div>

      {/* ── Step 2：策略选择 + 参数 + 结果 ── */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: T.textSub, letterSpacing: 1, marginBottom: 12 }}>
          STEP 2 · 选择策略并回测
        </div>

        {/* 三策略 Tab（强势轮动 / 双动能 / 波动率控管） */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {stratTabs.map(t => (
            <button key={t.id} onClick={() => setActiveStrat(t.id)} style={{
              padding: '5px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
              background: activeStrat === t.id ? '#4488ee22' : 'transparent',
              border: `1px solid ${activeStrat === t.id ? '#4488ee' : T.btnBorder}`,
              color: activeStrat === t.id ? '#4488ee' : T.btnColor,
            }}>{t.label}</button>
          ))}
        </div>

        {!etfData && (
          <div style={{ color: T.textMuted, fontSize: 12, padding: '12px 0' }}>
            请先完成 Step 1 加载历史数据
          </div>
        )}

        {etfData && activeStrat === 'momentum'  && <MomentumPanel    etfData={etfData} T={T} pendingOverride={pendingOverride} />}
        {etfData && activeStrat === 'dual'       && <DualMomentumPanel etfData={etfData} T={T} pendingOverride={pendingOverride} />}
        {etfData && activeStrat === 'volControl' && <VolControlPanel  etfData={etfData} T={T} pendingOverride={pendingOverride} />}
      </div>

      {/* ── 参数全量扫描（一键优化，可折叠） ── */}
      {etfData && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowOpt(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: T.cardBg,
              border: `1px solid ${T.border}`,
              borderRadius: showOpt ? '8px 8px 0 0' : 8,
              cursor: 'pointer', color: T.textSub,
              fontFamily: 'inherit', fontSize: 11, width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ color: '#4488ee', fontWeight: 700 }}>{showOpt ? '▼' : '▶'}</span>
            参数全量扫描（一键优化，86 种组合）
            <span style={{ fontSize: 10, color: T.textVMuted || T.textMuted, marginLeft: 4 }}>
              — 三策略合并，百分位综合评分
            </span>
          </button>
          {showOpt && (
            <div style={{
              padding: '16px 20px', background: T.cardBg,
              border: `1px solid ${T.border}`, borderTop: 'none',
              borderRadius: '0 0 8px 8px',
            }}>
              <OptimizePanel etfData={etfData} T={T} darkMode={darkMode} onApply={handleApplyAndRun} />
            </div>
          )}
        </div>
      )}

      {/* ── Walk Forward Optimization（可折叠） ── */}
      {etfData && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowWfo(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: T.cardBg,
              border: `1px solid ${T.border}`,
              borderRadius: showWfo ? '8px 8px 0 0' : 8,
              cursor: 'pointer', color: T.textSub,
              fontFamily: 'inherit', fontSize: 11, width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ color: '#aa66ff', fontWeight: 700 }}>{showWfo ? '▼' : '▶'}</span>
            <span style={{
              background: '#5522aa',
              color: darkMode ? '#ddb8ff' : '#ffffff',
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: 1,
            }}>MODE B</span>
            Walk Forward Optimization（滚动验证，无未来数据）
          </button>
          {showWfo && (
            <div style={{
              padding: '16px 20px', background: T.cardBg,
              border: `1px solid ${T.border}`, borderTop: 'none',
              borderRadius: '0 0 8px 8px',
            }}>
              <WfoPanel etfData={etfData} T={T} darkMode={darkMode} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
