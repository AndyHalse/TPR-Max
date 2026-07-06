---
name: Settings checklist cache staleness
description: Onboarding/Quick Setup checklist items can show stale "incomplete" state right after the user completes them, because settings-save mutations only invalidated the settings query, not the checklist query.
---

Any mutation that saves company settings (logo upload, CDM alerts email, SMTP config, branding reset, etc.) must invalidate BOTH `["/api/settings"]` AND the checklist queries: `["/api/settings/quick-setup-status"]` (Settings page panel) and `["/api/onboarding/checklist-status"]` (Dashboard getting-started card). These are two separate derived-status endpoints computed from the same settings row, cached independently by React Query.

**Why:** `useSettingsAutoSave`'s mutation and `BrandingSettings`' reset-to-defaults mutation only invalidated `["/api/settings"]`. Because the checklist queries had their own cache entries with a 30s staleTime, a user could upload a real logo, see it render immediately, yet the Quick Setup checklist kept showing "Upload your company logo" as incomplete — looking like the check was hardcoded/broken, when it was really just a stale cache.

**How to apply:** whenever you find or add a settings-saving mutation whose fields could affect a checklist/onboarding item (logo, emergency email, SMTP, muster points, etc.), invalidate the relevant checklist query key(s) in its `onSuccess` alongside `["/api/settings"]`. Also worth checking: every customer is provisioned with a hardcoded default placeholder logo (`/uploads/d6fe1a5b-aa78-4c1f-84b7-74037a02e0f6`, a fully-branded "ACS" image, not a blank/empty state) — the checklist correctly excludes this UUID when computing `companyLogoSet`, but the UI should also visually flag when the displayed logo is still this default so users don't mistake it for their own upload.
