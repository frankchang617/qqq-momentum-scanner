# Handoff — QQQ Momentum Scanner

更新时间：2026-05-31 Session 20（SPY 成分股列表扩充至全量 S&P 500）

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
src/spy/SpyRotationTab.jsx   # SPY 轮转策略（Session 20 修复）✅
src/spy/optimization/spyWfo.js / spyGridSearch.js
src/spy/strategies/spyRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 20 完成 — SPY 成分股全量扩充

### 问题描述
Session 19 的 SPY 轮转策略存在两个问题：
1. **标的池不完整**：只有 ~110 只"代表性"股票，仅覆盖 S&P 500 的 22%，与 QQQ 轮转策略（用全量 Nasdaq-100，覆盖率 100%）不对称
2. **硬编码不完整**：110 只是手工挑选的代表性股票，不是完整 S&P 500

### 修复内容（`src/spy/SpyRotationTab.jsx`）

| 修改项 | 旧值 | 新值 |
|--------|------|------|
| `SPY_COMPONENTS` 数量 | ~110 只 | ~480 只（全量 S&P 500，11个GICS行业） |
| 批次大小 `BATCH` | 5 | 10（加快加载速度） |
| 批间延迟 | 300ms | 200ms |
| 免责声明文本 | 约110只 | `{SPY_COMPONENTS.length}` 动态显示 |
| 策略规则文本 | 约110只 | `{SPY_COMPONENTS.length}` 动态显示 |
| 文件注释 | ~100只大市值股 | ~480只，覆盖11个GICS行业 |

### 加载时间估算
- 旧：~110只 / 5批 × 300ms ≈ 7秒
- 新：~480只 / 10批 × 200ms ≈ 10秒（可接受）

### 覆盖率
| 指数 | 成分股数 | 标的池 | 覆盖率 |
|------|----------|--------|--------|
| QQQ（Nasdaq-100）| ~100 | ~100 | ~100% |
| SPY（S&P 500）| ~503 | ~480 | ~95% |

架构差异说明：`QqqRotationTab` 接受父组件 `histData/histTs` props 作为数据备用（`effData = histDataLocal || histData`），`SpyRotationTab` 只有自加载——这是有意设计，不需对齐（SPY 数据父组件没有）。

---

## ✅ Session 19 全部完成 — commit `513388f`

### SPY 轮转策略（4个新文件 + qqq-momentum.jsx）

| 文件 | 说明 |
|------|------|
| `src/spy/strategies/spyRotation.js` | 纯函数回测，288种参数组合，基准 `__SPY__` |
| `src/spy/optimization/spyGridSearch.js` | 全量参数网格搜索 |
| `src/spy/optimization/spyWfo.js` | WFO（模式A固定参数 + 模式B自动寻优）|
| `src/spy/SpyRotationTab.jsx` | 完整 UI：回测/优化/WFO/调仓信号/localStorage 持仓 |
| `qqq-momentum.jsx` | 注册「SPY 轮转策略」sub-tab |

---

## ✅ Session 18 全部完成（commit `02ab41e` / `a97f1f3` / `ddf2edb` / `dc1a8dc`）

### localStorage 持仓持久化（全6策略）

| 策略 | localStorage key |
|------|-----------------|
| QQQ 轮转策略 | `qqq_rotation_holdings` |
| QQQ 成分股轮动 | `qqq_momentum_holdings` |
| ETF 强势轮动 | `etf_momentum_holdings` |
| ETF 双动能 | `etf_dualMomentum_holdings` |
| ETF 波动率控管 | `etf_volControl_holdings` |
| SPY 轮转策略（Session 19）| `spy_rotation_holdings` |

### ETF 标的池扩充 9→14 只

| 分类 | 标的 |
|------|------|
| 美股宽基 & 科技 | QQQ, SPY, XLK, SOXX |
| 杠杆 ETF | QLD, SOXL, TQQQ |
| 国际市场 | DXJ, TSM, EWY, EWJ |
| 债券 & 商品 | TLT, GLD, SHY |

### 白屏 TDZ bug 修复

`confirmTrades` 必须定义在 `signal` useMemo 之后，否则 const TDZ 崩溃白屏。

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
