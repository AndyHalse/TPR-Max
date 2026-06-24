---
name: TPR Max deep-link UX principle
description: Every View/action link in the platform must deep-link to the exact page and tab where the user needs to act — never to a generic landing page.
---

## The rule
Every "View", "Fix", or action link surfaced anywhere in TPR Max (compliance dashboard, critical issues, warnings, notifications, email alerts, timeline items) **must navigate the user to the exact page and tab** where they can immediately act on the issue.

**Why:** The owner explicitly stated this is a core usability principle for the platform. A link that drops the user on a generic page (e.g. "Existing Workers") instead of the relevant tab wastes time and erodes trust in the tool.

## How to apply
- RAMS issue → `/contractors?tab=rams`
- Permit to Work issue → `/permit-to-work?highlight=<id>`
- Risk Assessment → `/ra-builder?highlight=<id>`
- Audit issue → `/audits?highlight=<id>`
- PPM issue → `/ppm?highlight=<id>`
- Contractor insurance → `/contractors/<companyId>?tab=documents`
- Worker RTW/DBS/cert → `/contractors/<companyId>?tab=workers&workerId=<id>`
- Staff RTW → `/hr/staff/<id>?tab=rtw`
- Staff DBS → `/hr/staff/<id>?tab=dbs`
- Staff training → `/hr/staff/<id>?tab=training`
- Compliance certificate → `/compliance-certificates?highlight=<id>`
- Document approvals → `/contractors?tab=contractors&gaps=true&sort=true`
- Fire Risk Assessment → `/fire-risk-assessment?highlight=<id>`

## Common pitfall
`useContractorManagement.ts` initialises `activeTab` from the URL `?tab=` param. Any link to `/contractors` without `?tab=` defaults to the "previous" (Existing Workers) tab. Always include `?tab=<tabname>` explicitly.
