/**
 * wfo.js — Walk Forward Validation / Optimization（滚动样本外验证）
 *
 * 支持两种模式：
 *
 * 【模式A：固定参数 OOS 验证（fixedParams 指定时）】
 *  - 用户已通过优化选定一组参数
 *  - 直接用该参数在每个 OOS 窗口跑回测
 *  - IS 期不做任何搜索，仅计算固定参数在 IS 期的参考绩效
 *  - 目的：检验该参数在不同市场环境下的稳定性
 *
 * 【模式B：自动寻优 WFO（fixedParams = null 时，原有行为）】
 *  - IS 期跑 Grid Search 选最优参数
 *  - OOS 期用 IS 选出的参数验证
 *  - 目的：无未来数据的参数自动选择
 *
 * 窗口设计（两种模式相同）：
 *  - IS 期 : 3年（756 个交易日）
 *  - OOS 期: 1年（252 个交易日）
 *  - 步长  : 1年（252 天），每次往前滚动
 *  - 10年数据约 6～7 个 OOS 窗口
 *
 * 量化正确性：
 *  - OOS 数据不参与任何参数选择
 *  - IS/OOS 严格不重叠
 */

import { runGridSearch } from './gridSearch.js';
import { backtestMomentum } from '../strategies/momentum.js';
import { backtestDualMomentum } from '../strategies/dualMomentum.js';
import { backtestVolControl } from '../strategies/volControl.js';
import { calcMetrics } from '../strategies/metrics.js';

const IS_DAYS  = 756; // 3年
const OOS_DAYS = 252; // 1年

/**
 * 用指定参数运行一段回测，返回回测结果
 */
function runBacktest(closes, timestamps, vix, qqqVol20, params, startIdx, endIdx, opens) {
  if (params.strategy === 'momentum') {
    return backtestMomentum(closes, timestamps, params, startIdx, endIdx, opens);
  } else if (params.strategy === 'dualMomentum') {
    return backtestDualMomentum(closes, timestamps, params, startIdx, endIdx, opens);
  } else {
    return backtestVolControl(closes, timestamps, vix, qqqVol20, params, startIdx, endIdx, opens);
  }
}

/**
 * 运行 Walk Forward 验证/优化
 *
 * @param {Object}      closes
 * @param {number[]}    timestamps
 * @param {number[]}    vix
 * @param {number[]}    qqqVol20
 * @param {string}      optMetric     'sharpe' | 'cagr' | 'calmar' | 'composite'（仅模式B使用）
 * @param {Function}    onProgress    (windowsDone, windowsTotal, phase) => void
 * @param {Object|null} opens
 * @param {string|null} strategyFilter  模式B过滤：'momentum'|'dualMomentum'|'volControl'|null（仅模式B使用）
 * @param {Object|null} fixedParams   指定时启用模式A（固定参数 OOS 验证）
 */
export async function runWFO(
  closes, timestamps, vix, qqqVol20,
  optMetric = 'sharpe',
  onProgress = null,
  opens = null,
  strategyFilter = null,
  fixedParams = null
) {
  const N = timestamps.length;
  const isFixedMode = fixedParams != null;

  // 预建 timestamp→index 映射（O(1) 查找）
  const tsIndexMap = new Map(timestamps.map((ts, i) => [ts, i]));

  // 计算有效窗口
  const windows = [];
  let pos = 0;
  while (pos + IS_DAYS + 60 < N) {
    const isStart  = pos;
    const isEnd    = pos + IS_DAYS;
    const oosStart = isEnd;
    const oosEnd   = Math.min(oosStart + OOS_DAYS, N);
    windows.push({ isStart, isEnd, oosStart, oosEnd });
    pos += OOS_DAYS;
  }

  if (windows.length === 0) {
    return { error: '数据不足：需要至少 4 年历史数据', windowCount: 0 };
  }

  const windowResults        = [];
  const combinedOosEquity    = [];
  const combinedOosTs        = [];
  const combinedQqqOosEquity = [];
  const combinedSpyOosEquity = [];

  for (let wi = 0; wi < windows.length; wi++) {
    const { isStart, isEnd, oosStart, oosEnd } = windows[wi];

    let bestParams;
    let isMetricsRef = null; // IS 期参考绩效（仅用于显示，不影响参数选择）
    let isComboCnt = 0;

    if (isFixedMode) {
      // ── 模式A：固定参数，跳过 IS 搜索 ──
      onProgress?.(wi, windows.length, 'oos');
      bestParams = fixedParams;

      // 计算固定参数在 IS 期的参考绩效（供 UI 展示，证明不是事后调参）
      try {
        const isBt = runBacktest(closes, timestamps, vix, qqqVol20, fixedParams, isStart, isEnd, opens);
        if (isBt && isBt.equityCurve.length >= 10) {
          isMetricsRef = calcMetrics(isBt.equityCurve, isBt.timestamps);
        }
      } catch (e) {
        // IS 参考计算失败不影响 OOS
      }

    } else {
      // ── 模式B：IS 期 Grid Search 选最优 ──
      onProgress?.(wi, windows.length, 'is');

      const isResults = await runGridSearch(
        closes, timestamps, vix, qqqVol20,
        isStart, isEnd,
        null,
        opens,
        strategyFilter
      );

      if (isResults.length === 0) continue;

      const bestIsResult = selectBestByMetric(isResults, optMetric);
      bestParams   = bestIsResult.params;
      isComboCnt   = isResults.length;
      isMetricsRef = { cagr: bestIsResult.cagr, sharpe: bestIsResult.sharpe, mdd: bestIsResult.mdd };
    }

    // ── OOS 验证（两种模式相同） ──
    onProgress?.(wi, windows.length, 'oos');
    let oosBt;
    try {
      oosBt = runBacktest(closes, timestamps, vix, qqqVol20, bestParams, oosStart, oosEnd, opens);
    } catch (e) {
      console.warn('WFO OOS backtest failed:', e);
      continue;
    }

    if (!oosBt || oosBt.equityCurve.length < 10) continue;

    const oosMetrics = calcMetrics(oosBt.equityCurve, oosBt.timestamps);

    // 串接 OOS 净值曲线
    const lastEquity = combinedOosEquity.length > 0
      ? combinedOosEquity[combinedOosEquity.length - 1]
      : 1.0;
    const scale = lastEquity / oosBt.equityCurve[0];
    oosBt.equityCurve.forEach((v, i) => {
      combinedOosEquity.push(v * scale);
      combinedOosTs.push(oosBt.timestamps[i]);
    });

    // 串接 QQQ / SPY 基准
    const appendBenchmark = (rawCloses, combinedArr) => {
      if (!rawCloses) return;
      const seg = oosBt.timestamps.map(ts => {
        const idx = tsIndexMap.get(ts);
        return idx != null ? (rawCloses[idx] ?? null) : null;
      });
      if (seg.length === 0 || seg[0] == null) return;
      const lastVal = combinedArr.length > 0 ? combinedArr[combinedArr.length - 1] : 1.0;
      const sc = lastVal / seg[0];
      seg.forEach(p => combinedArr.push(
        p != null ? p * sc : combinedArr[combinedArr.length - 1] ?? 1.0
      ));
    };
    appendBenchmark(closes['QQQ'], combinedQqqOosEquity);
    appendBenchmark(closes['SPY'], combinedSpyOosEquity);

    // 模式B：IS 最优评分值（用于表头显示）
    const isScore = isFixedMode ? null : (() => {
      if (optMetric === 'calmar')    return isMetricsRef && Math.abs(isMetricsRef.mdd) > 0.001 ? isMetricsRef.cagr / Math.abs(isMetricsRef.mdd) : null;
      if (optMetric === 'composite') return null; // compositeScore 未单独缓存
      return isMetricsRef?.[optMetric] ?? null;
    })();

    windowResults.push({
      window: wi + 1,
      isFixedMode,
      isStart:  new Date(timestamps[isStart]    * 1000).toISOString().slice(0, 10),
      isEnd:    new Date(timestamps[isEnd - 1]  * 1000).toISOString().slice(0, 10),
      oosStart: new Date(timestamps[oosStart]   * 1000).toISOString().slice(0, 10),
      oosEnd:   new Date(timestamps[oosEnd - 1] * 1000).toISOString().slice(0, 10),
      // 参数（模式A固定 / 模式B IS 选出）
      isBestParams: bestParams,
      isOptMetric: optMetric,
      isScore,
      // IS 期参考绩效
      isCagr:   isMetricsRef?.cagr   ?? null,
      isSharpe: isMetricsRef?.sharpe ?? null,
      isMdd:    isMetricsRef?.mdd    ?? null,
      isComboCnt,
      // OOS 期绩效
      oosCagr:        oosMetrics?.cagr        ?? null,
      oosSharpe:      oosMetrics?.sharpe      ?? null,
      oosMdd:         oosMetrics?.mdd         ?? null,
      oosTotalReturn: oosMetrics?.totalReturn ?? null,
      oosEquityCurve: oosBt.equityCurve,
      oosTimestamps:  oosBt.timestamps,
    });
  }

  onProgress?.(windows.length, windows.length, 'done');

  // 串接总绩效
  let combinedMetrics    = null;
  let qqqCombinedMetrics = null;
  let spyCombinedMetrics = null;
  if (combinedOosEquity.length > 10) {
    combinedMetrics = calcMetrics(combinedOosEquity, combinedOosTs);
  }
  if (combinedQqqOosEquity.length > 10) {
    qqqCombinedMetrics = calcMetrics(combinedQqqOosEquity, combinedOosTs);
  }
  if (combinedSpyOosEquity.length > 10) {
    spyCombinedMetrics = calcMetrics(combinedSpyOosEquity, combinedOosTs);
  }

  const stability = calcWfoStability(windowResults);

  return {
    isFixedMode,
    fixedParams: isFixedMode ? fixedParams : null,
    combinedOosEquity,
    combinedOosTs,
    combinedQqqOosEquity: combinedQqqOosEquity.length > 0 ? combinedQqqOosEquity : null,
    combinedSpyOosEquity: combinedSpyOosEquity.length > 0 ? combinedSpyOosEquity : null,
    combinedMetrics,
    qqqCombinedMetrics,
    spyCombinedMetrics,
    windowResults,
    windowCount: windowResults.length,
    optMetric,
    stability,
  };
}

/**
 * 按指定指标从 IS 结果中选最优（仅模式B使用）
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
    return results.reduce((best, r) => (r.compositeScore ?? 0) > (best.compositeScore ?? 0) ? r : best);
  }
  return results[0];
}

/**
 * 计算 WFO 稳定性指标
 */
function calcWfoStability(windowResults) {
  if (windowResults.length === 0) return null;

  const oosCagrs    = windowResults.map(w => w.oosCagr).filter(v => v != null);
  const oosSharpes  = windowResults.map(w => w.oosSharpe).filter(v => v != null);
  const positiveWin = windowResults.filter(w => (w.oosCagr ?? 0) > 0).length;

  // IS vs OOS Sharpe 衰减比（仅模式B有意义）
  const isOosSharpeRatio = windowResults.reduce((s, w) => {
    if (w.isSharpe && w.oosSharpe && w.isSharpe !== 0) {
      return s + w.oosSharpe / w.isSharpe;
    }
    return s;
  }, 0) / (windowResults.length || 1);

  return {
    windowCount: windowResults.length,
    positiveOosWindows: positiveWin,
    positiveOosRate: positiveWin / windowResults.length,
    avgOosCagr:   avg(oosCagrs),
    avgOosSharpe: avg(oosSharpes),
    stdOosCagr:   std(oosCagrs),
    isOosSharpeRatio,
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
