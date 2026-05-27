# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 18（全5策略 localStorage 持仓持久化进行中）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动（本次改动）
src/etf/EtfStrategyTab.jsx   # ETF 三策略（本次改动）
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略（Session 18 第一批已完成）
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 18 进度（未 commit）

### localStorage 持仓持久化 — 全 5 策略

**目标：** 刷新页面后调仓对比（买/卖/持有）不再清零，用「✅ 我已完成调仓」按钮手动确认更新。

| 文件 | 组件 | localStorage key | 状态 |
|------|------|-----------------|------|
| `src/qqq/QqqRotationTab.jsx` | `QqqRotationTab` 主体 | `qqq_rotation_holdings` | ✅ 已完成（上一批 commit） |
| `qqq-momentum.jsx` | `QqqSignalCard` | `qqq_momentum_holdings` | ✅ 已完成 |
| `src/etf/EtfStrategyTab.jsx` | `SignalCard`（共用） | `etf_momentum_holdings` / `etf_dualMomentum_holdings` / `etf_volControl_holdings` | 🔄 进行中（prevSignalRef 已替换，确认按钮待加） |

### 改动模式（三处文件均相同）

```
useState 初始化从 localStorage 读取
useEffect 监听变化自动写入 localStorage
prevSignalRef / useRef → const prevSignal = myHoldings
confirmTrades callback → 把 signal 存入 myHoldings
UI 底部加：✅已完成调仓 / 📌上次确认 / 🗑清除记录
```

### localStorage keys 汇总

| 策略 | key |
|------|-----|
| QQQ 轮转策略 | `qqq_rotation_holdings` |
| QQQ 成分股轮动 | `qqq_momentum_holdings` |
| ETF 强势轮动 | `etf_momentum_holdings` |
| ETF 双动能 | `etf_dualMomentum_holdings` |
| ETF 波动率控管 | `etf_volControl_holdings` |

---

## ✅ Session 17 全部完成（已 commit）

- 双模式 WFO 修复（5策略统一）
- IS/OOS 无未来数据审计通过
- QQQ 轮转 WFO OOS 曲线改用 EquityCurveChart

---

## 下一步（当前 session 待完成）

1. `EtfStrategyTab.jsx` SignalCard 底部加确认按钮 UI（进行中）
2. 验证：`prevSignalRef` 在两个文件中已全部清除
3. git commit 全部改动

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
