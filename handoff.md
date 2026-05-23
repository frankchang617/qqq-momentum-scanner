# Handoff — QQQ Momentum Scanner

更新时间：2026-05-23

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
| 数据源 | Yahoo Finance（免费，无需 API Key，返回 OHLCV） |
| 成分股 | 101 只（2026-05 最新 Nasdaq-100） |
| 扫描时间 | 约 20 秒 |

## 架构说明

### 数据流
1. 前端调用 `/api/yahoo?symbol=AAPL`
2. **本地开发**：vite.config.js 的自定义 middleware 处理，启动时自动获取 crumb + cookie
3. **生产（Vercel）**：`api/yahoo.js` Edge Function 处理，运行在 Cloudflare 边缘节点（绕过 Yahoo Finance 对 AWS 数据中心 IP 的封锁）

### 为什么用 Edge Function 而非 Serverless Function
Yahoo Finance 会封锁 AWS/Vercel Lambda 的数据中心 IP，Cloudflare 边缘节点不受限制。

### 数据格式
- `fetchCandles` 返回 `{ c, h, l }[]`（收盘/最高/最低），取最近 252 天
- `runScan` 拆解为 `closes[]` / `highs[]` / `lows[]` 三个数组存入 row
- 高低价用于 ATR 精确计算（Wilder 平滑法）

### 动能计算
- `ret20 × 0.45 + ret50 × 0.35 + ret200 × 0.20` = 综合得分

## 已实现功能

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

**测试均线**：5D / 20D / 50D / 200D（数据不足时显示"无触发信号"）

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
| `backtest(closes,highs,lows,maDays,entryMode,exitMode,vol20)` | 回测核心，4×8 模式 |

## 部署更新流程
```bash
git add -A && git commit -m "描述" && git push
# Vercel 自动检测 GitHub push 并重新部署
# 若自动部署失败：npx vercel --prod
```

## 踩过的坑
- Finnhub 免费版不支持历史日线（需付费）→ 改用 Yahoo Finance
- Yahoo Finance 无 CORS 头 → Vite proxy（本地）+ Edge Function（生产）
- Yahoo Finance 需要 crumb token → fc.yahoo.com 获取 cookie + getcrumb
- Vercel Lambda IP 被封 → 改用 Edge Function（Cloudflare 节点）
- useEffect 依赖 useCallback 时必须在其后声明，否则 TDZ 报错导致白屏
- Vercel 未连接 GitHub 时 push 不触发自动部署 → Settings → Git → Install GitHub App
