# Handoff — QQQ Momentum Scanner

更新时间：2026-05-23

## 项目结构

```
追踪QQQ动能最强的股票/
├── qqq-momentum.jsx        # 全部业务逻辑与 UI（单文件）
├── src/main.jsx            # Vite 入口，挂载根组件
├── index.html              # HTML 模板
├── vite.config.js          # Vite 配置（含 Yahoo Finance 代理 + crumb 认证）
├── package.json            # 依赖：react 18 + vite 5
├── .env                    # VITE_FINNHUB_KEY=…（已废弃，可忽略）
├── .gitignore
├── 启动QQQ扫描器.command   # 双击启动脚本（用 Safari 打开）
├── CLAUDE.md
└── handoff.md              # 本文件
```

## 已完成工作

### 1. 项目脚手架
- Vite + React 18 环境，`npm run dev` 可启动
- 固定端口 5174（5173 留给其他项目）

### 2. 代码质量优化
- `makeColorScale` / `fmtNum` / `activeButtonStyle` / `tdStyle` 提取复用
- `useRef` 管理 API Key、`AbortController` 取消请求、`useMemo` 优化排序

### 3. 数据源：Yahoo Finance（无需 API Key）
- **原方案**：Finnhub `/stock/candle` → 免费版无权限，全部失败
- **现方案**：Yahoo Finance 日线数据，通过 Vite 代理转发
- **关键问题**：Yahoo Finance 需要 crumb token + cookie 认证
- **解决方案**：vite.config.js 启动时自动从 `fc.yahoo.com` + `/v1/test/getcrumb` 获取 crumb，注入到所有代理请求
- 批次延迟 300ms，约 20 秒完成全部 101 只成分股扫描

### 4. 成分股更新（May 2026，101 只）
- 新增：PLTR、ARM、APP、MSTR、SHOP、DASH、AXON、TMUS、WMT、GOOG 等
- 移除：SPLK（已收购）、SIRI、ZM、RIVN、BIIB、TEAM、OKTA 等

### 5. UI 可读性修复
- 深色背景上的低对比度色值（#334、#445、#223）全部替换为可读颜色
- 去掉 API Key 输入框，启动即自动扫描

### 6. 双击启动图标
- `启动QQQ扫描器.command` 放在项目目录内
- 监听 Vite 输出，服务就绪后自动用 Safari 打开 `http://localhost:5174`

### 7. Bug 修复
- `useEffect` 引用 `runScan` 的顺序错误（TDZ）→ 移到 `useCallback` 声明之后

## 当前状态
- 构建：✅
- 运行：✅ 双击图标 → Safari 自动打开 → 约 20 秒扫描完毕
- 数据：✅ Yahoo Finance 免费，crumb 自动获取，无需任何 API Key

## 下一步（可选）
1. 部署到 Vercel 时需配置 Yahoo Finance 的反向代理（Vercel rewrites）
2. 部分股票（CTAS、MSTR、SHOP、TRI 等）偶发 TLS 连接失败，已有自动重试逻辑
