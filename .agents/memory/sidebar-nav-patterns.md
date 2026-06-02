---
name: Sidebar navigation patterns
description: Rules for building the TPR Max collapsible sidebar — TooltipProvider scope, Link usage, nav_style column.
---

## Rules

**Single TooltipProvider**: wrap the entire sidebar nav area (scrollable nav groups + pinned settings row) in one `<TooltipProvider>`. Using two separate providers causes a React "Invalid hook call" warning that crashes tooltip rendering.

**Why:** Radix UI's Tooltip context must be provided once per subtree. Splitting it across two providers in the same component tree confuses React's hook reconciler.

**How to apply:** In `Sidebar.tsx`, place `<TooltipProvider delayDuration={300}>` just below the header `<div>`, wrapping both `<nav>` and the pinned settings `<div>`.

---

**Link styled directly, never `<Link><button>`**: Wouter's `<Link>` renders an `<a>` element. Putting a `<button>` inside it creates `<a><button>` which is invalid HTML and triggers validateDOMNesting warnings.

**Why:** Interactive elements (`<a>`, `<button>`) cannot be nested per HTML spec.

**How to apply:** Apply all button-like styles (className, style, onClick) directly to `<Link>`. Do not wrap a `<button>` or another interactive element inside `<Link>`.

---

**nav_style column**: stored as `TEXT DEFAULT 'classic'` in the per-tenant `users` table via raw migration (not Drizzle schema). Cast as `(user as any).navStyle` in auth routes. Values: `'classic'` | `'sidebar'`. Self-service PATCH endpoint: `PATCH /api/users/me/nav-style`.

**Why:** The isolatedSchema.ts Drizzle type doesn't include navStyle; it was added via raw ALTER TABLE migration (pattern consistent with other late-added columns like default_landing_page).
