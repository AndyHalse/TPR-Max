# TPR Max — Page Review Template (reusable)

**How to use:** Replace `(PAGE NAME)` with the page you want reviewed, then paste the whole thing.
Run it through Claude/Claude Code first to get the findings, choose the fixes, and only then have it write the final Replit prompt.

---

**TPR Max — Page Review Template**

**Page to review: `(PAGE NAME)`**

Review this page in the **latest** TPR Max codebase. Don't assume anything — read the actual code, and ask me if anything is unclear before guessing.

**Step 1 — Map it.**
Find and list every file that makes up this feature: the frontend page/components, the API routes it calls, the storage/DB layer, and the relevant schema. Confirm which file is the *live* one if there are legacy duplicates (this has caught us out before, e.g. Contractors.tsx vs ContractorManagement.tsx).

**Step 2 — Review against this standard.**
For each point give a verdict (✅ fine / ⚠️ issue / 🔴 serious), with the file and line:

1. **Logic & flow** — walk the full journey end to end. Does it do what it's meant to? Any dead buttons, broken filters, or steps that silently fail?
2. **Tenant isolation** — can one customer ever see or affect another customer's data? Check every query carries the customerId scope.
3. **Permissions & roles** — proper role checks on viewing *and* on every action? Who should be allowed here?
4. **Audit trail** — does every sensitive action (create / edit / delete / approve) write an audit entry capturing **who, what, when, and before/after**? Are audit records append-only and tamper-proof? Flag any gaps.
5. **Error trapping** — what happens on failure (DB down, bad input, expired session, oversized upload)? Are errors caught, logged via Winston, and shown to the user honestly — or swallowed silently? Does any action wrongly report success when an underlying step failed?
6. **Input validation** — on all forms, filters, dates, and uploads.
7. **Dates & time** — all dates/times in **UK / en-GB** format and timezone (not US, not UTC drift).
8. **Performance / optimisation** — pagination on long lists, no N+1 queries, sensible indexes, nothing loading an entire table into memory, client-side image resize before upload where relevant.

**Step 3 — Hand back.**
Summarise findings worst-first. For each issue, give the recommended fix and let me choose. Once I've approved, write a **single Replit prompt** containing only the fixes I've signed off — and flag clearly if it needs `npm run db:push`.

---

**Note for Andy:** a per-page sweep won't catch *cross-page* bugs (the same table read from two places, schema-level defaults, tokens burned by email scanners). Pair this with the occasional whole-flow review, e.g. "follow a contractor from invite to approved-on-site across every page."
