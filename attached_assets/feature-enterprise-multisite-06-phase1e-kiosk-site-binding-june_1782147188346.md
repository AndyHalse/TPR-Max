# Enterprise Multi-Site — Prompt 06 — Phase 1e: Kiosk & public-link site binding

**Phase 1 of the Enterprise Multi-Site build. Closes the kiosk gap: a self-service terminal or public link must know which site it belongs to. Run after prompt 05.**

## Context
Kiosk check-in is a mode behind a feature flag — there is no “kiosk device” record, so a kiosk has no inherent site. The same is true of public/token links (Fire Marshal muster URL, mobile audit URL, induction/self-mark-safe tokens, contractor QR). For enterprise customers these must bind to a specific site so a walk-in checks into the right place and shows on the right muster.

## What to build

1. **Kiosk site binding**
   - Add a way to bind a kiosk session to a site: a `site` parameter baked into the kiosk URL at setup (e.g. `/kiosk?site=<siteId>`), validated against the customer’s sites. Persist the chosen site for that kiosk (local config / device token) so it survives refresh.
   - Any check-in/registration made at that kiosk stamps the bound `site_id` via the prompt 03 helper.
   - For non-enterprise customers (single default site), the binding resolves to the default site automatically — no setup needed, no change in behaviour.

2. **Public-link / token site binding**
   - For tokenised public flows (muster, mobile audit, induction, self-mark-safe, contractor QR), ensure the generated link carries/derives the originating `site_id`, and the record it creates is stamped with that site.
   - The Fire Marshal muster page must show **only the bound site’s** people (an evacuation is a per-site event — never aggregate sites on a live muster).

3. **Kiosk setup helper (enterprise admin)**
   - In the Sites screen (prompt 05) or settings, let an admin generate the correct kiosk URL / QR for a chosen site so on-site staff can set up a terminal without guessing.

## Rules
- **Evacuation/muster is strictly per-site. Never combine sites on a live muster or roll-call.** (Highest-risk area — flagged in the architecture diagram.)
- Validate any incoming `site` parameter against the customer’s real sites; reject unknown values (fail closed).
- Non-enterprise customers: zero setup, zero change — everything resolves to the default site.

## Acceptance criteria
- A kiosk bound to Site A only checks people into Site A; the same customer’s Site B kiosk is independent.
- The Fire Marshal muster for Site A shows only Site A’s people.
- Public links (induction, audit, self-mark-safe) create records against the correct site.
- Non-enterprise kiosk/links work exactly as before with no configuration.

## Do NOT
- Do not let a muster or roll-call span multiple sites.
- Do not accept an unvalidated site id from a public URL.
