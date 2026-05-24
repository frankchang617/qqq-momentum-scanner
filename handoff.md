# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 7（QQQ 轮转策略新 Tab · 进行中）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描主文件（待改）
src/etf/                      # ETF 跨资产策略模块（已完成）
src/qqq/                      # QQQ 轮转策略模块（新建）
  strategies/
    qqqRotation.js            # ✅ 回测引擎（已创建）
  optimization/
    qqqGridSearch.js          # ✅ 144种参数网格搜索（已创建）
  QqqRotationTab.jsx          # ✅ 新 Tab 主界面（已创建）
```

---

## ✅ 已完成（本 Session）

### 新增文件

**`src/qqq/strategies/qqqRotation.js`**
- `backtestQqqRotation(histData, timestamps, params, startIdx, endIdx)`
- 参数：`{ lookback, topN, rebalFreq, marketFilter, defensiveAsset }`
- MOO 执行（T+1 开盘）、SMA200 过滤、等权、正动能过滤
- `getQqqRotationParams()` 生成 144 种参数组合
- `buildQqqBenchmark()` 生成 QQQ 买入持有基准曲线
- `paramLabelQqq()` 格式化参数标签

**`src/qqq/optimization/qqqGridSearch.js`**
- `runQqqGridSearch(histData, timestamps, startIdx, endIdx, onProgress)`
- 遍历 144 种组合，calcMetrics + calcCompositeScores，降序返回

**`src/qqq/QqqRotationTab.jsx`**
- 接收 `histData, histTs, T, darkMode` props
- Step 1：固定参数手动回测（参数选择器 + 净值曲线 + 年度收益对比）
- Step 2：一键优化（144 种，进度条 + 结果表格，含最终金额列）
- 操作建议信号面板（市场状态 + 持仓明细 + 投入金额 → 每只股数）
- 点击表格行可将参数加载到 Step 1

---

## ⏳ 下一步：修改 qqq-momentum.jsx（3处改动）

### 改动1：import QqqRotationTab
```js
// 在文件顶部，紧接 EtfStrategyTab import 之后添加：
import QqqRotationTab from "./src/qqq/QqqRotationTab.jsx";
```

### 改动2：loadHistData 增加 SHY 数据
在 `loadHistData` 函数末尾（`setHistData(aligned)` 之前），添加 SHY 抓取：
```js
// 抓取 SHY（防御资产，QQQ轮转策略用）
try {
  const shyRaw = await fetchCandlesExtended('SHY', histRange, signal);
  if (shyRaw) {
    const shyCloses = new Array(Nq).fill(null);
    const shyOpens  = new Array(Nq).fill(null);
    for (const { c, o, ts } of shyRaw) {
      const idx = tsIdx.get(ts);
      if (idx !== undefined) { shyCloses[idx] = c; shyOpens[idx] = o; }
    }
    for (let j = 1; j < Nq; j++) {
      if (shyCloses[j] === null && shyCloses[j-1] !== null) shyCloses[j] = shyCloses[j-1];
      if (shyOpens[j]  === null && shyOpens[j-1]  !== null) shyOpens[j]  = shyOpens[j-1];
    }
    aligned.set('SHY', { closes: shyCloses, opens: shyOpens });
  }
} catch(e) { /* SHY 加载失败不影响整体 */ }
```

### 改动3：btSubTab 增加新 Tab 入口 + 渲染
- 在 Tab 列表数组加入 `{ id: 'qqqRotation', label: 'QQQ 轮转策略' }`
- 在渲染区加入：
```jsx
{btSubTab === 'qqqRotation' && (
  <QqqRotationTab histData={histData} histTs={histTs} T={T} darkMode={darkMode} />
)}
```

---

## 关键设计决策

| 决策 | 内容 |
|------|------|
| 数据传入 | histData/histTs 以 props 从父组件传入，不重复加载 |
| SHY 数据 | 在 loadHistData 末尾额外抓取，存入 aligned Map |
| 未加载提示 | histData=null 时显示"请先加载数据"引导 |
| 点击表格行 | 自动将参数填入 Step 1，方便快速回测验证 |
| 投入金额 | 信号面板和网格搜索共用同一 investAmount state |
| 最终金额 | `inv × (1 + totalReturn)` 直接显示 |
