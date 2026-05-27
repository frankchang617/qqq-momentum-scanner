/**
 * fetchEtfData.js — 拉取 ETF + VIX 历史数据（10年）
 *
 * 标的：QQQ、SPY、XLK、DXJ、TLT、GLD、SHY、TSM、SOXX
 *       QLD（2x QQQ）、SOXL（3x 半导体）、TQQQ（3x QQQ）
 *       EWY（韩国）、EWJ（日本）
 *       + ^VIX
 * 数据源：Yahoo Finance（通过现有 /api/yahoo 代理）
 * 返回格式：
 *  {
 *    timestamps: number[],           // 对齐后的交易日时间戳（以 QQQ 日历为基准）
 *    closes: { QQQ: [], SPY: [], ... },  // adjclose 数组（已对齐）
 *    vix: number[],                  // 真实 VIX（null 表示无数据）
 *    qqqVol20: number[],             // QQQ 20日实现波动率（年化 %）
 *    symbols: string[],              // 成功加载的标的列表
 *    loadErrors: string[],           // 加载失败的标的
 *  }
 */

import { calcQqqVol20 } from '../strategies/volControl.js';

export const ETF_SYMBOLS = [
  // 美股宽基 & 科技
  'QQQ', 'SPY', 'XLK', 'SOXX',
  // 杠杆 ETF
  'QLD', 'SOXL', 'TQQQ',
  // 国际市场
  'DXJ', 'TSM', 'EWY', 'EWJ',
  // 债券 & 大宗商品
  'TLT', 'GLD', 'SHY',
];
const RANGE = '10y';
const BATCH_SIZE = 3;      // 每批同时请求数量（避免限速）
const BATCH_DELAY_MS = 600; // 批次间延迟

/**
 * 拉取单个标的的历史 adjclose 数据
 * @param {string} symbol
 * @param {AbortSignal} signal
 * @returns {Array<{c: number, ts: number}> | null}
 */
async function fetchSingleEtf(symbol, abortSignal) {
  // ^VIX 需要 URL 编码
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `/api/yahoo?symbol=${encodedSymbol}&range=${RANGE}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      if (abortSignal?.aborted) throw new Error('aborted');

      const res = await fetch(url, { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) return null;

      const tss = result.timestamp;
      const adj = result.indicators?.adjclose?.[0]?.adjclose;
      const q   = result.indicators?.quote?.[0]; // 原始 OHLCV（用于计算复权开盘价）
      if (!tss || !adj || adj.length < 50) return null;

      const rows = [];
      for (let i = 0; i < tss.length; i++) {
        if (adj[i] != null && adj[i] > 0) {
          const rawClose = q?.close?.[i];
          const rawOpen  = q?.open?.[i];
          const scale    = rawClose > 0 ? adj[i] / rawClose : 1;
          const adjOpen  = rawOpen != null ? rawOpen * scale : adj[i]; // 无 open 时退回 adjClose
          rows.push({ c: adj[i], o: adjOpen, ts: tss[i] });
        }
      }
      return rows.length >= 50 ? rows : null;
    } catch (e) {
      if (abortSignal?.aborted || attempt === 2) throw e;
    }
  }
  return null;
}

/**
 * 对齐所有标的到 QQQ 交易日历
 * 以 QQQ 的 timestamp 序列为基准，其他标的缺失日期前向填充
 *
 * @param {Object} rawData { symbol: Array<{c, ts}> }
 * @param {string} baseSymbol 基准标的（QQQ）
 * @returns {{ timestamps, closes }}
 */
function alignToBase(rawData, baseSymbol = 'QQQ') {
  const baseRows = rawData[baseSymbol];
  if (!baseRows || baseRows.length === 0) return null;

  const timestamps = baseRows.map(r => r.ts);
  const closes = {};
  const opens  = {};

  // QQQ 本身直接映射
  closes[baseSymbol] = baseRows.map(r => r.c);
  opens[baseSymbol]  = baseRows.map(r => r.o ?? r.c); // 无 open 时退回 close

  // 其他标的：按时间戳匹配，缺失时前向填充
  for (const [sym, rows] of Object.entries(rawData)) {
    if (sym === baseSymbol || !rows) continue;

    // 建立时间戳 → { close, open } 的 Map
    const priceMap = new Map(rows.map(r => [r.ts, { c: r.c, o: r.o ?? r.c }]));

    const alignedC = [], alignedO = [];
    let lastC = null, lastO = null;

    for (const ts of timestamps) {
      // 尝试精确匹配（容忍 ±3600 秒的时区偏差）
      let entry = priceMap.get(ts)
        ?? priceMap.get(ts + 3600)
        ?? priceMap.get(ts - 3600)
        ?? priceMap.get(ts + 86400)
        ?? priceMap.get(ts - 86400)
        ?? null;

      if (entry != null && entry.c > 0) {
        lastC = entry.c;
        lastO = entry.o ?? entry.c;
      }
      alignedC.push(lastC); // 前向填充 close
      alignedO.push(lastO); // 前向填充 open
    }

    closes[sym] = alignedC;
    opens[sym]  = alignedO;
  }

  return { timestamps, closes, opens };
}

/**
 * 主入口：加载所有 ETF 和 VIX 数据
 *
 * @param {AbortSignal} abortSignal
 * @param {Function} onProgress (done, total, symbol) => void
 * @returns {Object} 见文件顶部注释
 */
export async function fetchEtfData(abortSignal, onProgress = null) {
  const allSymbols = [...ETF_SYMBOLS, '^VIX'];
  const rawData = {};
  const loadErrors = [];
  const successSymbols = [];
  let done = 0;

  // 分批请求
  for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
    if (abortSignal?.aborted) throw new Error('aborted');

    const batch = allSymbols.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(sym => fetchSingleEtf(sym, abortSignal))
    );

    results.forEach((result, j) => {
      const sym = batch[j];
      done++;
      if (result.status === 'fulfilled' && result.value) {
        rawData[sym] = result.value;
        successSymbols.push(sym);
      } else {
        loadErrors.push(sym);
        console.warn(`fetchEtfData: 加载失败 ${sym}`, result.reason?.message);
      }
      onProgress?.(done, allSymbols.length, sym);
    });

    // 批次间延迟（最后一批不需要）
    if (i + BATCH_SIZE < allSymbols.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // QQQ 必须成功
  if (!rawData['QQQ']) {
    throw new Error('QQQ 数据加载失败，无法继续');
  }

  // ── 对齐时间戳 ──
  // VIX 单独处理（不参与基础对齐，因为它是指数不是价格）
  const vixRows = rawData['^VIX'];
  delete rawData['^VIX'];

  const aligned = alignToBase(rawData, 'QQQ');
  if (!aligned) throw new Error('时间戳对齐失败');

  const { timestamps, closes, opens } = aligned;

  // ── 对齐 VIX ──
  let vix = new Array(timestamps.length).fill(null);
  if (vixRows && vixRows.length > 0) {
    const vixMap = new Map(vixRows.map(r => [r.ts, r.c]));
    let lastVix = null;
    vix = timestamps.map(ts => {
      const v = vixMap.get(ts)
        ?? vixMap.get(ts + 3600)
        ?? vixMap.get(ts - 3600)
        ?? vixMap.get(ts + 86400)
        ?? vixMap.get(ts - 86400)
        ?? null;
      if (v != null && v > 0) lastVix = v;
      return lastVix;
    });
  }

  // ── 计算 QQQ 20日实现波动率 ──
  const qqqVol20 = calcQqqVol20(closes['QQQ']);

  return {
    timestamps,
    closes,
    opens,  // 复权开盘价（供 T+1 开盘执行回测使用）
    vix,
    qqqVol20,
    symbols: successSymbols.filter(s => s !== '^VIX'),
    vixLoaded: successSymbols.includes('^VIX'),
    loadErrors,
    loadedAt: Date.now(),
    dataRange: {
      start: new Date(timestamps[0] * 1000).toISOString().slice(0, 10),
      end:   new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10),
      days:  timestamps.length,
    },
  };
}
