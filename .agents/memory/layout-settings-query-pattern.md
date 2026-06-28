---
name: Layout settings query pattern
description: How Layout.tsx fetches /api/settings and why staleTime/refetchOnMount matter for nav visibility
---

## Rule
Layout.tsx settings query MUST use `staleTime: 0` and `refetchOnMount: true`. Without these, the nav sidebar shows stale feature-flag values across server restarts because Vite HMR's WebSocket fails in Replit (it tries `localhost:5173` but that isn't reachable from the browser).

**Why:** Vite HMR never hot-reloads code in Replit's proxied environment — the browser only gets fresh code on a hard refresh. Before these settings, the stale React Query cache (`staleTime: 30s`, `refetchOnMount: false`) meant feature flag changes in the DB didn't reflect in the sidebar until the user did a force-hard-refresh AND the cache had expired.

**How to apply:**
- `queryKey: ["/api/settings"]` in Layout.tsx must keep `staleTime: 0` and `refetchOnMount: true`
- Use `(settings as any)[featureKey]` not `settings[featureKey as keyof CompanySettings]` to access dynamic keys at runtime
- Admin users always see Settings and Staff Kiosk nav items regardless of feature flags (line 326-327) — same pattern as the admin can't be locked out of Settings

## Diagnosed with
- DB had `feature_staff_kiosk = true` (migration 066) and `platform_disabled_features = []`
- Browser was running old Layout.tsx because HMR never delivered the code change
- `[NAV DEBUG]` console.log never fired until server restart forced a full page reload
- `val=false` flickers in the log = user toggling the switch OFF in SystemSettings (correct live-update behavior, not a bug)
