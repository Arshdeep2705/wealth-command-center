# Wealth Command Center

A private, offline-first personal **finance + schedule dashboard** — a single-page PWA you can install on your phone. It tracks income, expenses, net profit, net worth, a weekly roster/calendar, and Australian income tax — all computed locally in your browser.

> **Your data never leaves your device.** There is no backend, no account, no analytics. The hosted version ships with *fictional demo data*; your real numbers live only in your browser's `localStorage` and in a backup file you control.

## Features

- **Command Center** — net worth, weekly/annual run-rate, projected after-tax income, this-month snapshot, income mix, and a month-by-month strip.
- **Weekly Schedule** — a true 12am→12am calendar grid: days across the top, 24 hours down the side, colour-coded shifts (overlaps stack into lanes), per-day earnings and hours at the foot of each column.
- **Income** — earnings by day-of-week and by source, with weekly / monthly / annual breakdowns.
- **Expenses** — log spending or **import a bank statement** (CSV from ANZ, CommBank, or any bank — works offline; PDF best-effort). Transactions auto-categorise and route to the right month.
- **Net Worth** — liquid vs pending breakdown, account composition, and a projected-growth curve.
- **Months** — Jun–Dec 2026 cards with income, expenses, tax set-aside and savings, plus a full-year projection.
- **Tax** — Australian resident brackets (FY 2025-26, verified against ato.gov.au): income tax, Medicare levy, optional Medicare Levy Surcharge, effective rate, and a tax-set-aside planner.
- **Offline PWA** — installable to your home screen, works without a connection after first load.

## Privacy & data model

- All state is a single JSON object persisted to `localStorage`.
- **Export backup** downloads that JSON; **Import backup** restores it (use this to move data between devices).
- The committed source contains **no personal data** — only a fictional demo dataset (`DEMO_STATE` in `assets/js/state.js`).

## Tech

Vanilla JavaScript (no build step), hand-rolled SVG charts, a service worker for offline support, and a web app manifest. Fonts: Bricolage Grotesque, Manrope, JetBrains Mono. Deployed as a static site on GitHub Pages.

## Run locally

```bash
# any static server works, e.g.
npx serve .
# then open http://localhost:3000
```

## Disclaimer

Net-worth, income and tax figures are **planning estimates**, not financial or tax advice. Tax brackets are simplified (no deductions, offsets, super or business structuring).
