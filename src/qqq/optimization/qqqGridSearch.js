/**
 * qqqGridSearch.js — QQQ 成分股轮转参数网格搜索
 *
 * 遍历全量 144 种参数组合，计算回测指标，按综合评分降序返回。
 *
 * 综合评分（百分位加权）：
 *   Score = Sharpe_pct × 0.40 + MDD_pct × 0.35 + CAGR_pct × 0.25
 */

import { backtestQqqRotation, getQqqRotationParams } from '../strategies/qqqRotation.js';
import { calcMetrics, calcCompositeScores } from '../../etf/strategies/metrics.js';

/**
 * 运行 QQQ 成分股轮转全量参数搜索
 *
 * @param {Map}      histData     Map<sym, {closes, opens}>
 * @param {number[]} timestamps
 * @param {number}   startIdx
 * @param {number}   endIdx
 * @param {Function} onProgress  (done, total) => void
 * @returns {Array}  所有结果，含综合评分，按评分降序
 */
export async function runQqqGridSearch(
  histData, timestamps,
  startIdx = 0, endIdx = null,
  onProgress = null
) {
  const allParams = getQqqRotationParams(); // 144种
  const total     = allParams.length;
  const rawResults = [];

  for (let idx = 0; idx < total; idx++) {
    // 每 10 个组合让浏览器喘气
    if (idx % 10 === 0) {
      await new Promise(r => setTimeout(r, 0));
      onProgress?.(idx, total);
    }

    try {
      const bt = backtestQqqRotation(histData, timestamps, allParams[idx], startIdx, endIdx);
      if (!bt || bt.equityCurve.length < 50) continue;

      const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
      if (!metrics) continue;

      rawResults.push({
        params:      allParams[idx],
        ...metrics,
        tradeLog:    bt.tradeLog,
        equityCurve: bt.equityCurve,
        timestamps:  bt.timestamps,
      });
    } catch (e) {
      console.warn('QQQ grid search combo failed:', allParams[idx], e);
    }
  }

  onProgress?.(total, total);

  if (rawResults.length === 0) return [];

  // 百分位综合评分
  const scores = calcCompositeScores(rawResults);
  rawResults.forEach((r, i) => { r.compositeScore = scores[i]; });

  // 降序排列
  rawResults.sort((a, b) => b.compositeScore - a.compositeScore);

  return rawResults;
}
