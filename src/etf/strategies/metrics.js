/**
 * metrics.js — 绩效指标计算（纯函数，无副作用）
 *
 * 所有函数输入：
 *   equityCurve : number[]  净值数组，初始值通常为 1.0
 *   timestamps  : number[]  对应的 Unix 时间戳（秒）
 */

/** 辅助：格式化 "YYYY-MM" */
function fmtYM(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 计算完整绩效指标
 * @returns {{
 *   cagr: number,
 *   sharpe: number,
 *   mdd: number,          // 负数，例如 -0.23 表示 -23%
 *   totalReturn: number,
 *   annualReturns: Object, // { "2021": 0.32, ... }
 *   monthlyReturns: Object,// { "2021-03": 0.05, ... }
 *   drawdownCurve: number[],
 *   equityCurve: number[],
 *   timestamps: number[]
 * }}
 */
export function calcMetrics(equityCurve, timestamps) {
  const n = equityCurve.length;
  if (n < 2) return null;

  // ── Total Return ──
  const totalReturn = equityCurve[n - 1] / equityCurve[0] - 1;

  // ── CAGR ──
  const years = (timestamps[n - 1] - timestamps[0]) / (365.25 * 24 * 3600);
  const cagr = years > 0.01
    ? Math.pow(equityCurve[n - 1] / equityCurve[0], 1 / years) - 1
    : 0;

  // ── Daily Returns ──
  const dailyRets = [];
  for (let i = 1; i < n; i++) {
    const prev = equityCurve[i - 1];
    if (prev > 0) dailyRets.push(equityCurve[i] / prev - 1);
  }

  // ── Sharpe（年化，无风险利率=0）──
  let sharpe = 0;
  if (dailyRets.length > 1) {
    const mean = dailyRets.reduce((s, r) => s + r, 0) / dailyRets.length;
    const variance = dailyRets.reduce((s, r) => s + (r - mean) ** 2, 0) / dailyRets.length;
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
  }

  // ── MDD（最大回撤，负数）──
  let peak = equityCurve[0];
  let mdd = 0;
  const drawdownCurve = [0];
  for (let i = 1; i < n; i++) {
    if (equityCurve[i] > peak) peak = equityCurve[i];
    const dd = peak > 0 ? (equityCurve[i] - peak) / peak : 0;
    if (dd < mdd) mdd = dd;
    drawdownCurve.push(dd);
  }

  // ── 年度收益 ──
  const annualReturns = {};
  let yrStart = { idx: 0, year: new Date(timestamps[0] * 1000).getFullYear() };
  for (let i = 1; i < n; i++) {
    const yr = new Date(timestamps[i] * 1000).getFullYear();
    if (yr !== yrStart.year) {
      annualReturns[yrStart.year] = equityCurve[i - 1] / equityCurve[yrStart.idx] - 1;
      yrStart = { idx: i, year: yr };
    }
    if (i === n - 1) {
      annualReturns[yr] = (annualReturns[yr] !== undefined)
        ? annualReturns[yr]
        : equityCurve[i] / equityCurve[yrStart.idx] - 1;
    }
  }

  // ── 月度收益 ──
  const monthlyReturns = {};
  let moStart = { idx: 0, key: fmtYM(timestamps[0]) };
  for (let i = 1; i < n; i++) {
    const key = fmtYM(timestamps[i]);
    if (key !== moStart.key) {
      monthlyReturns[moStart.key] = equityCurve[i - 1] / equityCurve[moStart.idx] - 1;
      moStart = { idx: i, key };
    }
    if (i === n - 1) {
      if (monthlyReturns[key] === undefined) {
        monthlyReturns[key] = equityCurve[i] / equityCurve[moStart.idx] - 1;
      }
    }
  }

  return {
    cagr,
    sharpe,
    mdd,
    totalReturn,
    annualReturns,
    monthlyReturns,
    drawdownCurve,
    equityCurve,
    timestamps,
  };
}

/**
 * 计算买持基准绩效（QQQ 或 SPY）
 * @param {Object} closes   { QQQ: number[], SPY: number[], ... }
 * @param {number[]} timestamps
 * @param {string} symbol
 * @param {number} startIdx
 * @param {number} endIdx
 */
export function calcBenchmark(closes, timestamps, symbol, startIdx = 0, endIdx = null) {
  const end = endIdx ?? timestamps.length;
  const prices = closes[symbol].slice(startIdx, end);
  const ts = timestamps.slice(startIdx, end);
  if (!prices || prices.length < 2) return null;
  const base = prices[0];
  const equity = prices.map(p => p / base);
  return calcMetrics(equity, ts);
}

/**
 * 百分位排名辅助：给定数组，返回每个元素在数组中的百分位（0~1）
 * higherBetter=true: 值越大 → 百分位越高
 * higherBetter=false: 值越小 → 百分位越高（用于 MDD：越接近0越好）
 */
export function percentileRanks(values, higherBetter = true) {
  const n = values.length;
  if (n === 0) return [];
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => higherBetter ? a.v - b.v : b.v - a.v);
  const ranks = new Array(n);
  indexed.forEach(({ i }, rank) => {
    ranks[i] = n > 1 ? rank / (n - 1) : 1;
  });
  return ranks;
}

/**
 * 综合评分（百分位加权）
 * Score = Sharpe_pct × 0.40 + MDD_pct × 0.35 + CAGR_pct × 0.25
 *
 * @param {Array<{sharpe, mdd, cagr}>} results
 * @returns {number[]} 每条结果的综合得分（0~1）
 */
export function calcCompositeScores(results) {
  const sharpes = results.map(r => r.sharpe);
  const mdds    = results.map(r => r.mdd);   // 负数，越接近0越好 → higherBetter=true
  const cagrs   = results.map(r => r.cagr);

  const sharpePcts = percentileRanks(sharpes, true);
  const mddPcts    = percentileRanks(mdds, true);   // mdd=-0.05 排名高，mdd=-0.35 排名低
  const cagrPcts   = percentileRanks(cagrs, true);

  return results.map((_, i) =>
    sharpePcts[i] * 0.40 + mddPcts[i] * 0.35 + cagrPcts[i] * 0.25
  );
}
