# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 18（白屏 TDZ bug 修复 + ETF 标的池扩充）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动
src/etf/EtfStrategyTab.jsx   # ETF 三策略 + WFO
src/etf/data/fetchEtfData.js # ETF 数据拉取（标的池定义）
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 18 全部完成

### 1. localStorage 持仓持久化（5策略）— commit `02ab41e` / `a97f1f3`

| 策略 | localStorage key |
|------|-----------------|
| QQQ 轮转策略 | `qqq_rotation_holdings` |
| QQQ 成分股轮动 | `qqq_momentum_holdings` |
| ETF 强势轮动 | `etf_momentum_holdings` |
| ETF 双动能 | `etf_dualMomentum_holdings` |
| ETF 波动率控管 | `etf_volControl_holdings` |

### 2. ETF 标的池扩充 9→14 只 — commit `ddf2edb`

新增：QLD（2x QQQ）、SOXL（3x 半导体）、TQQQ（3x QQQ）、EWY（韩国）、EWJ（日本）

| 分类 | 标的 |
|------|------|
| 美股宽基 & 科技 | QQQ, SPY, XLK, SOXX |
| 杠杆 ETF | QLD, SOXL, TQQQ |
| 国际市场 | DXJ, TSM, EWY, EWJ |
| 债券 & 商品 | TLT, GLD, SHY |

### 3. 白屏 TDZ bug 修复 — 本次 commit（待推送）

**根因：** `useCallback(..., [signal])` 在依赖数组求值时，`signal` 尚未被 `const` 初始化，
触发 JavaScript **Temporal Dead Zone ReferenceError**，导致组件崩溃白屏。

| 文件 | 问题 | 修复方式 |
|------|------|---------|
| `QqqRotationTab.jsx` | `confirmTrades`（line 464）在 `signal`（line 636）之前定义 | 移至 signal 之后（line 690），改为普通函数 |
| `qqq-momentum.jsx` | `confirmTrades`（line 907）在 `signal`（line 909）之前定义 | 移至 signal 之后（line 966），改为普通函数 |
| `EtfStrategyTab.jsx` | `signal`（line 161）在 `confirmTrades`（line 177）之前 ✅ | 无需改动 |

**白屏场景覆盖：**
- ✅ QQQ 轮转策略 — 点击 tab 立即白屏（TDZ）→ 已修复
- ✅ QQQ 成分股轮动 — 数据加载完成后白屏（TDZ）→ 已修复
- ✅ ETF 策略 — 原本 signal 在前，无 TDZ 问题，无白屏

---

## ✅ Session 17 全部完成（已 commit）

- 双模式 WFO 修复（5策略统一）
- IS/OOS 无未来数据审计通过
- QQQ 轮转 WFO OOS 曲线改用 EquityCurveChart

---

## 关键设计约定

### 双模式 WFO
| 模式 | 触发 | IS 期 | OOS 期 |
|------|------|-------|--------|
| 📌 固定参数 OOS 验证 | 「应用并回测」后自动切换 | 固定参数参考绩效 | 固定参数跑 OOS |
| 🔍 自动寻优 WFO | 手动切换或初始状态 | Grid Search | IS 最优参数跑 OOS |

### 进场评分公式
Score = Sharpe_pct × 0.40 + MaxDD_pct × 0.35 + CAGR_pct × 0.25

### 信号无泄漏原则
```
OOS 调仓日 i ≥ inEnd
信号索引 sigIdx = i - 1  ← 最后一个 IS 日
动能计算 closes[sigIdx - lookback]  ← 全部在 IS 期内 ✅
```

---

## 下一步
- 暂无待办，等待用户新需求

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
