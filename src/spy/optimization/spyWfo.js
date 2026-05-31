/**
 * spyWfo.js — SPY 成分股轮转 Walk Forward 验证/优化
 *
 * 两种模式：
 * 【模式A：固定参数 OOS 验证】fixedParams 指定时，IS 期只算参考绩效
 * 【模式B：自动寻优 WFO】IS 期 Grid Search 288 种组合 → 选最优 → OOS 验证
 *
 * 窗口：单窗口 70% IS / 30% OOS
 */

import { backtestSpyRotation, buildSpyBenchmark, getSpyRotationParams } from '../strategies/spyRotation.js';
import { calcMetrics } from '../../etf/strategies/metrics.js';

export async function runSpyWFO(histData, timestamps, optMetric = 'sharpe', onProgress = null, fixedParams = null) {
  const N           = timestamps.length;
  const isFixedMode = fixedParams != null;

  const inEnd   = Math.round(N * 0.70);
  const inDays  = inEnd;
  const outDays = N - inEnd;

  if (inDays < 252 || outDays < 42) return null;

  const scoreFn = (m) => {
    if (optMetric === 'cagr')   return m.cagr;
    if (optMetric === 'calmar') return Math.abs(m.mdd) > 0.001 ? m.cagr / Math.abs(m.mdd) : -Infinity;
    return m.sharpe;
  };

  let bestParams;
  let inSampleMetrics  = null;
  let inSampleComboCnt = 0;

  if (isFixedMode) {
    bestParams = fixedParams;
    onProgress?.('oos', 0, 1);
    try {
      const isBt = backtestSpyRotation(histData, timestamps, fixedParams, 0, inEnd);
      if (isBt && isBt.equityCurve.length >= 10) {
        inSampleMetrics = calcMetrics(isBt.equityCurve, isBt.timestamps);
      }
    } catch (e) { /* IS 参考计算失败不影响 OOS */ }
  } else {
    const allParams = getSpyRotationParams();
    const total     = allParams.length;
    const inResults = [];

    for (let idx = 0; idx < total; idx++) {
      if (idx % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
        onProgress?.('is', idx, total);
      }
      try {
        const bt = backtestSpyRotation(histData, timestamps, allParams[idx], 0, inEnd);
        if (!bt || bt.equityCurve.length < 50) continue;
        const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
        if (!metrics) continue;
        inResults.push({ params: allParams[idx], metrics });
      } catch (e) {
        console.warn('SPY WFO IS combo failed:', allParams[idx], e);
      }
    }

    onProgress?.('is', total, total);
    if (inResults.length === 0) return null;

    inResults.sort((a, b) => scoreFn(b.metrics) - scoreFn(a.metrics));
    const bestCombo  = inResults[0];
    bestParams       = bestCombo.params;
    inSampleMetrics  = bestCombo.metrics;
    inSampleComboCnt = inResults.length;
  }

  onProgress?.('oos', 0, 1);
  const oosBt = backtestSpyRotation(histData, timestamps, bestParams, inEnd, N);
  if (!oosBt || oosBt.equityCurve.length < 10) return null;

  const oosMetrics = calcMetrics(oosBt.equityCurve, oosBt.timestamps);
  if (!oosMetrics) return null;

  const spyCloses     = histData.get('__SPY__')?.closes ?? histData.get('__SPY__');
  const oosOffset     = timestamps.indexOf(oosBt.timestamps[0]);
  const spyOosEq      = buildSpyBenchmark(spyCloses, oosOffset, oosOffset + oosBt.timestamps.length);
  const spyOosMetrics = spyOosEq.length > 1
    ? calcMetrics(spyOosEq, oosBt.timestamps)
    : null;

  onProgress?.('oos', 1, 1);

  const windowResult = {
    winIdx:  1,
    isFixedMode,
    inTsStart:  timestamps[0],
    inTsEnd:    timestamps[inEnd - 1],
    outTsStart: timestamps[inEnd],
    outTsEnd:   timestamps[N - 1],
    bestParams,
    inSampleScore:    isFixedMode ? null : scoreFn(inSampleMetrics),
    inSampleSharpe:   inSampleMetrics?.sharpe   ?? null,
    inSampleCAGR:     inSampleMetrics?.cagr     ?? null,
    inSampleMDD:      inSampleMetrics?.mdd      ?? null,
    inSampleComboCnt,
    outMetrics:    oosMetrics,
    spyOutMetrics: spyOosMetrics,
  };

  return {
    isFixedMode,
    fixedParams:        isFixedMode ? fixedParams : null,
    windowResults:      [windowResult],
    allOutEquity:       oosBt.equityCurve,
    allOutTs:           oosBt.timestamps,
    combinedMetrics:    oosMetrics,
    spyCombinedMetrics: spyOosMetrics,
    spyWfoEq:           spyOosEq,
    optMetric,
    totalCombos:        isFixedMode ? 1 : 288,
    windowCount:        1,
    inDays,
    outDays,
  };
}
