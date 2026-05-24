# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 6（MOO 开盘执行模型 ✅ 全部完成）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描主文件
src/etf/
  data/fetchEtfData.js        # ETF 数据拉取 + adjOpen 计算
  strategies/
    momentum.js               # 策略1：强势轮动（已加 opens）
    dualMomentum.js           # 策略2：双动能（已加 opens）
    volControl.js             # 策略3：波动率控管（已加 opens）
    metrics.js                # 回测指标计算
  optimization/
    gridSearch.js             # 参数网格搜索（已加 opens）
    wfo.js                    # Walk Forward Optimization（已加 opens）
  EtfStrategyTab.jsx          # ETF 策略主界面
```

---

## ✅ 已完成工作（Session 6 · commit `56dbb8e`）

### MOO 执行模型（T 收盘信号 → T+1 开盘执行）

**目标**：将回测执行模型从「T-1 收盘信号 → T 收盘执行」改为「T 收盘信号 → T+1 开盘执行（Market-On-Open）」，使用真实 adjOpen 价格。

**adjOpen 计算**：`adjOpen = rawOpen × (adjClose / rawClose)`

**调仓日 3 步逻辑**：
1. 旧持仓 close[t-1] → open[t] 隔夜收益
2. 更新持仓（使用 T-1 收盘信号）
3. 新持仓 open[t] → close[t] 日内收益

**非调仓日**：close-to-close（不变）

### 改动文件汇总

| 文件 | 改动内容 |
|------|---------|
| `qqq-momentum.jsx` | `fetchCandlesExtended` 返回 adjOpen；`loadHistData` 存 `{closes,opens}`；`portfolioBacktest` 3 步调仓 |
| `src/etf/data/fetchEtfData.js` | adjOpen 计算，`alignToBase` 返回 `{closes, opens}` dict |
| `src/etf/strategies/momentum.js` | `opens=null` 参数，调仓日 3 步逻辑 |
| `src/etf/strategies/dualMomentum.js` | `opens=null` 参数，调仓日 3 步逻辑 |
| `src/etf/strategies/volControl.js` | `opens=null` 参数，`prevWeights` 追踪，`regimeChanged` 时 2 步换仓 |
| `src/etf/optimization/gridSearch.js` | `opens=null` 透传给 3 个策略 |
| `src/etf/optimization/wfo.js` | `opens=null` 传给 IS gridSearch + OOS 3 策略 |
| `src/etf/EtfStrategyTab.jsx` | 5 处调用点全部追加 `etfData.opens` |

---

## ✅ 已完成工作（Session 5 · commit `62b953f`）

### WFO 单窗口重构

- **单窗口**：前 70% IS（≈7年）+ 后 30% OOS（≈3年），非滚动
- **表格列**：IS/OOS 时间段拆成 4 列（IS Start / IS End / OOS Start / OOS End）
- **参数列**：重命名为「Selected TopN/Lookback/Rebalance/Market Filter」
- **10年数据**：新增「10年」加载选项，带紫色 "WFO" 标签
- **参数网格**：448 种组合不变（4×7×4×4）

---

## 关键决策记录

| 决策 | 内容 |
|------|------|
| MOO 方案选择 | 方案 A（真实 adjOpen）优于方案 B（收盘价近似），已采用 |
| WFO 窗口数 | 单窗口（70/30），非滚动 |
| volControl 特殊处理 | 日频调仓追踪 `prevWeights`，仅 `regimeChanged && opens` 时走 2 步 |
| histData 兼容性 | `portfolioBacktest` 检查 `d.closes` 存在与否，兼容旧平铺数组 |
| opens 参数默认值 | 所有函数 `opens=null`，存量调用不受影响 |

---

## 下一步（待规划）

当前所有功能已全部完成并通过 `npm run build`，可根据需要开展新功能或优化。
