# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 6（MOO 开盘执行模型 · 进行中）

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
    wfo.js                    # Walk Forward Optimization（已加 opens ✅）
  EtfStrategyTab.jsx          # ETF 策略主界面（待改）
```

---

## ✅ 已完成工作（Session 6）

### MOO 执行模型（T 收盘信号 → T+1 开盘执行）

**目标**：将回测执行模型从「T-1 收盘信号 → T 收盘执行」改为「T 收盘信号 → T+1 开盘执行（Market-On-Open）」，使用真实 adjOpen 价格。

**adjOpen 计算**：`adjOpen = rawOpen × (adjClose / rawClose)`

**调仓日 3 步逻辑**：
1. 旧持仓 close[t-1] → open[t] 隔夜收益
2. 更新持仓（使用 T-1 收盘信号）
3. 新持仓 open[t] → close[t] 日内收益

**非调仓日**：close-to-close（不变）

### 已改动文件

| 文件 | 状态 |
|------|------|
| `qqq-momentum.jsx` | ✅ fetchCandlesExtended + loadHistData + portfolioBacktest |
| `src/etf/data/fetchEtfData.js` | ✅ fetchSingleEtf + alignToBase，返回 opens |
| `src/etf/strategies/momentum.js` | ✅ opens=null 参数，3步调仓逻辑 |
| `src/etf/strategies/dualMomentum.js` | ✅ opens=null 参数，3步调仓逻辑 |
| `src/etf/strategies/volControl.js` | ✅ opens=null 参数，prevWeights 追踪，2步换仓 |
| `src/etf/optimization/gridSearch.js` | ✅ opens=null 参数，传给3个策略 |
| `src/etf/optimization/wfo.js` | ✅ opens=null 参数，传给 IS gridSearch + OOS 3策略 |
| `src/etf/EtfStrategyTab.jsx` | ⏳ 待改（5处调用点） |

---

## ⏳ 下一步（立即执行）

### EtfStrategyTab.jsx 5 处调用点，均需追加 `etfData.opens`

1. **Line 419** — `backtestMomentum`
   ```js
   // 改前
   const bt = backtestMomentum(etfData.closes, etfData.timestamps, p);
   // 改后
   const bt = backtestMomentum(etfData.closes, etfData.timestamps, p, 0, null, etfData.opens);
   ```

2. **Line 520** — `backtestDualMomentum`
   ```js
   // 改前
   const bt = backtestDualMomentum(etfData.closes, etfData.timestamps, p);
   // 改后
   const bt = backtestDualMomentum(etfData.closes, etfData.timestamps, p, 0, null, etfData.opens);
   ```

3. **Lines 619-621** — `backtestVolControl`
   ```js
   // 改前
   const bt = backtestVolControl(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20, p
   );
   // 改后
   const bt = backtestVolControl(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20, p, 0, null, etfData.opens
   );
   ```

4. **Lines 760-764** — `runGridSearch`
   ```js
   // 改前
   const res = await runGridSearch(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
     0, null,
     (done, total) => setProgress({ done, total })
   );
   // 改后
   const res = await runGridSearch(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
     0, null,
     (done, total) => setProgress({ done, total }),
     etfData.opens
   );
   ```

5. **Lines 917-921** — `runWFO`
   ```js
   // 改前
   const res = await runWFO(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
     optMetric,
     (done, total, ph) => setPhase(...)
   );
   // 改后
   const res = await runWFO(
     etfData.closes, etfData.timestamps, etfData.vix, etfData.qqqVol20,
     optMetric,
     (done, total, ph) => setPhase(...),
     etfData.opens
   );
   ```

### 完成后
- `npm run build` 验证无编译错误
- git commit + push

---

## 关键决策记录

- **MOO 方案 A**（真实 adjOpen）优于方案 B（收盘价近似），已确认采用
- **WFO 单窗口**（前70% IS ≈ 7年，后30% OOS ≈ 3年），非滚动
- **volControl** 日频调仓特殊处理：追踪 `prevWeights`，仅在 `regimeChanged && opens` 时走2步
- **histData 向后兼容**：`portfolioBacktest` 检查 `d.closes` 存在与否，兼容旧平铺数组格式
