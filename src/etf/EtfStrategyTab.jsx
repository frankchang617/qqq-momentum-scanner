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

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// 数据层
import { fetchEtfData, ETF_SYMBOLS } from './data/fetchEtfData.js';

// 策略回测
import { backtestMomentum, MOMENTUM_PARAM_GRID, MOMENTUM_UNIVERSE } from './strategies/momentum.js';
import { backtestDualMomentum, DUAL_MOMENTUM_PARAM_GRID, DUAL_MOMENTUM_UNIVERSE } from './strategies/dualMomentum.js';
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

// ══════════════════════════════════════════
//  当前信号计算（基于最新数据点，纯函数）
// ══════════════════════════════════════════
function computeSignal(etfData, strategy, params) {
  if (!etfData) return null;
  const N = etfData.timestamps.length;
  if (N < 2) return null;
  const sigIdx = N - 1;
  const date = new Date(etfData.timestamps[sigIdx] * 1000).toISOString().slice(0, 10);

  // ── 强势轮动 ──
  if (strategy === 'momentum') {
    const { lookback = 63, topN = 1, defensiveAsset = 'SHY' } = params;
    if (sigIdx < lookback) return null;
    const scores = MOMENTUM_UNIVERSE.map(sym => {
      const arr = etfData.closes[sym];
      if (!arr || arr[sigIdx] == null || arr[sigIdx - lookback] == null) return null;
      return { sym, ret: arr[sigIdx] / arr[sigIdx - lookback] - 1, price: arr[sigIdx] };
    }).filter(Boolean).sort((a, b) => b.ret - a.ret);

    const defResult = (reason) => {
      const defPrice = etfData.closes[defensiveAsset]?.[sigIdx] ?? null;
      return { date, strategy, isDefensive: true, scores: scores.slice(0, 6),
        holdings: defensiveAsset === 'CASH' ? { CASH: 1 } : { [defensiveAsset]: 1 },
        prices: defensiveAsset === 'CASH' ? {} : { [defensiveAsset]: defPrice },
        reason, rebalFreq: 'monthly' };
    };
    if (scores.length === 0 || scores.every(s => s.ret < 0))
      return defResult('所有 ETF 动能均为负，切换防御资产');
    const chosen = scores.slice(0, topN).filter(s => s.ret >= 0);
    if (chosen.length === 0) return defResult('前 TopN 中无正动能 ETF，切换防御资产');
    const w = 1 / chosen.length;
    return { date, strategy, isDefensive: false, scores: scores.slice(0, 6),
      holdings: Object.fromEntries(chosen.map(c => [c.sym, w])),
      prices: Object.fromEntries(chosen.map(c => [c.sym, c.price])),
      reason: `${chosen.map(c => c.sym).join(' / ')} 动能最强（前 ${chosen.length} 名，均为正动能）`,
      rebalFreq: 'monthly' };
  }

  // ── 双动能 ──
  if (strategy === 'dual') {
    const { lookback = 126, maFilter = 200, defensiveAsset = 'SHY' } = params;
    if (sigIdx < Math.max(lookback, maFilter)) return null;
    const scores = DUAL_MOMENTUM_UNIVERSE.map(sym => {
      const arr = etfData.closes[sym];
      if (!arr || arr[sigIdx] == null || arr[sigIdx - lookback] == null) return null;
      return { sym, ret: arr[sigIdx] / arr[sigIdx - lookback] - 1, price: arr[sigIdx] };
    }).filter(Boolean).sort((a, b) => b.ret - a.ret);

    const defResult = (reason) => {
      const defPrice = etfData.closes[defensiveAsset]?.[sigIdx] ?? null;
      return { date, strategy, isDefensive: true, scores: scores.slice(0, 6),
        holdings: defensiveAsset === 'CASH' ? { CASH: 1 } : { [defensiveAsset]: 1 },
        prices: defensiveAsset === 'CASH' ? {} : { [defensiveAsset]: defPrice },
        reason, rebalFreq: 'monthly' };
    };
    const best = scores[0];
    if (!best || best.ret < 0)
      return defResult(`最强 ETF (${best?.sym ?? '—'}) 动能为负 (${best ? (best.ret*100).toFixed(1)+'%' : '—'})，切防御`);

    // 均线过滤
    const arr = etfData.closes[best.sym];
    const slice = arr.slice(Math.max(0, sigIdx - maFilter + 1), sigIdx + 1).filter(v => v != null);
    const ma = slice.length >= Math.round(maFilter * 0.9) ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
    if (ma != null && arr[sigIdx] < ma)
      return defResult(`${best.sym} 收盘 $${arr[sigIdx].toFixed(2)} 低于 MA${maFilter}（$${ma.toFixed(2)}），切防御`);

    return { date, strategy, isDefensive: false, scores: scores.slice(0, 6),
      holdings: { [best.sym]: 1 },
      prices: { [best.sym]: best.price },
      reason: `${best.sym} 相对动能最强（${(best.ret*100).toFixed(1)}%），高于 MA${maFilter}（$${ma?.toFixed(2) ?? '—'}）`,
      maVal: ma, maFilter,
      rebalFreq: 'monthly' };
  }

  // ── 波动率控管 ──
  if (strategy === 'volControl') {
    const { volSource = 'REALIZED', lowThreshold = 20, highThreshold = 30, defensiveAsset = 'SHY' } = params;
    let vol = null;
    if (volSource === 'VIX') {
      for (let i = sigIdx; i >= Math.max(0, sigIdx - 5); i--) {
        if (etfData.vix?.[i] != null) { vol = etfData.vix[i]; break; }
      }
    } else {
      vol = etfData.qqqVol20?.[sigIdx] ?? null;
    }
    const volLabel = volSource === 'VIX' ? 'VIX' : 'QQQ 20日实现波动率';
    let regime, regimeName, regimeColor;
    if (vol == null)            { regime = 'full';      regimeName = '满仓（数据缺失，默认）'; regimeColor = '#4fc86e'; }
    else if (vol < lowThreshold){ regime = 'full';      regimeName = '满仓进攻';               regimeColor = '#4fc86e'; }
    else if (vol <= highThreshold){ regime = 'half';    regimeName = '半仓防守';               regimeColor = '#e8883a'; }
    else                        { regime = 'defensive'; regimeName = '全仓防御';               regimeColor = '#ee4444'; }

    const def = defensiveAsset === 'CASH' ? 'CASH' : (etfData.closes[defensiveAsset] ? defensiveAsset : 'CASH');
    const holdings = regime === 'full' ? { QQQ: 1 }
      : regime === 'half' ? { QQQ: 0.5, [def]: 0.5 }
      : def === 'CASH' ? { CASH: 1 } : { [def]: 1 };
    const prices = {};
    Object.keys(holdings).filter(s => s !== 'CASH').forEach(sym => {
      prices[sym] = etfData.closes[sym]?.[sigIdx] ?? null;
    });
    const warnHigh = vol != null && regime !== 'defensive' && vol > highThreshold * 0.88;
    const warnLow  = vol != null && regime !== 'full'      && vol < lowThreshold * 1.12;
    return { date, strategy, isDefensive: regime === 'defensive',
      holdings, prices, vol, volLabel, regime, regimeName, regimeColor,
      warnHigh, warnLow, lowThreshold, highThreshold,
      reason: vol != null ? `${volLabel}：${vol.toFixed(1)}%` : `${volLabel}：无数据`,
      rebalFreq: 'daily' };
  }
  return null;
}

// ── 调仓指令面板（三大策略共用）──
function SignalCard({ etfData, strategy, params, T }) {
  const [capital, setCapital] = useState('10000');
  const signal = useMemo(
    () => computeSignal(etfData, strategy, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etfData, strategy, JSON.stringify(params)]
  );

  // ── 持仓对比 ──
  const prevSignalRef = useRef(null);
  const prevSignal = prevSignalRef.current;
  const isFirstSignal = !prevSignal || Object.keys(prevSignal.holdings || {}).length === 0;

  let sellList = [], buyList = [], holdList = [];

  if (signal && prevSignal && !isFirstSignal) {
    const prevSyms = new Set(Object.keys(prevSignal.holdings));
    const currSyms = new Set(Object.keys(signal.holdings));
    const wasDefensive = prevSignal.isDefensive;
    const isDefensive  = signal.isDefensive;

    if (!wasDefensive && isDefensive) {
      for (const sym of prevSyms) {
        sellList.push({ sym, reason: signal.reason, price: prevSignal.prices?.[sym] });
      }
    }
    if (wasDefensive && !isDefensive) {
      const defSym = Object.keys(prevSignal.holdings)[0] || 'CASH';
      sellList.push({ sym: defSym, reason: '退出防御模式', price: null });
    }
    if (!wasDefensive && !isDefensive) {
      for (const sym of prevSyms) {
        if (currSyms.has(sym)) {
          const currW = signal.holdings[sym];
          const prevW = prevSignal.holdings[sym];
          if (Math.abs(currW - prevW) < 0.01) {
            holdList.push({ sym, reason: strategy === 'volControl' ? '仓位不变' : '仍在持仓名单', price: signal.prices?.[sym], color: '#4488ee' });
          } else {
            // 仓位调整（波动率控管专用）
            sellList.push({ sym, reason: `仓位调整 ${(prevW*100).toFixed(0)}%→${(currW*100).toFixed(0)}%`, price: signal.prices?.[sym] });
            buyList.push({ sym, reason: `仓位调整 ${(prevW*100).toFixed(0)}%→${(currW*100).toFixed(0)}%`, price: signal.prices?.[sym] });
          }
        } else {
          const se = signal.scores?.find(s => s.sym === sym);
          const reason = strategy === 'volControl' ? '波动率档位变化' :
            se ? (se.ret <= 0 ? '动能转负' : '跌出TopN') : '不再入选';
          sellList.push({ sym, reason, price: prevSignal.prices?.[sym] });
        }
      }
      for (const sym of currSyms) {
        if (!prevSyms.has(sym)) {
          const se = signal.scores?.find(s => s.sym === sym);
          const reason = strategy === 'volControl' ? '波动率档位变化' :
            se ? `新进持仓(+${(se.ret*100).toFixed(1)}%)` : '切换至防御资产';
          buyList.push({ sym, reason, price: signal.prices?.[sym] });
        }
      }
    }
    if (wasDefensive && isDefensive) {
      const defSym = Object.keys(signal.holdings)[0] || 'CASH';
      holdList.push({ sym: defSym, reason: '继续防御', price: null, color: '#e8883a' });
    }
    if (isDefensive && !wasDefensive) {
      const defSym = Object.keys(signal.holdings)[0] || 'CASH';
      buyList.push({ sym: defSym, reason: signal.reason, price: null });
    }
  }

  prevSignalRef.current = signal;

  // ── 资金流转 ──
  const cap = parseFloat(capital) || 0;
  let sellTotal = 0, buyTotal = 0;
  if (cap > 0 && sellList.length > 0 && prevSignal) {
    sellTotal = sellList.reduce((s, x) => {
      const w = prevSignal.holdings?.[x.sym] ?? 0;
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

  if (!signal) return null;

  const cap2 = parseFloat(capital) || 0;
  const borderColor = signal.isDefensive ? '#e8883a' : signal.regimeColor || '#4fc86e';
  const stateLabel  = signal.isDefensive ? '⚠️ 防御模式' : (signal.regime === 'half' ? '⚡ 半仓' : '🟢 进攻模式');
  const hasDiff = !isFirstSignal && (sellList.length > 0 || buyList.length > 0);

  return (
    <div style={{
      background: T.cardBg2, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: 8, padding: '14px 18px', marginBottom: 20,
    }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>📡 调仓指令</span>
        <span style={{ fontSize: 10, color: T.textMuted }}>{signal.date}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: borderColor }}>
          {stateLabel}
        </span>
      </div>

      {/* 信号依据 */}
      <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10, lineHeight: 1.6 }}>
        {signal.reason}
      </div>

      {/* 波动率预警 */}
      {signal.warnHigh && (
        <div style={{ fontSize: 11, color: '#ee4444', background: '#ee444414', border: '1px solid #ee444433',
          borderRadius: 5, padding: '5px 10px', marginBottom: 8 }}>
          🔔 波动率接近高阈值 {signal.highThreshold}%，若突破则次日切全仓防御
        </div>
      )}
      {signal.warnLow && (
        <div style={{ fontSize: 11, color: '#e8883a', background: '#e8883a14', border: '1px solid #e8883a33',
          borderRadius: 5, padding: '5px 10px', marginBottom: 8 }}>
          🔔 波动率接近低阈值 {signal.lowThreshold}%，若跌破则次日可恢复满仓 QQQ
        </div>
      )}

      {/* ── 操作清单 ── */}
      {isFirstSignal && (
        <div style={{fontSize:11,color:'#4fc86e',marginBottom:12,padding:'8px 12px',background:'#4fc86e14',borderRadius:6,border:'1px solid #4fc86e33'}}>
          🟢 <b>初始建仓</b> — 首次信号，按以下目标持仓执行
        </div>
      )}

      {hasDiff && (
        <div style={{marginBottom:14}}>
          {sellList.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:'#ee3344',fontWeight:700,marginBottom:4}}>🔴 卖出/减持（{sellList.length}）</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {sellList.map(({sym,reason,price})=>(
                  <div key={sym} style={{padding:'5px 10px',borderRadius:4,fontSize:10,
                    background:'#ee334411',border:'1px solid #ee334433'}}>
                    <span style={{fontWeight:700,color:'#ee3344',fontFamily:'monospace'}}>{sym === 'CASH' ? '现金' : sym}</span>
                    {price != null && <span style={{color:T.textMuted,marginLeft:4}}>${price.toFixed(1)}</span>}
                    <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {buyList.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:'#4fc86e',fontWeight:700,marginBottom:4}}>🟢 买入/增持（{buyList.length}）</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {buyList.map(({sym,reason,price})=>(
                  <div key={sym} style={{padding:'5px 10px',borderRadius:4,fontSize:10,
                    background:'#4fc86e11',border:'1px solid #4fc86e33'}}>
                    <span style={{fontWeight:700,color:'#4fc86e',fontFamily:'monospace'}}>{sym === 'CASH' ? '现金' : sym}</span>
                    {price != null && <span style={{color:T.textMuted,marginLeft:4}}>${price.toFixed(1)}</span>}
                    <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {holdList.length > 0 && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:'#4488ee',fontWeight:700,marginBottom:4}}>🔵 继续持有（{holdList.length}）</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {holdList.map(({sym,reason,price})=>(
                  <div key={sym} style={{padding:'5px 10px',borderRadius:4,fontSize:10,
                    background:'#4488ee11',border:'1px solid #4488ee33'}}>
                    <span style={{fontWeight:700,color:'#4488ee',fontFamily:'monospace'}}>{sym === 'CASH' ? '现金' : sym}</span>
                    {price != null && <span style={{color:T.textMuted,marginLeft:4}}>${price.toFixed(1)}</span>}
                    <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 资金流转摘要 ── */}
      {hasDiff && cap2 > 0 && (
        <div style={{padding:'8px 12px',marginBottom:12,borderRadius:6,
          background:T.cardBg,border:`1px solid ${T.border}`,
          fontSize:11,color:T.textSub,lineHeight:1.8}}>
          <div style={{fontWeight:700,marginBottom:2,color:T.textBright}}>💰 资金流转摘要</div>
          {sellList.length > 0 && (
            <div>🔴 卖出回收：<b style={{color:'#ee3344',fontFamily:'monospace'}}>${Math.round(sellTotal).toLocaleString()}</b></div>
          )}
          {buyList.length > 0 && (
            <div>🟢 买入需要：<b style={{color:'#4fc86e',fontFamily:'monospace'}}>${Math.round(buyTotal).toLocaleString()}</b></div>
          )}
          <div>
            {netFlow > 0.5 ? (
              <span>净回笼现金：<b style={{color:'#e8883a',fontFamily:'monospace'}}>${Math.round(netFlow).toLocaleString()}</b>（可保留或按比例再分配）</span>
            ) : netFlow < -0.5 ? (
              <span>净追加投入：<b style={{color:'#4fc86e',fontFamily:'monospace'}}>${Math.round(Math.abs(netFlow)).toLocaleString()}</b></span>
            ) : (
              <span>资金平衡，无需额外操作</span>
            )}
          </div>
        </div>
      )}

      {/* 动能排名（强势轮动/双动能专用） */}
      {signal.scores?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 5 }}>动能排名</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {signal.scores.map(({ sym, ret }, i) => {
              const isChosen = signal.holdings[sym] != null;
              return (
                <div key={sym} style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 10,
                  fontFamily: 'monospace', fontWeight: isChosen ? 700 : 400,
                  background: ret >= 0 ? '#4fc86e11' : '#ee444411',
                  border: `1px solid ${isChosen ? borderColor : (ret >= 0 ? '#4fc86e44' : '#ee444433')}`,
                  color: ret >= 0 ? '#4fc86e' : '#ee4444',
                }}>
                  #{i + 1} {sym} {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
                  {isChosen && <span style={{ color: borderColor }}> ✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 买入金额计算器 */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.textMuted }}>💰 按投入金额计算：</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: T.textMuted }}>$</span>
            <input type="number" value={capital} onChange={e => setCapital(e.target.value)}
              style={{ width: 100, padding: '3px 8px', background: T.inputBg,
                border: `1px solid ${T.borderSub || T.border}`, borderRadius: 4,
                color: T.text, fontFamily: 'inherit', fontSize: 12 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(signal.holdings).map(([sym, w]) => {
            const amt = cap2 * w;
            const price = signal.prices?.[sym];
            const shares = price && price > 0 ? (amt / price) : null;
            return (
              <div key={sym} style={{
                padding: '8px 14px', borderRadius: 6, minWidth: 170,
                background: T.cardBg, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textBright, marginBottom: 3 }}>
                  {sym === 'CASH' ? '🏦 持有现金（不操作）' : `📈 买入 ${sym}`}
                </div>
                <div style={{ fontSize: 14, color: '#4488ee', fontFamily: 'monospace', fontWeight: 700 }}>
                  ${amt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                {shares != null && (
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                    ≈ {shares.toFixed(2)} 股 @ ${price.toFixed(2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 下次检查提示 */}
      <div style={{ marginTop: 12, fontSize: 10, color: T.textMuted }}>
        {signal.rebalFreq === 'daily'
          ? '⏰ 每个交易日收盘后检查波动率，档位变化则次日调仓；无变化则持仓不动'
          : '⏰ 月调仓策略：每 21 个交易日（约 1 个月）检查一次，信号不变则无需操作'}
      </div>
    </div>
  );
}

// ── 策略规则卡（ETF三策略共用）──
function EtfStrategyRuleCard({ T, strategy, params }) {
  const [open, setOpen] = useState(false);

  const content = () => {
    if (strategy === 'momentum') {
      const lb = {20:'20日',21:'1个月(21日)',50:'50日',63:'3个月(63日)',126:'6个月(126日)',200:'200日',252:'12个月(252日)'}[params.lookback]||`${params.lookback}日`;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#4fc86e', marginBottom: 6, fontSize: 12 }}>入场条件</div>
            <div>· ETF 池（9只）：QQQ / SPY / XLK / DXJ / TLT / GLD / SHY / TSM / SOXX</div>
            <div>· 每月末计算各 ETF 过去 <b style={{color:T.textBright}}>{lb}</b> 收益率</div>
            <div>· 选排名前 <b style={{color:T.textBright}}>Top {params.topN||1}</b>，等权持有</div>
            <div>· 仅选正动能（ret ≥ 0），负动能 ETF 不纳入</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#ee3344', marginBottom: 6, fontSize: 12 }}>出场条件</div>
            <div>· 每月调仓重新排名，不在 Top{params.topN||1} 的持仓<b style={{color:'#ee3344'}}>全部清仓</b>（无缓冲区）</div>
            <div>· 个股动能转负 → 调仓日不再入选</div>
            <div>· 所有 9 只 ETF 动能均为负 → 全仓切换防御资产</div>
            <div>· 无独立止损 / 止盈 / 移动止损</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#e8883a', marginBottom: 6, fontSize: 12 }}>防御机制</div>
            <div>· 全负动能 → 切换至 <b style={{color:'#e8883a'}}>{params.defensiveAsset||'SHY'}</b></div>
            <div>· 防御资产可选：SHY（短债）/ GLD（黄金）/ CASH（现金）</div>
            <div>· 防御资产本身也在 ETF 池中，若动能为正可能自然入选</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#88bbff', marginBottom: 6, fontSize: 12 }}>执行方式</div>
            <div>· T 日收盘信号 → T+1 日开盘执行（MOO 模型）</div>
            <div>· 调仓频率：每月（固定 21 个交易日）</div>
          </div>
        </div>
      );
    }
    if (strategy === 'dual') {
      const lb = {20:'20日',50:'50日',63:'3个月(63日)',126:'6个月(126日)',200:'200日',252:'12个月(252日)'}[params.lookback]||`${params.lookback}日`;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#4fc86e', marginBottom: 6, fontSize: 12 }}>入场条件（三层过滤）</div>
            <div>· ETF 池（8只，无 SOXX）：QQQ / SPY / XLK / DXJ / TLT / GLD / SHY / TSM</div>
            <div>· <b style={{color:T.textBright}}>第一层·相对动能</b>：计算 {lb} 收益率，选排名第 1</div>
            <div>· <b style={{color:T.textBright}}>第二层·绝对动能</b>：排名第 1 的 ETF 收益率必须 &gt; 0</div>
            <div>· <b style={{color:T.textBright}}>第三层·趋势过滤</b>：排名第 1 的 ETF 收盘价必须 &gt; MA{params.maFilter||200}</div>
            <div>· 三层全部通过才买入，始终只持有一 只 ETF</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#ee3344', marginBottom: 6, fontSize: 12 }}>出场条件</div>
            <div>· 每月调仓，重新评估三层条件</div>
            <div>· <b style={{color:'#ee3344'}}>任一条件不满足</b> → 立即切换防御资产</div>
            <div>· 排名第 1 的 ETF 动能转负 → 防御</div>
            <div>· 排名第 1 的 ETF 价格跌破 MA{params.maFilter||200} → 防御</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#e8883a', marginBottom: 6, fontSize: 12 }}>防御机制</div>
            <div>· 防御资产：<b style={{color:'#e8883a'}}>{params.defensiveAsset||'SHY'}</b>（SHY / GLD / CASH 可选）</div>
            <div>· 不同于强势轮动（全负才防御），双动能只要最强 ETF 不满足条件就防御</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#88bbff', marginBottom: 6, fontSize: 12 }}>执行方式 & 框架来源</div>
            <div>· T 日收盘信号 → T+1 日开盘执行（MOO 模型）</div>
            <div>· 调仓频率：每月（固定 21 个交易日）</div>
            <div>· Gary Antonacci 双动能（Dual Momentum）框架</div>
          </div>
        </div>
      );
    }
    if (strategy === 'volControl') {
      const vs = params.volSource === 'VIX' ? 'VIX（恐慌指数）' : 'QQQ 20日实现波动率（年化）';
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#4fc86e', marginBottom: 6, fontSize: 12 }}>仓位规则（三档）</div>
            <div>· 核心资产始终是 QQQ，不做选股</div>
            <div>· <b style={{color:'#4fc86e'}}>低波动</b>（vol &lt; {params.lowThreshold||20}%）：满仓 QQQ 100%</div>
            <div>· <b style={{color:'#e8883a'}}>中波动</b>（{params.lowThreshold||20}% ≤ vol ≤ {params.highThreshold||30}%）：半仓 QQQ 50% + 半仓防御 50%</div>
            <div>· <b style={{color:'#ee3344'}}>高波动</b>（vol &gt; {params.highThreshold||30}%）：全仓防御 100%</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#88bbff', marginBottom: 6, fontSize: 12 }}>波动率来源 & 调仓</div>
            <div>· 波动率来源：<b style={{color:T.textBright}}>{vs}</b></div>
            <div>· 每日检查波动率水平</div>
            <div>· 波动率档位变化 → 次日开盘调仓</div>
            <div>· 档位不变 → 持仓不动，不调仓</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#e8883a', marginBottom: 6, fontSize: 12 }}>防御机制</div>
            <div>· 防御资产：<b style={{color:'#e8883a'}}>{params.defensiveAsset||'SHY'}</b>（SHY / CASH）</div>
            <div>· 半仓时 QQQ 50% + {params.defensiveAsset||'SHY'} 50%</div>
            <div>· 全仓防御时 100% {params.defensiveAsset||'SHY'}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#ee3344', marginBottom: 6, fontSize: 12 }}>参数约束</div>
            <div>· lowThreshold &lt; highThreshold（低阈值必须小于高阈值）</div>
            <div>· VIX 阈值：15/20/25；实现波动率阈值：25/30/35</div>
            <div>· 理念：高波动时降低风险暴露，低波动时充分参与</div>
          </div>
        </div>
      );
    }
    return null;
  };

  const label = () => {
    if (strategy === 'momentum') {
      const lb = {20:'20D',21:'1M',50:'50D',63:'3M',126:'6M',200:'200D',252:'12M'}[params.lookback]||`${params.lookback}D`;
      return `回看${lb} · Top${params.topN||1} · 防御=${params.defensiveAsset||'SHY'}`;
    }
    if (strategy === 'dual') {
      const lb = {20:'20D',50:'50D',63:'3M',126:'6M',200:'200D',252:'12M'}[params.lookback]||`${params.lookback}D`;
      return `回看${lb} · MA${params.maFilter||200} · 防御=${params.defensiveAsset||'SHY'}`;
    }
    if (strategy === 'volControl') {
      return `波动率=${params.volSource||'REALIZED'} · ${params.lowThreshold||20}%/${params.highThreshold||30}% · 防御=${params.defensiveAsset||'SHY'}`;
    }
    return '';
  };

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
        <span style={{ color: T.textMuted, marginLeft: 8 }}>{label()}</span>
      </button>
      {open && (
        <div style={{
          padding: '14px 18px', background: T.cardBg, border: `1px solid ${T.border}`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', fontSize: 11, lineHeight: 1.9, color: T.textSub,
        }}>
          {content()}
        </div>
      )}
    </div>
  );
}

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
    { val: 20, label: '20D（20日）' },
    { val: 21, label: '1M（21日）' },
    { val: 50, label: '50D（50日）' },
    { val: 63, label: '3M（63日）' },
    { val: 126, label: '6M（126日）' },
    { val: 200, label: '200D（200日）' },
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
        const bt = backtestMomentum(etfData.closes, etfData.timestamps, p, 0, null, etfData.opens);
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
      <EtfStrategyRuleCard T={T} strategy="momentum" params={params} />
      <SignalCard etfData={etfData} strategy="momentum" params={params} T={T} />
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
        const bt = backtestDualMomentum(etfData.closes, etfData.timestamps, p, 0, null, etfData.opens);
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
      <EtfStrategyRuleCard T={T} strategy="dual" params={params} />
      <SignalCard etfData={etfData} strategy="dual" params={params} T={T} />
      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        选最强 ETF，并确认其价格高于均线（趋势过滤）。跌破均线改持防御资产。
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>回看期</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{val:20,label:'20D'},{val:50,label:'50D'},{val:63,label:'3M'},{val:126,label:'6M'},{val:200,label:'200D'},{val:252,label:'12M'}].map(o => (
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
          etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20, p, 0, null, etfData.opens
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
      <EtfStrategyRuleCard T={T} strategy="volControl" params={params} />
      <SignalCard etfData={etfData} strategy="volControl" params={params} T={T} />
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
  const [progress, setProgress]     = useState({ done: 0, total: 131 });
  const [best, setBest]             = useState(null);
  const [section, setSection]       = useState('ranking');
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe');
  const abortRef = useRef(false);

  const run = useCallback(async () => {
    if (!etfData || running) return;
    abortRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: 131 });
    setResults([]);
    setBest(null);

    try {
      const res = await runGridSearch(
        etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
        0, null,
        (done, total) => setProgress({ done, total }),
        etfData.opens
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
        一键遍历全部 <strong style={{ color: T.textBright }}>131 种</strong> 参数组合（三策略合并），
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
function WfoPanel({ etfData, T, onApply }) {
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
        (done, total, ph) => setPhase(`窗口 ${done + 1}/${total} · ${ph === 'is' ? 'IS优化' : 'OOS验证'}`),
        etfData.opens
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
        用前 3 年（IS）找最佳参数，用后 1 年（OOS）验证，每年滚动一次。串接所有 OOS 结果得到无偏绩效估计。
        <br/>
        <span style={{ fontSize: 11, color: '#cc88ff' }}>
          🔒 参数一致性：IS 选出的参数直接用于 OOS，OOS 期间不重新优化，确保无前视偏差。
        </span>
        <br />
        <span style={{ color: '#e8883a', fontSize: 11 }}>
          ⚠ 10年数据约 6～7 个窗口，每窗口内 IS 跑 131 种组合，耗时约 1～2 分钟。
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
                qqqEq={wfoResult.combinedQqqOosEquity}
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
            <div style={{ fontSize: 12, color: T.textBright, fontWeight: 600, marginBottom: 6 }}>
              窗口明细
            </div>
            {/* IS = OOS 参数一致性说明 */}
            <div style={{
              padding: '8px 12px', marginBottom: 10,
              background: '#9944ee18', border: '1px solid #9944ee44',
              borderRadius: 6, fontSize: 11, color: T.textSub, lineHeight: 1.6,
            }}>
              ⚡ <b style={{ color: '#cc88ff' }}>参数一致性保证</b>：每个窗口的 OOS 期间
              严格使用 IS 期选出的最佳参数，<b style={{ color: T.textBright }}>不重新优化、不事后调参</b>。
              "IS→OOS 参数" 列同时标注 IS 选参结果 = OOS 实际使用参数。
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    {[
                      { h: '窗口',            sub: '' },
                      { h: 'IS 训练期',       sub: '样本内（选参）' },
                      { h: 'OOS 验证期',      sub: '样本外（禁止重选参）' },
                      { h: 'IS→OOS 参数',    sub: '两者完全一致 ✓' },
                      { h: 'IS 评分',         sub: `按 ${wfoResult.optMetric} 排序` },
                      { h: 'OOS CAGR',        sub: '' },
                      { h: 'OOS Sharpe',      sub: '' },
                      { h: 'OOS MDD',         sub: '' },
                      { h: '操作',           sub: '' },
                    ].map(({ h, sub }) => (
                      <th key={h} style={{
                        padding: '7px 10px', textAlign: 'left',
                        color: T.textMuted, fontWeight: 600,
                        borderBottom: `1px solid ${T.border}`, background: T.theadBg,
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                        {sub && <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 400, marginTop: 1 }}>{sub}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wfoResult.windowResults.map((w, i) => {
                    const isScoreVal = w.isScore != null ? (
                      ['cagr', 'oosCagr'].includes(wfoResult.optMetric)
                        ? fmtPct(w.isScore)
                        : fmtNum(w.isScore)
                    ) : '—';
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? T.rowEven : T.cardBg }}>
                        <td style={{ padding: '6px 10px', color: T.textMuted, fontWeight: 700 }}>#{w.window}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: T.textSub, fontSize: 10 }}>
                          {w.isStart} → {w.isEnd}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: T.textBright, fontSize: 10, fontWeight: 600 }}>
                          {w.oosStart} → {w.oosEnd}
                        </td>
                        {/* IS→OOS 参数（两者相同） */}
                        <td style={{ padding: '6px 10px', fontSize: 10, maxWidth: 220 }}>
                          <span style={{ color: '#cc88ff', fontWeight: 600 }}>{paramLabel(w.isBestParams)}</span>
                          <span style={{ marginLeft: 6, fontSize: 9, color: '#4fc86e', opacity: 0.8 }}>OOS同</span>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: T.textSub }}>
                          {isScoreVal}
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
                        <td style={{ padding: '5px 8px' }}>
                          {onApply && (
                            <button onClick={() => onApply({ params: w.isBestParams })} style={{
                              padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
                              background: '#0055cc', border: '1px solid #4488ee', color: '#fff',
                              whiteSpace: 'nowrap',
                            }}>
                              应用并回测
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
            参数全量扫描（一键优化，131 种组合）
            <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 4 }}>
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
              <WfoPanel etfData={etfData} T={T} darkMode={darkMode} onApply={handleApplyAndRun} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
