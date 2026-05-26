/**
 * gridSearch.js — 一键优化：遍历三个策略的全量参数组合
 *
 * 参数网格：
 *   策略1 强势轮动：lookback×7 × topN×3 × defensiveAsset×3 = 63种
 *   策略2 双动能：  lookback×6 × maFilter×2 × defensiveAsset×3 = 36种
 *   策略3 波动率控管：有效组合 = 32种（低阈值<高阈值约束）
 *   合计：131种
 *
 * 综合评分（百分位加权）：
 *   Score = Sharpe_pct × 0.40 + MDD_pct × 0.35 + CAGR_pct × 0.25
 */

import { backtestMomentum, MOMENTUM_PARAM_GRID } from '../strategies/momentum.js';
import { backtestDualMomentum, DUAL_MOMENTUM_PARAM_GRID } from '../strategies/dualMomentum.js';
import { backtestVolControl, getVolControlParams } from '../strategies/volControl.js';
import { calcMetrics, calcCompositeScores } from '../strategies/metrics.js';

/**
 * 生成策略1参数组合列表
 */
export function getMomentumParams() {
  const result = [];
  for (const lookback of MOMENTUM_PARAM_GRID.lookback) {
    for (const topN of MOMENTUM_PARAM_GRID.topN) {
      for (const defensiveAsset of MOMENTUM_PARAM_GRID.defensiveAsset) {
        result.push({ strategy: 'momentum', lookback, topN, defensiveAsset });
      }
    }
  }
  return result; // 63种
}

/**
 * 生成策略2参数组合列表
 */
export function getDualMomentumParams() {
  const result = [];
  for (const lookback of DUAL_MOMENTUM_PARAM_GRID.lookback) {
    for (const maFilter of DUAL_MOMENTUM_PARAM_GRID.maFilter) {
      for (const defensiveAsset of DUAL_MOMENTUM_PARAM_GRID.defensiveAsset) {
        result.push({ strategy: 'dualMomentum', lookback, maFilter, defensiveAsset });
      }
    }
  }
  return result; // 36种
}

/**
 * 生成策略3参数组合列表
 */
export function getVolParams() {
  return getVolControlParams().map(p => ({ strategy: 'volControl', ...p }));
  // ~32种（有效组合）
}

/**
 * 运行所有参数组合（Grid Search）
 *
 * @param {Object}   closes          { QQQ: [], SPY: [], ... }
 * @param {number[]} timestamps      对齐后的时间戳
 * @param {number[]} vix             VIX 数组（可含 null）
 * @param {number[]} qqqVol20        QQQ 自算波动率数组
 * @param {number}   startIdx        回测起始索引
 * @param {number}   endIdx          回测终止索引（null=全程）
 * @param {Function} onProgress      进度回调 (done, total) => void
 * @param {Object}   opens           开盘价数据（可选）
 * @param {string|null} strategyFilter  策略过滤：'momentum'|'dualMomentum'|'volControl'|null（null=全部）
 * @returns {Array} 所有结果，含综合评分，按评分降序
 */
export async function runGridSearch(
  closes, timestamps, vix, qqqVol20,
  startIdx = 0, endIdx = null,
  onProgress = null, opens = null,
  strategyFilter = null
) {
  let allParams = [
    ...getMomentumParams(),
    ...getDualMomentumParams(),
    ...getVolParams(),
  ];

  // 按策略过滤（WFO 模式下仅跑选中策略）
  if (strategyFilter) {
    allParams = allParams.filter(p => p.strategy === strategyFilter);
  }

  const total = allParams.length;
  const rawResults = [];

  for (let idx = 0; idx < total; idx++) {
    const p = allParams[idx];

    // 让浏览器喘气：每 10 个组合 yield 一次
    if (idx % 10 === 0) {
      await new Promise(r => setTimeout(r, 0));
      onProgress?.(idx, total);
    }

    try {
      let bt;
      if (p.strategy === 'momentum') {
        bt = backtestMomentum(closes, timestamps, p, startIdx, endIdx, opens);
      } else if (p.strategy === 'dualMomentum') {
        bt = backtestDualMomentum(closes, timestamps, p, startIdx, endIdx, opens);
      } else {
        bt = backtestVolControl(closes, timestamps, vix, qqqVol20, p, startIdx, endIdx, opens);
      }

      if (!bt || bt.equityCurve.length < 50) continue;

      const metrics = calcMetrics(bt.equityCurve, bt.timestamps);
      if (!metrics) continue;

      rawResults.push({
        params: p,
        ...metrics,
        tradeLog: bt.tradeLog,
        equityCurve: bt.equityCurve,
        timestamps: bt.timestamps,
      });
    } catch (e) {
      // 单个组合失败不影响整体
      console.warn('gridSearch combo failed:', p, e);
    }
  }

  onProgress?.(total, total);

  if (rawResults.length === 0) return [];

  // ── 百分位综合评分 ──
  const scores = calcCompositeScores(rawResults);
  rawResults.forEach((r, i) => { r.compositeScore = scores[i]; });

  // 降序排列
  rawResults.sort((a, b) => b.compositeScore - a.compositeScore);

  return rawResults;
}

/**
 * 从 Grid Search 结果中提取各维度最优
 * @param {Array} results runGridSearch 的返回值
 * @returns {{
 *   bestSharpe, bestCagr, bestMdd, bestCalmar, bestComposite
 * }}
 */
export function extractBest(results) {
  if (!results || results.length === 0) return null;

  const bestSharpe    = results.reduce((best, r) => r.sharpe > best.sharpe ? r : best);
  const bestCagr      = results.reduce((best, r) => r.cagr > best.cagr ? r : best);
  // MDD 负数，越接近0越好
  const bestMdd       = results.reduce((best, r) => r.mdd > best.mdd ? r : best);
  const bestCalmar    = results.reduce((best, r) => {
    const ca = Math.abs(r.mdd) > 0.001 ? r.cagr / Math.abs(r.mdd) : 0;
    const cb = Math.abs(best.mdd) > 0.001 ? best.cagr / Math.abs(best.mdd) : 0;
    return ca > cb ? r : best;
  });
  const bestComposite = results[0]; // 已按 compositeScore 降序

  return { bestSharpe, bestCagr, bestMdd, bestCalmar, bestComposite };
}

/**
 * 将参数对象格式化为可读标签
 */
export function paramLabel(p) {
  if (!p) return '—';
  const stratName = {
    momentum:      '强势轮动',
    dualMomentum:  '双动能',
    volControl:    '波动率控管',
  }[p.strategy] ?? p.strategy;

  const parts = [stratName];

  if (p.lookback != null) {
    const lb = { 20:'20D', 21:'1M', 50:'50D', 63:'3M', 126:'6M', 200:'200D', 252:'12M' }[p.lookback] ?? `${p.lookback}D`;
    parts.push(`回看${lb}`);
  }
  if (p.topN != null) parts.push(`Top${p.topN}`);
  if (p.maFilter != null) parts.push(`MA${p.maFilter}`);
  if (p.volSource != null) parts.push(p.volSource === 'VIX' ? 'VIX' : '实现波动率');
  if (p.lowThreshold != null) parts.push(`低<${p.lowThreshold}%`);
  if (p.highThreshold != null) parts.push(`高>${p.highThreshold}%`);
  if (p.defensiveAsset != null) parts.push(`防御=${p.defensiveAsset}`);

  return parts.join(' · ');
}
