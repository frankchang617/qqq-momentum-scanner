# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24（修复运行回测全部为0的根本原因）

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
| 排名指标 | 综合评分 / 20日 / 50日 / 200日 |
| 持仓数量 | Top 5 / 10 / 20 |
| 调仓频率 | 每周（5日）/ 每月（21日）|
| 缓冲换股 | 进 Top N 买入，跌出 Top 1.5N 才卖 |
| QQQ均线滤网 | QQQ 跌破 200 日均线时全部转现金 |

#### 绩效面板（策略 vs QQQ）
- 指标卡：CAGR、Sharpe Ratio、最大回撤 MDD、累积收益、换股次数
- 净值曲线（SVG，策略蓝线 + QQQ 灰虚线）
- 回撤曲线（SVG，红色填充）
- 年度收益柱状图（策略蓝 vs QQQ 灰）
- 月度收益热图（绿/红色阶）

#### 一键优化（96 种参数组合）
- 遍历：排名×4 × Top N×3 × 频率×2 × 缓冲×2 × 均线×2 = 96 种
- 输出前 5 名：Sharpe 最高 / CAGR 最高 / MDD 最低 / CAGR/MDD 最优
- 点「应用」直接填回参数区

#### Walk Forward Optimization
- 自动按数据长度决定窗口：≥4年 → 3年 in-sample + 1年 out-sample；2-4年 → 按 60%/20% 比例
- 逐窗口：in-sample 跑 96 组优化找最佳参数 → out-sample 验证
- 串接所有 out-sample 画净值曲线，汇总 CAGR/Sharpe/MDD vs QQQ

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
| `runAllCombos(histData,commonTs,qqqCloses,start,end)` | 遍历 96 种参数组合，返回全量结果 |
| `runWFO(histData,commonTs,qqqCloses)` | Walk Forward：滚动窗口优化+验证，串接 out-sample |

## 部署更新流程
```bash
git add -A && git commit -m "描述" && git push
# Vercel 自动检测 GitHub push 并重新部署
# 若自动部署失败：npx vercel --prod
```

## 主题系统

`DARK` / `LIGHT` 两个常量对象定义所有颜色 token（pageBg、cardBg、border、text 等），App 内 `const T = darkMode ? DARK : LIGHT`，所有 inline style 引用 `T.xxx`。信号颜色（绿/红）不在 theme 内，全局统一。

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
