---
name: Enterprise site-isolation audit pattern
description: How to audit and fix site-scoped table access across all route files; includes false-positive notes.
---

# Enterprise Site-Isolation Audit Pattern

## The rule
Every query that touches a table in `server/isolatedSchema.ts`'s 34-table site-scoped list must use one of:
- `getScopedDb(req)` — returns the customer DB scoped with automatic `WHERE site_id = ?`
- `scopedWhere(siteContext)` — builds an `and(eq(siteId, ...) , ...)` clause for Drizzle
- `withSiteId(siteContext, { ...data })` — stamps `siteId` on insert payloads

## Audit grep command
```bash
for f in server/routes/*.ts; do
  uses=$(grep -cE "isolatedSchema\.(preBookings|incidentReports|contractorPreBookings|ramsDocuments|inductionTokens|meetingRooms|roomBookings|ppmAssets|ppmWorkOrders|cdmProjects|helpDeskTickets|raBuilderAssessments|auditRecords|loneWorkerSessions|complianceCertificates|permitToWork|fireRiskAssessments|hsIncidents)" "$f" 2>/dev/null || true)
  scoped=$(grep -c "getScopedDb\|scopedWhere\|withSiteId" "$f" 2>/dev/null || true)
  if [ "$uses" -gt "0" ] && [ "$scoped" -eq "0" ]; then
    echo "UNSCOPED: $(basename $f)"
  fi
done
```

## Known false positive
`inductionTokens` in `server/routes/induction.ts` is imported from `@shared/schema` (management DB, isolated by `customerId`) NOT from `isolatedSchema`. The management DB does not need `siteId` isolation. The same table name exists in both schemas; always check the import source.

**Why:** Both `shared/schema.ts` (line ~1680) and `isolatedSchema.ts` (line ~1224) define `induction_tokens`. The management copy has `customerId`; the isolated copy has `siteId`. The grep pattern matches the table name in both.

## Files fixed during the multi-site engagement
- rams.ts, passes.ts, templateLibrary.ts, contractors.ts, visitors.ts (pre-bookings + insert paths)
- analytics.ts, imports.ts, reports.ts, emergency.ts (prior session)
