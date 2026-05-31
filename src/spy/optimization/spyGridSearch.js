/**
 * spyGridSearch.js — SPY 成分股轮转参数网格搜索
 *
 * 遍历全量 288 种参数组合，计算回测指标，按综合评分降序返回。
 * 综合评分：Sharpe×40% + MDD×35% + CAGR×25%
 */

import { backtestSpyRotation, getSpyRotationParams } from '../strategies/spyRotation.js';
import { calcMetrics, calcCompositeScores } from '../../etf/strategies/metrics.js';

export async function runSpyGridSearch(
  histData, timestamps,
  startIdx = 0, endIdx = null,
  onProgress = null
) {
  const allParams  = getSpyRotationParams();
  const total      = allParams.length;
  const rawResults = [];

  for (let idx = 0; idx < total; idx++) {
    if (idx % 10 === 0) {
      await new Promise(r => setTimeout(r, 0));
      onProgress?.(idx, total);
    }
    try {
      const bt = backtestSpyRotation(histData, timestamps, allParams[idx], startIdx, endIdx);
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
      console.warn('SPY grid search combo failed:', allParams[idx], e);
    }
  }

  onProgress?.(total, total);
  if (rawResults.length === 0) return [];

  const scores = calcCompositeScores(rawResults);
  rawResults.forEach((r, i) => { r.compositeScore = scores[i]; });
  rawResults.sort((a, b) => b.compositeScore - a.compositeScore);
  return rawResults;
}
