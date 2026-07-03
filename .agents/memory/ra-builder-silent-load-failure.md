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
Also: cookies (session auth) transfer fine across browser tabs regardless of `rel="noopener"` on
an `<a target="_blank">` link, and `/api/auth/me` self-heals the per-tab bearer token on mount —
so a fresh-tab auth/session mismatch is an unlikely cause of this symptom; look at the target
page's own query error-handling first.
