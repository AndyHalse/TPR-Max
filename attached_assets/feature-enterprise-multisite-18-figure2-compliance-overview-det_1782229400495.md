# Enterprise Multi-Site — Prompt 18 — Figure 2: richer, clearer Compliance Overview (issues & expiries)

**Enhances the existing Estate Compliance Overview (`client/src/pages/EnterpriseCompliance.tsx`) to match Figure 2 of the Board Investment Case. Customers have seen that deck and expect this level of detail. Front-end polish using data that already exists — no new backend. Design reference: `CoWork ACS/proposal-mockups/overview.png`.**

## Context
The page already shows the score ring, category bars, stat cards, a critical-issues list, upcoming expiries, and a site-by-site table. The data comes from `/api/enterprise/compliance/summary`, `/alerts`, `/expiries`, `/compliance/sites`, `/trend`. Two areas read thin/noisy compared with the deck:
- **Critical Issues & Warnings** are terse (e.g. "35 PPM work orders overdue at this site") and don't read like the deck's specific, scannable items.
- **Upcoming Expiries** show repeated near-identical rows (e.g. "PPM · Primary Site · EXPIRED" many times) instead of clear, distinct items.

## What to build

### 1. Critical Issues & Warnings — make each item specific and scannable (per overview.png)
For each alert from `/alerts`, show: the **site name**, the **category**, a one-line **plain-English detail** (what's wrong and the consequence, e.g. "Insurance expired — Apex Electrical Ltd · 3 active bookings on site"), a coloured **status chip** (EXPIRED / MISSING / OVERDUE / "14 DAYS"), and a **link** that drills to the exact record/module. Keep the **Ack** action. Sort worst-first (critical → warning), newest within severity. Use the existing severity colours (red/amber).

### 2. Upcoming Expiries — de-noise and clarify (per overview.png)
- **Group/de-duplicate** repeated items so the list shows distinct, meaningful rows (e.g. roll up "35 PPM overdue at Primary Site" into one row with a count, rather than 35 identical lines).
- Each row: the **item** (e.g. "Public Liability — Smith Plumbing"), the **site**, the **type** (Contractor insurance / Compliance cert / Induction cert), the **date**, and **days remaining** ("2 days"), colour-coded by urgency. Match the deck's two-column readability.

### 3. General readability
- Tighten spacing and typography so the dashboard reads at a glance (the deck is calm and scannable; the live one is busier).
- Keep the score ring, "+/- this month" delta (from `/trend`), category bars, the four stat cards, and the site-by-site table — but ensure the table rows link through to each site's detail (this lands fully in Prompt 19).

## Rules
- en-GB dates (DD/MM/YYYY) and 24-hour times; Europe/London.
- Respect role scope (Area Manager sees their area only) — already handled by the endpoints; don't break it.
- No new backend endpoints — use the existing compliance APIs. If a field you need isn't returned, extend the existing endpoint minimally rather than adding a new one.
- No glassmorphism on any emergency/kiosk surfaces (not relevant here, but keep the house style).

## Acceptance criteria
- Critical issues read like overview.png: site + specific detail + status chip + drill link, worst-first, with Ack.
- Upcoming expiries are de-duplicated and clearly show item / site / type / date / days-left.
- The overview is visibly calmer and easier to scan than the current version, and matches the deck.
- Role scoping and single-site customers are unaffected.

## Do NOT
- Do not invent data — render what the compliance engine provides (extend an endpoint only if a needed field is missing).
- Do not remove the Ack, the score ring, the category bars, or the site-by-site table.
