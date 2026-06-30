# Feature Prompt — Contractor SLA Activity Report

**Date:** 30 June 2026
**Module:** Contractors page (with data pulled from across the app)
**Type:** New report — investigation first, then build

---

## IMPORTANT — read before you change anything

**Do NOT build or alter any code yet.** This is a two-stage job.

**Stage 1 (do this first):** Investigate the codebase and tell me, honestly, whether the data needed for this report already exists and is wired together. Where it isn't, tell me exactly what's missing and where new data wiring would need to be added. Report back in plain English. Then stop and wait for my go-ahead.

**Stage 2 (only after I approve):** Build the report based on what we agree.

Do not assume data exists — check the code and show me where each piece comes from.

---

## What I want to build and why

I want a **Contractor SLA Activity Report** on the Contractors page. The purpose is to produce a single report, for a chosen contractor over a chosen date range, that we can hand to a **client** who has that contractor working on their site as part of a **Service Level Agreement (SLA) assessment**.

The user picks:
- A **contractor**
- A **date range** (e.g. last quarter)

…and the report pulls together everything that contractor has done on site over that period.

### Who it's for and how it's presented

- **Audience: the client.** This is a client-facing document, not an internal debug view. It must look professional and read cleanly — a short summary at the top (the headline SLA picture, ideally with a simple RAG / pass-fail rating), then the supporting detail below. Plain, confident language; no internal jargon or system field names on the page.
- **Output: both on-screen AND a downloadable PDF.** The on-screen version is the working view; the PDF is the formal evidence pack the client keeps. Re-use the existing PDF-export approach already used elsewhere in the app (e.g. the bug-report PDF export) rather than inventing a new mechanism — confirm in Stage 1 what that approach is and whether it can be reused here.

## What the report needs to include

1. **Compliance turnaround time — scored against an SLA target.** For each document/verification, the time taken from when it was **requested** to when it was **received**. This data lives on the Contractors page and/or `/contractor-portal-admin` — confirm which, and whether the request and receipt timestamps are actually stored. Don't just *show* the time taken — **measure it against an SLA target** (e.g. "documents returned within X working days") and show whether each item met or breached the target, plus an overall on-time percentage for the period. The SLA target should be configurable rather than hard-coded — in Stage 1, propose how/where it's set (e.g. a default with an optional per-contractor or per-client override) for me to approve.

2. **Worker safety violations** — any **Yellow / Red cards** issued, broken down **by individual worker**. Safety violation cards are already a feature in TPR — locate the existing cards data and pull from that; do not build a new cards system.

3. **Equipment on site** — what contractor equipment has been on site, with the status of its **required documentation** (e.g. certs present / missing / expired).

4. **H&S incident reports** — anything linked to that contractor from the `hs-incidents` page, broken down by type:
   - Incidents
   - Near Misses
   - Good Spots
   - Positive Actions
   - RIDDOR-reportable issues

5. **Worker attendance** — for each worker, **how many days** they've been on site and **how many hours** in total.

6. **PPM (Planned Preventative Maintenance) activity** — where the **same contractor** carries out PPM on site, pull their maintenance activity over the period:
   - PPM tasks/jobs assigned to that contractor
   - Completed **on time vs overdue/missed against the schedule** (this is itself a key SLA measure — show a completion / on-time rate)
   - Outstanding or upcoming tasks in the period
   - Any certificates or documentation generated from that PPM work
   - **Important:** the contractor ↔ PPM link has been unreliable in the past — verify in Stage 1 that PPM records are genuinely tied to a contractor and can be filtered per contractor and per site, and flag clearly if that link is broken or missing.

7. **Anything I've missed** — based on what the app actually captures, suggest any other data points that would strengthen an SLA assessment (e.g. inductions completed, permits to work, expired/lapsed compliance during the period, RAMS acceptance). Don't invent data — only suggest things the app genuinely records.

## Questions I need you to answer in Stage 1

- Is each of the six data points above actually captured and stored, and is it **linked to a specific contractor** so it can be filtered?
- Is everything tied to a contractor in a consistent way so one report can join it all together? If the links are inconsistent or missing, say so and tell me where the wiring needs adding.
- For attendance (days + hours): do we have reliable sign-in/sign-out timestamps per worker per visit to calculate this, or only partial data?
- For compliance turnaround: are both the **request** time and the **receipt** time stored, so the gap can be measured?

## Multi-tenancy — must work in BOTH modes

This has to be correct for:
- **Standalone customers** (single site) — the report covers that one tenant's site.
- **Enterprise multi-site customers** — the report must be **site-scoped**. The user should be able to run it for a contractor at a specific site, and an enterprise admin should not see data leaking across sites or tenants.

Confirm in Stage 1 how contractor, incident, card, equipment and attendance data is scoped in each mode, and flag any place where the enterprise/site filter is missing.

## Client confirmation email (draft — do not send)

> **Subject:** Confirming your contractor SLA report — what we've understood
>
> Hi [Client name],
>
> Thanks for talking us through what you need. I wanted to put it in writing so you can check we've understood it correctly before we build anything.
>
> **What you'll be able to do**
>
> Pick a contractor and a date range (say, the last quarter), and produce a single report covering everything that contractor has done on your site over that period. You'll be able to view it on screen and download it as a tidy PDF you can keep as part of your SLA assessment.
>
> **What the report will show**
>
> - **Compliance turnaround** — how long each required document took to come back, from the moment we requested it to the moment we received it, measured against an agreed target (e.g. "returned within 5 working days"), with a clear pass/fail on each and an overall on-time score.
> - **Planned maintenance (PPM)** — where the contractor carries out scheduled maintenance on your site, the jobs due in the period, how many were completed on time versus overdue or missed, and any certificates produced.
> - **Safety violations** — any yellow or red cards issued, broken down by individual worker.
> - **Equipment on site** — what equipment has been on site, and whether its required documentation is in place.
> - **Health & safety records** — any incidents, near misses, good spots, positive actions and RIDDOR-reportable issues linked to that contractor.
> - **Attendance** — how many days each worker has been on site, and the total hours.
>
> **A couple of things to confirm**
>
> 1. **Your SLA targets** — what's the agreed turnaround for documents (in days), and the expected completion standard for planned maintenance jobs? (And should document turnaround be the same for every document, or different for certain ones?)
> 2. **Is there anything else you'd want on the report** that would help your assessment? We'd rather capture it now than add it later.
>
> Once you're happy this is right, we'll get it built. If I've missed or misunderstood anything, just say and I'll adjust.
>
> Best regards,
> Andy

## Constraints

- Use **British English** throughout the report and UI.
- Use **UK date/time formatting** (DD/MM/YYYY, 24-hour or clear am/pm).
- If the SLA target is in **working days**, calculate it as working days (exclude weekends; confirm whether bank holidays matter to me before assuming).
- The **PDF must match the on-screen report** and carry the client/site name, contractor name, date range and a generated-on date so it stands alone as evidence.
- Respect existing **roles and permissions** — only users who should see contractor compliance data can run this report.
- Don't break any existing Contractors-page or `/contractor-portal-admin` behaviour.
- No `db:push` / schema changes in Stage 1. If the build needs schema changes, list them clearly for me to approve first.

---

**Deliverable for Stage 1:** a plain-English report telling me:
- what's wired, what isn't, and where wiring needs adding;
- where the existing **safety cards** and **PDF-export** features live and whether they can be reused;
- how you propose to set and store the **SLA target(s)**;
- a proposed plan for the report — for both standalone and enterprise multi-site.

Then wait for my approval before building.
