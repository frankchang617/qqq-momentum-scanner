# Handoff — QQQ Momentum Scanner

更新时间：2026-05-24 Session 7（QQQ 轮转策略 WFO · 进行中）

## 已完成
- src/qqq/strategies/qqqRotation.js ✅
- src/qqq/optimization/qqqGridSearch.js ✅
- src/qqq/optimization/qqqWfo.js ✅（runQqqWFO，单窗口70/30，144种）
- src/qqq/QqqRotationTab.jsx：import runQqqWFO ✅，wfo state ✅，handleRunWFO ✅
- qqq-momentum.jsx：import + SHY + 新Tab ✅

## 下一步（立即执行）
QqqRotationTab.jsx 末尾（最后 `</div>` 前）插入 WFO UI 区块，
结构与现有 QQQ 成分股轮动 WFO 完全一致：
- 可折叠 MODE B 按钮
- 说明文字
- IS 优化指标选择（Sharpe/CAGR/Calmar）
- 运行按钮 + 进度
- 窗口明细表（IS/OOS时间 + 参数列 + 评分 + OOS指标）
- OOS 净值曲线
- Mode A vs Mode B 对比表

参数列映射（QQQ轮转专用）：
- Lookback: {21:'1M', 63:'3M', 126:'6M'}
- TopN: `Top ${bp.topN}`
- RebalFreq: {5:'每周', 10:'每两周', 21:'每月'}
- MarketFilter+Defensive: filter=false→'无过滤', filter=true→`SMA200→${bp.defensiveAsset}`
