# Bugfix — Remove the dead `callerIsAdmin` role helper in Enterprise Scheduled Reports

**File:** `server/routes/enterpriseScheduledReports.ts`
**Type:** Tidy + harden (no live failure today — this is preventive)
**db:push required:** No
**Risk:** Low. No behaviour change to any route; we are removing unused code and
adding a guard comment so the pattern can't creep back.

---

## Background — what and why

The enterprise multi-site subsystem has ONE rule that has caused nearly every
enterprise bug we've had: **role/scope must be resolved in one place and read
consistently.** The shared path is:

- middleware `requireEnterpriseRole(...roles)` in `server/enterpriseRoles.ts`
  resolves grants via `resolveEnterpriseGrants(...)` and attaches them to
  `req.enterpriseGrants`;
- handlers read scope from `req.enterpriseGrants` — never re-implement role logic.

`server/routes/enterpriseScheduledReports.ts` currently defines a **bespoke** role
helper at the top of the file:

```ts
function callerIsAdmin(req: any): boolean {
  return req.enterpriseGrants?.roles?.includes('enterprise_admin') ?? false;
}
```

**This function is never called.** It is dead code. It is not breaking anything —
but it re-implements role logic in a route file, which is exactly the seed of the
recurring "grant resolved inconsistently at different call sites" bug class. Left in
place, the next person will wire it up and reintroduce the problem. The mutation
routes (POST / PATCH / DELETE / seed-defaults) are ALREADY correctly gated by
`requireEnterpriseRole('enterprise_admin')` at the middleware, so the helper is also
redundant.

## The fix

1. **Delete** the `callerIsAdmin` function and its `// ─── Role helper ───` comment
   block from `server/routes/enterpriseScheduledReports.ts`.

2. In its place, add a short comment so the intent is explicit and the pattern
   doesn't come back:

   ```ts
   // Role gating is enforced entirely by `requireEnterpriseRole(...)` middleware,
   // which attaches resolved grants to `req.enterpriseGrants`. Do NOT add a local
   // role helper here — read scope from `req.enterpriseGrants` if a handler ever
   // needs it, so all enterprise role logic stays on the single shared path.
   ```

3. Confirm nothing else references `callerIsAdmin` (there are no other references in
   the repo — a project-wide search should return only the definition you're
   removing). Confirm the file still compiles.

**Do not** change any route's middleware, request/response shape, or behaviour.
This is a pure removal + comment.

## Acceptance

- `callerIsAdmin` no longer exists anywhere in `server/`.
- The file compiles and all five scheduled-report routes behave exactly as before
  (GET list, POST create, PATCH update, DELETE, POST seed-defaults).
- `npm run test:site-isolation-routes` still passes (no regression).

---

## While you're here — TWO things to confirm (report back, don't fix yet)

These are separate from the dead-code removal. Just tell Andy what you find; don't
change behaviour without his say-so.

1. **GET list scope for area managers.** The list route allows
   `requireEnterpriseRole('enterprise_admin', 'area_manager')` and returns ALL
   schedules with no scope filter. Schedules carry `recipients` (email addresses)
   and scope config. Confirm whether an `area_manager` should see estate-wide
   schedules and their recipient lists, or only schedules scoped to their area.
   (Same-tenant over-share, low severity — but a governance call for Andy.)

2. **Recipient governance.** Recipients on a schedule are free-text emails that
   receive estate compliance report PDFs on a cron. Confirm there is validation that
   they are well-formed emails, and note whether there is (or should be) any bound on
   who can be added (e.g. only users on the customer, or a documented "trusted
   recipients" step). This is the outbound-data surface — worth an explicit decision
   before enterprise go-live.

---

**Static-trace caveat:** this was traced from the code, not run. After applying,
run `npm run test:site-isolation-routes` and a quick manual check that the Scheduled
Reports page still lists/creates/toggles schedules.
