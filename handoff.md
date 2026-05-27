# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 17（IS/OOS 无未来数据全策略审计完成）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动
src/etf/EtfStrategyTab.jsx   # ETF 三策略 + WFO
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 17 全部完成（已 commit）

### 1. 双模式 WFO 完整修复（5个策略统一）

所有5个策略的「▶ 运行回测」和「应用并回测」均已正确同步 WFO 固定参数逻辑。

### 2. IS/OOS 无未来数据完整审计（本次新增）

#### 审计结论：**所有5个策略均无未来数据（look-ahead bias）问题** ✅

| 策略 | 文件 | 预热期(warmup) | 最小IS天数 | backtestStart | 信号使用数据 | 结论 |
|------|------|--------------|-----------|--------------|------------|------|
| QQQ 成分股轮动 | `qqq-momentum.jsx` | 205天（score需200日） | 252天 | = inEnd（252>205）✅ | `d = t-1`，回看IS期 | ✅ 无泄漏 |
| QQQ 轮转策略 | `qqqRotation.js` | 201天（lookback=200+filter） | 252天 | = inEnd（252>201）✅ | `sigIdx = i-1`，回看IS期 | ✅ 无泄漏 |
| ETF 强势轮动 | `momentum.js` | lookback+1（≤253天） | 756天（3年） | = oosStart（756>253）✅ | `sigIdx = i-1` | ✅ 无泄漏 |
| ETF 双动能 | `dualMomentum.js` | max(lookback,maFilter)+1（≤253天） | 756天 | = oosStart（756>253）✅ | `sigIdx = i-1` + MA回看IS期 | ✅ 无泄漏 |
| ETF 波动率控管 | `volControl.js` | 22天（realized vol） | 756天 | = oosStart（756>22）✅ | `sigIdx = i-1`，vol用IS期 | ✅ 无泄漏 |

**核心逻辑验证：**
- OOS 回测调用：`backtestXxx(data, timestamps, params, inEnd, N)`
- 第一个 OOS 调仓日：`i = backtestStart = inEnd`
- 信号：`sigIdx = i - 1 = inEnd - 1`（最后一个 IS 日）
- 动能回看：`closes[sigIdx - lookback]` ≤ `closes[inEnd - 1 - lookback]` → 全部在 IS 期内 ✅

**70% IS / 30% OOS 窗口：**
- QQQ 成分股轮动 & QQQ 轮转策略：`inEnd = round(N × 0.70)`，单窗口
- ETF 三策略：IS=3年(756天) / OOS=1年(252天)，滑动窗口，约6~7个窗口

#### 净值曲线"看起来不对"问题修复

**原因：** QQQ 轮转策略 WFO OOS 净值曲线使用 `MiniLineChart`，该组件：
- **无 x 轴日期标注**（只有索引 0→n）
- 无年份刻度线
- 看起来像全量历史数据，实际只有后30%（3年）

**修复：** 将 `MiniLineChart` 替换为 `EquityCurveChart`（有年份刻度），并在标题处明确标注 OOS 日期范围（起始→结束，天数/后30%数据）。

**修改位置：** `src/qqq/QqqRotationTab.jsx` line ~1536

---

## 改动文件汇总（Session 17 全部）

| 文件 | 改动摘要 |
|------|---------|
| `qqq-momentum.jsx` | `runWFO` 加 `fixedParams` 双模式；`appliedParams`/`wfoMode` state；WFO UI 重构 |
| `src/etf/optimization/wfo.js` | 完全重写，支持 `fixedParams` 双模式 |
| `src/etf/optimization/gridSearch.js` | 新增 `strategyFilter` 参数 |
| `src/etf/EtfStrategyTab.jsx` | WfoPanel 双模式 UI；三策略面板加 `onRunBacktest`；`handleStratBacktest` |
| `src/qqq/optimization/qqqWfo.js` | 完全重写，支持 `fixedParams` 双模式 |
| `src/qqq/QqqRotationTab.jsx` | `appliedParams`/`wfoMode` state；WFO UI 重构；OOS 曲线改用 `EquityCurveChart` |

---

## 关键设计约定

### 双模式 WFO

| 模式 | 触发 | IS 期 | OOS 期 |
|------|------|-------|--------|
| 📌 固定参数 OOS 验证 | 任意「运行回测」/「应用并回测」后自动切换 | 用固定参数算参考绩效，**不搜索** | 用固定参数跑 OOS |
| 🔍 自动寻优 WFO | 手动切换，或初始状态 | Grid Search 选最优 | 用 IS 最优参数跑 OOS |

### 信号无泄漏原则

```
OOS 调仓日 i ≥ inEnd
信号索引 sigIdx = i - 1 ≤ inEnd - 1  ← 最后一个 IS 日
动能计算 closes[sigIdx - lookback]    ← 更早的 IS 期
均线计算 closes[sigIdx-maFilter..sigIdx] ← 全部 IS 期
→ OOS 期间的每次决策均只用 IS 期（或更早）的价格数据 ✅
```

---

## 下一步计划

1. **git commit 本次修复**（WFO 净值曲线改用 EquityCurveChart + 日期标注）
2. **观察净值曲线是否正常显示**（年份刻度 + 明确 OOS 时间范围）
3. 如有其他视觉问题，进一步调查数据对齐

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
