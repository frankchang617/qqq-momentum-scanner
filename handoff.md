# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 18（localStorage 持仓持久化功能完成）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动
src/etf/EtfStrategyTab.jsx   # ETF 三策略 + WFO
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略（本次改动）
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 18 完成（未 commit）

### localStorage 持仓持久化 — `src/qqq/QqqRotationTab.jsx`

**问题：** 原来用 `prevSignalRef`（useRef）记录上一期持仓，刷新页面后 ref 清零，
调仓面板总显示「初始建仓」，用户无法准确看到买卖差异。

**解决方案：** 用 `localStorage` + `useState` 替换 `prevSignalRef`，加「✅ 我已完成调仓」按钮。

**改动清单（QqqRotationTab.jsx）：**

| 位置 | 改动 |
|------|------|
| import 行 | 加入 `useEffect` |
| state 区块 | 新增 `myHoldings` state，从 `localStorage.getItem('qqq_rotation_holdings')` 初始化 |
| state 区块 | 新增 `useEffect` 监听 `myHoldings` 变化，自动写入 localStorage |
| state 区块 | 新增 `confirmTrades` callback，把当前 signal 存入 `myHoldings` |
| 持仓对比逻辑 | `prevSignalRef` + `useRef(null)` → `const prevSignal = myHoldings` |
| `isFirstSignal` | 由 `!prevSignal.holdings.length` → 兼容 isDefensive 情况的空判断 |
| ref 更新行 | 删除 `prevSignalRef.current = signal`，改为注释说明 |
| 调仓面板底部 | 新增「✅ 我已完成调仓」按钮、「📌 上次确认」日期+持仓摘要、「🗑 清除记录」按钮 |

**localStorage key：** `qqq_rotation_holdings`

**存储结构：**
```json
{
  "holdings": { "NVDA": 0.2, "AAPL": 0.2, "MSFT": 0.2, "AMZN": 0.2, "META": 0.2 },
  "isDefensive": false,
  "defensiveAsset": null,
  "prices": { "NVDA": 135.5, ... },
  "date": "2026-05-27"
}
```

**用户使用流程：**
1. 第一次打开 → `myHoldings = null` → 显示「🟢 初始建仓」
2. 执行买入后点「✅ 我已完成调仓」→ 持仓写入 localStorage
3. 任何时候刷新 / 重新打开 → 从 localStorage 读取 → 正确显示增量调仓（卖出/买入/继续持有）
4. 不再需要时点「🗑 清除记录」→ 重置为初始建仓状态

---

## ✅ Session 17 全部完成（已 commit）

### IS/OOS 无未来数据完整审计

所有5策略均无 look-ahead bias ✅（详见历史 handoff.md）

### QQQ 轮转策略 WFO OOS 净值曲线

将 `MiniLineChart` 替换为 `EquityCurveChart`（含年份刻度 + OOS 日期范围标注）

---

## 关键设计约定

### 双模式 WFO

| 模式 | 触发 | IS 期 | OOS 期 |
|------|------|-------|--------|
| 📌 固定参数 OOS 验证 | 「应用并回测」后自动切换 | 固定参数参考绩效 | 固定参数跑 OOS |
| 🔍 自动寻优 WFO | 手动切换或初始状态 | Grid Search 288种 | IS 最优参数跑 OOS |

### 进场评分公式

Score = Sharpe_pct × 0.40 + MaxDD_pct × 0.35 + CAGR_pct × 0.25

---

## 下一步计划

1. **git commit** Session 18 持仓持久化改动
2. 测试：刷新后调仓面板是否正确显示上次持仓 vs 当前目标差异
3. 如有其他需求继续开发

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
