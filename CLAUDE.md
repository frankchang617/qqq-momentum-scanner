# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page React app that scans all ~90 QQQ ETF component stocks for momentum signals using the Finnhub free stock API. No backend — all data fetching and computation happens in the browser.

## Running the App

This is a standalone JSX file with no build config yet. To run it, scaffold a minimal Vite + React project:

```bash
npm create vite@latest . -- --template react
# Replace src/App.jsx content with qqq-momentum.jsx, or import it as the default export
npm install
npm run dev
```

Alternatively, use any React sandbox (StackBlitz, CodeSandbox) by pasting the file as the root component.

A **Finnhub API key** (free tier) is required at runtime — the user enters it in the UI. No `.env` needed.

## Architecture

**Single file:** `qqq-momentum.jsx` — all logic, UI, and styling live here.

### Data flow

1. User pastes Finnhub key → `handleStart` → `runScan(key)`
2. `runScan` fetches daily candles for each symbol in batches of 5 (rate-limit safe for free tier: 60 req/min, with 700 ms delay between batches)
3. Raw `closes[]` arrays flow into pure calculation functions → result objects stored in `results` state
4. `sorted` = filtered + sorted slice of `results`, recomputed on every render from `sortKey` and `topN`

### Calculation functions (pure, no side effects)

| Function | Input | Output |
|---|---|---|
| `calcReturn(closes, days)` | price array, lookback | % return over N days |
| `calcVol(closes, days)` | price array, lookback | annualized vol % (log returns) |
| `calcSharpe(ret, vol)` | return %, vol % | Sharpe ratio (no risk-free rate) |

**Composite score** = `ret20 × 0.45 + ret50 × 0.35 + ret200 × 0.20`

### Key UI components (all in same file)

- `Sparkline` — SVG polyline with gradient fill; re-generates a random gradient `id` each render (stateless)
- `MiniBar` — horizontal bar + formatted label for return columns
- `ScoreBadge` — colored pill showing composite score
- `retColor` / `sharpeColor` — deterministic color mapping, no theme system

### State (all in `App`)

| State var | Purpose |
|---|---|
| `results` | Accumulated scan results (grows during scan) |
| `loading` | Controls progress UI visibility |
| `progress` | `{done, total}` counter for the progress bar |
| `sortKey` | Active sort column key |
| `topN` | How many rows to show |
| `expandedSym` | Symbol whose detail row is open (one at a time) |
| `abortRef` | `useRef` flag to cancel mid-scan without re-render |

## Important Constraints

- **Finnhub free tier**: 60 requests/min. The 5-symbol batch + 700 ms inter-batch delay keeps the app under the limit. Do not remove this throttle.
- **No external UI library** — all styles are inline JS objects or a single `<style>` tag at the bottom. Keep it that way unless adding a full design system.
- The `Sparkline` component generates a random SVG gradient `id` on every render — this is intentional to avoid gradient ID collisions when multiple sparklines render simultaneously.
