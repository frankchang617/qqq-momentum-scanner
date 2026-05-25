# Handoff — QQQ Momentum Scanner

更新时间：2026-05-25 Session 12（策略规则卡 + 调仓指令面板）

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
| lookback | 20、21、50、63、126、200（20D/1M/50D/3M/6M/200D） |
| topN | 1、3、5、10 |
| rebalFreq | 5、10、21（周/双周/月） |
| marketFilter | false（无过滤）/ true（QQQ < SMA200） |
| defensiveAsset | CASH / QQQ / SHY（filter=true 时） |

- filter=false：72种 · filter=true：216种 · 合计：288种

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

## ✅ Session 9 完成（2026-05-24）

用户请求阅读并解释三大 ETF 策略的进出场逻辑（momentum / dualMomentum / volControl）。
已完整读取三个策略文件，无代码变更。

---

## ✅ Session 10 完成（2026-05-25，commits `17d3c34` · `9b5251e`）

### 1. 修复：ETF WFO 图表 QQQ 基准线缺失

| 文件 | 改动 |
|------|------|
| `src/etf/optimization/wfo.js` | 预建 `tsIndexMap`（O(1)查找）；每个 OOS 窗口按 `oosBt.timestamps` 对齐提取 QQQ 价格，串接为 `combinedQqqOosEquity` 返回 |
| `src/etf/EtfStrategyTab.jsx` | `WfoPanel` 补传 `qqqEq={wfoResult.combinedQqqOosEquity}` |
| `src/etf/ui/charts/EtfEquityChart.jsx` | 图例 QQQ 虚线改为条件渲染 `{qqqEq && <>...</>}` |

QQQ 曲线与策略曲线**等长**，保证像素精确对齐；各窗口衔接用相同 scale 归一化。

### 2. 修复：全局暗色模式文字可读性（`textVMuted` → `textMuted`/`textSub`）

`textVMuted`（暗色 `#405870`）对比度不足，共升级 **40 处**：

| 文件 | 处数 | 内容 |
|------|------|------|
| `qqq-momentum.jsx` | 36处 | SVG轴标签、MODE A参数标签、表头、操作标签、说明文字、脚注 |
| `src/etf/EtfStrategyTab.jsx` | 3处 | 调仓频率提示、表头子标签、优化副标题 |
| `src/etf/ui/charts/EtfEquityChart.jsx` | 3处 | Y轴数值、X轴年份刻度 |
| `src/etf/ui/charts/EtfDrawdownChart.jsx` | 3处 | Y轴数值、X轴年份刻度 |

升级规则：SVG轴/说明文字 → `textMuted #6a8090`；表头/操作标签/数据值 → `textSub #7a9aaa`  
**保留**：月度热图空值色（`v==null?T.textVMuted`，无数据格用极暗色是正确视觉语言）

---

## ✅ Session 11 完成（2026-05-25，commits `a52f6f9` · `f4d79fb`）

### 扩展三大策略动能回看期参数网格

在 QQQ 轮转、ETF 强势轮动、ETF 双动能三个策略的 lookback 参数网格中新增 **20日、50日、200日** 回看期选项。

| 策略 | 原 lookback | 新 lookback | 组合数 |
|------|------------|-------------|--------|
| QQQ 轮转 | 21/63/126 | 20/21/50/63/126/200 | 144→288 |
| ETF 强势轮动 | 21/63/126/252 | 20/21/50/63/126/200/252 | 36→63 |
| ETF 双动能 | 63/126/252 | 20/50/63/126/200/252 | 18→36 |
| ETF 三策略合计 | — | — | 86→131 |

**改动文件（10个）**：
- `src/qqq/strategies/qqqRotation.js` — PARAM_GRID + paramLabel + 注释
- `src/etf/strategies/momentum.js` — MOMENTUM_PARAM_GRID
- `src/etf/strategies/dualMomentum.js` — DUAL_MOMENTUM_PARAM_GRID
- `src/etf/optimization/gridSearch.js` — paramLabel + 参数数量注释
- `src/etf/optimization/wfo.js` — 参数数量注释
- `src/qqq/optimization/qqqGridSearch.js` — 参数数量注释
- `src/qqq/optimization/qqqWfo.js` — 参数数量注释 + totalCombos
- `src/qqq/QqqRotationTab.jsx` — UI 文字 + progress total + 回看期下拉选项 + lbLabel
- `src/etf/EtfStrategyTab.jsx` — UI 文字 + progress total + LOOKBACK_OPTS + 双动能回看按钮组
- `handoff.md`

动能计算逻辑不变（仍为单一回看期），仅扩展可选参数范围。

**fixup `f4d79fb`**：首次 commit 遗漏了 UI 下拉选择器的硬编码选项（参数网格常量改了但界面没联动），补充修复了 4 处选择器。

---

## ✅ Session 12 完成（2026-05-25）

### 为全部五个策略添加策略规则卡 + 重构信号面板为调仓指令面板

用户希望在页面上直观看到每个策略的进出场规则，并让信号面板显示「需要卖出什么、需要买入什么、继续持有什么」而不仅仅是目标持仓。

#### 三大改动

| 改动 | 说明 |
|------|------|
| **策略规则卡** | 每个策略页面顶部新增可折叠规则卡片（默认收起），详细列出入场条件、出场条件、防御机制、执行方式 |
| **调仓指令面板** | 信号面板重构：对比上一期目标持仓 vs 本期目标持仓，展示 🔴卖出 / 🟢买入 / 🔵继续持有 清单，每笔操作附理由 |
| **资金流转摘要** | 面板中新增卖出回收金额 / 买入需要金额 / 净回笼或净追加的计算 |

#### 各策略特殊处理

| 策略 | 特殊展示 |
|------|---------|
| QQQ成分股轮动 | 🟡 缓冲区保留（跌出 TopN 但仍在 TopN×1.5 内，保留观察） |
| QQQ轮转策略 | 防御资产三选一（CASH/QQQ/SHY），市场过滤SMA200 |
| ETF强势轮动 | 9只ETF选TopN，全负动能切防御(SHY/GLD/CASH) |
| ETF双动能 | 三层过滤状态展示（相对动能/绝对动能/趋势MA），只持1只 |
| ETF波动率控管 | 仓位比例调整（满仓→半仓→防御），波动率预警保留 |

#### 改动文件

| 文件 | 改动内容 |
|------|---------|
| `src/qqq/QqqRotationTab.jsx` | 新增 `StrategyRuleCard` 组件；信号面板重构为调仓指令面板（含 useRef 持仓对比、买卖持有清单、资金流转摘要） |
| `qqq-momentum.jsx` | 新增 `QqqStrategyRuleCard` 组件；`QqqSignalCard` 重构为调仓指令面板（含 🟡缓冲区保留标记、useRef 持仓对比、资金流转摘要） |
| `src/etf/EtfStrategyTab.jsx` | 新增 `EtfStrategyRuleCard` 组件（三策略共用）；`SignalCard` 重构为调仓指令面板（含 useRef 持仓对比、买卖持有清单、资金流转摘要） |
| `handoff.md` | 更新至 Session 12 |

#### 技术要点

- 使用 `useRef` 存储上一期目标持仓，与新一期做 diff：prev ∩ curr = 继续持有，prev − curr = 卖出，curr − prev = 买入
- QQQ成分股轮动的缓冲区：ranked[topN:bufferN] 单独标记为 🟡 缓冲区保留
- 首次加载时显示「初始建仓」提示，不做 diff 对比
- 资金流转：sellTotal = Σ(prevWeights × capital)，buyTotal = Σ(currWeights × capital)，netFlow = sellTotal − buyTotal

#### WFO 窗口明细表新增「应用并回测」按钮

| 文件 | 实现方式 |
|------|---------|
| `src/qqq/QqqRotationTab.jsx` | 直接调用已有 `handleApplyAndBacktest(bp)` |
| `qqq-momentum.jsx` | `setStratParams(bp)` + `runStratBacktest(bp)` |
| `src/etf/EtfStrategyTab.jsx` | WfoPanel 新增 `onApply` prop → `handleApplyAndRun` → `pendingOverride` 机制 |

点击后参数自动同步到 Mode A 并立即触发回测。

#### Mode A vs Mode B 绩效差异说明

Mode A（全量回测）和 Mode B（WFO OOS）的绩效**理应不同**，这正是 WFO 的意义：
- Mode A 用全量 10 年数据回测，包含事后信息，存在乐观偏差
- Mode B 仅用后 30% OOS 数据，参数由 IS 期选出且不事后调参，更接近真实未来预期
- 两者差异大小反映过拟合程度：差异越大 = 过拟合越严重；OOS 不输 IS = 泛化能力强
- 决策时应以 Mode B（WFO）为准

#### QQQ轮转策略新增独立数据加载

在 QQQ轮转策略页面中新增 STEP 0 数据加载区，与 QQQ成分股轮动的加载方式完全一致：
- 历史深度选择（2y/3y/5y/10y）+ 加载按钮 + 进度条
- 使用 Yahoo Finance API，批次拉取（每批5只，间隔300ms）
- 同时加载 SHY 数据供防御资产使用
- 本地数据优先，回退到父组件传入的 props（保持兼容性）
- 改动文件：`src/qqq/QqqRotationTab.jsx`（新增 QQQ_COMPONENTS、fetchCandlesExtended、本地状态和 loadHistData）
- **fixup**：修复 React Hooks 顺序问题 — early return 移到所有 hooks 之后
- **fixup**：修复变量名冲突 — `histData` prop 与局部变量同名导致语法错误，改用 `effData`/`effTs`

---

## ✅ Session 13 完成（2026-05-25）

### 修复：QQQ 轮转策略点击后白屏

**根因**：`QqqRotationTab.jsx` 中 `const cap` 在第 744 行声明，但第 730 行起就已使用。`const` 不像 `var` 会提升（hoisting），在声明前访问会抛出 `ReferenceError: Cannot access 'cap' before initialization`，导致组件渲染崩溃白屏。

**修复**：将 `const cap = parseFloat(investAmount) || 0;` 从第 744 行移至资金流转摘要计算块最前面（第 728 行），确保变量先声明后使用。

| 文件 | 改动 |
|------|------|
| `src/qqq/QqqRotationTab.jsx` | 将 `const cap` 声明提前至使用位置之前 |

---

## ✅ Session 14 完成（2026-05-25）

### Mode B WFO 绩效展示重构 — 新增 WfoSummaryTable

将原来横排的四枚 `SimpleMetricCard` 小卡片，替换为参考 Portfolio Visualizer 风格的精美绩效对比表。

#### 改动内容

| 文件 | 改动 |
|------|------|
| `src/qqq/QqqRotationTab.jsx` | 新增 `WfoSummaryTable` 组件；删除旧 SimpleMetricCard 横排区块；OOS 净值曲线保留在上方，表格置于曲线下方 |

#### WfoSummaryTable 设计细节

| 要素 | 说明 |
|------|------|
| 列结构 | 指标名（左） / 🟣 策略 OOS（中，紫色调） / QQQ 基准（右） |
| 指标行 | 年化收益 CAGR、Sharpe Ratio、最大回撤 MDD、累积收益 + 最佳年度、最差年度（有数据时自动出现） |
| 颜色标注 | 策略值绿色（胜）/ 红色（负），QQQ 保持中性色 |
| ▲▼ 指示器 | 每行策略值旁显示方向箭头 |
| 胜出徽章 | 标题栏右侧「策略胜出 X / N 项指标」，绿/黄/红随胜率变色 |
| 渐变标题栏 | 深紫→深蓝渐变（暗色）/ 浅紫→浅蓝渐变（亮色） |
| 策略列背景 | 持续淡紫色 tint，与列标题视觉统一 |
| 比较逻辑 | 统一用 sv > qv 判断（MDD 负值同理：-0.15 > -0.20 = 策略回撤更小 = 胜） |

#### 布局顺序（WFO 结果区域）

1. 运行摘要信息条
2. 参数一致性说明
3. 窗口明细表（含「应用并回测」按钮）
4. **OOS 净值曲线**（保留）
5. **WfoSummaryTable**（新增，替换旧卡片）
6. Mode A vs Mode B 对比表（保留，供过拟合参考）

---

## 🚧 Session 15 进行中（2026-05-25）

### 全策略 WFO Performance Summary 统一改版

将所有策略的 Mode B 绩效展示统一为精美对比表，覆盖 5 个策略。

#### 方案确认
- **共享组件**：`src/shared/WfoSummaryTable.jsx`，4 个策略共用
- **QQQ轮转 / QQQ成分股**：策略 OOS vs QQQ 基准（2列）
- **ETF三策略**：策略 OOS vs QQQ 基准 vs SPY 基准（3列）
- **胜出徽章**：`vs QQQ: X/N 项 · vs SPY: Y/N 项`（分开显示）
- **ETF wfo.js**：需新增 SPY 基准追踪（`combinedSpyOosEquity` + `spyCombinedMetrics`）

#### 当前进度
| 步骤 | 状态 |
|------|------|
| 1. 创建 `src/shared/WfoSummaryTable.jsx` | ✅ |
| 2. `src/etf/optimization/wfo.js` 加 SPY 追踪 | ✅ |
| 3. `src/qqq/QqqRotationTab.jsx` 改 import + 删本地定义 | ✅ |
| 4. `qqq-momentum.jsx` 接入共享组件 | ✅ |
| 5. `src/etf/EtfStrategyTab.jsx` 接入双基准 | 🚧 进行中 |

#### 格式注意
- QqqRotationTab / EtfStrategyTab 的 metrics 为小数（decimal）
- qqq-momentum.jsx 的 `calcPortMetrics` 返回百分比（%），需 ÷100 归一化再传入

---

## 下一步（待规划）

所有规划功能已全部完成，可根据需要开展新功能或优化。
