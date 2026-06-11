---
name: Induction video serving mode
description: How the induction "video" endpoints decide between an uploaded MP4 and AI-generated slides; why customVideoUrl must be checked first.
---

# Induction video: custom MP4 vs AI slides

Induction mode is **derived**, not stored: there is NO `videoSource`/mode column.
An induction is in `custom_upload` mode iff `inductionSettings.customVideoUrl` is set,
otherwise `ai_generated` (slides in `generatedHtml`). Deleting the MP4 nulls `customVideoUrl`.

**Rule:** any endpoint that renders or serves an induction MUST check `customVideoUrl`
FIRST and serve the MP4 path; only fall back to `generatedHtml` when it is empty.
The admin preview route (`GET /api/induction/video/:roleType`) originally skipped this
check and always served `generatedHtml`, so uploaded MP4s showed AI slides in Preview.

**Why:** the public/inductee token flow already derives mode from `customVideoUrl`, so the
admin preview must mirror it or admins see something different from what inductees get.

**How to apply:** when touching any induction render/serve/preview path, branch on
`customVideoUrl` before `generatedHtml`. MP4 streaming uses object storage with HTTP Range;
the session-auth admin stream route mirrors the public token stream route (same path build:
`privateObjectDir` + stored `/induction-videos/{customerId}/{objectId}.{ext}`).

**Schema:** `customVideoUrl` lives in `server/isolatedSchema.ts` (`induction_settings.custom_video_url`),
the customer-isolated schema — query it via `customerDbService.getCustomerDatabase(customerId)`.
