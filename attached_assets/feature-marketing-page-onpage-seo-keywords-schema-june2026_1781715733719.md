# Feature: On-page SEO for the marketing page — keyword-targeted copy, FAQ & pricing schema, image alt text

**Date:** 17 June 2026
**Area:** SEO / public marketing page (`/marketing`)
**Type:** Feature (additive — no behaviour or layout changes beyond copy/alt text and added schema)

---

## ⚠️ Dependency — read first

This prompt **builds on** `feature-seo-per-page-meta-sitemap-robots-june2026.md`. That prompt must be applied **first**, because it creates `server/seo.ts` (with `ROUTE_META`, `buildHead`, `resolveMeta` and the default `SoftwareApplication` JSON-LD) and the per-page meta injection. **Do not duplicate** titles, descriptions, canonical tags, Open Graph or the base JSON-LD — those are already handled. This prompt only adds the things that one does **not** cover:

1. Keyword-targeted on-page copy (headings + body) on the marketing page.
2. Extra structured data so Google can show rich results: an **FAQPage** schema and a **Product/Offer** schema for the pricing plans.
3. Alt text on the marketing page's images.
4. A clean single-`<h1>` heading hierarchy.

**Do not change page styling, colours, layout, the demo form, or any app behaviour. This is content + metadata only.**

---

## Plain-English summary (for Andy)

The per-page-meta prompt fixed how Google *labels* each page. This prompt makes the marketing page actually **say the words buyers search for**, and gives Google two extra things it loves:

- An **FAQ block marked up as schema** — this is what makes those expandable question-and-answer results appear under your listing in Google, which takes up more space and pulls more clicks.
- **Pricing marked up as a product with offers** — helps Google understand TPR is a paid software product with plans.

It also adds **alt text** (a short text description) to every image, which both helps blind users and gives Google more to read.

We are *not* keyword-stuffing. The phrases below are woven in naturally where they already fit.

---

## Target keyword map

These are the phrases real UK buyers use for what TPR does. Weave them into headings (`<h2>`/`<h3>`) and body copy **naturally** — never force, never repeat the same phrase more than a couple of times. Keep all existing meaning and tone (British spelling, plain English).

**Primary (use in H1/H2 and intro copy):**
- contractor compliance software
- visitor management system
- site safety software
- emergency mustering software (or "muster roll software")
- contractor management software UK

**Secondary / long-tail (use in section headings and feature copy where they already fit):**
- CDM 2015 compliance software
- contractor induction software
- site sign-in system
- evacuation / fire mustering app
- permit to work software
- RAMS software UK
- risk assessment software
- lone worker protection
- PPM / planned maintenance software
- audit and inspection software

> Search volumes can be validated later in Google Search Console or Ahrefs once the page is live and indexed. Do not block on this — the map above reflects how the sector actually searches.

---

## Current state (verified in codebase)

- `client/src/pages/MarketingPage.tsx` (~4,560 lines) renders the full public marketing page.
- It has **one `<h1>`** at ~line 399 (good — keep exactly one). Verify no other `<h1>` exists; demote any extras to `<h2>`/`<h3>`.
- The page already lists pricing plans (e.g. TPR Basic £49, plus higher tiers — read the actual plans/prices/features from the live component; **do not invent figures**).
- There is no FAQ schema and no Product/Offer schema. The default page-level JSON-LD is the `SoftwareApplication` object defined in `server/seo.ts` (from the dependency prompt).

---

## Implementation

### 1. Keyword-aware copy pass on `MarketingPage.tsx`

- Review the existing `<h1>`, section `<h2>`/`<h3>` headings and intro paragraphs. Where a heading is generic (e.g. "Powerful features", "Everything you need"), rephrase it to include a relevant keyword **only where it reads naturally** — e.g. "Contractor compliance and induction, built in", "Emergency mustering that works without an app".
- Do **not** rewrite whole sections or change the meaning. This is a light touch: improve headings and the opening sentence of each major section, not the entire body.
- Keep one `<h1>` only. Ensure heading levels are properly nested (no jumping from `<h1>` to `<h3>`).

### 2. Alt text on all marketing-page images

- Every `<img>` on the marketing page must have a descriptive `alt` attribute that says what the image shows in plain English (e.g. `alt="TPR mustering dashboard showing a live evacuation roll call"`). Decorative-only images get `alt=""`.
- If any feature graphics are background CSS images conveying meaning, leave them (out of scope) — only fix real `<img>` tags.

### 3. FAQPage schema (server-injected, for the `/marketing` route)

The most reliable place for crawlers is server-side, alongside the existing JSON-LD. In `server/seo.ts`:

- Define an `FAQPage` JSON-LD object built from **5–8 genuine questions** a buyer asks about TPR. Source the answers from real marketing-page copy so they match what's on the page. Suggested questions (adjust wording to match the page):
  - "What is TPR?" → one-sentence product summary.
  - "Do visitors and contractors need to download an app?" → (TPR is browser/QR based — confirm from the page).
  - "Does TPR handle contractor compliance and CDM 2015?" → yes, summarise.
  - "Can TPR run an emergency muster / evacuation roll call?" → yes, summarise the mustering module.
  - "Is TPR built in the UK / GDPR-compliant?" → confirm from existing copy.
  - "How much does TPR cost?" → reference that plans start from the lowest published price (read it from the page; don't hard-code a number that could drift — see note below).
- Each entry uses the standard shape: `{ "@type": "Question", "name": "...", "acceptedAnswer": { "@type": "Answer", "text": "..." } }`.
- HTML-escape all answer text.

### 4. Product / Offer schema for the pricing plans (server-injected)

- In `server/seo.ts`, define a `Product` (or `SoftwareApplication` with `offers`) JSON-LD for the `/marketing` route describing TPR with an `offers` array — one `Offer` per published plan, using the **actual plan names and prices read from the marketing component**, `priceCurrency: "GBP"`, and `availability: "https://schema.org/InStock"`.
- **Single source of truth:** to avoid the schema price drifting from the displayed price, define the plans once (name, price, key features) in a small shared constant and use it both for the schema here and — if practical without risk — referenced by the page. If wiring the page to it is risky, at minimum add a code comment in both places: `// keep in sync with pricing plans in MarketingPage.tsx`.

### 5. Combine the schema blocks for `/marketing`

- The dependency prompt sets the `/marketing` route's `jsonLd` to the default `SoftwareApplication`. Change the `/marketing` entry so its JSON-LD is an **array (or schema.org `@graph`)** containing: the existing `SoftwareApplication`/Organization, the new `FAQPage`, and the new `Product`/Offer object.
- `buildHead` must render an array of JSON-LD as **multiple `<script type="application/ld+json">` blocks** (or one `@graph`). Either is valid; multiple separate blocks is simplest. Other routes are unaffected.

---

## Acceptance criteria

1. The marketing page still looks and behaves exactly as before — same layout, colours, demo form, and links. Only copy, alt text and `<head>` schema changed.
2. `curl -s https://www.tpr-max.com/marketing` contains a `FAQPage` JSON-LD block and a `Product`/`Offer` JSON-LD block, in addition to the existing `SoftwareApplication`.
3. The marketing page passes Google's [Rich Results Test](https://search.google.com/test/rich-results) with **FAQ** and **Product** results detected and **no errors**.
4. Pricing in the schema matches the prices shown on the page.
5. Exactly one `<h1>` on the page; headings nested correctly; key headings include relevant keywords read naturally.
6. Every `<img>` has an `alt` attribute (descriptive, or empty for decorative).
7. No console errors; `npm run check` passes.

---

## Notes

- Do **not** add `<meta name="keywords">` — Google ignores it.
- British spelling throughout. Keep ACS Organization details consistent with the existing JSON-LD.
- Keep it honest: every FAQ answer and feature claim must be true of TPR as it exists. Read the component; don't invent features or prices.
