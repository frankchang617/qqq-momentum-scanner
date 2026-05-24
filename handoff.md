# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 3（ETF 策略步骤结构对齐 QQQ 风格）

## 项目结构

```
追踪QQQ动能最强的股票/
├── qqq-momentum.jsx        # 全部业务逻辑与 UI（单文件）
├── src/main.jsx            # Vite 入口
├── index.html              # HTML 模板
├── vite.config.js          # 开发服务器 + Yahoo Finance 本地代理（含 crumb 认证）
├── api/yahoo.js            # Vercel Edge Function：Yahoo Finance 代理
├── vercel.json             # Vercel 构建配置
├── package.json
├── .gitignore
├── 启动QQQ扫描器.command   # 双击启动（Safari，http://localhost:5174）
└── handoff.md
```

## 当前状态 ✅

| 项目 | 状态 |
|------|------|
| 本地运行 | ✅ 双击 `启动QQQ扫描器.command` → Safari 自动打开 |
| 线上部署 | ✅ https://qqq-momentum-scanner.vercel.app |
| GitHub | https://github.com/frankchang617/qqq-momentum-scanner |
| GitHub → Vercel 自动部署 | ✅ 已连接（Settings → Git） |
| 数据源 | Yahoo Finance（免费，无需 API Key，返回 OHLCV + adjclose） |
| 成分股 | 101 只（2026-05 最新 Nasdaq-100） |
| 扫描时间 | 约 20 秒 |
| 策略回测数据 | Yahoo Finance adjclose，支持 2Y / 3Y / 5Y，加载约 2-3 分钟 |

## 架构说明

### 数据流
1. 前端调用 `/api/yahoo?symbol=AAPL`
2. **本地开发**：vite.config.js 的自定义 middleware 处理，启动时自动获取 crumb + cookie
3. **生产（Vercel）**：`api/yahoo.js` Edge Function 处理，运行在 Cloudflare 边缘节点（绕过 Yahoo Finance 对 AWS 数据中心 IP 的封锁）

### 为什么用 Edge Function 而非 Serverless Function
Yahoo Finance 会封锁 AWS/Vercel Lambda 的数据中心 IP，Cloudflare 边缘节点不受限制。

### 数据格式
- `fetchCandles` 返回 `{ c, h, l }[]`（收盘/最高/最低），取最近 252 天，用于扫描器
- `fetchCandlesExtended(symbol, range, signal)` 返回 `{ c, ts }[]`（adjclose + 时间戳），用于策略回测
- `api/yahoo.js` 和 `vite.config.js` 均已透传 `range` 参数（默认 `1y`，策略回测传 `2y/3y/5y`）
- `runScan` 拆解为 `closes[]` / `highs[]` / `lows[]` 三个数组存入 row
- 高低价用于 ATR 精确计算（Wilder 平滑法）

### 动能计算
- `ret20 × 0.45 + ret50 × 0.35 + ret200 × 0.20` = 综合得分

## 已实现功能

### 策略回测标签页（新增）

导航栏新增「策略回测」标签，与扫描器并列，互不干扰。

#### Step 1 · 加载历史数据
- 选择历史深度：2年 / 3年 / 5年
- 点「加载历史数据」→ 拉取 101 只成分股 + QQQ 的 adjclose 数据
- 时间戳对齐到 QQQ 日历（`alignHistData`），空值前向填充
- 存入 `histData: Map<symbol, closes[]>`（key `__QQQ__` 存 QQQ 本身）

#### Step 2 · 策略参数
| 参数 | 选项 |
|------|------|
| 动能回看期 | 综合评分 / 20日 / 50日 / 200日 |
| 持仓数量 TopN | Top 3/5/10/15/20/25/30 |
| 调仓频率 | 每日（1日）/ 每周（5日）/ 每月（21日）/ 每季（63日）|
| 市场过滤 | 不过滤 / QQQ>MA50 / QQQ>MA100 / QQQ>MA200 |
| Grid Search 参数组合数 | 4×7×4×4 = 448 种 |

#### 绩效面板（策略 vs QQQ）
- 指标卡：CAGR、Sharpe Ratio、最大回撤 MDD、累积收益、换股次数
- 净值曲线（SVG，策略蓝线 + QQQ 灰虚线）
- 回撤曲线（SVG，红色填充）
- 年度收益柱状图（策略蓝 vs QQQ 灰）
- 月度收益热图（绿/红色阶）

#### 参数全量扫描（Grid Search，448 种参数组合）
- 遍历：动能回看期×4 × TopN×7 × 调仓频率×4 × 市场过滤×4 = 448 种（全量历史数据）
- ⚠️ 全量数据上选参存在过拟合风险，仅用于探索，无偏验证请用 Mode B WFO
- 输出前 5 名：Sharpe 最高 / CAGR 最高 / MDD 最低 / CAGR/MDD 最优
- 点「应用并回测」直接填回 Mode A 参数区

#### Walk Forward Optimization（重写后的正确逻辑）
- **窗口设计**：70% in-sample / 30% out-of-sample，按 OOS 步长滚动（数据自适应）
- **正确流程**：① in-sample 跑 Grid Search(448种) → ② 按 optMetric 选最佳参数 → ③ 固定参数跑 OOS → ④ 只记录 OOS 绩效，不重新选参 → ⑤ 串接所有 OOS 得总绩效
- **严格约束**：OOS 结果不参与任何参数选择，不显示"OOS 最佳参数"
- **optMetric 可选**：Sharpe（推荐）/ CAGR / Calmar(CAGR/MDD)
- **窗口明细表**：显示 in-sample 时间、OOS 时间、in-sample 选出的参数（TopN/动能回看/调仓频率/市场过滤）、IS 评分、OOS CAGR/Sharpe/MDD/总收益

#### 量化正确性保证
- **无未来数据**：排名用 T-1 收盘，交易用 T 收盘（日线数据无 T+1 开盘时的标准近似）
- **时间戳严格对齐**：以 QQQ 日历为基准，其他股票空值前向填充
- **使用 adjclose**：已处理拆股与分红，避免假信号
- **幸存者偏差**：明确标注使用当前成分股，历史上被剔除的股票未计入

### UI 增强
- **固定表头**：使用 `borderCollapse:"separate"` + `position:sticky`，向下滚动时表头始终可见（`borderCollapse:"collapse"` 与 sticky 不兼容，是此前失效的根因）
- **亮/暗模式切换**：右上角按钮一键切换，背景/文字/卡片/边框全部跟随主题，信号颜色不变

### 主列表
- 综合得分排行榜，支持按 20D/50D/200D 涨幅和夏普比切换排序
- Top 10/20/30/50 切换，刷新按钮
- **信号列**：买入参考（绿）/ 观望（橙）/ —
- **一致性列**：●●● 三点显示 20D/50D/200D 涨跌方向
- **精选筛选面板**：三周期同向 / 20日≥+20% / 夏普50≥1.0，开启时自动剔除 200D 后25%极端尾部

### 顶部统计卡
- 已扫描数量、正/负动能只数、均值20D涨幅
- **QQQ 大盘状态**：实时抓取 QQQ 自身，判断是否高于200日均线

### 展开行（点击任意股票）
- 200日价格走势大图
- 9格指标卡：20/50/200D 涨幅、波动率、夏普、综合得分、现价

#### 资金模拟

- **策略回测**：MetricCard 下方「起始资金」输入框，实时显示「策略最终 $XXX」vs「QQQ 最终 $XXX」及超额收益
- **单股回测**：「每笔入场 $X」输入框，各均线卡片底部显示顺序复利总盈亏

#### 单股回测长周期（1Y / 2Y / 3Y / 5Y）

- 展开行顶部加「回测期间」选择器，默认 1年（直接用扫描器数据）
- 选 2/3/5年后出现「↓ 加载历史数据」按钮，点击按需从 Yahoo Finance 抓取该股 OHLCV
- `fetchCandlesOHLC(symbol, range, signal)`：adjclose 做收盘，按 adjclose/close 比例缩放 high/low（处理拆股）
- 数据按 `${symbol}_${range}` 缓存在 `btLongData` state，同 session 内不重复请求
- 长周期 `vol20` 从完整数据末尾重新计算，而非用扫描器的1年 vol20
- 各均线卡片展示：CAGR、Sharpe、MDD（顺序复利净值曲线）、vs QQQ（扫描器1年数据）、总盈亏

#### 回测面板（核心功能）

**测试均线**：5D / 10D / 20D / 50D / 200D（数据不足时显示"无触发信号"）

**入场方式（4选1，紫色按钮）：**

| 模式 | 逻辑 |
|------|------|
| 触线即买 | 价格回调至均线 ±2%，次日买入 |
| 反弹确认再买 | 回调触线后，等次日收盘站回均线上方，再次日买入 |
| 冲量+触线 | Elder冲量系统绿色 + 触线，次日买入 |
| 冲量+反弹确认 | Elder冲量系统绿色 + 反弹确认，再次日买入 |

**出场方式（8选1，蓝色按钮）：**

| 模式 | 逻辑 |
|------|------|
| 均线破位 | 收盘跌破入场均线平仓（无时间限制，跟随趋势） |
| 固定金额追踪 | 从阶段高点下跌超过买入价×20%（vol20≤50%）或×30%（vol20>50%）平仓 |
| ATR×2 | 从阶段高点下跌超过 2×ATR(14) 平仓（用真实高低价计算） |
| ATR×3 | 从阶段高点下跌超过 3×ATR(14) 平仓 |
| RSI>70 | RSI(14) 超过 70（超买）时平仓 |
| MACD死叉 | MACD 柱从正转负时平仓 |
| 追踪止损7% | 从阶段高点回落 7% 平仓 |
| 固定20日 | 持有满20个交易日平仓（对照基准） |

**硬止损**：-9%，所有模式常驻生效，哪个先触发就用哪个出场。

**回测结果显示**：触发次数、均持天数、平均收益、胜率、最好/最差单次

#### 止损计算器
输入买入价 → 自动显示止损价（×91%）、现价涨跌幅、是否触发止损警告

#### Elder 冲量系统（Impulse System）
- 13日EMA 方向 + MACD(12,26,9) 柱方向
- 两者均向上 → 绿色（可买）
- 两者均向下 → 红色（避免买入）
- 方向不一致 → 蓝色（观望）

### 信号徽标逻辑
**买入参考**（全部满足）：综合得分全量排名前15 + 三周期全正 + 夏普50≥1.0 + 20日涨幅≤60%

**观望**（任一满足）：200日涨幅>200% 或 三周期不全正

## 技术指标函数（纯函数，无副作用）

| 函数 | 说明 |
|------|------|
| `maArrFn(closes, period)` | 简单移动均线数组，O(n) |
| `emaArrFn(src, period)` | 指数移动均线，支持含 null 的输入 |
| `atrArrFn(highs, lows, closes, 14)` | ATR，Wilder 平滑法 |
| `rsiArrFn(closes, 14)` | RSI，Wilder 平滑法 |
| `macdArraysFn(closes)` | MACD(12,26,9)，返回 {macdLine, signalArr, histArr} |
| `impulseArrFn(closes)` | Elder冲量系统，返回 'green'/'red'/'blue'/null |
| `backtest(closes,highs,lows,maDays,entryMode,exitMode,vol20)` | 单股回测核心，4×8 模式 |
| `portfolioBacktest(histData,commonTs,qqqCloses,params,start,end)` | 组合回测，缓冲换股 + QQQ滤网，无未来数据 |
| `buildQqqEquity(qqqCloses,startIdx,endIdx)` | 构造 QQQ 买持净值曲线（基准对比） |
| `calcPortMetrics(equityCurve,timestamps)` | CAGR / Sharpe / MDD / 年度收益 / 月度收益 |
| `runAllCombos(histData,commonTs,qqqCloses,start,end)` | 遍历 448 种参数组合（4×7×4×4），返回全量结果 |
| `runWFO(histData,commonTs,qqqCloses,optMetric)` | Walk Forward：70/30 滚动窗口，in-sample 选参→OOS 验证，串接 out-sample |

## 部署更新流程
```bash
git add -A && git commit -m "描述" && git push
# Vercel 自动检测 GitHub push 并重新部署
# 若自动部署失败：npx vercel --prod
```

## 主题系统

`DARK` / `LIGHT` 两个常量对象定义所有颜色 token（pageBg、cardBg、border、text 等），App 内 `const T = darkMode ? DARK : LIGHT`，所有 inline style 引用 `T.xxx`。信号颜色（绿/红）不在 theme 内，全局统一。

## ✅ 已完成：ETF 跨资产策略模块（Session 2，2026-05-24）

### 已确认的架构决策

| 决策项 | 确认内容 |
|--------|---------|
| VIX 数据 | 真实 `^VIX`（Yahoo Finance）+ QQQ 自算 20日实现波动率，两个都要 |
| 代码结构 | 拆成多个文件（不再单文件）|
| 历史数据深度 | 10 年（`range=10y`）|
| ETF 池 | QQQ、SPY、XLK、DXJ、TLT、GLD、SHY、TSM、SOXX（含 DXJ 确认）|
| 整体最佳定义 | Sharpe×40% + MDD×35% + CAGR×25%（百分位加权）|
| UI 方案 | 策略回测 Tab 内新增二级 Tab："QQQ成分股轮动" \| "ETF跨资产策略" |
| 手续费 | 默认 0 |
| Walk Forward | 3年 in-sample + 1年 out-of-sample，按年滚动 |

### 新增文件结构（计划）

```
src/etf/
├── strategies/
│   ├── metrics.js          # 绩效指标纯函数（CAGR/Sharpe/MDD/年度/月度）
│   ├── momentum.js         # 策略1：强势轮动（4回看×3持仓×3防御=36种）
│   ├── dualMomentum.js     # 策略2：双动能（3×2×3=18种）
│   └── volControl.js       # 策略3：波动率控管（2×3×3×2=32种）
├── optimization/
│   ├── gridSearch.js       # 一键优化（86种参数组合，百分位综合评分）
│   └── wfo.js              # Walk Forward（3y IS + 1y OOS 滚动）
├── data/
│   └── fetchEtfData.js     # 拉取9个ETF + ^VIX，10年，时间戳对齐
└── ui/
    ├── EtfStrategyTab.jsx  # 主容器（二级 Tab + 三级策略选择器）
    ├── panels/
    │   ├── StrategyPanel.jsx   # 参数选择 + 运行按钮
    │   ├── ResultsPanel.jsx    # 绩效面板
    │   ├── OptimizePanel.jsx   # 一键优化结果排名
    │   └── WfoPanel.jsx        # WFO 窗口明细
    └── charts/
        ├── EquityChart.jsx     # 净值曲线（策略 vs QQQ vs SPY，3条线）
        ├── DrawdownChart.jsx   # 回撤曲线
        ├── AnnualBar.jsx       # 年度收益柱状图
        ├── MonthlyHeatmap.jsx  # 月度热图
        ├── ParamHeatmap.jsx    # 参数热图（新）
        ├── StrategyRanking.jsx # 策略排名表（新）
        └── TradeLog.jsx        # 每次交易记录（新）
```

### 三个策略参数网格

| 策略 | 参数 | 选项 | 组合数 |
|------|------|------|--------|
| 强势轮动 | lookback×topN×defensiveAsset | 4×3×3 | 36 |
| 双动能 | lookback×maFilter×defensiveAsset | 3×2×3 | 18 |
| 波动率控管 | volSource×lowVol×highVol×defensiveAsset（低<高约束） | 2×4×2 | 32 |
| **合计** | | | **86** |

### 量化正确性约束
- 信号用 T-1 收盘计算，T 收盘执行（月调仓：月末信号，次日收盘执行）
- 使用 adjclose（处理拆股分红）
- 幸存者偏差：注明使用当前成分，未追溯历史调整
- 手续费默认 0，界面可调

### 当前进度
- [x] 架构方案确认
- [x] 读取现有代码结构（fetchCandlesExtended 模式、主题系统、Tab 切换方式）
- [x] `src/etf/strategies/metrics.js` — CAGR/Sharpe/MDD/年度/月度/百分位综合评分
- [x] `src/etf/strategies/momentum.js` — 策略1强势轮动（36种参数，月调仓）
- [x] `src/etf/strategies/dualMomentum.js` — 策略2双动能（18种参数，MA趋势过滤）
- [x] `src/etf/strategies/volControl.js` — 策略3波动率控管（32种有效参数，含QQQ Vol20计算）
- [x] `src/etf/optimization/gridSearch.js` — 一键优化（86种组合，百分位综合评分，extractBest）
- [x] `src/etf/optimization/wfo.js` — WFO（3y IS + 1y OOS 滚动，稳定性指标）
- [x] `src/etf/data/fetchEtfData.js` — 10年数据加载，VIX对齐，批次请求
- [x] `src/etf/ui/charts/EtfEquityChart.jsx` — 3条线（策略/QQQ/SPY）
- [x] `src/etf/ui/charts/EtfDrawdownChart.jsx` — 回撤曲线，MDD标注
- [x] `src/etf/ui/charts/EtfAnnualBar.jsx` — 年度收益柱状图
- [x] `src/etf/ui/charts/EtfMonthlyHeatmap.jsx` — 月度热图
- [x] `src/etf/ui/charts/ParamHeatmap.jsx` — 参数热图（X/Y轴任意参数）
- [x] `src/etf/ui/charts/StrategyRanking.jsx` — 策略排名表（Top 20，可应用）
- [x] `src/etf/ui/charts/TradeLog.jsx` — 交易记录表
- [x] `src/etf/EtfStrategyTab.jsx` — 完整主容器（含三策略面板 + 一键优化 + WFO）
- [x] `src/etf/EtfStrategyTab.jsx` — 完整主容器
- [x] `qqq-momentum.jsx` — 加入 import + 第三个 Tab `"etf"`
- [x] 构建成功（c94d910），已推送 GitHub / Vercel
- [x] **UI 已修正为方案A**（commit df5e15e）：顶栏保持 2 Tab，策略回测内部加二级 Tab
  - 顶栏：`扫描器 | 策略回测`
  - 策略回测内顶部：`[ QQQ 成分股轮动 ]  [ ETF 跨资产策略 ]`
  - `btSubTab` state 控制切换（'qqq' | 'etf'）

### 关键代码约定（来自现有代码分析）
- fetch 模式：`/api/yahoo?symbol=XXX&range=10y`，VIX 用 `encodeURIComponent('^VIX')`
- 返回格式：`result.timestamp[]` + `result.indicators.adjclose[0].adjclose[]`
- 主题：`DARK`/`LIGHT` 对象，通过 props 传 `T` 和 `darkMode`
- Tab 切换：`activeTab` state + button 数组 map

---

## Session 3 变更（2026-05-24）

### ETF 跨资产策略步骤结构对齐 QQQ 风格

**改动文件**：`src/etf/EtfStrategyTab.jsx`

**问题**：ETF 策略用一个大 Step 2 卡片 + 内部 5 个 Tab（强势轮动/双动能/波动率控管/一键优化/Walk Forward），与 QQQ 的扁平分层结构不一致。

**修改内容**：
- `stratTabs` 改为仅保留 3 个策略 Tab（强势轮动 / 双动能 / 波动率控管）
- 新增 `showOpt` / `showWfo` state
- Step 1 标题样式改为 `STEP 1 · ...`（全大写 + letterSpacing，与 QQQ 一致）
- Step 1 加载按钮样式改为与 QQQ 相同（`#004488/#0055cc` + `#88ccff/#ffffff` 文字）
- Step 1 进度条改为蓝绿渐变（`linear-gradient(90deg,#005bcc,#00c96e)`）
- Step 2 标题同步改为 `STEP 2 · ...` 风格
- **一键优化**：从 Tab 4 独立出来，改为 Step 2 下方的**可折叠手风琴**（蓝色 ▶/▼，与 QQQ Grid Search 一致）
- **Walk Forward**：从 Tab 5 独立出来，改为最下方**可折叠手风琴**（紫色 ▶/▼ + `MODE B` 徽标，与 QQQ WFO 一致）

**最终布局结构**（对齐后）：
```
STEP 1 · 加载历史数据（10年）         ← 卡片
STEP 2 · 选择策略并回测               ← 卡片
  [强势轮动] [双动能] [波动率控管]     ← 三策略 Tab
  参数 + 运行按钮 + 结果               ← 内容区
▶ 参数全量扫描（一键优化，86种组合）   ← 可折叠，展开后渲染 OptimizePanel
▶ MODE B  Walk Forward Optimization   ← 可折叠，展开后渲染 WfoPanel
```

**当前状态**：代码已修改，待验证运行。

---

## Session 2 commit 记录（2026-05-24）

| commit | 内容 |
|--------|------|
| `c94d910` | feat: 新增 ETF 跨资产策略模块（19 个新文件，2997 行新增）|
| `df5e15e` | fix: ETF 策略改为策略回测 Tab 内的二级 Tab（方案A），顶栏保持 2 个 Tab |

### 踩坑记录（Session 2）
- `qqq-momentum.jsx` 在项目根目录，import 新的 `src/etf/` 文件需用 `./src/etf/` 而非 `./etf/`
- 在已有 JSX 块内插入新的条件渲染 + 容器 div，必须同时维护所有闭合标签，否则出现"JSX 元素没有对应结束标记"错误

---

## 近期变更（2026-05-24 Session 1）

| commit | 内容 |
|--------|------|
| `4c3be31` | MDD 始终显示红色（`MetricCard` 新增 `alwaysRed` prop）；`EquityCurveChart` / `DrawdownChart` 接收 `timestamps`，底部渲染年份横轴刻度 |
| `5aed0c9` | 亮色模式蓝色按钮（加载历史数据 / 运行固定参数回测 / 开始优化）文字改白色 |
| `bac0a83` | 亮色模式紫色按钮（运行 WFO）文字改白色 |
| `d9afdd0` | 亮色模式 MODE B 徽标文字改白色（MODE A 原本已是白色） |
| `1c1e87b` | 加载历史数据按钮加载中状态文字跟随主题（临时修复） |
| `eeec3f4` | 加载历史数据按钮加载中保持蓝底白字 + opacity 0.6，与「开始优化」风格完全一致 |

### 规律总结：深色背景按钮颜色规则
- **未运行**：蓝底/紫底 + `darkMode ? 淡色 : #ffffff`（白字）
- **运行中**：保持同色背景 + `opacity: 0.6` + `cursor: not-allowed`（不改背景为 transparent）
- **MODE X 徽标**：`darkMode ? 淡色 : #ffffff`

## 踩过的坑
- Finnhub 免费版不支持历史日线（需付费）→ 改用 Yahoo Finance
- Yahoo Finance 无 CORS 头 → Vite proxy（本地）+ Edge Function（生产）
- Yahoo Finance 需要 crumb token → fc.yahoo.com 获取 cookie + getcrumb
- Vercel Lambda IP 被封 → 改用 Edge Function（Cloudflare 节点）
- useEffect 依赖 useCallback 时必须在其后声明，否则 TDZ 报错导致白屏
- Vercel 未连接 GitHub 时 push 不触发自动部署 → Settings → Git → Install GitHub App
- `position:sticky` 表头失效 → 根因是 `borderCollapse:"collapse"`，必须改为 `"separate"` + `borderSpacing:0`，分割线改用 `boxShadow`
- 一键优化「应用」按钮点击无反应 → 原因是只调用了 `setStratParams`（state 异步更新），回测未重跑；修复：`runStratBacktest` 新增 `overrideParams` 参数，「应用」改为「应用并回测」，先将参数存入局部变量 `p`，同步传给 `setStratParams(p)` 和 `runStratBacktest(p)`
- 「运行回测」点击后指标全为0、换股次数0 → 根本原因：`onClick={runStratBacktest}` 让 React 把 SyntheticEvent 作为第一个参数传入，`overrideParams = event`（truthy），覆盖了 `stratParams`，导致 `sortMetric=undefined`，所有排名条件不匹配，`ranked` 始终为空；修复：改为 `onClick={()=>runStratBacktest()}`，无参调用
- WFO 运行结果永远只显示1个窗口 → 根本原因：循环条件 `pos+inDays+outDays <= N` 要求 out-sample 必须是完整 outDays 天；5年数据实际交易日约1255天（不足整1260），第2窗口条件 `1260 <= 1255` 不满足；修复：改为 `pos+inDays+60 < N`，允许最后一个窗口的 out-sample 截短到数据末尾（`outEnd=Math.min(..., N)`）
- MDD 显示为正数（如 +20.3%）语义错误 → `calcPortMetrics` 改为返回 `-mdd`（负数），所有 MetricCard 的 MDD 改 `higherBetter=true`（越接近0越好），一键优化排序改为降序，CAGR/MDD 比率改用 `Math.abs`
- 单股回测新增 CAGR/Sharpe/MDD 均基于顺序复利净值曲线（trade by trade），样本量小（3～8次），看方向比看绝对值更有意义
- WFO 原始错误：`runAllCombos` 仅测 topN=[5,10,20]、rebalanceFreq=['weekly','monthly']、参数仅96种，且窗口设计用固定3y+1y / 60%+20%，与 70/30 原则不符 → 全部重写：Grid Search 扩展到 448种（4×7×4×4），70/30 窗口，marketFilter 替换 qqq200Filter，新增 daily/quarterly 调仓
- 按钮加载中 background 改为 transparent 导致亮色模式文字不可见 → 规则：加载中**不改背景色**，只加 `opacity:0.6` + `cursor:not-allowed`；文字颜色随背景保持不变

## Claude Code 开发环境配置

### 全局 Hook（~/.claude/settings.json）
- **PostToolUse hook**：每完成 10 次工具调用，自动向 Claude 注入 `additionalContext` 提醒写 handoff.md
  - 计数器存储在 `/tmp/.cc_<session_id>`，按 session 独立计数
  - 触发条件：`CNT % 10 === 0`，输出 `hookSpecificOutput.additionalContext` JSON
  - 适用所有项目（全局配置）
- **Superpowers 插件**：已安装 v5.1.0（claude-plugins-official），含 14 个 skills（并行 agent、TDD、调试等）
  - 位置：`~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/`

## 函数签名变化（2026-05-24 WFO 重写）
- `portfolioBacktest(params)` 新增 `marketFilter:'none'|'ma50'|'ma100'|'ma200'` 替代 `qqq200Filter:bool`（向后兼容）；`rebalanceFreq` 新增 `'daily'`/`'quarterly'`
- `runAllCombos(histData,commonTs,qqqCloses,rangeStart,rangeEnd)` 参数网格从 96→448 种
- `runWFO(histData,commonTs,qqqCloses,optMetric='sharpe')` 新增 optMetric 参数，窗口改为 70/30，返回值新增 `windowCount`/`totalCombos`/`optMetric`，`windowResults[i]` 新增 `inSampleScore`/`inSampleCAGR`/`inSampleMDD`/`inSampleComboCnt`
