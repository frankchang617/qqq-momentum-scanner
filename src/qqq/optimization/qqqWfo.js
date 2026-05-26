/**
 * qqqWfo.js — QQQ 成分股轮转 Walk Forward 验证/优化
 *
 * 支持两种模式：
 *
 * 【模式A：固定参数 OOS 验证（fixedParams 指定时）】
 *  - 用户已通过优化选定一组参数（如「应用并回测」后的参数）
 *  - 直接用该参数跑 OOS（后30%数据）
 *  - IS 期只计算固定参数的参考绩效，不做任何搜索
 *  - 目的：验证选中参数在从未见过的数据上的稳定性
 *
 * 【模式B：自动寻优 WFO（fixedParams = null 时，原有行为）】
 *  - IS 期（前70%）跑 Grid Search（288种组合）→ 选最优
 *  - OOS 期（后30%）用 IS 最优参数验证
 *  - 目的：无前视偏差的参数自动选择
 *
 * 窗口设计：单窗口 70% IS / 30% OOS
 */

import { backtestQqqRotation, buildQqqBenchmark, getQqqRotationParams } from '../strategies/qqqRotation.js';
import { calcMetrics } from '../../etf/strategies/metrics.js';

/**
 * 运行 QQQ 轮转策略 Walk Forward 验证/优化
 *
 * @param {Map}         histData     Map<sym, {closes, opens}>
 * @param {number[]}    timestamps
 * @param {string}      optMetric    'sharpe' | 'cagr' | 'calmar'（仅模式B使用）
 * @param {Function}    onProgress   (phase, done, total) => void
 * @param {Object|null} fixedParams  指定时启用模式A（固定参数 OOS 验证）
 */
export async function runQqqWFO(histData, timestamps, optMetric = 'sharpe', onProgress = null, fixedParams = null) {
  const N = timestamps.length;
  const isFixedMode = fixedParams != null;

  // 单窗口：前 70% IS，后 30% OOS
  const inEnd   = Math.round(N * 0.70);
  const inDays  = inEnd;
  const outDays = N - inEnd;

  // 至少需要 1年 IS + 2个月 OOS
  if (inDays < 252 || outDays < 42) return null;

  const scoreFn = (m) => {
    if (optMetric === 'cagr')   return m.cagr;
    if (optMetric === 'calmar') return Math.abs(m.mdd) > 0.001 ? m.cagr / Math.abs(m.mdd) : -Infinity;
    return m.sharpe; // 默认 Sharpe
  };

  let bestParams;
  let inSampleMetrics  = null;
  let inSampleComboCnt = 0;

  if (isFixedMode) {
    // ── 模式A：固定参数，跳过 IS 搜索 ──
    bestParams = fixedParams;
    onProgress?.('oos', 0, 1);

    // 计算固定参数在 IS 期的参考绩效（只供 UI 展示，不影响参数选择）
    try {
      const isBt = backtestQqqRotation(histData, timestamps, fixedParams, 0, inEnd);
      if (isBt && isBt.equityCurve.length >= 10) {
        inSampleMetrics = calcMetrics(isBt.equityCurve, isBt.timestamps);
      }
    } catch (e) { /* IS 参考计算失败不影响 OOS */ }

  } else {
    // ── 模式B：IS 期 Grid Search（288种组合）──
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

    inResults.sort((a, b) => scoreFn(b.metrics) - scoreFn(a.metrics));
    const bestCombo  = inResults[0];
    bestParams       = bestCombo.params;
    inSampleMetrics  = bestCombo.metrics;
    inSampleComboCnt = inResults.length;
  }

  // ── OOS 验证（两种模式完全相同）──
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

  const windowResult = {
    winIdx: 1,
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
    qqqOutMetrics: qqqOosMetrics,
  };

  return {
    isFixedMode,
    fixedParams: isFixedMode ? fixedParams : null,
    windowResults:      [windowResult],
    allOutEquity:       oosBt.equityCurve,
    allOutTs:           oosBt.timestamps,
    combinedMetrics:    oosMetrics,
    qqqCombinedMetrics: qqqOosMetrics,
    qqqWfoEq:           qqqOosEq,
    optMetric,
    totalCombos:        isFixedMode ? 1 : 288,
    windowCount:        1,
    inDays,
    outDays,
  };
}
