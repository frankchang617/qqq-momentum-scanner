# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 18（全5策略 localStorage 持仓持久化完成）

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

## ✅ Session 18 全部完成（已 commit & push）

### localStorage 持仓持久化 — 全 5 策略

**问题：** 原来用 `prevSignalRef`（useRef）记录上一期持仓，刷新页面后清零，
调仓面板总显示「初始建仓」，无法显示增量调仓（买/卖/继续持有）。

**解决：** 用 `localStorage` + `useState` 替换，并加「✅ 我已完成调仓」按钮手动确认。

| 策略 | 文件 | localStorage key | commit |
|------|------|-----------------|--------|
| QQQ 轮转策略 | `src/qqq/QqqRotationTab.jsx` | `qqq_rotation_holdings` | `02ab41e` |
| QQQ 成分股轮动 | `qqq-momentum.jsx` | `qqq_momentum_holdings` | `a97f1f3` |
| ETF 强势轮动 | `src/etf/EtfStrategyTab.jsx` | `etf_momentum_holdings` | `a97f1f3` |
| ETF 双动能 | `src/etf/EtfStrategyTab.jsx` | `etf_dualMomentum_holdings` | `a97f1f3` |
| ETF 波动率控管 | `src/etf/EtfStrategyTab.jsx` | `etf_volControl_holdings` | `a97f1f3` |

**存储结构（通用）：**
```json
{
  "holdings":    { "NVDA": 0.2, "AAPL": 0.2, ... },
  "isDefensive": false,
  "prices":      { "NVDA": 135.5, ... },
  "date":        "2026-05-27"
}
```
QQQ成分股轮动额外含 `bufferHoldings`；QQQ轮转策略额外含 `defensiveAsset`。

**用户使用流程：**
1. 第一次打开 → `myHoldings = null` → 显示「🟢 初始建仓」
2. 执行买入后点「✅ 我已完成调仓」→ 持仓写入 localStorage
3. 之后任何时候刷新 / 重新打开 → 正确显示增量调仓（🔴卖出 / 🟢买入 / 🔵继续持有）
4. 需要重置时点「🗑 清除记录」

---

## ✅ Session 17 全部完成（已 commit）

### 双模式 WFO 完整修复（5个策略统一）

所有5个策略的「▶ 运行回测」和「应用并回测」均已正确同步 WFO 固定参数逻辑。

### IS/OOS 无未来数据完整审计

所有5策略审计通过，均无 look-ahead bias ✅

| 策略 | 预热期 | 最小IS天数 | 结论 |
|------|--------|-----------|------|
| QQQ 成分股轮动 | 205天 | 252天 | ✅ 无泄漏 |
| QQQ 轮转策略 | 201天 | 252天 | ✅ 无泄漏 |
| ETF 强势轮动 | lookback+1（≤253天） | 756天 | ✅ 无泄漏 |
| ETF 双动能 | max(lookback,maFilter)+1 | 756天 | ✅ 无泄漏 |
| ETF 波动率控管 | 22天 | 756天 | ✅ 无泄漏 |

### QQQ 轮转策略 WFO OOS 净值曲线

`MiniLineChart` → `EquityCurveChart`（含年份刻度 + OOS 日期范围标注）

---

## 关键设计约定

### 双模式 WFO

| 模式 | 触发 | IS 期 | OOS 期 |
|------|------|-------|--------|
| 📌 固定参数 OOS 验证 | 「应用并回测」后自动切换 | 固定参数参考绩效 | 固定参数跑 OOS |
| 🔍 自动寻优 WFO | 手动切换或初始状态 | Grid Search 288种 | IS 最优参数跑 OOS |

### 进场评分公式

Score = Sharpe_pct × 0.40 + MaxDD_pct × 0.35 + CAGR_pct × 0.25

### 信号无泄漏原则

```
OOS 调仓日 i ≥ inEnd
信号索引 sigIdx = i - 1 ≤ inEnd - 1  ← 最后一个 IS 日
动能计算 closes[sigIdx - lookback]    ← 更早的 IS 期
→ OOS 期间的每次决策均只用 IS 期（或更早）的价格数据 ✅
```

---

## 下一步计划

- 暂无待办，等待用户新需求

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
