# Handoff — QQQ Momentum Scanner

更新时间：2026-05-27 Session 18（ETF 标的池扩充完成）

## 项目结构

```
qqq-momentum.jsx              # QQQ 成分股动能扫描 + 成分股轮动
src/etf/EtfStrategyTab.jsx   # ETF 三策略 + WFO
src/etf/data/fetchEtfData.js # ETF 数据拉取（标的池定义）
src/etf/optimization/wfo.js / gridSearch.js
src/etf/strategies/momentum.js / dualMomentum.js / volControl.js / metrics.js
src/qqq/QqqRotationTab.jsx   # QQQ 轮转策略
src/qqq/optimization/qqqWfo.js / qqqGridSearch.js
src/qqq/strategies/qqqRotation.js
src/shared/WfoSummaryTable.jsx
```

---

## ✅ Session 18 全部完成（未 commit）

### 1. localStorage 持仓持久化（5策略）

| 策略 | key | commit |
|------|-----|--------|
| QQQ 轮转策略 | `qqq_rotation_holdings` | `02ab41e` |
| QQQ 成分股轮动 | `qqq_momentum_holdings` | `a97f1f3` |
| ETF 强势轮动 | `etf_momentum_holdings` | `a97f1f3` |
| ETF 双动能 | `etf_dualMomentum_holdings` | `a97f1f3` |
| ETF 波动率控管 | `etf_volControl_holdings` | `a97f1f3` |

### 2. ETF 标的池扩充（本次新增，未 commit）

**新增 5 只标的：QLD、SOXL、TQQQ（杠杆）、EWY（韩国）、EWJ（日本）**

| 文件 | 改动 |
|------|------|
| `fetchEtfData.js` | `ETF_SYMBOLS` 9只 → 14只 |
| `momentum.js` | `MOMENTUM_UNIVERSE` 9只 → 14只 |
| `dualMomentum.js` | `DUAL_MOMENTUM_UNIVERSE` 8只 → 13只（仍无SOXX） |
| `EtfStrategyTab.jsx` | 规则卡、策略描述、数据加载状态栏文字同步更新 |

**扩充后标的池（14只）：**

| 分类 | 标的 |
|------|------|
| 美股宽基 & 科技 | QQQ, SPY, XLK, SOXX |
| 杠杆 ETF | QLD（2x QQQ）, SOXL（3x 半导体）, TQQQ（3x QQQ） |
| 国际市场 | DXJ（日本对冲）, TSM, EWY（韩国）, EWJ（日本） |
| 债券 & 商品 | TLT, GLD, SHY |

⚠️ **波动率控管策略不受影响**（只用 QQQ 作为主资产）

---

## ✅ Session 17 全部完成（已 commit）

- 双模式 WFO 修复（5策略统一）
- IS/OOS 无未来数据审计通过
- QQQ 轮转 WFO OOS 曲线改用 EquityCurveChart

---

## 关键设计约定

### 双模式 WFO
| 模式 | 触发 | IS 期 | OOS 期 |
|------|------|-------|--------|
| 📌 固定参数 OOS 验证 | 「应用并回测」后自动切换 | 固定参数参考绩效 | 固定参数跑 OOS |
| 🔍 自动寻优 WFO | 手动切换或初始状态 | Grid Search | IS 最优参数跑 OOS |

### 进场评分公式
Score = Sharpe_pct × 0.40 + MaxDD_pct × 0.35 + CAGR_pct × 0.25

---

## 下一步
1. git commit + push 本次 ETF 标的池扩充改动

---

_本文件由 Claude Code 自动维护，每10次工具调用更新一次。_
