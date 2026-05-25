/**
 * WfoSummaryTable.jsx — Mode B WFO Performance Summary 共享组件
 *
 * Props:
 *   cm         : object  策略 OOS 合并指标（decimal 格式：cagr=0.185，mdd=-0.15）
 *   benchmarks : Array<{ label: string, metrics: object }>  基准列表（同 decimal 格式）
 *   T          : object  主题色对象
 *   darkMode   : boolean
 *
 * 注意：所有指标值统一使用 decimal 格式（非百分比）。
 *   qqq-momentum.jsx 的 calcPortMetrics 返回百分比，调用前请先 ÷100 归一化。
 */

import React from 'react';

export default function WfoSummaryTable({ cm, benchmarks = [], T, darkMode }) {
  if (!cm) return null;

  const fp = (v, d = 1) => v == null ? '—' : `${(v * 100).toFixed(d)}%`;
  const fn = (v, d = 2) => v == null ? '—' : v.toFixed(d);

  // 最佳 / 最差年度（从 annualReturns 提取，decimal 值）
  const annVals  = cm?.annualReturns ? Object.values(cm.annualReturns) : [];
  const bestYr   = annVals.length  ? Math.max(...annVals)  : null;
  const worstYr  = annVals.length  ? Math.min(...annVals)  : null;

  const getBenchAnn = (b, fn) => {
    const vals = b.metrics?.annualReturns ? Object.values(b.metrics.annualReturns) : [];
    return vals.length ? fn(...vals) : null;
  };

  const rows = [
    {
      label: '年化收益 CAGR',
      sv:  cm.cagr,
      bvs: benchmarks.map(b => b.metrics?.cagr        ?? null),
      fmt: v => fp(v),
    },
    {
      label: 'Sharpe Ratio',
      sv:  cm.sharpe,
      bvs: benchmarks.map(b => b.metrics?.sharpe      ?? null),
      fmt: v => fn(v),
    },
    {
      label: '最大回撤 MDD',
      sv:  cm.mdd,
      bvs: benchmarks.map(b => b.metrics?.mdd         ?? null),
      fmt: v => fp(v),
    },
    {
      label: '累积收益',
      sv:  cm.totalReturn,
      bvs: benchmarks.map(b => b.metrics?.totalReturn ?? null),
      fmt: v => fp(v, 0),
    },
    ...(bestYr != null ? [{
      label: '最佳年度',
      sv:  bestYr,
      bvs: benchmarks.map(b => getBenchAnn(b, Math.max)),
      fmt: v => v != null ? fp(v) : '—',
    }] : []),
    ...(worstYr != null ? [{
      label: '最差年度',
      sv:  worstYr,
      bvs: benchmarks.map(b => getBenchAnn(b, Math.min)),
      fmt: v => v != null ? fp(v) : '—',
    }] : []),
  ];

  // 每个基准的胜出计数（sv > bv → 策略胜，MDD同理：-0.15 > -0.20 = 回撤更小）
  const winCounts = benchmarks.map((_, bi) => {
    const valid = rows.filter(r => r.sv != null && r.bvs[bi] != null);
    const wins  = valid.filter(r => r.sv > r.bvs[bi]).length;
    return { wins, total: valid.length };
  });

  // 徽章配色
  const badgeColor = (wins, total) => {
    const p = total > 0 ? wins / total : 0;
    return p >= 0.6 ? '#4fc86e' : p >= 0.4 ? '#f0c040' : '#ee3344';
  };
  const badgeBg = (wins, total) => {
    const p = total > 0 ? wins / total : 0;
    return p >= 0.6
      ? (darkMode ? '#00331a22' : '#f0fff4')
      : p >= 0.4
        ? (darkMode ? '#33220011' : '#fffdf0')
        : (darkMode ? '#33000022' : '#fff8f8');
  };

  // Grid 列定义
  const gridCols = `2fr 1.5fr ${benchmarks.map(() => '1.5fr').join(' ')}`;
  const purpleTint   = darkMode ? '#1a003333' : '#f3eeff66';
  const purpleBorder = '#8844ee28';

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden', marginBottom: 16,
      border: `1px solid ${T.border}`,
      boxShadow: darkMode ? '0 4px 24px #00000040' : '0 2px 14px #0000000d',
    }}>

      {/* ── 标题栏 ── */}
      <div style={{
        padding: '14px 20px',
        background: darkMode
          ? 'linear-gradient(135deg, #160030 0%, #0b1828 100%)'
          : 'linear-gradient(135deg, #f0eaff 0%, #eaf2ff 100%)',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{
          background: '#5522aa', color: '#ddb8ff', fontSize: 9, fontWeight: 700,
          padding: '2px 8px', borderRadius: 4, letterSpacing: 1,
        }}>MODE B</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textBright }}>
          WFO Performance Summary
        </span>
        <span style={{ fontSize: 10, color: T.textMuted }}>· OOS 纯样本外，无事后挑参</span>

        {/* 每个基准的胜出徽章 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {benchmarks.map((b, bi) => {
            const { wins, total } = winCounts[bi];
            const color = badgeColor(wins, total);
            const bg    = badgeBg(wins, total);
            // 去掉"基准"二字，缩短标签
            const shortLabel = b.label.replace(' 基准', '');
            return (
              <div key={bi} style={{
                padding: '3px 12px', borderRadius: 20,
                background: bg, border: `1px solid ${color}55`,
                fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap',
              }}>
                vs {shortLabel}：{wins}/{total} 项 ▲
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 列标题 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ padding: '9px 20px', fontSize: 10, fontWeight: 600, color: T.textMuted, letterSpacing: 0.5, background: T.pageBg }}>
          指标
        </div>
        <div style={{
          padding: '9px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700,
          color: '#cc99ff', letterSpacing: 0.5,
          background: darkMode ? '#1a003355' : '#f0eaff',
          borderLeft: `1px solid ${purpleBorder}`, borderRight: `1px solid ${purpleBorder}`,
        }}>
          🟣 策略 OOS
        </div>
        {benchmarks.map((b, bi) => (
          <div key={bi} style={{
            padding: '9px 20px', textAlign: 'right', fontSize: 10, fontWeight: 600,
            color: T.textMuted, letterSpacing: 0.5, background: T.pageBg,
            borderRight: bi < benchmarks.length - 1 ? `1px solid ${T.border}44` : 'none',
          }}>
            {b.label}
          </div>
        ))}
      </div>

      {/* ── 数据行 ── */}
      {rows.map((row, i) => {
        const beatsList = row.bvs.map(bv => row.sv != null && bv != null && row.sv > bv);
        const losesList = row.bvs.map(bv => row.sv != null && bv != null && row.sv < bv);
        const hasAny    = row.bvs.some(bv => row.sv != null && bv != null);
        const allBeats  = hasAny && beatsList.every(b => b);
        const allLoses  = hasAny && losesList.every(b => b);

        // 策略值颜色：全胜绿，全负红，混合黄
        const sColor = !hasAny ? T.textBright
          : allBeats ? '#4fc86e'
          : allLoses ? '#ee3344'
          : '#f0c040';

        const indicator = !hasAny ? '' : allBeats ? '▲' : allLoses ? '▼' : '~';
        const isEven    = i % 2 === 0;
        const rowBg     = isEven ? (darkMode ? T.cardBg : '#f9f9fc') : T.pageBg;
        const notLast   = i < rows.length - 1;
        const divider   = notLast ? `1px solid ${T.border}33` : 'none';

        return (
          <div key={row.label} style={{
            display: 'grid', gridTemplateColumns: gridCols,
            background: rowBg, borderBottom: divider,
          }}>
            {/* 指标名 */}
            <div style={{ padding: '13px 20px', fontSize: 11, fontWeight: 600, color: T.textSub }}>
              {row.label}
            </div>

            {/* 策略值 */}
            <div style={{
              padding: '13px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5,
              fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: sColor,
              background: isEven ? purpleTint : (darkMode ? '#1a003318' : '#f3eeff33'),
              borderLeft: `1px solid ${purpleBorder}`, borderRight: `1px solid ${purpleBorder}`,
            }}>
              <span>{row.fmt(row.sv)}</span>
              {indicator && <span style={{ fontSize: 9, opacity: 0.75 }}>{indicator}</span>}
            </div>

            {/* 各基准值 */}
            {benchmarks.map((b, bi) => (
              <div key={bi} style={{
                padding: '13px 20px', textAlign: 'right',
                fontFamily: 'monospace', fontSize: 13, color: T.textSub,
                borderRight: bi < benchmarks.length - 1 ? `1px solid ${T.border}33` : 'none',
              }}>
                {row.fmt(row.bvs[bi])}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
