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
├── .gitignore              # 排除 .env / node_modules / dist / .vercel
├── 启动QQQ扫描器.command   # 双击启动（Safari）
└── handoff.md
```

## 当前状态 ✅

| 项目 | 状态 |
|------|------|
| 本地运行 | ✅ 双击 `启动QQQ扫描器.command` → Safari 自动打开 |
| 线上部署 | ✅ https://qqq-momentum-scanner.vercel.app |
| GitHub | https://github.com/frankchang617/qqq-momentum-scanner |
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
- 20日涨幅 × 0.45 + 50日涨幅 × 0.35 + 200日涨幅 × 0.20 = 综合得分
- 数据：Yahoo Finance 日线，取最近 252 个交易日

## 部署更新流程
```bash
git add -A && git commit -m "描述" && git push
# Vercel 自动检测 GitHub push 并重新部署
```
