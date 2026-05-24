/**
 * qqqWfo.js — QQQ 成分股轮转 Walk Forward Optimization
 *
 * 单窗口设计：前 70% in-sample / 后 30% out-of-sample
 *  ① IS 期跑 Grid Search（144 种组合）
 *  ② 按 optMetric 选最佳参数
 *  ③ 固定参数跑 OOS（不重新选参，不事后调整）
 *  ④ 记录 OOS 绩效
 *
 * IS / OOS 参数严格一致：OOS 使用的参数 = IS Grid Search 选出的最优参数。
 */

import { backtestQqqRotation, buildQqqBenchmark, getQqqRotationParams } from '../strategies/qqqRotation.js';
import { calcMetrics } from '../../etf/strategies/metrics.js';

/**
 * 运行 QQQ 轮转策略 Walk Forward Optimization
 *
 * @param {Map}      histData    Map<sym, {closes, opens}>
 * @param {number[]} timestamps
 * @param {string}   optMetric   'sharpe' | 'cagr' | 'calmar'
 * @param {Function} onProgress  (phase, done, total) => void
 * @returns {Object|null}
 */
export async function runQqqWFO(histData, timestamps, optMetric = 'sharpe', onProgress = null) {
  const N = timestamps.length;

  // 单窗口：前 70% in-sample，后 30% out-of-sample
  const inEnd  = Math.round(N * 0.70);
  const inDays  = inEnd;
  const outDays = N - inEnd;

  // 至少需要 1年 IS + 2个月 OOS
  if (inDays < 252 || outDays < 42) return null;

  // 评分函数
  const scoreFn = (m) => {
    if (optMetric === 'cagr')   return m.cagr;
    if (optMetric === 'calmar') return Math.abs(m.mdd) > 0.001 ? m.cagr / Math.abs(m.mdd) : -Infinity;
    return m.sharpe; // 默认 Sharpe
  };

  // ── Step 1: IS 期 Grid Search（144 种组合）──
  const allParams = getQqqRotationParams();
  const total = allParams.length;
  const inResults = [];

  for (let idx = 0; idx < total; idx++) {
    if (idx % 10 === 0) {
      await new Promise(r => setTimeout(r, 0));
      onProgress?.('is', idx, total);
    }
    try {
      const bt = backtestQqqRotation(histData, timestamps, allParams[idx], 0, inEnd);
      if (!bt || bt.equityCurve.length < 50) continue;
      const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
      if (!metrics) continue;
      inResults.push({ params: allParams[idx], metrics });
    } catch (e) {
      console.warn('WFO IS combo failed:', allParams[idx], e);
    }
  }

  onProgress?.('is', total, total);

  if (inResults.length === 0) return null;

  // ── Step 2: 按 optMetric 选最佳参数 ──
  inResults.sort((a, b) => scoreFn(b.metrics) - scoreFn(a.metrics));
  const bestCombo  = inResults[0];
  const bestParams = bestCombo.params; // ← 唯一用于 OOS 的参数，绝不事后修改

  // ── Step 3: 固定参数跑 OOS ──
  onProgress?.('oos', 0, 1);
  const oosBt = backtestQqqRotation(histData, timestamps, bestParams, inEnd, N);
  if (!oosBt || oosBt.equityCurve.length < 10) return null;

  const oosMetrics = calcMetrics(oosBt.equityCurve, oosBt.timestamps);
  if (!oosMetrics) return null;

  // QQQ 基准（OOS 同期）
  const qqqCloses = histData.get('__QQQ__')?.closes ?? histData.get('__QQQ__');
  const oosOffset = timestamps.indexOf(oosBt.timestamps[0]);
  const qqqOosEq  = buildQqqBenchmark(qqqCloses, oosOffset, oosOffset + oosBt.timestamps.length);
  const qqqOosMetrics = qqqOosEq.length > 1
    ? calcMetrics(qqqOosEq, oosBt.timestamps)
    : null;

  onProgress?.('oos', 1, 1);

  // ── Step 4: 组装结果 ──
  const windowResult = {
    winIdx: 1,
    inTsStart:  timestamps[0],
    inTsEnd:    timestamps[inEnd - 1],
    outTsStart: timestamps[inEnd],
    outTsEnd:   timestamps[N - 1],
    bestParams,
    inSampleScore:    scoreFn(bestCombo.metrics),
    inSampleSharpe:   bestCombo.metrics.sharpe,
    inSampleCAGR:     bestCombo.metrics.cagr,
    inSampleMDD:      bestCombo.metrics.mdd,
    inSampleComboCnt: inResults.length,
    outMetrics:    oosMetrics,
    qqqOutMetrics: qqqOosMetrics,
  };

  return {
    windowResults:       [windowResult],
    allOutEquity:        oosBt.equityCurve,
    allOutTs:            oosBt.timestamps,
    combinedMetrics:     oosMetrics,
    qqqCombinedMetrics:  qqqOosMetrics,
    qqqWfoEq:            qqqOosEq,
    optMetric,
    totalCombos:         144,
    windowCount:         1,
    inDays,
    outDays,
  };
}
