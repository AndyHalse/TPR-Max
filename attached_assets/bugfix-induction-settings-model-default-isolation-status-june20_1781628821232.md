# Bugfix — Induction Settings: AI model default, tenant isolation, generation status

**Date:** 16 June 2026
**Area:** Health & Safety Induction Builder
**Files:** `server/isolatedSchema.ts`, `server/routes/induction.ts`, `client/src/pages/InductionSettings.tsx`

This is a deep-dive fix pack for the Induction Settings feature. The flow works, but there are five issues — one that affects every new customer, two tenant-isolation gaps, a fragile generation-status design, and a couple of smaller robustness fixes. Apply them all. Do **not** change any other behaviour.

---

## 1. Make Claude Sonnet 4 the real default (HIGH — affects every new customer)

**Problem:** The UI labels `claude-sonnet-4-6` as "✦ Recommended" and falls back to it for display, but the actual system default is `gpt-5`. So a brand-new customer who clicks "Generate complete draft" without touching the model dropdown generates with GPT-5 (which needs platform AI credits / an OpenAI key), while the screen tells them Claude is selected and recommended. The "No Anthropic API key configured" warning can also show while the real call goes to GPT-5.

**Decision:** the default everywhere must be `claude-sonnet-4-6`.

**Changes:**

a) `server/isolatedSchema.ts` line ~415 — change the column default:
```ts
// BEFORE
openaiModel: text("openai_model").default("gpt-5"),
// AFTER
openaiModel: text("openai_model").default("claude-sonnet-4-6"),
```

b) `server/isolatedSchema.ts` line ~1209 — change the induction model default:
```ts
// BEFORE
modelType: text("model_type").default("gpt-5").notNull(),
// AFTER
modelType: text("model_type").default("claude-sonnet-4-6").notNull(),
```

c) `server/routes/induction.ts` in the `generate-video/:roleType` handler (~line 4462–4467) — change the local fallbacks:
```ts
// BEFORE
let modelType = 'gpt-5';
...
modelType = roleSetting?.modelType || 'gpt-5';
// AFTER
let modelType = 'claude-sonnet-4-6';
...
modelType = roleSetting?.modelType || 'claude-sonnet-4-6';
```

d) Add a one-off data migration so **existing** customers who never changed their model — i.e. still sitting on the old `gpt-5` default — move to Claude. Only touch rows that are exactly `gpt-5` so we don't override anyone's deliberate choice:
- In the isolated `induction_settings` table: `UPDATE induction_settings SET model_type = 'claude-sonnet-4-6' WHERE model_type = 'gpt-5';`
- In the isolated company/AI settings table: `UPDATE <company_settings> SET openai_model = 'claude-sonnet-4-6' WHERE openai_model = 'gpt-5';`

Run this for every customer-isolated database, using the same per-tenant iteration the existing migration runner uses. Confirm in the prompt output how many rows were updated per tenant.

**Acceptance:** a fresh customer who has never opened the AI Model dropdown sees "Claude Sonnet 4 ✦ Recommended" selected, and generation actually calls Claude. The displayed model, stored model, and model used for generation all match.

---

## 2. Scope question edit/delete to the logged-in customer (HIGH — tenant isolation)

**Problem:** `PATCH /api/induction/questions/:id` (~line 910) and `DELETE /api/induction/questions/:id` (~line 932) filter only by `id`. A user in tenant A could edit or delete tenant B's question if they knew its UUID. Questions live in the shared `db` and are scoped by the convention `videoId = ${customerId}-${roleType}`, so use that to guard the mutation.

**Fix:** before updating/deleting, load the question and verify its `videoId` starts with `${req.customerId}-`. Reject with 404 if it doesn't (404, not 403, so we don't confirm the row exists to another tenant). Example for the PATCH handler:
```ts
const customerId = req.customerId;
if (!customerId) return res.status(401).json({ error: 'Authentication required' });
const [existing] = await db.select({ videoId: inductionQuestions.videoId })
  .from(inductionQuestions).where(eq(inductionQuestions.id, id));
if (!existing || !existing.videoId?.startsWith(`${customerId}-`)) {
  return res.status(404).json({ error: 'Question not found' });
}
// ...then proceed with the existing update/delete
```
Apply the same guard to the DELETE handler.

**Acceptance:** editing/deleting a question still works for its owner; a request for another tenant's question ID returns 404 and changes nothing.

---

## 3. Scope or remove the legacy settings-by-id write (MEDIUM — tenant isolation)

**Problem:** `PUT /api/induction/settings/:id` (~line 4154) writes to the **global** `inductionSettings` table by raw `id` with no customer check. The current UI doesn't call it (it uses `/:roleType/toggle` and `/:roleType/scenes`).

**Fix:** if nothing else in the codebase calls it, remove the route. If you're not certain it's unused, instead add a guard that loads the row and confirms it belongs to `req.customerId` before writing (404 otherwise), matching the pattern in fix 2. State in the prompt output which option you took and why.

---

## 4. Persist generation status to the database (MEDIUM — survives redeploys)

**Problem:** generation progress is held in an in-memory `Map` (`inductionGenerationStatus`, ~line 75). On a Replit redeploy or any server restart mid-generation, the status is lost: the progress bar hangs forever even though the slides may have saved, and it can't work across more than one server instance.

**Fix (pragmatic):** add a small `induction_generation_status` table (or reuse a key/value/jobs table if one already exists) keyed by `customerId + roleType`, storing `{ status, step, totalSteps, message, error, startedAt, completedAt }`. Write to it at each `setStatus(...)` call in the generate-video handler, and read from it in `GET /api/induction/status/:roleType`. Keep the in-memory Map as a fast-path cache if you like, but the database must be the source of truth.

Add a safety net: in the status read, if a row has been in a non-terminal state (`generating_script`/`building_slides`/`creating_questions`/`saving`) for more than, say, 10 minutes with no update, return `failed` with a clear message ("Generation timed out — please try again") so the UI never hangs indefinitely.

**Acceptance:** start a generation, restart the server, reload the page — the UI either shows the correct final state (if it completed) or a clean failure, never a frozen spinner.

---

## 5. Quick Start robustness (LOW — client)

In `client/src/pages/InductionSettings.tsx`:

a) `runQuickStartGeneration` (~line 1417) ignores the question-generation response. Check it and surface a problem instead of silently reporting success:
```ts
const qr = await apiRequest('POST', `/api/induction/generate-questions/${role}`, {});
const qd = await qr.json();
if (qd && qd.success === false) {
  throw new Error(qd.error || `Could not generate questions for ${ROLE_LABELS[role]}.`);
}
```

b) If a single-role generation is already running and the user triggers Quick Start, the `generate-video` call returns 409 and the flow throws "Generation already in progress" for the whole batch. Make the thrown message friendlier and tell the user to wait for the in-progress generation to finish before using Quick Start.

c) Remove the duplicate `AiKeysResponse` interface declared inside `RoleCard` (~line 217) — the top-level one (line 34) already covers it.

---

## Out of scope (do not change)
- The slide/checkpoint photo upload paths and `/objects` rendering — verified correct.
- The HSE script/content generation prompts.
- The kiosk and public token read paths — isolation there is already correct.

## Testing checklist
1. Fresh customer → AI Model shows Claude Sonnet 4, Quick Start generates via Claude, no GPT billing.
2. Existing `gpt-5` customer → migrated to Claude; a customer who deliberately picked GPT-4o is untouched.
3. Edit/delete a question as its owner → works. Same ID from another tenant → 404, no change.
4. Start a generation, restart the server, reload → no frozen spinner.
5. Quick Start with a generation already running → clear message, no broken batch.
6. Build is clean (`npm run build`), and run `npm run db:push` for the new status table + column default changes.
