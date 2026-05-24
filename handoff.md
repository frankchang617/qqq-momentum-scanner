# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 8（回测修复 + 应用并回测按钮 + 图表对齐）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描主文件
src/etf/                      # ETF 跨资产策略模块（已完成）
src/qqq/                      # QQQ 轮转策略模块（本 Session 新建，已完成）
  strategies/
    qqqRotation.js            # 回测引擎（backtestQqqRotation，144种参数）
  optimization/
    qqqGridSearch.js          # 参数网格搜索（144种组合）
    qqqWfo.js                 # Walk Forward Optimization（单窗口70/30）
  QqqRotationTab.jsx          # 完整 Tab 界面（Step1/信号/Step2/WFO）
```

---

## ✅ Session 8 完成（commits `41de388` · `70b11e9` · `72ef43f` · `ffcdbd7`）

### 回测执行逻辑修复

**问题**：`portfolioBacktest()` 中首个调仓日（`t === simStart`）的 Step 3（新持仓日内收益 open→close）被条件 `t > simStart` 跳过，导致建仓当天的日内收益遗漏。

**修复**：`qqq-momentum.jsx:671`，将条件改为 `holdings.size > 0`，首日建仓同样计算日内收益。

### QQQ轮转策略图表与成分股轮动对齐（`QqqRotationTab.jsx`，commit `ffcdbd7`）

| 新增内容 | 说明 |
|----------|------|
| `EquityCurveChart` | 带年份刻度的净值曲线（策略蓝线 vs QQQ灰虚线） |
| `DrawdownChart` | 红色填充回撤曲线，含年份刻度 |
| `AnnualBarsChart` | 年度收益柱状图（策略 vs QQQ 并排） |
| `MonthlyHeatmap` | 月度收益热图（绿红色块 + 年度汇总） |
| `DualMetricCard` | 指标卡片显示策略值 + QQQ基准对比 |
| 资金模拟 | 起始资金输入 → 策略/QQQ 最终金额 + 超额对比 |
| 换仓次数 | 显示 tradeLog 长度 |
| `toPortMetrics()` | calcMetrics（小数）→ 百分比格式转换函数 |

保留不变：`SimpleMetricCard`（WFO区域）、`MiniLineChart`（OOS净值曲线）。

### 一键优化「应用并回测」按钮（`QqqRotationTab.jsx`）

- Step 2 结果表格每行末尾新增「应用并回测」按钮
- 点击按钮：参数同步写入 Step 1 选择器，并**立即自动运行回测**（不依赖 state 更新时序）
- 新增 `handleApplyAndBacktest(rowParams)` 函数，直接用传入参数调用回测引擎
- 点击行本身仍只载入参数（不自动回测），两种交互共存
- 底部提示文字同步更新

---

## ✅ Session 7 完成（commit `fee7332`）

### QQQ 轮转策略 Tab 全功能上线

| 功能 | 说明 |
|------|------|
| Step 1 · 固定参数回测 | 参数选择器 + 净值曲线 + 年度收益对比 |
| 操作建议信号面板 | 市场状态(QQQ vs SMA200) + 当前持仓 + 投入金额→买入股数 |
| Step 2 · 一键优化 | 144种组合，进度条，结果表含最终金额列 |
| Step 3 · WFO | 单窗口70/30，参数明细表，OOS净值曲线，Mode A vs B对比 |

### 参数网格（144种组合）

| 参数 | 候选值 |
|------|--------|
| lookback | 21、63、126（1M/3M/6M） |
| topN | 1、3、5、10 |
| rebalFreq | 5、10、21（周/双周/月） |
| marketFilter | false（无过滤）/ true（QQQ < SMA200） |
| defensiveAsset | CASH / QQQ / SHY（filter=true 时） |

- filter=false：36种 · filter=true：108种 · 合计：144种

### 关键设计

| 项目 | 设计 |
|------|------|
| 执行方式 | T 收盘信号 → T+1 开盘执行（MOO，adjOpen） |
| 选股规则 | 单一 lookback 动能，仅正动能入选，等权 |
| 熊市过滤 | SMA200（固定，不作为优化参数） |
| 防御资产 | CASH / QQQ / SHY（SHY 在 loadHistData 额外抓取） |
| WFO 逻辑 | 单窗口 70/30，IS 选参固定用于 OOS，不事后调参 |
| 数据传入 | histData/histTs 以 props 从父组件传入，不重复加载 |

---

## ✅ Session 6 完成（commit `56dbb8e`）— MOO 执行模型

所有策略（ETF + QQQ 成分股）改为 T+1 开盘执行（adjOpen）。
改动文件：fetchEtfData / momentum / dualMomentum / volControl / gridSearch / wfo / EtfStrategyTab / qqq-momentum。

---

## ✅ Session 5 完成（commit `62b953f`）— WFO 单窗口重构

ETF WFO 改为单窗口 70/30，表格拆成 4 列，支持 10 年数据。

---

## 使用流程（QQQ 轮转策略）

1. 在「QQQ 成分股轮动」标签页选 **10年** 数据并加载
2. 切换到「**QQQ 轮转策略**」标签页
3. **Step 2 一键优化** → 找最高 Sharpe 组合 → 点击「**应用并回测**」直接跳到结果（或点击行仅载入参数）
4. **Step 1** 查看净值曲线和年度收益（按钮自动触发，也可手动调参后再运行）
5. **Step 3 WFO** → 验证参数稳健性（Mode A vs Mode B 对比）
6. **信号面板** → 输入投入金额 → 按提示买入/持有

---

## 下一步（待规划）

所有规划功能已全部完成，可根据需要开展新功能或优化。
