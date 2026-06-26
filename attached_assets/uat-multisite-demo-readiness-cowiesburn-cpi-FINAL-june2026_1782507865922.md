# FINAL — Multi-site demo-readiness UAT (Cowiesburn central + CPI independent-sites-reporting-to-HQ)

**Run after all the scoping fixes + the consolidated route test pass. Proves the two demo stories work end-to-end: (1) sites work INDEPENDENTLY with no cross-site leaks, AND (2) head office sees ALL compliance across every site. Test customers only — never real customer data. Report pass/fail per step + a one-line go/no-go.**

## Setup
Seed/confirm one enterprise test customer with **3 sites** (Site A, B, C) each with its own staff/visitors/contractors/PPM/permits/incidents, and one normal **single-site** customer. Create:
- a **head-office** user (enterprise_admin / "primary site"),
- a **site-local** user per site (site_coordinator) with that site's **own login name** (e.g. "CPI Books Suffolk").

## Part 1 — Sites work INDEPENDENTLY (isolation holds — the leak fixes)
For each module (visitors, contractors, PPM, permits, RAMS, RA builder, audits, H&S incidents, FRA, compliance certs, lone worker, meeting rooms, help desk, CDM):
1. As the **Site A** site-local user, confirm you see ONLY Site A's records — lists, dashboards, and by-id (a Site B record's URL/id returns "not found", not the data).
2. Create a record at Site A; confirm it is invisible to the Site B user.
3. Confirm a Site A user **cannot act on** a Site B record by id (e.g. authorise a permit, resolve an incident) → refused.
4. Muster: activate an evacuation at Site A → roll-call shows ONLY Site A people.

## Part 2 — Head office sees ALL compliance (the roll-up — the CPI/Cowiesburn requirement)
As the **head-office (enterprise_admin)** user:
1. **Compliance Overview** shows the estate score and every site's compliance, aggregated across A+B+C.
2. **Sites** page lists all sites with their individual scores; the **per-site drill-down** opens each site's full compliance (no 403).
3. **Portfolio Reports** generates an estate-wide report covering all sites.
4. An **area_manager** (if used) sees only their area's sites; a **site_coordinator** sees only their site — proving the hierarchy.

## Part 3 — The two named models
- **Cowiesburn (central):** head office manages and monitors all 120+ sites from one place; site users optional. Confirm head office can do everything across sites.
- **CPI (independent + report to HQ):** each site runs locally via its own login (Part 1), AND head office still sees all their compliance (Part 2). Confirm both at once on the same customer.

## Part 4 — Single-site regression
Log in as the normal single-site customer: no Enterprise menu, no site switcher, every module behaves exactly as before.

## Report back
- Pass/fail table for Parts 1–4.
- Any module where a site user saw another site's data (that's a remaining leak — name it).
- One-line verdict: **is the enterprise multi-site feature demo-ready for Cowiesburn — yes or no?**

## Rules
- Test customers only. If any isolation step fails, STOP and report the module — do not paper over it.
