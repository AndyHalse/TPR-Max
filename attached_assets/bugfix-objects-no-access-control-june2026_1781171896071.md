# Security — uploaded files are served with no access control (platform-wide)

**Priority: HIGH (data exposure / GDPR). Effort: medium — this is a design fix, not a one-liner. Read the whole thing before touching code, especially the "logo trap" section, or you will break the login page.**

## Plain-English summary (for Andy)

Every file anyone uploads to TPR — contractor insurance, RAMS, DBS certificates, permits, induction files — is served from one web address that has **no login check at all**. If someone has the link, they can open the file with no password. The only protection is that the link contains a long random code that's hard to guess. For ordinary images that's fine. For DBS certificates and insurance documents — personal, sensitive data — it isn't, and it's a GDPR risk.

There's a second half to the problem: the platform has a proper permissions system for files built in, but **it was never switched on** — no upload ever tags a file as "public" or "private". So we can't just flip a switch; if we turn the check on as-is, every file (including company logos on the login page) stops loading. This prompt explains how to close the hole without breaking those logos.

---

## The problem (for the developer)

**Gap 1 — the serving route enforces nothing.** `server/routes/settings.ts:740`:

```ts
app.get("/objects/:objectPath(*)", async (req, res) => {
  const objectStorageService = new ObjectStorageService();
  const objectFile = await objectStorageService.getObjectEntityFile(req.path);
  objectStorageService.downloadObject(objectFile, res);   // streams to anyone
});
```

No `requireAuth`, no portal-token check, no ACL check. `downloadObject` (`server/objectStorage.ts:99`) *reads* the ACL policy but only to decide the `Cache-Control` header — it never blocks a private object. `canAccessObject` exists in `server/objectAcl.ts` and is imported, but **is never called on this route**.

**Gap 2 — no upload ever sets an ACL policy.** `ObjectStorageService.trySetObjectEntityAclPolicy` (`server/objectStorage.ts:211`) is defined but has **zero callers**. Every upload site (`settings.ts:712` general upload, `contractorPortal.ts:389`, `permitToWork.ts`, `complianceCertificates.ts`, `contractors.ts`, `ppm.ts`, induction, cdm) writes the file and stores a `/objects/uploads/<uuid>` or `/objects/contractor-portal/<uuid>` path, but never tags it. So `getObjectAclPolicy` returns `null` for every object in the system.

**Why that matters for the fix:** `canAccessObject` returns `false` when the policy is `null`. So if you "just add `canAccessObject`" to the serving route, **every file on the platform 403s** — logos, photos, documents, everything. That's the trap. The ACL data doesn't exist yet, so the fix has to account for that.

---

## The logo trap — read this before you change the route

Company logos are served through this same private route (`/objects/uploads/<uuid>`), and they're shown **before login** — on the main login page and on the contractor-portal login/branding screen (`GET /api/contractor-portal/branding` returns `/objects/...` logo URLs to unauthenticated visitors). The platform-admin login already uses the separate public route `/public-objects/...`, but customer logos do not.

So: **gating `/objects/*` behind authentication, on its own, will break the logo on every login screen.** You must handle public assets first/at the same time. Grep the client for `/objects/` and `/public-objects/` and confirm which assets render pre-auth before you ship.

---

## Recommended fix — two phases

### Phase 1 — close the hole now, keep logos working

1. **Make genuinely-public assets public, and serve them publicly.** For logos / branding / marketing images, either:
   - tag them `visibility: "public"` at upload via `trySetObjectEntityAclPolicy`, **and** make the serving route honour public objects (serve without auth when `getObjectAclPolicy(file)?.visibility === "public"`); or
   - simpler and more robust: serve logos from the existing `/public-objects/` route (as platform-admin branding already does) and update the logo URLs the branding/settings endpoints return.

   Pick one and apply it consistently. The login-page and portal-branding logos must still load with no session.

2. **Require an authenticated caller for everything else.** Change the `/objects/:objectPath(*)` route so that, unless the object is explicitly public, it requires either:
   - a valid staff session (the same check `requireAuth` uses), **or**
   - a valid contractor-portal bearer token (`verifyPortalToken` from `server/utils/contractorPortalAuth.ts`).

   If neither is present, return `401`. Don't attempt per-user ACL rules here yet — the access-group types in `objectAcl.ts` are stubs (`ObjectAccessGroupType` is empty, `createObjectAccessGroup` throws), so there's no real group membership to check. The meaningful win in Phase 1 is simply: **you must be logged into TPR at all to pull a private file.** That removes the open-internet exposure, which is the actual risk.

This is enough to make the prompt's headline problem go away without a big refactor. Ship Phase 1, verify logos, then move on.

### Phase 2 — proper per-object, per-customer ACL (later, separate work)

Once Phase 1 is stable:
- Wire `trySetObjectEntityAclPolicy` into **every** upload site so each file is tagged at creation with `{ owner, visibility }` — `private` for compliance documents, `public` only for branding/marketing assets.
- Backfill existing objects (a one-off script): default everything to `private` except known logo/marketing paths.
- Tighten the serving route to call `canAccessObject` with the caller's id, and scope access to the owning customer so customer A can never pull customer B's file even with the URL. (All tenants currently share one bucket with UUID paths, so customer scoping needs the ACL `owner`/customer id on the object — that's what Phase 2 adds.)

Don't try to do Phase 2 in the same change as Phase 1 — tag-on-upload plus backfill plus route tightening is its own testable piece.

---

## How to verify

**Phase 1 — the hole is closed:**
1. Upload a contractor document through the portal. Copy its `/objects/contractor-portal/<uuid>` URL.
2. Open that URL in a private browser window with **no** login / no token → must return `401`, not the file.
3. Open the same URL while logged in as a staff user of that customer → file loads.
4. Open the same URL with a valid contractor-portal token (Authorization: Bearer …) → file loads.

**Phase 1 — nothing visible broke (the important regression set):**
5. Customer logo still shows on the **main login page** (logged out).
6. Customer logo still shows on the **contractor-portal login page** (logged out).
7. Logos and images still render inside the app once logged in (dashboard, contractor records, PDF/branding, induction media).
8. Platform-admin login branding still works (it already uses `/public-objects/`).

If any of 5–8 fail, the public-asset handling in step 1 of Phase 1 isn't right — fix that before shipping.

## Scope guard

- Phase 1 changes: the `/objects/:objectPath(*)` route in `server/routes/settings.ts`, possibly `downloadObject` in `server/objectStorage.ts`, and the logo-URL handling for public assets. Reuse the existing session check and `verifyPortalToken` — don't invent a new auth scheme.
- Do **not** start tagging every upload or backfilling ACLs in this change — that's Phase 2.
- Confirm with Andy which assets are genuinely public (logos, marketing images) before deciding how to serve them.
