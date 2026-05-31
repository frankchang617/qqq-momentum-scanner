/**
 * spyRotation.js — SPY 成分股轮转回测（纯函数）
 *
 * 规则：
 *  - 标的池：S&P 500 代表性成分股（~100只大市值股）
 *  - 每隔 rebalFreq 个交易日，计算各股票过去 lookback 天涨幅
 *  - 等权持有涨幅排名前 topN 名（仅正动能）
 *  - 全部动能为负 → 切换到 defensiveAsset
 *  - 市场过滤（可选）：SPY 收盘 < SMA200 → 切换到 defensiveAsset
 *  - 执行：T 收盘信号 → T+1 开盘执行（MOO）
 *
 * 参数网格：与 QQQ 轮转策略一致，共 288 种组合
 */

export const SPY_ROTATION_PARAM_GRID = {
  lookback:       [20, 21, 50, 63, 126, 200],
  topN:           [1, 3, 5, 10],
  rebalFreq:      [5, 10, 21],
  marketFilter:   [false, true],
  defensiveAsset: ['CASH', 'SPY', 'SHY'],
};

export function getSpyRotationParams() {
  const result = [];
  for (const lookback of SPY_ROTATION_PARAM_GRID.lookback) {
    for (const topN of SPY_ROTATION_PARAM_GRID.topN) {
      for (const rebalFreq of SPY_ROTATION_PARAM_GRID.rebalFreq) {
        result.push({ lookback, topN, rebalFreq, marketFilter: false, defensiveAsset: 'CASH' });
        for (const defensiveAsset of SPY_ROTATION_PARAM_GRID.defensiveAsset) {
          result.push({ lookback, topN, rebalFreq, marketFilter: true, defensiveAsset });
        }
      }
    }
  }
  return result; // 72 + 216 = 288种
}

/**
 * SPY 成分股轮转回测
 *
 * @param {Map}      histData     Map<sym, {closes, opens}>，'__SPY__' 为 SPY ETF，'SHY' 为短债
 * @param {number[]} timestamps   对齐后的 Unix 时间戳（秒）
 * @param {Object}   params       { lookback, topN, rebalFreq, marketFilter, defensiveAsset }
 * @param {number}   startIdx     回测起始索引
 * @param {number}   endIdx       回测终止索引（null = 全程）
 */
export function backtestSpyRotation(histData, timestamps, params, startIdx = 0, endIdx = null) {
  const {
    lookback       = 63,
    topN           = 5,
    rebalFreq      = 21,
    marketFilter   = false,
    defensiveAsset = 'CASH',
  } = params;

  const spyData   = histData.get('__SPY__');
  const spyCloses = spyData?.closes ?? spyData;
  const spyOpens  = spyData?.opens  ?? null;

  const shyData   = histData.get('SHY');
  const shyCloses = shyData?.closes ?? shyData ?? null;
  const shyOpens  = shyData?.opens  ?? null;

  const symbols = [...histData.keys()].filter(k => k !== '__SPY__' && k !== 'SHY');

  const symCloses = new Map();
  const symOpens  = new Map();
  for (const sym of symbols) {
    const d = histData.get(sym);
    if (d && d.closes) { symCloses.set(sym, d.closes); symOpens.set(sym, d.opens ?? null); }
    else               { symCloses.set(sym, d);        symOpens.set(sym, null); }
  }

  const N = endIdx ?? timestamps.length;
  const warmup = Math.max(lookback, marketFilter ? 200 : 0) + 1;
  const backtestStart = Math.max(startIdx, warmup);

  if (backtestStart >= N - 10) return null;

  const equityCurve = [];
  const ts          = [];
  const tradeLog    = [];

  let equity         = 1.0;
  let currentWeights = {};
  let nextRebalDay   = backtestStart;

  for (let i = backtestStart; i < N; i++) {
    const isRebalDay = i === nextRebalDay;

    if (isRebalDay) {
      // Step 1: 旧持仓隔夜收益（close[i-1] → open[i]）
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portRet = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const cl = _getCl(sym, spyCloses, shyCloses, symCloses);
          const op = _getOp(sym, spyOpens,  shyOpens,  symOpens);
          const prevClose = cl?.[i - 1];
          const currOpen  = op?.[i] ?? cl?.[i];
          if (prevClose && currOpen && prevClose > 0) portRet += w * (currOpen / prevClose - 1);
        }
        equity *= (1 + portRet);
      }

      // Step 2: T-1 收盘信号 → 更新持仓
      const sigIdx    = i - 1;
      const newWeights = calcSpyWeights(
        symCloses, spyCloses, shyCloses,
        sigIdx, lookback, topN, marketFilter, defensiveAsset
      );

      const prevSyms = Object.keys(currentWeights).sort().join(',');
      const newSyms  = Object.keys(newWeights).sort().join(',');
      if (prevSyms !== newSyms || i === backtestStart) {
        tradeLog.push({
          date:         new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          ts:           timestamps[i],
          action:       'REBAL',
          from:         { ...currentWeights },
          to:           { ...newWeights },
          equityBefore: equity,
        });
      }
      currentWeights = newWeights;
      nextRebalDay   = i + rebalFreq;

      // Step 3: 新持仓日内收益（open[i] → close[i]）
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portRet = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const cl = _getCl(sym, spyCloses, shyCloses, symCloses);
          const op = _getOp(sym, spyOpens,  shyOpens,  symOpens);
          const currOpen  = op?.[i] ?? cl?.[i - 1];
          const currClose = cl?.[i];
          if (currOpen && currClose && currOpen > 0) portRet += w * (currClose / currOpen - 1);
        }
        equity *= (1 + portRet);
      }

    } else if (i > backtestStart && Object.keys(currentWeights).length > 0) {
      // 非调仓日：close[i-1] → close[i]
      let portRet = 0;
      for (const [sym, w] of Object.entries(currentWeights)) {
        if (sym === 'CASH') continue;
        const cl   = _getCl(sym, spyCloses, shyCloses, symCloses);
        const prev = cl?.[i - 1];
        const curr = cl?.[i];
        if (prev && curr && prev > 0) portRet += w * (curr / prev - 1);
      }
      equity *= (1 + portRet);
    }

    equityCurve.push(equity);
    ts.push(timestamps[i]);
  }

  return { equityCurve, timestamps: ts, tradeLog };
}

function _getCl(sym, spyCloses, shyCloses, symCloses) {
  if (sym === 'SPY') return spyCloses;
  if (sym === 'SHY') return shyCloses;
  return symCloses.get(sym);
}
function _getOp(sym, spyOpens, shyOpens, symOpens) {
  if (sym === 'SPY') return spyOpens;
  if (sym === 'SHY') return shyOpens;
  return symOpens.get(sym);
}

function calcSpyWeights(symCloses, spyCloses, shyCloses, sigIdx, lookback, topN, marketFilter, defensiveAsset) {
  if (marketFilter && sigIdx >= 200) {
    let sum = 0, count = 0;
    for (let k = sigIdx - 199; k <= sigIdx; k++) {
      if (spyCloses[k] != null) { sum += spyCloses[k]; count++; }
    }
    if (count === 200 && spyCloses[sigIdx] < sum / 200) {
      return toDefensive(defensiveAsset, shyCloses);
    }
  }

  const scores = [];
  for (const [sym, closes] of symCloses.entries()) {
    if (!closes || sigIdx < lookback) continue;
    const curr = closes[sigIdx], prev = closes[sigIdx - lookback];
    if (curr == null || prev == null || prev === 0) continue;
    scores.push({ sym, ret: curr / prev - 1 });
  }

  if (scores.length === 0) return toDefensive(defensiveAsset, shyCloses);

  scores.sort((a, b) => b.ret - a.ret);
  const chosen = scores.slice(0, topN).filter(s => s.ret > 0);

  if (chosen.length === 0) return toDefensive(defensiveAsset, shyCloses);

  const w = 1 / chosen.length;
  const weights = {};
  chosen.forEach(({ sym }) => { weights[sym] = w; });
  return weights;
}

function toDefensive(defensiveAsset, shyCloses) {
  if (defensiveAsset === 'SPY')              return { SPY: 1.0 };
  if (defensiveAsset === 'SHY' && shyCloses) return { SHY: 1.0 };
  return { CASH: 1.0 };
}

export function buildSpyBenchmark(spyCloses, startIdx, endIdx) {
  const N = endIdx ?? spyCloses.length;
  const equityCurve = [];
  let equity = 1.0;
  for (let t = startIdx; t < N; t++) {
    if (t > startIdx && spyCloses[t] && spyCloses[t - 1])
      equity *= spyCloses[t] / spyCloses[t - 1];
    equityCurve.push(equity);
  }
  return equityCurve;
}

export function paramLabelSpy(p) {
  if (!p) return '—';
  const lb   = { 20: '20D', 21: '1M', 50: '50D', 63: '3M', 126: '6M', 200: '200D' }[p.lookback] ?? `${p.lookback}D`;
  const freq = { 5: '周调仓', 10: '双周调仓', 21: '月调仓' }[p.rebalFreq] ?? `${p.rebalFreq}D`;
  const parts = [`回看${lb}`, `Top${p.topN}`, freq];
  if (p.marketFilter) parts.push(`防御=${p.defensiveAsset}`);
  else                parts.push('无过滤');
  return parts.join(' · ');
}
