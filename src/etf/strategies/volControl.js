/**
 * volControl.js — 策略3：波动率控管回测（纯函数）
 *
 * 规则：
 *  - 主资产：QQQ
 *  - 每日根据波动率调整仓位
 *  - 波动低（< lowThreshold）：100% QQQ
 *  - 波动中（lowThreshold ~ highThreshold）：50% QQQ + 50% 防御
 *  - 波动高（> highThreshold）：100% 防御（SHY / CASH）
 *
 * 波动率来源：
 *  - 'VIX'      ：真实 ^VIX 数据
 *  - 'REALIZED' ：QQQ 过去 20 日实现波动率（年化），公式：std(log returns) × √252
 *
 * 无未来数据：用 T-1 的波动率决定 T 的仓位
 *
 * 参数网格（低阈值 < 高阈值 约束）：
 *   volSource      : ['VIX', 'REALIZED']
 *   lowThreshold   : [15, 20, 25]  (%)
 *   highThreshold  : [25, 30, 35]  (%)
 *   defensiveAsset : ['SHY', 'CASH']
 */

export const VOL_CONTROL_PARAM_GRID = {
  volSource:      ['VIX', 'REALIZED'],
  lowThreshold:   [15, 20, 25],
  highThreshold:  [25, 30, 35],
  defensiveAsset: ['SHY', 'CASH'],
};

/** 生成有效参数组合（过滤 lowThreshold >= highThreshold 的情况）*/
export function getVolControlParams() {
  const result = [];
  for (const volSource of VOL_CONTROL_PARAM_GRID.volSource) {
    for (const lowThreshold of VOL_CONTROL_PARAM_GRID.lowThreshold) {
      for (const highThreshold of VOL_CONTROL_PARAM_GRID.highThreshold) {
        if (lowThreshold >= highThreshold) continue; // 无效组合
        for (const defensiveAsset of VOL_CONTROL_PARAM_GRID.defensiveAsset) {
          result.push({ volSource, lowThreshold, highThreshold, defensiveAsset });
        }
      }
    }
  }
  return result; // 8种 × 2 = 16种有效组合（每种 volSource）
}

/**
 * @param {Object}   closes       { QQQ: number[], SHY: number[], ... }
 * @param {number[]} timestamps
 * @param {number[]} vix          真实 VIX 数组（与 timestamps 对齐，可含 null）
 * @param {number[]} qqqVol20     QQQ 20日实现波动率数组（年化 %，与 timestamps 对齐）
 * @param {Object}   params       { volSource, lowThreshold, highThreshold, defensiveAsset }
 * @param {number}   startIdx
 * @param {number}   endIdx
 */
export function backtestVolControl(closes, timestamps, vix, qqqVol20, params, startIdx = 0, endIdx = null, opens = null) {
  const {
    volSource      = 'REALIZED',
    lowThreshold   = 20,
    highThreshold  = 30,
    defensiveAsset = 'SHY',
  } = params;

  const N = endIdx ?? timestamps.length;
  // 预热期：VIX 无需预热，REALIZED 需要至少 21 天
  const warmup = volSource === 'REALIZED' ? 21 : 1;
  const backtestStart = Math.max(startIdx, warmup);

  const equityCurve = [];
  const ts = [];
  const tradeLog = [];
  const positions = [];

  let equity = 1.0;
  let lastRegime = null; // 记录上一个 regime，用于换仓日志
  let prevWeights = {}; // 上一天的持仓权重（用于隔夜收益计算）

  for (let i = backtestStart; i < N; i++) {
    // ── 用 i-1 的波动率决定 i 的持仓（T-1 信号，T 开盘执行）──
    const sigIdx = i - 1;
    let vol = null;

    if (volSource === 'VIX') {
      vol = vix?.[sigIdx] ?? null;
    } else {
      vol = qqqVol20?.[sigIdx] ?? null;
    }

    let regime; // 'full' | 'half' | 'defensive'
    if (vol == null) {
      regime = 'full';
    } else if (vol < lowThreshold) {
      regime = 'full';
    } else if (vol <= highThreshold) {
      regime = 'half';
    } else {
      regime = 'defensive';
    }

    const weights = regimeToWeights(regime, defensiveAsset, closes);
    const regimeChanged = regime !== lastRegime;

    // 记录换手日志（regime 变化时）
    if (regimeChanged && lastRegime !== null) {
      tradeLog.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        ts: timestamps[i],
        action: 'REGIME_CHANGE',
        regime,
        vol: vol?.toFixed(1),
        from: regimeToWeights(lastRegime, defensiveAsset, closes),
        to: weights,
        equityBefore: equity,
      });
    }

    // ── 计算当日收益 ──
    if (i > backtestStart) {
      if (regimeChanged && opens) {
        // Regime 变化（调仓日）：2步执行
        // Step 1: 旧持仓 close[i-1] → open[i] 隔夜收益
        let portReturn = 0;
        for (const [sym, w] of Object.entries(prevWeights)) {
          if (sym === 'CASH') continue;
          const prevClose = closes[sym]?.[i - 1];
          const currOpen  = opens[sym]?.[i] ?? closes[sym]?.[i];
          if (prevClose && currOpen && prevClose > 0) portReturn += w * (currOpen / prevClose - 1);
        }
        equity *= (1 + portReturn);
        // Step 2: 新持仓 open[i] → close[i] 日内收益
        portReturn = 0;
        for (const [sym, w] of Object.entries(weights)) {
          if (sym === 'CASH') continue;
          const currOpen  = opens[sym]?.[i] ?? closes[sym]?.[i - 1];
          const currClose = closes[sym]?.[i];
          if (currOpen && currClose && currOpen > 0) portReturn += w * (currClose / currOpen - 1);
        }
        equity *= (1 + portReturn);
      } else {
        // Regime 不变（或无 open 数据）：close[i-1] → close[i]
        let portReturn = 0;
        for (const [sym, w] of Object.entries(weights)) {
          if (sym === 'CASH') continue;
          const prev = closes[sym]?.[i - 1];
          const curr = closes[sym]?.[i];
          if (prev && curr && prev > 0) portReturn += w * (curr / prev - 1);
        }
        equity *= (1 + portReturn);
      }
    }

    prevWeights = weights;
    lastRegime = regime;

    equityCurve.push(equity);
    ts.push(timestamps[i]);
    positions.push({ ...weights, regime, vol });
  }

  return { equityCurve, timestamps: ts, tradeLog, positions };
}

function regimeToWeights(regime, defensiveAsset, closes) {
  const defSym = defensiveAsset === 'CASH' ? 'CASH' : (closes[defensiveAsset] ? defensiveAsset : 'CASH');
  switch (regime) {
    case 'full':      return { QQQ: 1.0 };
    case 'half':      return defSym === 'CASH' ? { QQQ: 0.5, CASH: 0.5 } : { QQQ: 0.5, [defSym]: 0.5 };
    case 'defensive': return defSym === 'CASH' ? { CASH: 1.0 } : { [defSym]: 1.0 };
    default:          return { QQQ: 1.0 };
  }
}

/**
 * 计算 QQQ 20日实现波动率序列（年化 %）
 * 输入 QQQ adjclose 数组，返回与输入等长的数组（前20个为 null）
 */
export function calcQqqVol20(qqqCloses) {
  const result = [];
  for (let i = 0; i < qqqCloses.length; i++) {
    if (i < 20) { result.push(null); continue; }
    const logRets = [];
    for (let j = i - 19; j <= i; j++) {
      if (qqqCloses[j] > 0 && qqqCloses[j - 1] > 0) {
        logRets.push(Math.log(qqqCloses[j] / qqqCloses[j - 1]));
      }
    }
    if (logRets.length < 10) { result.push(null); continue; }
    const mean = logRets.reduce((s, r) => s + r, 0) / logRets.length;
    const variance = logRets.reduce((s, r) => s + (r - mean) ** 2, 0) / logRets.length;
    result.push(Math.sqrt(variance) * Math.sqrt(252) * 100); // 年化 %
  }
  return result;
}
