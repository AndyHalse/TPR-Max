# Enterprise Multi-Site — Prompt 10 — Phase 3b: Compliance dashboard APIs

**Phase 3 of the Enterprise Multi-Site build. The endpoints the dashboard reads. Run after prompt 09.**

## Context
The engine maintains `compliance_items`, `compliance_snapshots`, `compliance_alerts` (prompt 09). Expose them through scoped, role-aware endpoints.

## What to build
All under `requireEnterpriseRole`, scope filtered automatically from the user’s allowlist (prompt 07):

```
GET  /api/enterprise/compliance/summary      estate score + 7 category scores + headline stats
GET  /api/enterprise/compliance/alerts       ranked; filters severity / site / category; status filter
POST /api/enterprise/compliance/alerts/:id/acknowledge
GET  /api/enterprise/compliance/expiries?days=30    all items expiring within N days, sorted by date
GET  /api/enterprise/compliance/sites         per-site breakdown table (score, status, key counts)
GET  /api/enterprise/compliance/trend?days=90       from compliance_snapshots
```

- **Scope:** an enterprise_admin gets the estate; an area_manager gets their area; a site_coordinator gets their site. The same endpoint returns the right slice based on the caller — never the whole estate to someone not entitled to it.
- **Caching:** the summary endpoint is polled by the dashboard — make it cacheable (~60s) per scope.
- **Alerts** are returned worst-first (critical → warning), newest within severity.
- Acknowledging an alert sets `status='acknowledged'` and writes an audit entry; resolved/auto-cleared alerts are handled by the engine.

## Rules
- Site-scoped via the prompt 03 helper; respects the prompt 07 allowlist; fail closed.
- en-GB date/number formatting in any server-rendered values; otherwise return ISO and let the client format en-GB.

## Acceptance criteria
- `/summary` returns the estate score and category scores matching the engine; an area_manager’s `/summary` is limited to their area.
- `/alerts` filters and ranks correctly; acknowledge works and is audited.
- `/expiries?days=30` and `/trend?days=90` return correct, scoped data.
- Summary responds fast under repeated polling (cache effective).

## Do NOT
- Do not leak estate-wide figures to area/site-limited users.
- Do not do heavy recomputation in the endpoint — read what the engine has already computed.
