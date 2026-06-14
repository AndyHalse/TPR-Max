# Fix — Contractor Portal Admin: three smaller fixes (verified against live codebase 14 June 2026)

These are the three lower-priority items left over from the main review (the compliance-sync bug is in its own prompt: `fix-contractor-portal-admin-approval-expiry-june2026.md`). None is urgent, but together they tidy up the admin page and close a small gap. All three are independent — apply in any order.

Files:
- `client/src/pages/ContractorPortalAdmin.tsx`
- `server/routes/contractors.ts`

Run `npm run check` when done.

---

## Fix 1 — "Resend" shows an empty email in the success toast

**The problem:** On the Portal Users list, clicking **Resend** on a pending invite fires a success toast that reads *"Portal invite sent to ."* — the email is missing. The row's Resend button calls the mutation directly with the user's email, but the toast reads from the `inviteEmail`/`postCreateEmail` dialog state, which is empty in that case.

**File:** `client/src/pages/ContractorPortalAdmin.tsx`

Find `sendInviteMutation` and its `onSuccess` (currently around lines 88–98):

```ts
  const sendInviteMutation = useMutation({
    mutationFn: async ({ companyId, email }: { companyId: string; email: string }) => {
      const res = await apiRequest("POST", `/api/contractors/${companyId}/portal-invite`, { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: `Portal invite sent to ${inviteEmail || postCreateEmail}.` });
      setInviteEmail(""); setInviteCompanyId(""); setInviteOpen(false);
      setPostCreateInviteOpen(false);
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
```

Change the `onSuccess` signature to read the email from the mutation's own variables (which are always correct, whichever button triggered it):

```ts
    onSuccess: (_data, variables) => {
      toast({ title: "Invitation sent", description: `Portal invite sent to ${variables.email}.` });
      setInviteEmail(""); setInviteCompanyId(""); setInviteOpen(false);
      setPostCreateInviteOpen(false);
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
```

That's the whole fix — the toast now always names the address the invite actually went to.

---

## Fix 2 — Revoked users look identical to never-accepted invites

**The problem:** When you revoke a portal user, the row stays in the list showing the **"Invite pending"** badge and is counted in the **"Pending invites"** stat — exactly like someone who was just invited and hasn't accepted yet. There's no way to tell "I cut this person off" apart from "this person hasn't replied".

The two states are distinguishable in the data: a genuine pending invite still has an `inviteToken`; revoke clears it (`revoke` sets `inviteToken: null`). We just need to surface that to the page.

### Step 2a — expose it from the API

**File:** `server/routes/contractors.ts`, the `GET /api/contractor-portal/admin-overview` handler (around line 4917).

In the `portalUsers` select, there's already a computed `hasPassword` flag (around line 4930):

```ts
          hasPassword: sql<boolean>`(${isolatedSchema.contractorPortalUsers.passwordHash} IS NOT NULL)`,
```

Add a `hasPendingInvite` flag right after it:

```ts
          hasPendingInvite: sql<boolean>`(${isolatedSchema.contractorPortalUsers.inviteToken} IS NOT NULL)`,
```

### Step 2b — use it on the page

**File:** `client/src/pages/ContractorPortalAdmin.tsx`

**(i)** The pending count (around line 152) currently counts every inactive user:

```ts
  const pendingCount = allPortalUsers.filter((u) => !u.isActive).length;
```

Replace it, and add a revoked count below:

```ts
  const pendingCount = allPortalUsers.filter((u) => !u.isActive && u.hasPendingInvite).length;
  const revokedCount = allPortalUsers.filter((u) => !u.isActive && !u.hasPendingInvite).length;
```

**(ii)** The status badge (around lines 336–338) currently reads:

```tsx
                          <Badge variant={u.isActive ? "default" : "secondary"}>
                            {u.isActive ? "Active" : "Invite pending"}
                          </Badge>
```

Replace with a three-way label:

```tsx
                          <Badge variant={u.isActive ? "default" : u.hasPendingInvite ? "secondary" : "outline"}
                                 className={!u.isActive && !u.hasPendingInvite ? "text-red-600 border-red-300" : undefined}>
                            {u.isActive ? "Active" : u.hasPendingInvite ? "Invite pending" : "Revoked"}
                          </Badge>
```

**(iii)** The Resend button for inactive users (around line 342) is correct to keep — re-inviting a revoked user is the intended way to restore access. Just make its label match the state. Change its text from `Resend` to:

```tsx
                                  {resendInviteBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} {u.hasPendingInvite ? "Resend" : "Re-invite"}
```

**(iv)** Optional, only if you want it visible: the "Pending invites" stat card now excludes revoked users. If you'd like a revoked count shown too, you can surface `revokedCount` in the muted text under that card — but it's fine to leave the stat as-is now that it's accurate. Leave the four stat cards as they are unless you want the extra number.

---

## Fix 3 — Portal admin API isn't gated on the feature flag

**The problem:** The "Contractor Portal" menu item is hidden unless `featureContractorPortal` is on (`Layout.tsx:248`), but the `/api/contractor-portal/*` and portal-user/portal-document admin endpoints don't check the flag. A customer who doesn't have the feature could still call them directly. Low risk — every route is already tenant-isolated and admin-only — but it's inconsistent with how Permit-to-Work, Compliance Dashboard, and Fire Risk Assessment gate themselves, and it means the feature isn't really "off" when it's switched off.

**File:** `server/routes/contractors.ts`

### Step 3a — add the middleware

Right next to the existing `requirePortalAdmin` function (around line 4908), add a feature-gate that mirrors `requirePermitToWorkFeature` (`permitToWork.ts:18`). `simpleDatabaseService` is already imported in this file.

```ts
  // ── Portal feature gate (mirrors requirePermitToWorkFeature) ──────────────
  async function requirePortalFeature(req: any, res: any, next: any) {
    try {
      const context = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);
      if (!settings?.featureContractorPortal) {
        return res.status(403).json({ error: 'Contractor Portal module is not enabled for your account.' });
      }
      next();
    } catch (error) {
      next(error);
    }
  }
```

### Step 3b — chain it on the seven portal-admin routes

Add `requirePortalFeature` between `requireAuth` and `requirePortalAdmin` on each of these (feature first, then admin role):

| Route | Approx line |
|---|---|
| `GET /api/contractor-portal/admin-overview` | 4917 |
| `POST /api/contractors/:companyId/portal-invite` | 4985 |
| `GET /api/contractors/:companyId/portal-users` | 5086 |
| `PATCH /api/contractors/portal-users/:userId/revoke` | 5119 |
| `POST /api/contractors/portal-users/:userId/resend-login` | 5140 |
| `PUT /api/contractors/documents/:docId/review` | 5214 |
| `GET /api/contractors/:companyId/portal-documents` | 5328 |

So each one changes from:

```ts
  app.get('/api/contractor-portal/admin-overview', requireAuth, requirePortalAdmin, async (req, res) => {
```

to:

```ts
  app.get('/api/contractor-portal/admin-overview', requireAuth, requirePortalFeature, requirePortalAdmin, async (req, res) => {
```

Apply the same change to all seven. **Do not** add this gate to any other contractor route — only the seven portal-admin endpoints above. The contractor *side* (`server/routes/contractorPortal.ts`) is a separate login and isn't affected.

---

## Verify

1. `npm run check` passes.
2. **Resend toast:** invite a contractor, leave it unaccepted, click **Resend** on their row — the toast names their email, not "sent to .".
3. **Revoked state:** revoke an active user — their row now shows a red **"Revoked"** badge, the button reads **Re-invite**, and the "Pending invites" stat does **not** count them. A genuinely unaccepted invite still shows **"Invite pending"** and is still counted.
4. **Re-invite path:** click **Re-invite** on a revoked user — they go back to "Invite pending" and receive the invite email.
5. **Feature gate:** in a test customer with the Contractor Portal switched **off** in Settings, the API calls return 403 "module is not enabled" (the menu item is already hidden). Switch it **on** — the page works as before.
