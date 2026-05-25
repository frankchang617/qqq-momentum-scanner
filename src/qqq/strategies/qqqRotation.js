/**
 * qqqRotation.js — QQQ 成分股轮转回测（纯函数）
 *
 * 规则：
 *  - 标的池：QQQ 全部成分股（~90只）
 *  - 每隔 rebalFreq 个交易日，计算各股票过去 lookback 天涨幅
 *  - 等权持有涨幅排名前 topN 名（仅正动能）
 *  - 全部动能为负 → 切换到 defensiveAsset
 *  - 市场过滤（可选）：QQQ 收盘 < SMA200 → 切换到 defensiveAsset
 *  - 执行：T 收盘信号 → T+1 开盘执行（MOO）
 *
 * 参数网格：
 *   lookback × 6 × topN × 4 × rebalFreq × 3 × marketFilter × 2 × defensiveAsset × 3
 *   filter=false: 6×4×3 = 72种
 *   filter=true:  6×4×3×3 = 216种
 *   合计：288种
 */

export const QQQ_ROTATION_PARAM_GRID = {
  lookback:       [20, 21, 50, 63, 126, 200], // 20D, 1M, 50D, 3M, 6M, 200D
  topN:           [1, 3, 5, 10],
  rebalFreq:      [5, 10, 21],            // 周、双周、月
  marketFilter:   [false, true],
  defensiveAsset: ['CASH', 'QQQ', 'SHY'],
};

/**
 * 生成有效参数组合列表（288种）
 */
export function getQqqRotationParams() {
  const result = [];
  for (const lookback of QQQ_ROTATION_PARAM_GRID.lookback) {
    for (const topN of QQQ_ROTATION_PARAM_GRID.topN) {
      for (const rebalFreq of QQQ_ROTATION_PARAM_GRID.rebalFreq) {
        // 过滤器关闭：防御资产无意义，统一用 CASH
        result.push({ lookback, topN, rebalFreq, marketFilter: false, defensiveAsset: 'CASH' });
        // 过滤器开启：3种防御资产
        for (const defensiveAsset of QQQ_ROTATION_PARAM_GRID.defensiveAsset) {
          result.push({ lookback, topN, rebalFreq, marketFilter: true, defensiveAsset });
        }
      }
    }
  }
  return result; // 72 + 216 = 288种
}

/**
 * QQQ 成分股轮转回测
 *
 * @param {Map}      histData     Map<sym, {closes, opens}>，'__QQQ__' 为 QQQ ETF，'SHY' 为短债
 * @param {number[]} timestamps   对齐后的 Unix 时间戳（秒）
 * @param {Object}   params       { lookback, topN, rebalFreq, marketFilter, defensiveAsset }
 * @param {number}   startIdx     回测起始索引
 * @param {number}   endIdx       回测终止索引（null = 全程）
 * @returns {{ equityCurve, timestamps, tradeLog } | null}
 */
export function backtestQqqRotation(histData, timestamps, params, startIdx = 0, endIdx = null) {
  const {
    lookback       = 63,
    topN           = 5,
    rebalFreq      = 21,
    marketFilter   = false,
    defensiveAsset = 'CASH',
  } = params;

  // QQQ ETF 数据（用于 SMA200 过滤和基准）
  const qqqData   = histData.get('__QQQ__');
  const qqqCloses = qqqData?.closes ?? qqqData;
  const qqqOpens  = qqqData?.opens  ?? null;

  // SHY 数据（防御用）
  const shyData   = histData.get('SHY');
  const shyCloses = shyData?.closes ?? shyData ?? null;
  const shyOpens  = shyData?.opens  ?? null;

  // 成分股（排除 __QQQ__ 和 SHY）
  const symbols = [...histData.keys()].filter(k => k !== '__QQQ__' && k !== 'SHY');

  // 预提取 closes/opens（兼容 {closes,opens} 对象和旧版 flat array）
  const symCloses = new Map();
  const symOpens  = new Map();
  for (const sym of symbols) {
    const d = histData.get(sym);
    if (d && d.closes) { symCloses.set(sym, d.closes); symOpens.set(sym, d.opens ?? null); }
    else               { symCloses.set(sym, d);        symOpens.set(sym, null); }
  }

  const N = endIdx ?? timestamps.length;
  // 预热期：SMA200 需要 200 天，lookback 本身也需要
  const warmup = Math.max(lookback, marketFilter ? 200 : 0) + 1;
  const backtestStart = Math.max(startIdx, warmup);

  if (backtestStart >= N - 10) return null;

  const equityCurve = [];
  const ts          = [];
  const tradeLog    = [];

  let equity        = 1.0;
  let currentWeights = {};
  let nextRebalDay  = backtestStart;

  for (let i = backtestStart; i < N; i++) {
    const isRebalDay = i === nextRebalDay;

    if (isRebalDay) {
      // ── Step 1：旧持仓隔夜收益（close[i-1] → open[i]）──
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portRet = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const cl = _getCl(sym, qqqCloses, shyCloses, symCloses);
          const op = _getOp(sym, qqqOpens,  shyOpens,  symOpens);
          const prevClose = cl?.[i - 1];
          const currOpen  = op?.[i] ?? cl?.[i];
          if (prevClose && currOpen && prevClose > 0) portRet += w * (currOpen / prevClose - 1);
        }
        equity *= (1 + portRet);
      }

      // ── Step 2：T-1 收盘信号 → 更新持仓 ──
      const sigIdx = i - 1;
      const newWeights = calcQqqWeights(
        symCloses, qqqCloses, shyCloses,
        sigIdx, lookback, topN, marketFilter, defensiveAsset
      );

      const prevSyms = Object.keys(currentWeights).sort().join(',');
      const newSyms  = Object.keys(newWeights).sort().join(',');
      if (prevSyms !== newSyms || i === backtestStart) {
        tradeLog.push({
          date:        new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          ts:          timestamps[i],
          action:      'REBAL',
          from:        { ...currentWeights },
          to:          { ...newWeights },
          equityBefore: equity,
        });
      }
      currentWeights = newWeights;
      nextRebalDay   = i + rebalFreq;

      // ── Step 3：新持仓日内收益（open[i] → close[i]）──
      if (i > backtestStart && Object.keys(currentWeights).length > 0) {
        let portRet = 0;
        for (const [sym, w] of Object.entries(currentWeights)) {
          if (sym === 'CASH') continue;
          const cl = _getCl(sym, qqqCloses, shyCloses, symCloses);
          const op = _getOp(sym, qqqOpens,  shyOpens,  symOpens);
          const currOpen  = op?.[i] ?? cl?.[i - 1];
          const currClose = cl?.[i];
          if (currOpen && currClose && currOpen > 0) portRet += w * (currClose / currOpen - 1);
        }
        equity *= (1 + portRet);
      }

    } else if (i > backtestStart && Object.keys(currentWeights).length > 0) {
      // ── 非调仓日：close[i-1] → close[i] ──
      let portRet = 0;
      for (const [sym, w] of Object.entries(currentWeights)) {
        if (sym === 'CASH') continue;
        const cl   = _getCl(sym, qqqCloses, shyCloses, symCloses);
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

// ── 辅助：获取 closes/opens 数组 ──
function _getCl(sym, qqqCloses, shyCloses, symCloses) {
  if (sym === 'QQQ') return qqqCloses;
  if (sym === 'SHY') return shyCloses;
  return symCloses.get(sym);
}
function _getOp(sym, qqqOpens, shyOpens, symOpens) {
  if (sym === 'QQQ') return qqqOpens;
  if (sym === 'SHY') return shyOpens;
  return symOpens.get(sym);
}

/**
 * 计算某时刻的持仓权重
 */
function calcQqqWeights(symCloses, qqqCloses, shyCloses, sigIdx, lookback, topN, marketFilter, defensiveAsset) {
  // 市场过滤：QQQ < SMA200 → 防御
  if (marketFilter && sigIdx >= 200) {
    let sum = 0, count = 0;
    for (let k = sigIdx - 199; k <= sigIdx; k++) {
      if (qqqCloses[k] != null) { sum += qqqCloses[k]; count++; }
    }
    if (count === 200 && qqqCloses[sigIdx] < sum / 200) {
      return toDefensive(defensiveAsset, shyCloses);
    }
  }

  // 计算各股票动能
  const scores = [];
  for (const [sym, closes] of symCloses.entries()) {
    if (!closes || sigIdx < lookback) continue;
    const curr = closes[sigIdx], prev = closes[sigIdx - lookback];
    if (curr == null || prev == null || prev === 0) continue;
    scores.push({ sym, ret: curr / prev - 1 });
  }

  if (scores.length === 0) return toDefensive(defensiveAsset, shyCloses);

  scores.sort((a, b) => b.ret - a.ret);
  const chosen = scores.slice(0, topN).filter(s => s.ret > 0); // 只取正动能

  if (chosen.length === 0) return toDefensive(defensiveAsset, shyCloses);

  const w = 1 / chosen.length;
  const weights = {};
  chosen.forEach(({ sym }) => { weights[sym] = w; });
  return weights;
}

function toDefensive(defensiveAsset, shyCloses) {
  if (defensiveAsset === 'QQQ')              return { QQQ: 1.0 };
  if (defensiveAsset === 'SHY' && shyCloses) return { SHY: 1.0 };
  return { CASH: 1.0 };
}

/**
 * 计算 QQQ 买入持有基准净值曲线
 */
export function buildQqqBenchmark(qqqCloses, startIdx, endIdx) {
  const N = endIdx ?? qqqCloses.length;
  const equityCurve = [];
  let equity = 1.0;
  for (let t = startIdx; t < N; t++) {
    if (t > startIdx && qqqCloses[t] && qqqCloses[t - 1])
      equity *= qqqCloses[t] / qqqCloses[t - 1];
    equityCurve.push(equity);
  }
  return equityCurve;
}

/**
 * 格式化参数标签
 */
export function paramLabelQqq(p) {
  if (!p) return '—';
  const lb   = { 20: '20D', 21: '1M', 50: '50D', 63: '3M', 126: '6M', 200: '200D' }[p.lookback] ?? `${p.lookback}D`;
  const freq = { 5: '周调仓', 10: '双周调仓', 21: '月调仓' }[p.rebalFreq] ?? `${p.rebalFreq}D`;
  const parts = [`回看${lb}`, `Top${p.topN}`, freq];
  if (p.marketFilter) parts.push(`防御=${p.defensiveAsset}`);
  else                parts.push('无过滤');
  return parts.join(' · ');
}
