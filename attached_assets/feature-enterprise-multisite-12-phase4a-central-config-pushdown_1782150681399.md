# Enterprise Multi-Site — Prompt 12 — Phase 4a: Central config push-down

**Phase 4 of the Enterprise Multi-Site build. Head office sets standards once; they apply to every site. Run after Phase 3.**

## Context
Today each customer’s config (inductions, required documents, templates, visit reasons) is single-set. For enterprise customers, head office wants to define a standard centrally and have every site inherit it, while still allowing a site to override where genuinely needed.

## What to build

### 1. Scope on configurable records
Introduce a `scope` concept on the relevant config tables: `enterprise` (applies to all sites unless overridden) or `site` (a local override for one site). Apply to:
- Site Inductions (induction content/settings)
- Contractor Onboarding Requirements (required-document checklist)
- Template Library entries
- Visit Reasons
- Relevant feature flags / standards

Implement with an `enterprise`-scoped record + optional per-site override. **Read-time resolution order: site override → enterprise default.** Add a resolver used everywhere these configs are read, so a site automatically gets the enterprise standard unless it has its own override.

### 2. “Standards” screen (enterprise_admin only)
- A central screen to edit the enterprise-level induction / required-docs / templates / visit reasons and **push** them. Pushing writes/updates the `enterprise`-scoped records; sites pick them up immediately via the resolver.
- Show **which sites have overridden** a given standard (so head office can see divergence) and let an admin reset a site back to the enterprise default.
- Audit every push and every override reset.

### 3. Site-level override (site_coordinator / area_manager within scope)
- Where allowed by the role matrix, a site can create a local override. Make it obvious in the UI that the site is diverging from the group standard.

## Rules
- Non-enterprise customers: behaviour unchanged — their single config simply acts as before (treat as a single default scope).
- Resolution must be consistent — every read path for these configs uses the resolver, not direct table reads.
- en-GB; audit pushes and overrides.

## Acceptance criteria
- An enterprise_admin edits the standard induction/required-docs and pushes; all sites without an override immediately reflect it.
- A site can override, and head office can see and reset the override.
- A non-enterprise customer’s inductions/required-docs/templates/visit-reasons work exactly as before.

## Do NOT
- Do not duplicate config per site by default — sites inherit; overrides are the exception.
- Do not bypass the role matrix (only enterprise_admin pushes group standards).
