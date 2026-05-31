# Handoff — QQQ Momentum Scanner

更新时间：2026-05-31 Session 20（SPY 成分股轮动策略 — 开发完成，待测试）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动（含 sub-tab 路由）
src/etf/EtfStrategyTab.jsx   # ETF 三策略 + WFO
src/etf/data/fetchEtfData.js # ETF 数据拉取（标的池定义）
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略（含网格搜索、WFO、调仓信号）
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/spy/SpyRotationTab.jsx   # SPY 轮转策略 ✅
src/spy/SpyMomentumTab.jsx   # SPY 成分股轮动策略 ✅（1492行，新增）
src/spy/optimization/spyWfo.js / spyGridSearch.js
src/spy/strategies/spyRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 20 刚完成 — SPY 成分股轮动策略（本次）

### 新建 `src/spy/SpyMomentumTab.jsx`（1492行）

完整功能：

| 模块 | 说明 |
|------|------|
| SPY_COMPONENTS | 468只 S&P 500 成分股，BATCH=20，延迟200ms |
| portfolioBacktest | T-1信号/T执行MOO，无前视偏差，市场过滤SPY均线 |
| buildSpyEquity | SPY Buy & Hold 基准净值曲线 |
| calcPortMetrics | CAGR/Sharpe/MDD/年度/月度指标 |
| runAllCombos | 448种参数全扫（4×7×4×4） |
| runWFO | 单窗口70%IS/30%OOS，固定参数+自动寻优双模式 |
| SpySignalCard | 调仓指令面板，localStorage key: `spy_momentum_holdings` |
| SpyMomentumRuleCard | 可折叠策略规则卡 |
| SpyMomentumTab | 主组件：数据加载/MODE A回测/Grid Search/WFO |

### 修改 `qqq-momentum.jsx`

| 修改 | 内容 |
|------|------|
| line 5 | `import SpyMomentumTab from "./src/spy/SpyMomentumTab.jsx"` |
| line 1955 | sub-tab 列表新增 `{id:"spyMomentum",label:"SPY 成分股轮动"}` |
| line 1983 | `{btSubTab === "spyMomentum" && <SpyMomentumTab T={T} darkMode={darkMode} />}` |

### 与 QQQ 版本的5处差异（均已正确实现）

| 项目 | QQQ | SPY |
|------|-----|-----|
| 成分股 | 101只 | 468只 |
| 数据 key | `__QQQ__` | `__SPY__` |
| 基准函数 | buildQqqEquity | buildSpyEquity |
| 市场过滤标的 | QQQ | SPY |
| localStorage key | `qqq_momentum_holdings` | `spy_momentum_holdings` |

---

## ✅ Session 20 早期完成 — SPY 轮转策略标的池扩充（commit `5a54d0a`）

SPY_COMPONENTS 从110扩充至468只，批次20，延迟200ms。

---

## ✅ Session 19 全部完成 — commit `513388f`

SPY 轮转策略（spyRotation.js / spyGridSearch.js / spyWfo.js / SpyRotationTab.jsx）。

---

## ✅ Session 18 全部完成

全6策略的 localStorage 持仓持久化。

---

## 关键设计约定

### 回测引擎无前视偏差
```
T-1 收盘信号 → T 开盘执行（MOO）
动能计算：closes[t-1] / closes[t-1-lookback] ✅
```

### 进场评分公式
`score = ret20 × 0.45 + ret50 × 0.35 + ret200 × 0.20`

### 双模式 WFO（两个标的池策略共用）
- 📌 固定参数 OOS 验证：运行回测后自动切换
- 🔍 自动寻优 WFO：IS Grid Search（448种）→ OOS 验证

---

## 下一步
- 启动 dev server 测试 SPY 成分股轮动 tab 是否正常渲染
- 可考虑 commit 当前改动

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
