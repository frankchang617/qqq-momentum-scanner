# Handoff — QQQ Momentum Scanner

更新时间：2026-05-26 Session 17（全部5个策略 WFO 双模式修复完成）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描主文件（含 QQQ成分股轮动 + 扫描器）
src/etf/                      # ETF 跨资产策略模块
  EtfStrategyTab.jsx          # ETF 主容器（WfoPanel + 3策略面板本次全部修复）
  optimization/
    gridSearch.js             # 参数网格搜索（加 strategyFilter 参数）
    wfo.js                    # ETF WFO（双模式）
  strategies/
    momentum.js / dualMomentum.js / volControl.js / metrics.js
  data/fetchEtfData.js
src/shared/WfoSummaryTable.jsx
src/qqq/                      # QQQ 轮转策略模块
  QqqRotationTab.jsx          # QQQ 轮转策略主容器（WFO 双模式，已完整）
  strategies/qqqRotation.js
  optimization/
    qqqGridSearch.js
    qqqWfo.js                 # QQQ 轮转 WFO（双模式）
```

---

## 5个策略说明

| Tab/子Tab | 文件 | 策略名 |
|----------|------|--------|
| 策略回测 → QQQ成分股轮动 | `qqq-momentum.jsx` | QQQ 成分股轮动 |
| 策略回测 → QQQ轮转策略 | `src/qqq/QqqRotationTab.jsx` | QQQ 轮转策略 |
| 策略回测 → ETF → 强势轮动 | `src/etf/EtfStrategyTab.jsx` `MomentumPanel` | ETF 强势轮动 |
| 策略回测 → ETF → 双动能 | `src/etf/EtfStrategyTab.jsx` `DualMomentumPanel` | ETF 双动能 |
| 策略回测 → ETF → 波动率控管 | `src/etf/EtfStrategyTab.jsx` `VolControlPanel` | ETF 波动率控管 |

---

## ✅ Session 17 完成（当前 Session，未 commit）

### 核心目标：5个策略 WFO 双模式逻辑一致

**双模式设计：**
- **📌 固定参数 OOS 验证（Mode A）**：用户运行过任意回测后自动切换，IS 期只算参考绩效，OOS 用固定参数
- **🔍 自动寻优 WFO（Mode B）**：IS Grid Search 选最优 → OOS 验证，无前视偏差

---

### Bug 修复汇总

#### Bug 1：QQQ 成分股轮动 — 无双模式（本次修复）

**文件：** `qqq-momentum.jsx`

**修复内容：**
1. `runWFO(histData, commonTs, qqqCloses, optMetric, fixedParams=null)` — 加第5参数 `fixedParams`
   - `fixedParams != null` → 模式A（跳过 IS Grid Search）
   - `fixedParams == null` → 模式B（原有 448 种 Grid Search）
2. 新增 state：`appliedParams`（null）、`wfoMode`（'auto'）
3. `runStratBacktest` 加：`setAppliedParams({...params}); setWfoMode('fixed')`
4. `handleRunWFO` 加：`const fixedArg = wfoMode==='fixed' ? appliedParams : null;`，传给 `runWFO`
5. WFO UI 加双模式 Tab 切换器（📌 固定参数 / 🔍 自动寻优）
6. 固定参数模式显示已选参数绿色框
7. 结果表格：摘要栏区分模式，IS Score 列仅自动模式显示，新增 IS CAGR / IS Sharpe 参考列

#### Bug 2：ETF 三策略面板「▶ 运行回测」未通知 WFO（本次修复）

**文件：** `src/etf/EtfStrategyTab.jsx`

**修复内容：**
- `MomentumPanel` / `DualMomentumPanel` / `VolControlPanel` 函数签名均加 `onRunBacktest` prop
- 各自 `runWithParams` 首行加 `onRunBacktest?.({ strategy: '...', ...p })`
- 主组件新增 `handleStratBacktest = (params) => setPendingOverride({ params, ts: Date.now() })`
- 三个面板 JSX 调用加 `onRunBacktest={handleStratBacktest}`

#### Bug 3：QQQ 轮转策略 `handleRunBacktest` 未更新 `appliedParams`（上轮修复）

`handleRunBacktest` 加：`setAppliedParams({ ...params }); setWfoMode('fixed')`

---

### 五策略 WFO 一致性最终状态

| 策略 | `▶ 运行回测` → WFO 固定参数 | `应用并回测` → WFO 固定参数 |
|------|-----------------------|------------------------|
| QQQ 成分股轮动 | ✅ (本次修复) | ✅ |
| QQQ 轮转策略 | ✅ (上轮修复) | ✅ |
| ETF 强势轮动 | ✅ (本次修复) | ✅ |
| ETF 双动能 | ✅ (本次修复) | ✅ |
| ETF 波动率控管 | ✅ (本次修复) | ✅ |

---

## 改动文件汇总（本 Session）

| 文件 | 改动摘要 |
|------|---------|
| `qqq-momentum.jsx` | `runWFO` 加 `fixedParams` 双模式；新增 `appliedParams`/`wfoMode` state；`runStratBacktest` 追踪参数；WFO UI 双模式 Tab + 结果表 |
| `src/etf/optimization/wfo.js` | 完全重写，支持 `fixedParams` 双模式 |
| `src/etf/optimization/gridSearch.js` | 新增 `strategyFilter` 参数 |
| `src/etf/EtfStrategyTab.jsx` | WfoPanel 双模式 UI；三策略面板加 `onRunBacktest`；新增 `handleStratBacktest` |
| `src/qqq/optimization/qqqWfo.js` | 完全重写，支持 `fixedParams` 双模式 |
| `src/qqq/QqqRotationTab.jsx` | 新增 `appliedParams`/`wfoMode` state；`handleRunBacktest` 补充；WFO UI 重构 |

---

## 关键函数签名

```js
// QQQ 成分股轮动（qqq-momentum.jsx）
runWFO(histData, commonTs, qqqCloses, optMetric='sharpe', fixedParams=null)

// ETF 跨资产策略
runWFO(closes, timestamps, vix, qqqVol20, optMetric, onProgress, opens, strategyFilter, fixedParams)

// QQQ 轮转策略
runQqqWFO(histData, timestamps, optMetric, onProgress, fixedParams)
```

---

## 下一步计划

1. **提交本次全部改动**：
   ```bash
   git add -A
   git commit -m "feat: 全部5策略 WFO 双模式修复——固定参数OOS验证 + 自动寻优统一"
   ```

2. **验证清单**：
   - QQQ成分股轮动：运行回测 → WFO 显示固定参数模式 → 参数一致
   - QQQ成分股轮动：Grid Search「应用并回测」→ WFO 固定参数 → 参数一致
   - QQQ成分股轮动：手动切到「自动寻优」→ 跑 448 种 Grid Search
   - ETF 三策略：运行回测 → WFO 固定参数模式正确
   - QQQ 轮转策略：同上

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
