# Marketing Page — Lead With the Routine, Caption Every Screen, Add Social Proof

**File:** `client/src/pages/MarketingPage.tsx` (single file, ~4,750 lines)
**Type:** Frontend only. No schema change, no `npm run db:push`, no backend routes.
**Why:** Feedback from a real buyer (retired Deputy Director of Estates & Facilities at a university — exactly our target persona). Three problems on the public page at `/marketing`:

1. **The example screens don't explain themselves.** He couldn't tell what he was looking at, what it was telling him, or why he'd ever pull that data up.
2. **We lead with the emergency.** An evacuation is rare, uncomfortable to picture, and not the moment anyone wants to think about when deciding to buy. The day-to-day routine is where the value lives.
3. **No proof it's real.** He wanted to see where it's running, customer reviews, and the option to see it working on a real site.

Do all three changes below. Keep the existing design language, colours (ACS blue `#2460A9`, emerald, the red used for emergency), spacing, dark-mode classes, and component patterns. Don't introduce new dependencies.

---

## Change 1 — Reorder the page so the routine leads and the emergency becomes the payoff

Right now the section order after the hero is:

1. Hero (`{/* Hero Section */}`, ~line 392)
2. **Muster Before & During** (`{/* Muster Before & During Section */}`, ~line 524) ← big red emergency block, second thing on the page
3. Stats Strip (~line 625)
4. One Platform Solution (~line 645)
5. All Modules Overview (~line 779)
6. Interactive Tabbed Product Tour (~line 1053)
7. Industry-Specific Solutions (~line 3983)

**New order:** move the whole **Muster Before & During** section (`{/* Muster Before & During Section */}` through its closing `</section>`, ~lines 524–623) so it sits **after** the "One Platform Solution" section and **before** the "All Modules Overview" section. The emergency block stays — it's our strongest differentiator — but it now lands as "and when it really matters…" once the everyday value has been made, not as the cold open.

New order becomes:

1. Hero
2. Stats Strip
3. One Platform Solution
4. **Muster Before & During** (moved here)
5. All Modules Overview
6. Interactive Tabbed Product Tour
7. Industry-Specific Solutions

When you move the muster section, change its lead-in so it reads as the payoff rather than the opener. In that section's header block (the `<h2>` and intro `<p>` around lines 532–539), keep the heading but add a short bridging line above it. Add this sentence as a new paragraph directly under the `Badge` (~line 531), before the `<h2>`:

> "You'll spend almost every day in the routine above. But the day it counts most is the one you can't predict — so TPR is built for that too."

Keep the rest of the muster section exactly as-is.

**Hero imagery (recommended, lower priority):** the hero image is currently a Fire Marshal mid-evacuation (`fireMarshalMobileImg`) with a red glow and "LIVE — Fire Marshal Panel" / "EMERGENCY"-style badges (~lines 493–518). That reinforces the emergency-first feel. If a routine product screenshot is available in the existing imported assets (e.g. a dashboard, reception diary, or contractor screen already used elsewhere on the page), swap the hero image for that and change the two floating badges to routine messaging (e.g. "LIVE — Today's Site Activity" and "No App Download Required"). **If no suitable routine image already exists in the imports, leave the hero image unchanged** — do not invent or generate one. Flag in your summary that the hero image still needs a routine screenshot.

---

## Change 2 — Caption every product screenshot and mockup so it explains itself

This is the most important change. Every screen on the page must answer two things at a glance: **what is this**, and **why would I care**.

Create one small reusable caption block and place it directly beneath each screenshot/mockup. Pattern:

```tsx
{/* ScreenCaption — what it is + why it matters */}
<div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3">
  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{/* WHAT */}</p>
  <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{/* WHY / WHAT IT SAVES */}</p>
</div>
```

You may extract this into a small local component (e.g. `function ScreenCaption({ what, why }: { what: string; why: string })`) at the top of the file and reuse it — that's cleaner than repeating the markup. Use whichever fits the existing code style.

Add a caption under **each** of these screens. Suggested copy below — keep it plain, British English, no jargon, no buzzwords ("leverage", "seamless", "robust", "streamline", etc. are banned). Each "why" line should name a concrete saving (time, a fine avoided, a risk caught).

**Muster section (~lines 543–603):**
- Readiness screenshot — **What:** "Your normal, everyday view — who's on site right now, split across zones, with Fire Marshals already assigned." **Why:** "Open it any time to see exactly who's in the building. No drill, no emergency needed."
- Active emergency screenshot — **What:** "The same screen the moment an evacuation is triggered — Fire Marshals get a roll-call on their phones instantly." **Why:** "Everyone accounted for in minutes, with a timestamped record you can hand to the fire service."

**Interactive Tabbed Product Tour (~lines 1053–3981)** — add a caption under the main visual/mockup in each tab. Cover at least these:
- Dashboard & Analytics — **What:** "Your morning overview — site activity, compliance status, and anything that needs attention today." **Why:** "Replaces the spreadsheet check-round. You see what's wrong before it becomes a problem."
- Reception Diary — **What:** "Today's expected and signed-in visitors and contractors." **Why:** "Reception knows who's due, who's late, and who never showed — without phoning round."
- Meeting Rooms — **What:** "Live room availability and bookings." **Why:** "Stops double-bookings and the 'is this room free?' interruptions."
- People Management — **What:** "Your staff, visitors and contractors in one list, with their status." **Why:** "One place to check who's verified and who isn't."
- ID Printing — **What:** "A printed site pass generated from the person's record." **Why:** "Professional passes in seconds, no separate badge software."
- Contractor Management — **What:** "Every contractor's compliance status at a glance — insurance, RAMS, CSCS, inductions." **Why:** "A non-compliant contractor is flagged before he reaches the gate."
- Contractor Self-Service Portal — **What:** "Contractors upload and keep their own documents up to date." **Why:** "The chasing stops — they keep themselves compliant, you just approve."
- AI Compliance / RAMS — **What:** "A risk assessment or method statement drafted from your inputs." **Why:** "A first draft in minutes instead of starting from a blank page."
- Emergency Mustering — **What:** "Live roll-call during an evacuation." **Why:** "Complete accountability when it matters most." *(Tie it to the routine: "the same data you use every day, ready the instant you need it.")*
- Time & Attendance — **What:** "Who was on site, when, and for how long." **Why:** "Accurate hours for payroll, no manual timesheets."
- Reports & Analytics — **What:** "Compliance and activity reports you can export." **Why:** "Audit-ready evidence without building it by hand."
- RAMS — **What:** "Your risk assessments and method statements, version-controlled." **Why:** "The right document, current version, found in seconds — the exact 'check the method statement covers the risk' job our buyer described."
- PPM — **What:** "Your 12-month planned maintenance schedule with statutory tasks flagged." **Why:** "Nothing statutory gets missed, and you can prove it."
- CDM 2015 — **What:** "Construction project compliance — duty holders, F10, phase plans." **Why:** "Stay legal under CDM 2015 without a separate system."
- H&S Incidents — **What:** "Incidents, near misses and good spots in one record." **Why:** "RIDDOR-ready reporting and a safety trend you can actually see."
- Fire Risk Assessment — **What:** "Your FRA records with action items and due dates." **Why:** "Overdue fire actions are chased automatically, not forgotten."
- Compliance Certificate Register — **What:** "Every certificate with its expiry date." **Why:** "You're warned before one lapses, not after."
- Permit-to-Work — **What:** "Permits with a full authorisation trail." **Why:** "High-risk work is signed off properly, on record."
- HR Module — **What:** "Staff records, Right to Work, leave and absence." **Why:** "The HR admin in the same place as site safety."
- Risk Assessment Builder — **What:** "Build a risk assessment from a guided template." **Why:** "Consistent, defensible RAs without the blank-page struggle."
- Template Library — **What:** "Pre-built H&S frameworks ready to use." **Why:** "Start from a proven template, not from scratch."
- Microsoft Teams Integration — **What:** "Key events pushed into your Teams channels." **Why:** "Your team hears about an evacuation or RIDDOR event where they already work."
- Calendar Integration — **What:** "Outlook/Google invites become visitor pre-registrations automatically." **Why:** "Reception is ready for your guests without you telling them twice."
- Enterprise Multi-site — **What:** "Every site rolled up into one estate view." **Why:** "Compliance across the whole estate from one screen."

If a tab's exact wording doesn't fit its visual, adjust the copy to match what the mockup actually shows — but every tab gets a what/why caption.

---

## Change 3 — Add a "See it in action" / social-proof section

Add a new section **after** the Industry-Specific Solutions section (~after line 4298) and before the pricing/contact area. Heading: **"See TPR working on a real site."**

**Honesty rule — do not fabricate.** Do not invent customer names, logos, quotes, star ratings, or numbers. We don't have published references yet. Build the section so it's credible today and ready to fill in later:

- A short lead paragraph offering a live walkthrough: "We'd rather show you than tell you. Book a 20-minute walkthrough and we'll take you through TPR on a working site, set up the way you'd actually use it." With a button that calls `scrollToSection("contact")`.
- A clearly structured, currently-empty area ready for customer logos and quotes, with an HTML comment marking where Andy will paste real references later, e.g. `{/* CUSTOMER REFERENCES — add real logos/quotes here once available. Do not add placeholder/fake testimonials. */}`. If rendering an empty grid looks broken, render only the lead paragraph + CTA for now and keep the references markup commented out.

Match the visual style of the existing CTA blocks on the page.

---

## Acceptance checklist
- [ ] Muster section now appears after "One Platform Solution", before "All Modules Overview"; bridging line added above its heading.
- [ ] Every screenshot in the muster section and every mockup in the product-tour tabs has a what/why caption.
- [ ] New "See it in action" section added with a live-walkthrough CTA and a commented-out, clearly-marked placeholder for real references — no fake testimonials.
- [ ] British English throughout; none of the banned buzzwords.
- [ ] No backend, schema, or `db:push` changes. Page builds and renders in light and dark mode.
- [ ] Summary notes whether the hero image was swapped for a routine screenshot or still needs one.
