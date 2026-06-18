# Bugfix — Site Induction "Submit Quiz": scope scoring to the customer, make the compliance field first-class, and surface the real error

**Module:** Site Induction (public quiz submit flow)
**Reported via:** BR-027 (Emma Leschenko, ACS Safety & Security Ltd) — "took the quiz, pressed Submit Quiz, got an error, couldn't test any further". Follow-up to BR-025.
**Status of diagnosis:** The exact error Emma hit is not yet confirmed (her screenshots weren't available). These three fixes correct genuine faults found while tracing the submit path **and** make any remaining failure show its real cause so the re-test is actually informative. Apply, redeploy, then re-take the quiz.

---

## Files in scope

- `client/src/pages/SiteInduction.tsx` — quiz UI / `submitQuiz` (around lines 305–393)
- `server/routes/induction.ts` — `POST /api/induction/:tokenId/submit-quiz` (around lines 1258–1415) and the GET questions route (around 938–984, the correct scoping pattern to copy)
- `server/inductionService.ts` — `submitQuizAnswers` and `getInductionQuestions` (around lines 400–478)
- `shared/schema.ts` — shared `inductionTokens` model (around lines 1652–1678)

Do **not** touch the per-customer isolated schema (`server/isolatedSchema.ts`) — the live quiz Q&A all lives in the **shared** DB.

---

## Fix 1 — Score the quiz against the customer's own questions (not everyone's)

**Problem.** When a quiz is submitted, scoring loads **every customer's** active questions with no filter:

```ts
// server/inductionService.ts ~400
async getInductionQuestions(): Promise<InductionQuestion[]> {
  return await db.select().from(inductionQuestions)
    .where(eq(inductionQuestions.isActive, true))      // ← no customer / videoId filter
    .orderBy(inductionQuestions.orderIndex);
}
```

But the questions the contractor actually *saw* are scoped by customer in the GET route:

```ts
// server/routes/induction.ts ~966
const customerVideoId = `${customerId}-${roleType}`;
const allQuestions = await db.select().from(inductionQuestions)
  .where(and(eq(inductionQuestions.isActive, true),
             eq(inductionQuestions.videoId, customerVideoId)))
  .orderBy(inductionQuestions.orderIndex);
```

The scoring set and the displayed set must be built from the **same** filter, scoped to the token's customer. This is also a tenant-isolation hole — scoring should never reach across customers.

**Change `submitQuizAnswers(tokenId, answers)` in `server/inductionService.ts` to:**

1. Read the token first to get `customerId` and `personType` (default `personType` to `'contractor'`):
   ```ts
   const [token] = await db.select().from(inductionTokens).where(eq(inductionTokens.id, tokenId));
   if (!token) throw new Error('Induction link not found.');
   const roleType = token.personType || 'contractor';
   const customerVideoId = `${token.customerId}-${roleType}`;
   ```
2. Load the scoped question set (mirror the GET route exactly) and build the lookup map from **that**:
   ```ts
   const allQuestions = await db.select().from(inductionQuestions)
     .where(and(eq(inductionQuestions.isActive, true),
                eq(inductionQuestions.videoId, customerVideoId)))
     .orderBy(inductionQuestions.orderIndex);
   const questionMap = new Map(allQuestions.map(q => [q.id, q]));
   ```
3. Keep the existing "skip unknown questionId" behaviour, but add a **guard**: if there were answers submitted yet **none** matched the customer's questions (`answers.length > 0 && validAnswerCount === 0`), do **not** silently record 0%. Throw a clear, logged error instead:
   ```ts
   logger.error(`[InductionService] No matching questions for token ${tokenId} (videoId=${customerVideoId}); submitted ${answers.length} answers`);
   throw new Error('We could not match your answers to this site’s induction questions. Please contact the site operator.');
   ```

`getInductionQuestions()` is only used here — fold the scoped query in or leave the method but stop using its unscoped result for scoring.

---

## Fix 2 — Make the CDM 2015 "topics covered" field first-class on the shared token

**Problem.** The submit route writes the CDM compliance record to the shared token:

```ts
// server/routes/induction.ts ~1308
db.update(inductionTokens).set({ inductionTopicsCovered: topicsCovered } as any)...
```

…but `inductionTopicsCovered` is **not declared** on the shared `inductionTokens` model in `shared/schema.ts` (only on the isolated schema). It currently works **only because** `seedInductionSettings.ts` adds the column with raw SQL at boot, and the write is cast `as any` and fire-and-forget. That's fragile — it's invisible to the model and depends on the seed having run.

**Change:** add the column to the shared `inductionTokens` model in `shared/schema.ts` (around line 1674, next to `completedAt`):

```ts
inductionTopicsCovered: jsonb("induction_topics_covered"), // CDM 2015 compliance record — array of {id, label, covered}
```

Make sure `jsonb` is imported in `shared/schema.ts` (it almost certainly already is). Then **remove the `as any` cast** at induction.ts ~1309 so the write is properly typed.

> ⚠️ **Run `npm run db:push` after this change** to formalise the column on the shared DB. It is additive and the column already exists from the seed, so the push is effectively a no-op on existing data — but it keeps the schema and the database in step.

---

## Fix 3 — Stop masking the real error on submit (so the re-test tells us something)

**Problem.** Right now any failure in the submit route returns a generic `500 { error: 'Internal server error' }` ([induction.ts ~1411-1414](server/routes/induction.ts)), and the client shows a generic "Failed to submit quiz. Please try again." That generic masking is most likely **why BR-027 can't be diagnosed** — the actual cause never reaches the screen or the logs in a usable form. This mirrors the fix we made for the help chatbot.

**Server — `server/routes/induction.ts`, the submit-quiz catch block:**

```ts
} catch (error) {
  logger.error('Error submitting quiz:', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
}
```

(Return the real `error.message`. These are operator-facing H&S messages, not secrets — but do **not** include stack traces in the response.)

**Client — `client/src/pages/SiteInduction.tsx`, the `submitQuiz` catch block (~383-389):** surface the real message instead of the hard-coded line:

```ts
} catch (error) {
  console.error("Failed to submit quiz:", error);
  toast({
    title: "Submission Failed",
    description: error instanceof Error ? error.message : "Failed to submit quiz. Please try again.",
    variant: "destructive"
  });
}
```

(The `throw new Error(errData.error || 'Failed to submit quiz')` at ~355 already carries the server message through — just show it.)

---

## What NOT to change

- Don't re-architect the shared-vs-isolated split. Questions, answers and tokens stay in the shared DB; settings/feedback stay isolated. We're only making the submit path consistent and observable.
- Don't change the rate-limiting, the 5-attempt cap, the 10-minute cooldown, the worker-note audit write, or the exhausted-attempts email — those are working.
- Keep all dates/times `en-GB` / `Europe/London` (already correct).

---

## Database

- **`npm run db:push` required** — for Fix 2 (adds `induction_topics_covered` to the shared `induction_tokens` model). Additive and safe; the column already exists from the boot seed.
- Fixes 1 and 3 need no schema change.

---

## Test plan (after deploy)

1. Send a fresh induction link to a test contractor for **ACS Safety & Security Ltd**.
2. Watch the video / slides, answer the quiz, press **Submit Quiz**.
   - **Pass case:** scores correctly against ACS's own questions, "Congratulations" + completed.
   - **Fail case:** shows the real score and the retry/cooldown behaviour.
3. If it still errors, the toast and the server log now show the **real reason** — capture that text; it will tell us exactly what BR-027 is.
4. Confirm the CDM "topics covered" record persists on the token (no silent failure in the logs).
