# Fix — Induction Settings page: Quick Start silently throws away the details you typed + AI model label disagrees with itself (verified against live codebase 14 June 2026)

## The problem (read this first)

Two bugs on the Health & Safety Induction Builder page (`client/src/pages/InductionSettings.tsx`). The first one matters because it quietly produces a worse induction, so it's the priority.

### Bug 1 — "Generate complete draft" throws away the Company / Industry / Hazards you just typed (HIGH)

The whole point of the page is to generate a **site-specific** induction. When a new user clicks **"Generate complete draft induction"** and hasn't filled in Site Details yet, the page pops up a mini "Just the essentials" form asking for Company / Site Name, Industry, and Key Site Hazards. The user fills it in, clicks **Generate now**, and the AI is supposed to write content tailored to those answers.

It doesn't. Here's why.

`handleQuickStartWithForm` (around `client/src/pages/InductionSettings.tsx:1428`) tries to save those three answers like this:

```ts
await apiRequest('PATCH', '/api/settings', {
  ...(qs.form.siteName.trim() && { siteAddress: qs.form.siteName.trim() }),
  ...(qs.form.industry.trim() && { inductionIndustry: qs.form.industry.trim() }),
  ...(qs.form.hazards.trim() && { inductionHazards: qs.form.hazards.trim() }),
});
```

The problem is the method: **`PATCH`**. On the server there is **no `PATCH /api/settings` route** — the only handlers are `GET /api/settings` and `PUT /api/settings` (see `server/routes/settings.ts:144` and `server/routes/settings.ts:641`). Everywhere else on this same page that saves settings correctly uses `PUT` (the auto-save `handleInputChange`, and the hazard-reporting toggle at `client/src/pages/InductionSettings.tsx:1206`).

So the `PATCH` call fails. And the failure is **swallowed silently**:

```ts
  } catch { /* non-fatal */ }
  await runQuickStartGeneration();
```

The user sees no error. Generation runs straight afterwards — but against whatever was in Settings *before* (for a brand-new user, that's nothing). The result: they carefully typed their site name, industry and hazards, and the AI ignores every word of it and generates a generic induction. That defeats the single most important promise of the feature ("site-specific, CDM 2015 / HSE compliant").

### Bug 2 — The AI model label contradicts itself when no model has been chosen (LOW / cosmetic)

The main **AI Model** dropdown (`client/src/pages/InductionSettings.tsx:1660`) falls back to showing **"Claude Sonnet 4"** when no model is set:

```ts
value={currentSettings?.openaiModel || 'claude-sonnet-4-6'}
```

That fallback is correct — when no model is stored, the server actually uses `claude-sonnet-4-6` (`server/videoGenerationService.ts:589` and `server/routes/induction.ts:54`).

But lower down, the little **"AI Generation Model"** badge inside each role's *Advanced options* (`client/src/pages/InductionSettings.tsx:1311`) falls back to **"GPT-5"** instead:

```ts
{companySettings?.openaiModel || settings?.modelType || 'GPT-5'}
```

So on a fresh account the top of the page says the model is **Claude Sonnet 4** while the Advanced panel says **GPT-5**. They're describing the same setting and disagree. The Claude one is right; the `'GPT-5'` fallback is the wrong/misleading default to show.

**Scope:** one file only — `client/src/pages/InductionSettings.tsx`. No server changes needed (the correct `PUT /api/settings` route already exists and already accepts partial bodies like `{ inductionIndustry, inductionHazards, siteAddress }`). Run `npm run check` when done.

---

## Fix 1 — Use the real endpoint, and don't generate if the save failed (PRIORITY)

In `client/src/pages/InductionSettings.tsx`, find `handleQuickStartWithForm` (around line 1428). Replace the `try/catch` block so it (a) uses `PUT`, and (b) does **not** silently carry on if the save fails — because generating without the user's details is exactly the outcome we're trying to prevent.

Change this:

```ts
    try {
      // Save essentials directly so they're committed before generation hits the server
      await apiRequest('PATCH', '/api/settings', {
        ...(qs.form.siteName.trim() && { siteAddress: qs.form.siteName.trim() }),
        ...(qs.form.industry.trim() && { inductionIndustry: qs.form.industry.trim() }),
        ...(qs.form.hazards.trim() && { inductionHazards: qs.form.hazards.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch { /* non-fatal */ }
    await runQuickStartGeneration();
```

to this:

```ts
    try {
      // Save essentials FIRST so the AI generates against them. Uses PUT — the
      // only settings write endpoint the server exposes (GET + PUT /api/settings).
      await apiRequest('PUT', '/api/settings', {
        ...(qs.form.siteName.trim() && { siteAddress: qs.form.siteName.trim() }),
        ...(qs.form.industry.trim() && { inductionIndustry: qs.form.industry.trim() }),
        ...(qs.form.hazards.trim() && { inductionHazards: qs.form.hazards.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    } catch {
      // The whole point of this form is site-specific content — if the details
      // didn't save, stop and tell the user rather than generating a generic induction.
      setQs(prev => ({
        ...prev,
        phase: 'failed',
        error: 'Could not save your site details. Please check your connection and try again.',
      }));
      return;
    }
    await runQuickStartGeneration();
```

That's the core fix: `PATCH` → `PUT`, and the silent `catch` now surfaces the failure and aborts instead of generating against empty settings.

---

## Fix 2 — Make the Advanced-options model badge agree with the main selector

Still in `client/src/pages/InductionSettings.tsx`. The Advanced-options badge (around line 1311) currently reads:

```tsx
<Badge variant="outline" className="text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600 text-xs">{companySettings?.openaiModel || settings?.modelType || 'GPT-5'}</Badge>
```

Change the final fallback from `'GPT-5'` to match what the page and server actually use when nothing is set:

```tsx
<Badge variant="outline" className="text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600 text-xs">{companySettings?.openaiModel || settings?.modelType || 'claude-sonnet-4-6'}</Badge>
```

(Optional polish: it shows the raw model id, e.g. `claude-sonnet-4-6`. That's acceptable, but if you want it to read nicely you can map known ids to friendly labels — not required for this fix.)

---

## How to test when done

1. `npm run check` passes with no new type errors.
2. **Quick Start save test (the important one):** use a fresh account with empty Site Details. Click **Generate complete draft induction → fill the essentials form** (e.g. Site = "Acme — Birmingham", Industry = "Construction", Hazards = "overhead lines, heavy plant") → **Generate now**. After it finishes, open **Step 1: Site Details** and confirm Industry, Site Address and Site-Specific Hazards now contain what you typed. Open a generated slide and confirm the content actually references your industry/hazards, not generic text.
3. **Save-failure test:** simulate the save failing (e.g. offline) and confirm the Quick Start panel shows the red "Could not save your site details…" error and does **not** kick off generation.
4. **Model label test:** on an account with no AI model chosen, confirm the top **AI Model** selector and the per-role **Advanced options → AI Generation Model** badge now show the **same** model (Claude Sonnet 4), not GPT-5 in one place and Claude in the other.
