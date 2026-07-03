---
name: PPM role-gating removal
description: PPM module had blanket admin/manager-only checks on nearly every route; both backend and frontend had to be updated together.
---

`server/routes/ppm.ts` had ~31 inline `if (req.user!.role !== "admin"/!["admin","manager"].includes(...)) return res.status(403)` checks scattered across asset/group/template/schedule/work-order CRUD and actions. `client/src/pages/PPM.tsx` had 3 parallel `isAdmin` UI gates (export-all, resend-all-alerts, per-doc resend-alert) driven by a separate `/api/auth/me` role check.

**Why:** These were legacy blanket admin-gates on what is meant to be an operational, all-user feature. They are completely orthogonal to tenant/site isolation (`getScopedDb`/`scopedWhere`/`withSiteId` in `server/siteScope.ts`), so removing them does not affect standalone vs. Enterprise Central/Independent scoping — a single backend fix (deleting the role-gate lines, keeping `requireAuth`) automatically applies uniformly everywhere.

**How to apply:** When a user reports "role X should be able to do Y" on a feature, check BOTH the backend route guards AND any mirrored frontend `isAdmin`/role-conditional rendering — fixing only one side leaves either a dead button or an API that 403s despite a visible UI control. `requireAuth` (`server/auth.ts`) only validates session/token + active-user status, never role, so removing a role check there is safe by design.
