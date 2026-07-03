---
name: RA Builder / detail-editor silent load failure
description: Pattern where a failed detail-fetch left an editor form silently blank, making users believe their data was deleted when it was still safe server-side.
---

Client editor pages that load a single record into local component state via `useQuery`
(e.g. `assessment` state seeded from a `useEffect` on `data`) must handle `isError` explicitly.
If the query throws (404, network blip, auth hiccup, etc.) and there is no error branch, the
component silently keeps its initial empty state, rendering a fully blank form that looks
identical to "the record lost its data" — even though nothing was touched server-side.

**Why:** A user reported the Risk Assessment Builder "lost" a saved RAMS assessment when
reopened from the RAMS tab (blank title/dates/hazards, status Draft). Investigation of
`server/routes/raBuilder.ts` confirmed all PUT/approve routes only do partial `.set()` updates
on explicitly-provided fields — they cannot zero out title/hazards. The real defect was in
`client/src/pages/RaBuilder.tsx`: the editor's assessment-loading `useQuery` had no error
handling, so any fetch failure left `assessment` at its default `{}`, which renders as a
totally empty editor — indistinguishable from real data loss to the user.

**How to apply:** When a detail/editor view seeds local state from a `useQuery` fetch, always
destructure and branch on `isError`/`error` (and ideally `isLoading`) before rendering the form,
and show an explicit "couldn't load / try again" state instead of falling through to default
empty state. This applies broadly across the app's many "open item → edit in place" flows
(RA Builder, and likely other builder/editor-style pages that follow the same pattern).

## Follow-up: the real underlying cause was an Enterprise "wrong site" 404, not a bug in the error handling itself

Adding the error UI above surfaced the true root cause: `GET /api/ra-builder/assessments/:id`
genuinely returned 404. Confirmed via direct DB query — the assessment (and its linked shared
`rams_documents` row created on approve) is stamped with the `siteId` that was active at
creation time. In an Enterprise multi-site account, `scopedWhere()` (see `server/siteScope.ts`)
filters single-record reads by the session's *current* `activeSiteId`; if a shareable/deep link
(e.g. a RAMS-tab "Download"/"View" link pointing at `/ra-builder?open=<id>`) is opened while a
*different* site is active than the one the record belongs to, the scoped query returns nothing
— indistinguishable from a genuinely deleted record.

This applies to any of the 34 site-scoped tables listed at the top of `server/siteScope.ts` that
have a deep-linkable single-record GET route (PPM, incidents, permits, audits, etc.) — if a
"record not found" bug is reported on an Enterprise account, check whether the record exists
under a different `siteId` before assuming data loss.

**Fix pattern:** in the single-record GET handler, when the site-scoped lookup finds nothing,
run a second customer-scoped-only (no site filter) lookup. If the row exists under a different
site, return a distinguishable payload, e.g. `{ error, wrongSite: true, siteId, siteName }`,
instead of a bare 404. On the frontend, detect `wrongSite` and offer a "Switch to <site> & Open"
action that calls `POST /api/enterprise/active-site` with the correct `siteId` then refetches —
don't just tell the user the record is missing.

## Second follow-up: correction — new-tab `noopener` DOES break per-tab auth here

The claim above ("cookies transfer fine across tabs regardless of `noopener`... unlikely cause")
was wrong and has been removed. Confirmed by reproducing with real log/session evidence: this app
uses a **per-tab Bearer session token** stored in `sessionStorage` (`session_token`) specifically so
different browser tabs can be logged into different customers at once (see `apiRequest` /
`getSessionToken` in `client/src/lib/queryClient.ts`). `sessionStorage` is NOT shared with a new
auxiliary browsing context opened via `<a target="_blank" rel="noopener noreferrer">` — `noopener`
severs the opener relationship that would otherwise let some browsers copy it over. The shared
session *cookie*, by contrast, is always sent to any tab. Since the shared cookie can currently
belong to a *different* login than the tab's own per-tab token (e.g. someone logged in elsewhere,
or via dev-bypass, after the original tab's login), a fresh tab opened this way falls back to
authenticating as whatever the shared cookie currently represents — not the identity of the tab
that generated the link. If that's a different customer, the target record genuinely doesn't exist
in that customer's schema → indistinguishable generic "not found" error.

`server/routes/raBuilder.ts`'s approve endpoint sets a RAMS doc's `documentUrl` to an **internal SPA
route** (`/ra-builder?open=<id>`), not a real file — but `client/src/components/RAMSManagement.tsx`
rendered ALL `documentUrl` values (real uploaded files and this internal route alike) as
`<a target="_blank" rel="noopener noreferrer">`, i.e. real downloads and internal deep-links used
the same "open in new tab" treatment.

**Fix pattern:** distinguish internal SPA deep-links from real external file URLs (e.g. prefix check
`url.startsWith("/ra-builder?open=")`) and navigate internal links in the **same tab**
(`window.location.href = url`, no `target="_blank"`) so the tab's own `sessionStorage` bearer token
is reused; reserve `target="_blank" rel="noopener"` for genuine external file downloads only. See
the `isInternalAppLink` helper in `RAMSManagement.tsx`. Any other module that mixes real uploaded
files with generated internal-route links in the same "documentUrl"-style field should apply the
same distinction.
