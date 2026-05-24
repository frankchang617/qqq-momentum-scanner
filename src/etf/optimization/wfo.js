/**
 * wfo.js — Walk Forward Optimization（无偏验证）
 *
 * 设计：
 *  - In-sample (IS)  : 3年（756 个交易日）
 *  - Out-of-sample (OOS): 1年（252 个交易日）
 *  - 步长            : 1年（252 天），每次往前滚动
 *  - 10年数据最多可得 ~6~7 个 OOS 窗口
 *
 * 流程（每个窗口）：
 *  1. IS 期跑 Grid Search（86种参数组合）
 *  2. 按 optMetric 选最佳参数
 *  3. 固定参数跑 OOS 期（不重新选参）
 *  4. 只记录 OOS 绩效
 *
 * 最终：串接所有 OOS 净值曲线 → 计算总体 OOS 绩效
 *
 * 量化正确性：
 *  - OOS 数据不参与任何参数选择
 *  - IS/OOS 严格不重叠
 */

import { runGridSearch, getMomentumParams, getDualMomentumParams, getVolParams } from './gridSearch.js';
import { backtestMomentum } from '../strategies/momentum.js';
import { backtestDualMomentum } from '../strategies/dualMomentum.js';
import { backtestVolControl } from '../strategies/volControl.js';
import { calcMetrics, calcCompositeScores } from '../strategies/metrics.js';

const IS_DAYS  = 756; // 3年
const OOS_DAYS = 252; // 1年

/**
 * 运行 Walk Forward Optimization
 *
 * @param {Object}   closes
 * @param {number[]} timestamps
 * @param {number[]} vix
 * @param {number[]} qqqVol20
 * @param {string}   optMetric   'sharpe' | 'cagr' | 'calmar' | 'composite'
 * @param {Function} onProgress  (windowsDone, windowsTotal, phase) => void
 * @returns {{
 *   combinedOosEquity: number[],
 *   combinedOosTs: number[],
 *   combinedMetrics: Object,
 *   windowResults: Array,
 *   windowCount: number,
 *   optMetric: string
 * }}
 */
export async function runWFO(closes, timestamps, vix, qqqVol20, optMetric = 'sharpe', onProgress = null) {
  const N = timestamps.length;

  // 计算有多少个有效窗口
  const windows = [];
  let pos = 0;
  while (pos + IS_DAYS + 60 < N) {  // 至少有 60 天 OOS
    const isStart  = pos;
    const isEnd    = pos + IS_DAYS;
    const oosStart = isEnd;
    const oosEnd   = Math.min(oosStart + OOS_DAYS, N);
    windows.push({ isStart, isEnd, oosStart, oosEnd });
    pos += OOS_DAYS; // 步长：1年
  }

  if (windows.length === 0) {
    return { error: '数据不足：需要至少 4 年历史数据', windowCount: 0 };
  }

  const windowResults = [];
  const combinedOosEquity = [];
  const combinedOosTs = [];

  for (let wi = 0; wi < windows.length; wi++) {
    const { isStart, isEnd, oosStart, oosEnd } = windows[wi];
    onProgress?.(wi, windows.length, 'is');

    // ── Step 1: IS 期 Grid Search ──
    const isResults = await runGridSearch(
      closes, timestamps, vix, qqqVol20,
      isStart, isEnd,
      null // IS 期不需要进度回调（避免 UI 混乱）
    );

    if (isResults.length === 0) continue;

    // ── Step 2: 按 optMetric 选最佳参数 ──
    const bestIsResult = selectBestByMetric(isResults, optMetric);
    const bestParams = bestIsResult.params;

    // ── Step 3: 固定参数跑 OOS ──
    onProgress?.(wi, windows.length, 'oos');
    let oosBt;
    try {
      if (bestParams.strategy === 'momentum') {
        oosBt = backtestMomentum(closes, timestamps, bestParams, oosStart, oosEnd);
      } else if (bestParams.strategy === 'dualMomentum') {
        oosBt = backtestDualMomentum(closes, timestamps, bestParams, oosStart, oosEnd);
      } else {
        oosBt = backtestVolControl(closes, timestamps, vix, qqqVol20, bestParams, oosStart, oosEnd);
      }
    } catch (e) {
      console.warn('WFO OOS backtest failed:', e);
      continue;
    }

    if (!oosBt || oosBt.equityCurve.length < 10) continue;

    const oosMetrics = calcMetrics(oosBt.equityCurve, oosBt.timestamps);

    // ── Step 4: 记录 OOS 绩效，串接净值曲线 ──
    // 串接时需要标准化：从上一段结尾处接续
    const lastEquity = combinedOosEquity.length > 0
      ? combinedOosEquity[combinedOosEquity.length - 1]
      : 1.0;
    const scale = lastEquity / oosBt.equityCurve[0];
    oosBt.equityCurve.forEach((v, i) => {
      combinedOosEquity.push(v * scale);
      combinedOosTs.push(oosBt.timestamps[i]);
    });

    windowResults.push({
      window: wi + 1,
      isStart: new Date(timestamps[isStart] * 1000).toISOString().slice(0, 10),
      isEnd:   new Date(timestamps[isEnd - 1] * 1000).toISOString().slice(0, 10),
      oosStart: new Date(timestamps[oosStart] * 1000).toISOString().slice(0, 10),
      oosEnd:   new Date(timestamps[oosEnd - 1] * 1000).toISOString().slice(0, 10),
      // IS 期信息
      isOptMetric: optMetric,
      isScore:  bestIsResult[optMetric === 'calmar'
        ? '_calmar' : optMetric === 'composite'
        ? 'compositeScore' : optMetric],
      isBestParams: bestParams,
      isCagr:   bestIsResult.cagr,
      isSharpe: bestIsResult.sharpe,
      isMdd:    bestIsResult.mdd,
      isComboCnt: isResults.length,
      // OOS 期绩效
      oosCagr:   oosMetrics?.cagr   ?? null,
      oosSharpe: oosMetrics?.sharpe ?? null,
      oosMdd:    oosMetrics?.mdd    ?? null,
      oosTotalReturn: oosMetrics?.totalReturn ?? null,
      oosEquityCurve: oosBt.equityCurve,
      oosTimestamps: oosBt.timestamps,
    });
  }

  onProgress?.(windows.length, windows.length, 'done');

  // ── 串接 OOS 总绩效 ──
  let combinedMetrics = null;
  if (combinedOosEquity.length > 10) {
    combinedMetrics = calcMetrics(combinedOosEquity, combinedOosTs);
  }

  // ── WFO 稳定性指标 ──
  const stability = calcWfoStability(windowResults);

  return {
    combinedOosEquity,
    combinedOosTs,
    combinedMetrics,
    windowResults,
    windowCount: windowResults.length,
    optMetric,
    stability,
  };
}

/**
 * 按指定指标从 IS 结果中选最优
 */
function selectBestByMetric(results, optMetric) {
  if (optMetric === 'sharpe') {
    return results.reduce((best, r) => r.sharpe > best.sharpe ? r : best);
  }
  if (optMetric === 'cagr') {
    return results.reduce((best, r) => r.cagr > best.cagr ? r : best);
  }
  if (optMetric === 'calmar') {
    const calmar = r => Math.abs(r.mdd) > 0.001 ? r.cagr / Math.abs(r.mdd) : -Infinity;
    return results.reduce((best, r) => calmar(r) > calmar(best) ? r : best);
  }
  if (optMetric === 'composite') {
    // compositeScore 已在 runGridSearch 中计算
    return results.reduce((best, r) => (r.compositeScore ?? 0) > (best.compositeScore ?? 0) ? r : best);
  }
  return results[0];
}

/**
 * 计算 WFO 稳定性指标
 * @param {Array} windowResults
 */
function calcWfoStability(windowResults) {
  if (windowResults.length === 0) return null;

  const oosCagrs   = windowResults.map(w => w.oosCagr).filter(v => v != null);
  const oosSharpes = windowResults.map(w => w.oosSharpe).filter(v => v != null);
  const positiveWindows = windowResults.filter(w => (w.oosCagr ?? 0) > 0).length;

  // IS vs OOS 衰减比（Sharpe）
  const isOosSharpeRatio = windowResults.reduce((s, w) => {
    if (w.isSharpe && w.oosSharpe && w.isSharpe !== 0) {
      return s + w.oosSharpe / w.isSharpe;
    }
    return s;
  }, 0) / (windowResults.length || 1);

  return {
    windowCount: windowResults.length,
    positiveOosWindows: positiveWindows,
    positiveOosRate: positiveWindows / windowResults.length,
    avgOosCagr:   avg(oosCagrs),
    avgOosSharpe: avg(oosSharpes),
    stdOosCagr:   std(oosCagrs),
    isOosSharpeRatio, // 接近1表示无过拟合，<0.5表示严重衰减
  };
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr) {
  if (arr.length < 2) return null;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
