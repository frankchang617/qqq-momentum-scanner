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
| GitHub → Vercel 自动部署 | ✅ 已连接（Settings → Git → Connected just now） |
| 数据源 | Yahoo Finance（免费，无需 API Key） |
| 成分股 | 101 只（2026-05 最新 Nasdaq-100） |
| 扫描时间 | 约 20 秒 |

## 架构说明

### 数据流
1. 前端调用 `/api/yahoo?symbol=AAPL`
2. **本地开发**：vite.config.js 的自定义 middleware 处理，启动时自动获取 crumb + cookie
3. **生产（Vercel）**：`api/yahoo.js` Edge Function 处理，运行在 Cloudflare 边缘节点（绕过 Yahoo Finance 对 AWS 数据中心 IP 的封锁），每次请求自动获取 crumb

### 为什么用 Edge Function 而非 Serverless Function
Yahoo Finance 会封锁 AWS/Vercel Lambda 的数据中心 IP，但 Cloudflare 边缘节点（Edge Function 的运行环境）不受限制。

### 动能计算
- `ret20 × 0.45 + ret50 × 0.35 + ret200 × 0.20` = 综合得分
- 数据：Yahoo Finance 日线，取最近 252 个交易日（改自原来的 202，为了回测有更多历史数据）

## 已实现功能

### 主列表
- 综合得分排行榜，支持按 20D/50D/200D 涨幅和夏普比切换排序
- Top 10/20/30/50 切换，刷新按钮
- **信号列**：买入参考（绿）/ 观望（橙）/ — 三档，逻辑见下方
- **一致性列**：●●● 三点显示 20D/50D/200D 涨跌方向（绿=正，红=负）
- **精选筛选面板**：三周期同向 / 20日≥+20% / 夏普50≥1.0，开启时自动剔除 200D 后25%极端尾部，显示通过数量

### 顶部统计卡
- 已扫描数量、正/负动能只数、均值20D涨幅
- **QQQ 大盘状态**：实时抓取 QQQ 自身数据，判断是否高于200日均线（趋势健康 / 趋势偏弱）

### 展开行（点击任意股票）
- 200日价格走势大图（Sparkline）
- 9格指标卡：20/50/200D 涨幅、波动率、夏普、综合得分、现价
- **回测面板**：
  - 入场信号：前一日价格 > 均线×1.01（在均线上方），当日收盘落入均线 ±2% 区间，次日开盘价买入
  - 硬止损：-9%，始终生效，与出场模式无关
  - 三种出场模式（按钮切换）：
    - **均线破位出**（默认）：收盘跌破入场均线立即出，无时间限制，自然跟随趋势
    - **追踪止损7%**：从阶段高点回落7%出场，锁住浮盈
    - **固定20日**：持有满20个交易日出场，作为对照基准
  - 显示：触发次数、均持天数、平均收益、胜率、最好/最差单次
  - 测试四条均线：5D / 20D / 50D / 200D（数据不足时显示"无触发信号"）
- **止损计算器**：输入买入价，自动显示止损价（×91%）、现价距买入涨跌幅、是否触发止损

### 信号徽标逻辑
**买入参考**（全部满足）：
- 综合得分全量排名前15
- 三周期全正（ret20/50/200 均 > 0）
- 夏普50 ≥ 1.0
- 20日涨幅 ≤ 60%（过热排除）

**观望**（任一满足）：
- 200日涨幅 > 200%（数据异常或严重过热）
- 三周期不全正

## 部署更新流程
```bash
git add -A && git commit -m "描述" && git push
# Vercel 自动检测 GitHub push 并重新部署（已配置 GitHub App）
# 若自动部署失败，手动执行：npx vercel --prod
```

## 踩过的坑
- Finnhub 免费版不支持历史日线数据（`/stock/candle` 需付费）
- Yahoo Finance 无 CORS 头，浏览器直接请求被拦截 → 需代理
- Yahoo Finance 需要 crumb token，直接代理无效 → fc.yahoo.com 获取 cookie + getcrumb
- Vercel Lambda（AWS）IP 被 Yahoo Finance 封锁 → 改用 Edge Function（Cloudflare 节点）
- useEffect 依赖 useCallback 时必须在 useCallback 之后声明，否则 TDZ 报错导致白屏
- Vercel 未连接 GitHub 时 git push 不触发自动部署 → Settings → Git → Install GitHub App → 选仓库
