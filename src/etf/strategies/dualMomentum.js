/**
 * dualMomentum.js — 策略2：双动能回测（纯函数）
 *
 * 规则（Gary Antonacci 双动能框架）：
 *  - ETF 池：QQQ、SPY、XLK、DXJ、TLT、GLD、SHY、TSM（无 SOXX）
 *  - 每月末计算各 ETF 过去 lookback 天收益率
 *  - 选排名第1的 ETF（绝对动能 + 相对动能）
 *  - 附加趋势过滤：若该 ETF 收盘价低于 MA(maFilter)，改持防御资产
 *  - 防御：SHY / GLD / CASH
 *
 * 无未来数据：信号 T-1 收盘 → 执行 T 收盘
 */

export const DUAL_MOMENTUM_UNIVERSE = ['QQQ','SPY','XLK','DXJ','TLT','GLD','SHY','TSM'];
export const DUAL_MOMENTUM_PARAM_GRID = {
  lookback:       [63, 126, 252],       // 3M, 6M, 12M
  maFilter:       [100, 200],
  defensiveAsset: ['SHY', 'GLD', 'CASH'],
};

/**
 * @param {Object}   closes       { QQQ: number[], ... }
 * @param {number[]} timestamps
 * @param {Object}   params       { lookback, maFilter, defensiveAsset }
 * @param {number}   startIdx
 * @param {number}   endIdx
 */
export function backtestDualMomentum(closes, timestamps, params, startIdx = 0, endIdx = null, opens = null) {
  const { lookback = 126, maFilter = 200, defensiveAsset = 'SHY' } = params;
  const N = endIdx ?? timestamps.length;
  const REBAL_FREQ = 21;

  const warmup = Math.max(lookback, maFilter) + 1;
  const backtestStart = Math.max(startIdx, warmup);

  const equityCurve = [];
  const ts = [];
  const tradeLog = [];
  const positions = [];

  let equity = 1.0;
  let currentWeights = {};
  let nextRebalDay = backtestStart;

  for (let i = backtestStart; i < N; i++) {
    // ── 调仓日：3步执行 ──
    if (i === nextRebalDay) {

      // Step 1: 旧持仓从 close[i-1] → open[i] 的隔夜收益
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portReturn = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const prevClose = closes[sym]?.[i - 1];
          const currOpen  = opens?.[sym]?.[i] ?? closes[sym]?.[i];
          if (prevClose && currOpen && prevClose > 0) portReturn += w * (currOpen / prevClose - 1);
        }
        equity *= (1 + portReturn);
      }

      // Step 2: T-1 收盘信号 → 更新持仓
      const sigIdx = i - 1;
      const newWeights = calcDualMomentumWeights(closes, sigIdx, lookback, maFilter, defensiveAsset);
      const prevSyms = Object.keys(currentWeights).sort().join(',');
      const newSyms  = Object.keys(newWeights).sort().join(',');
      if (prevSyms !== newSyms || i === backtestStart) {
        tradeLog.push({
          date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          ts: timestamps[i], action: 'REBAL',
          from: currentWeights, to: newWeights, equityBefore: equity,
        });
      }
      currentWeights = newWeights;
      nextRebalDay = i + REBAL_FREQ;

      // Step 3: 新持仓从 open[i] → close[i] 的日内收益
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portReturn = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const currOpen  = opens?.[sym]?.[i] ?? closes[sym]?.[i - 1];
          const currClose = closes[sym]?.[i];
          if (currOpen && currClose && currOpen > 0) portReturn += w * (currClose / currOpen - 1);
        }
        equity *= (1 + portReturn);
      }

    } else if (i > backtestStart && Object.keys(currentWeights).length > 0) {
      // ── 非调仓日：close[i-1] → close[i] 收益 ──
      let portReturn = 0;
      for (const [sym, w] of Object.entries(currentWeights)) {
        if (sym === 'CASH') continue;
        const prev = closes[sym]?.[i - 1];
        const curr = closes[sym]?.[i];
        if (prev && curr && prev > 0) portReturn += w * (curr / prev - 1);
      }
      equity *= (1 + portReturn);
    }

    equityCurve.push(equity);
    ts.push(timestamps[i]);
    positions.push({ ...currentWeights });
  }

  return { equityCurve, timestamps: ts, tradeLog, positions };
}

function calcDualMomentumWeights(closes, sigIdx, lookback, maFilter, defensiveAsset) {
  const scores = [];

  for (const sym of DUAL_MOMENTUM_UNIVERSE) {
    const arr = closes[sym];
    if (!arr || sigIdx < lookback || arr[sigIdx] == null || arr[sigIdx - lookback] == null) continue;
    const ret = arr[sigIdx] / arr[sigIdx - lookback] - 1;
    scores.push({ sym, ret });
  }

  if (scores.length === 0) return defensive(defensiveAsset, closes);

  scores.sort((a, b) => b.ret - a.ret);
  const best = scores[0];

  // 绝对动能过滤：最强 ETF 自身动能为负 → 防御
  if (best.ret < 0) return defensive(defensiveAsset, closes);

  // 趋势过滤：最强 ETF 价格低于 MA(maFilter) → 防御
  const arr = closes[best.sym];
  if (!arr || sigIdx < maFilter) return defensive(defensiveAsset, closes);
  const ma = simpleMA(arr, sigIdx, maFilter);
  if (ma == null || arr[sigIdx] < ma) return defensive(defensiveAsset, closes);

  return { [best.sym]: 1.0 };
}

/** 简单均线（sigIdx 为最新，往前取 period 个点的均值）*/
function simpleMA(arr, sigIdx, period) {
  if (sigIdx < period - 1) return null;
  let sum = 0, count = 0;
  for (let i = sigIdx - period + 1; i <= sigIdx; i++) {
    if (arr[i] != null) { sum += arr[i]; count++; }
  }
  return count === period ? sum / count : null;
}

function defensive(defensiveAsset, closes) {
  if (defensiveAsset === 'CASH') return { CASH: 1.0 };
  if (closes[defensiveAsset]) return { [defensiveAsset]: 1.0 };
  return { CASH: 1.0 };
}
