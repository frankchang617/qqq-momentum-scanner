/**
 * momentum.js — 策略1：强势轮动回测（纯函数）
 *
 * 规则：
 *  - ETF 池：QQQ、SPY、XLK、DXJ、TLT、GLD、SHY、TSM、SOXX
 *  - 每月末（每 21 个交易日）计算各 ETF 过去 lookback 天的收益率
 *  - 买入排名前 topN 名，等权持有
 *  - 若所有资产动能均为负，切换到 defensiveAsset（SHY / GLD / CASH）
 *  - 信号：T-1 收盘；执行：T 收盘（月调仓：月末最后一天计算信号，次个交易日执行）
 *
 * @param {Object} closes        { QQQ: number[], SPY: number[], ... } 已对齐的 adjclose 数组
 * @param {number[]} timestamps  对齐后的 Unix 时间戳（秒）
 * @param {Object} params        { lookback: number, topN: number, defensiveAsset: 'SHY'|'GLD'|'CASH' }
 * @param {number} startIdx      回测起始索引（含）
 * @param {number} endIdx        回测终止索引（不含）
 * @returns {{ equityCurve, timestamps, tradeLog, positions }}
 */

export const MOMENTUM_UNIVERSE = ['QQQ','SPY','XLK','DXJ','TLT','GLD','SHY','TSM','SOXX'];
export const MOMENTUM_PARAM_GRID = {
  lookback:        [21, 63, 126, 252],   // 1M, 3M, 6M, 12M
  topN:            [1, 2, 3],
  defensiveAsset:  ['SHY', 'GLD', 'CASH'],
};

export function backtestMomentum(closes, timestamps, params, startIdx = 0, endIdx = null) {
  const { lookback = 63, topN = 1, defensiveAsset = 'SHY' } = params;
  const N = endIdx ?? timestamps.length;
  const REBAL_FREQ = 21; // 每月调仓

  // 需要足够的历史数据来计算动能信号
  // 从 startIdx 开始，但实际回测需要 lookback 天的预热期
  const warmup = lookback + 1;
  const backtestStart = Math.max(startIdx, warmup);

  const equityCurve = [];
  const ts = [];
  const tradeLog = [];
  const positions = []; // 每天持仓快照

  let equity = 1.0;
  // 当前持仓：{ symbol: weight } 例如 { QQQ: 0.5, SPY: 0.5 }
  let currentWeights = {};
  let nextRebalDay = backtestStart; // 下一次调仓的执行日

  for (let i = backtestStart; i < N; i++) {
    // ── 调仓逻辑（在 nextRebalDay 执行）──
    if (i === nextRebalDay) {
      // 用 i-1 的收盘计算信号（T-1 信号，T 执行）
      const sigIdx = i - 1;
      const newWeights = calcMomentumWeights(closes, sigIdx, lookback, topN, defensiveAsset);

      // 记录换仓日志
      const prevSyms = Object.keys(currentWeights).sort().join(',');
      const newSyms  = Object.keys(newWeights).sort().join(',');
      if (prevSyms !== newSyms || i === backtestStart) {
        tradeLog.push({
          date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          ts: timestamps[i],
          action: 'REBAL',
          from: currentWeights,
          to: newWeights,
          equityBefore: equity,
        });
      }
      currentWeights = newWeights;
      nextRebalDay = i + REBAL_FREQ;
    }

    // ── 计算当日组合收益 ──
    if (i > backtestStart && Object.keys(currentWeights).length > 0) {
      let portReturn = 0;
      for (const [sym, w] of Object.entries(currentWeights)) {
        if (sym === 'CASH') continue; // 现金：0% 收益
        const prevClose = closes[sym]?.[i - 1];
        const currClose = closes[sym]?.[i];
        if (prevClose && currClose && prevClose > 0) {
          portReturn += w * (currClose / prevClose - 1);
        }
      }
      equity *= (1 + portReturn);
    }

    equityCurve.push(equity);
    ts.push(timestamps[i]);
    positions.push({ ...currentWeights });
  }

  return { equityCurve, timestamps: ts, tradeLog, positions };
}

/**
 * 计算某一天各资产动能，返回持仓权重
 * @param {Object} closes
 * @param {number} sigIdx   信号计算截止索引（含，用 sigIdx 和更早的数据）
 * @param {number} lookback 回看天数
 * @param {number} topN     持仓数量
 * @param {string} defensiveAsset
 * @returns {Object} weights: { symbol: weight }
 */
function calcMomentumWeights(closes, sigIdx, lookback, topN, defensiveAsset) {
  const scores = [];

  for (const sym of MOMENTUM_UNIVERSE) {
    const arr = closes[sym];
    if (!arr || sigIdx < lookback || arr[sigIdx] == null || arr[sigIdx - lookback] == null) continue;
    const ret = arr[sigIdx] / arr[sigIdx - lookback] - 1;
    scores.push({ sym, ret });
  }

  if (scores.length === 0) {
    return defensiveWeight(defensiveAsset, closes);
  }

  // 降序排列
  scores.sort((a, b) => b.ret - a.ret);

  // 判断是否全部为负动能
  const allNegative = scores.every(s => s.ret < 0);
  if (allNegative) {
    return defensiveWeight(defensiveAsset, closes);
  }

  // 取前 topN 名（只取正动能的）
  const chosen = scores.slice(0, topN).filter(s => s.ret >= 0);
  if (chosen.length === 0) {
    return defensiveWeight(defensiveAsset, closes);
  }

  const weight = 1 / chosen.length;
  const weights = {};
  chosen.forEach(({ sym }) => { weights[sym] = weight; });
  return weights;
}

function defensiveWeight(defensiveAsset, closes) {
  if (defensiveAsset === 'CASH') return { CASH: 1.0 };
  // SHY 或 GLD 必须在 closes 中
  if (closes[defensiveAsset]) return { [defensiveAsset]: 1.0 };
  return { CASH: 1.0 }; // 兜底
}
