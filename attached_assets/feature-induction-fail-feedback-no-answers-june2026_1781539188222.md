# FEATURE — Induction fail screen: stop giving away the answers (+ per-customer feedback setting)

**Source:** TPR Bug Report BR-016 (Emma Leschenko, 15 Jun 2026). When a contractor fails the induction, the "questions to revisit" panel shows them the **correct answers**. Emma: *"The answers should not be given — only the number of the question(s) answered incorrectly."*

**Decision (Andy, 15 Jun 2026):** Default = show the **question number + topic** they got wrong, never the answer. And make the strictness a **per-customer setting** so strict and lenient customers can differ.

**Why this matters:** the induction quiz is a legal H&S record that the contractor understood the safety briefing. If it shows the correct answers and lets them retake, they just copy the key and pass — the record stops proving anything. UK benchmarks (CITB HS&E test) never reveal the answers on failure; they point you at the weak topics to revise.

---

## 1. Immediate fix — remove the correct-answer reveal
`client/src/pages/SiteInduction.tsx`, the "Induction Not Passed" block (~lines 922–948). Today it renders, per wrong question:
```
✗ Your answer: <givenText>
✓ Correct answer: <correctText>   <-- REMOVE this line entirely
```
Stop rendering `correctText` (and the "✓ Correct answer" row) anywhere on the fail screen. The contractor must never see the correct answer.

## 2. Default fail feedback — question number + topic, no answers
Questions already have `category` (topic), `questionText`, `orderIndex`, and `sceneIndex` (`InductionQuestion`, ~line 34). For each incorrectly-answered question, show a clean list item:
```
• Question {orderIndex + 1} — {category}
```
(Use a stable, human question number — `orderIndex + 1` — consistent with how questions are presented.) Do **not** show the question's options, the given answer text, or the correct answer. Keep the score line ("You scored 60% — you need 80%"), the attempts-remaining line, and the Rewatch / Retry buttons that are already there.

## 3. New per-customer setting — failure feedback level
Add a setting so customers choose how much help a failed contractor gets.

**Schema (`shared/schema.ts`, `inductionSettings` table ~line 1700):**
- Add `failureFeedbackLevel text("failure_feedback_level").default("questions_topics")` — one of:
  - `score_only` — show only the score + retry. No per-question list.
  - `questions_topics` — **(default)** the list from §2: question number + topic, no answers.
  - `topics_rewatch` — same list, but each item also links back to the relevant briefing section to rewatch before retrying (see §4). Still no answers.
- Requires `npm run db:push`.

**Admin UI (`client/src/pages/InductionSettings.tsx`):** add an "On failure, show…" radio/select with the three options (label them plainly, e.g. *"Questions & topics to revisit (no answers) — recommended"*), saved via the existing induction settings save path. Put it near the pass-threshold / attempts settings.

**Reader (`SiteInduction.tsx`):** read `failureFeedbackLevel` (alongside `passThreshold`) and render the fail screen accordingly. Default to `questions_topics` if unset.

## 4. `topics_rewatch` behaviour (the most helpful, still strict)
For wrong questions that have a `sceneIndex`, show a "▶ Rewatch this section" link that jumps the contractor back to that scene/section of the briefing before they retry. Global questions (`sceneIndex == null`) just appear in the list without a rewatch link. Never reveal the answer — they get re-tested.

## 5. Keep attempts; after the final attempt, notify the safety team
- Keep the existing **5-attempt** cap and lock (already built, ~line 884 / 760). (Optional nicety: make max-attempts a setting too, alongside the new one — only if quick.)
- When a contractor **exhausts all attempts**, in addition to locking them out, **email the site operator / safety contact** so a human can step in (re-brief in person, or issue a fresh link). Reuse the existing `EmailService` — don't add a new mailer. Send to the customer's induction/safety contact email if one exists, else the customer admin email. Keep it short and factual: which contractor, which induction/role, attempts used, timestamp. (This notification is likely **new** — the current lock just tells the contractor to contact the operator; check before building.)

## Acceptance criteria
- On failure, the correct answers are **never** shown, in any mode.
- Default (`questions_topics`): the contractor sees "Question N — {topic}" for each wrong answer, plus score and retry — no answers, no option text.
- `score_only`: score + retry only, no per-question list.
- `topics_rewatch`: as default, plus a rewatch link to the relevant section for scene-linked questions.
- The feedback level is set per customer in Induction Settings and honoured on the live induction.
- After the final (5th) failed attempt, the contractor is locked **and** the safety contact is emailed.
- Passing still works exactly as now.

## Notes
- Schema change (`failure_feedback_level`) needs `npm run db:push`.
- Don't touch the pass screen — only the fail path changes.
- British English in all copy ("revisit", "briefing", etc.).
