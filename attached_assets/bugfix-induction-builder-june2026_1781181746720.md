# TPR Max — Fix the Induction Builder (1-slide bug, reliability, ease of use)

**Date:** 11 June 2026
**Owner:** Andy Halse
**Files in play:**
- `server/videoGenerationService.ts` — AI script + slide HTML generation (the real bug lives here)
- `server/routes/induction.ts` — generate-video route (~line 4216), scenes endpoints (~4890–4960), video serving route (~4535)
- `server/managers/AiModelManager.ts` — `callClaude` (~line 211), model map (~line 290), per-model `maxTokens`
- `client/src/pages/InductionSettings.tsx` — the routed builder page
- `client/src/pages/InductionPreview.tsx` — preview iframe
- Do **not** touch the orphaned `client/src/pages/settings/InductionSettings.tsx` (kept for reference only).

Read the whole induction flow before changing anything. Run the app and verify each part before moving to the next. Additive and backwards-compatible. British spelling in all UI copy. No glassmorphism on kiosk/inductee-facing screens.

---

## THE CORE BUG: induction generates only 1 slide

The slide HTML builder (`createEnhancedHTMLPresentation`, ~line 2106) maps correctly over every scene. So if the preview shows one slide, **the stored `scenes` array only has one item.** Root causes, in order of likelihood — fix all of them:

### 1. Output token ceiling truncates the AI response
- `AiModelManager.callClaude` caps output at the per-model `maxTokens`, and `claude-3-5-sonnet` is set to **4000** (`AiModelManager.ts` ~line 76). `videoGenerationService.aiJsonFromMessagesViaClaude` (~line 157) also defaults to 4000, and `generateInductionScript` (~line 615) does `Math.min(4000, calculateOptimalTokens(...))`.
- A full 6–8 scene induction (script of 750–1200 words + 8 scene objects, each with 100–150 words of content plus an imagePrompt) routinely exceeds 4000 output tokens. The response gets cut off mid-JSON.
- **Fix:** Raise the induction generation ceiling to at least **8000 output tokens** (Claude 3.5 Sonnet supports 8192). Plumb a real `maxTokens` through from `generateInductionScript` → `aiJsonFromMessagesViaClaude` → `callClaude` and stop clamping it down to 4000. Set the per-model `maxTokens` for the Sonnet-class models used here to 8192.

### 2. No minimum-scene validation — a 1-scene response is silently accepted
- `generateInductionScript` only checks `content.scenes.length === 0` (~line 682). A response with **1** scene sails through, gets saved, and the preview shows one slide.
- **Fix:** After parsing, validate `scenes.length >= 5`. If fewer than 5 scenes come back (truncation, a lazy response, or a single mega-scene), do **not** save it. Either: (a) re-request with an explicit instruction to return the missing scenes, or (b) fall back to the structured 6–8 scene fallback. Never persist a sub-5-scene induction. Log a loud warning with the actual count and the raw response when this triggers.

### 3. Fragile JSON parsing with no repair
- `aiJsonFromMessagesViaClaude` does `text.match(/\{[\s\S]*\}/)` then a bare `JSON.parse` (~line 179–184). A truncated response has no closing brace, so the match is malformed and `JSON.parse` throws — which currently drops straight into the retry/fallback path.
- **Fix:** Make JSON extraction robust: strip markdown code fences first; if `JSON.parse` fails, attempt a single structured repair (e.g. close an unterminated `scenes` array / object and retry the parse) before giving up. If it still fails, log the raw text (truncated to a sane length) so this is diagnosable instead of silent.

### 4. Using an older model
- Default is `claude-3-5-sonnet-20241022` (`videoGenerationService.ts` ~line 500). The codebase already lists `claude-sonnet-4-6` in `CLAUDE_MODELS` (`AiModelManager.ts` ~line 30).
- **Fix:** Default induction generation to **`claude-sonnet-4-6`** unless the customer has explicitly chosen another model in AI Settings. It's stronger at following the "return 6–8 scenes as valid JSON" instruction and supports a larger output budget. Make sure the model map and per-model `maxTokens` entry exist for it.

### 5. Tighten the generation prompt
- The JSON example in the prompt (`videoGenerationService.ts` ~line 572) shows a single scene object in the `scenes` array. Weak/token-pressured responses copy that literally.
- **Fix:** State explicitly and near the end of the prompt: *"Return between 6 and 8 scene objects in the `scenes` array. A response with fewer than 6 scenes is invalid."* Show two scene objects in the example, not one, with a `// …6–8 total` comment.

**Acceptance for the core bug:** Generate an induction for visitor, staff and contractor. Each must produce **6–8 slides**, every time, across at least 5 consecutive generations. The preview (`/induction-preview/:roleType`) shows all slides with working Previous/Next. If the AI ever returns fewer than 5 scenes, the server log shows the warning and the saved induction still has the full fallback set — never one slide.

---

## SECOND: make the "site hazard photos" feature easy to find

The ability to add real photos of dangerous areas already exists in two places, but Andy can't find them in the UI:
1. **Per-slide site photos** — the Slide Editor (`InductionSettings.tsx`, Step 2) has an "Upload Photo" button per slide via `POST /api/induction/settings/:roleType/scenes/photo`. A real photo overrides the AI image for that slide.
2. **Walk-around QR checkpoints** — Step 4 lets you create QR stations with a label, description and (intended) photo.

Do this:
- In Step 1 / Step 2, add a short, plain-English explainer: *"Add photos of real hazards on your site (e.g. a low beam, a loading bay, a chemical store). Each photo and description becomes part of the induction so it's specific to your site, not generic."*
- Confirm the checkpoint builder actually supports a **photo upload + description** per checkpoint (the merge spec intended this). If the checkpoint `imageUrl` upload isn't wired, wire it using the **same** object-storage pattern as the slide-photo endpoint. Show the photo on the public checkpoint page (`/induction/checkpoint/:qrToken`) and in the admin list.
- Make both photo features visibly discoverable — don't bury them behind a collapsed accordion with no hint that they exist.

---

## THIRD: confirm the two content routes both work and are obvious

1. **AI-generated slides** — the fixed flow above.
2. **Upload your own MP4** — the toggle and upload exist (`handleVideoFileSelect`, `/api/induction/upload-video`). Verify end-to-end: upload an MP4 → page flips to "Ready" → kiosk toggle becomes enableable → inductee watches the MP4 then takes the quiz. (This depends on the `hasVideo` fix below.)

**Custom questions:** when a customer uploads their own MP4, the AI has no script to generate questions from. Add a simple **manual question editor** for that case: add/edit/delete a question, set its four options, mark the correct answer, add a wrong-answer explanation. Reuse the existing `inductionQuestions` table and the existing question-display UI in Step 3. So the customer can either auto-generate questions from AI slides, or write their own to match their uploaded video.

---

## FOURTH: small correctness fixes already noted (do these too)

- **Custom MP4 treated as "nothing generated".** `hasVideo` is computed from `settings?.generatedAt` only. A custom upload doesn't set `generatedAt`, so the page shows "Not Generated" and the kiosk toggle stays disabled. Fix `hasVideo` to be true when **either** AI slides exist (`generatedAt != null`) **or** a custom video exists (`customVideoUrl` set). The "Ready" badge and kiosk toggle must both respect this.
- **Attempts count mismatch.** UI shows `/5` in the Sent Links list but check the lockout constant in `induction.ts` (~line 788) matches. Define one shared `MAX_QUIZ_ATTEMPTS = 5` used by both the lockout check and the display.

---

## Constraints
- Don't break: AI generation, the slide editor, checkpoints, the questions system, the sent-links log, kiosk check-in, or the preview route.
- All inductee-facing screens (kiosk, checkpoint, induction player) stay plain and calm — no glassmorphism.
- British spelling throughout the UI.
- Provide Drizzle migrations for any new/changed columns (e.g. checkpoint photo, if not already present).

## Deliverable — report back with:
1. Every file changed.
2. Proof the core bug is fixed: paste the server log scene-counts from 5 consecutive generations across all three role types (must be 6–8 each time).
3. Confirmation that: MP4 upload flips the page to "Ready" and enables the kiosk toggle; manual questions can be added for an MP4 induction; checkpoint photos upload and show on the public page.
4. A short manual test script Andy can follow to demo the whole thing end-to-end.
