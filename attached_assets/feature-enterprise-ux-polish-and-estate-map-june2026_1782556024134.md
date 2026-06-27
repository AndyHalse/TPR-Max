# Feature — Enterprise UX polish + estate map (the "blow them away" pass)

**The enterprise screens are clean and well-structured; this pass removes the small things that read as "unfinished" in a demo and adds the one visual that wins the room — an estate map. Test customers only. Single-site customers unaffected. No `npm run db:push`.**

## 1. The estate map (the high-impact addition)
On the **Compliance Overview** (and optionally the Sites page), add a **UK map** plotting every site as a pin, **colour-coded by compliance band** (green ≥90 / amber ≥70 / orange ≥50 / red <50). Clicking a pin drills into that site (the existing `/enterprise/sites/:id`). Plot from each site's postcode/region (geocode by postcode or region centroid). Use a lightweight map (e.g. react-simple-maps or leaflet). For a property manager with sites across the country this is the standout visual — make it prominent.

## 2. Consistency / correctness fixes (the "unfinished" tells)
- **Score vs issues contradiction:** a site showing score 100 + "Compliant" must not also show "1 issue". Make the badge/score/issue-count derive from the same source so they can never disagree.
- **People & Access:** group a user's multiple site grants into ONE row with their sites listed (instead of repeating the same person per site, which reads as duplicates). Keep the role/scope badges. Ensure each person's displayed **name matches their email** (fix any mismatched demo records via the data seeder, but make the UI robust to it).
- **en-GB dates/times** on every enterprise page (Sites, People & Access, Group Standards, Contractor Pool currently have none) — DD/MM/YYYY, 24-hour.

## 3. Estate-context clarity
- On `/enterprise/*` pages the top single-site selector ("SITE-001 – Primary Site") is confusing because these screens are estate-wide. Either hide it on estate pages, or show a clear **"Viewing: whole estate"** state with the per-site switch available but visibly distinct from the estate view.

## 4. Contractor Pool — surface the value at a glance
On each contractor row, show **per-site clearance at a glance** (e.g. "cleared at 3 of 5 sites" with the site chips on expand), and use a **mix of colours** (green where cleared) rather than a uniform wall of red — so the "onboard once, deploy across sites" benefit is obvious without clicking.

## 5. Polish details
- Empty states should invite action, not read as broken — e.g. Group Standards' empty state already does this well; apply the same tone everywhere, and (with the demo seeder) these screens won't be empty in a demo anyway.
- Tighten card spacing/whitespace where pages feel sparse (Contractor Pool, Group Standards) so they read as full and considered.
- Keep the existing charts/score rings, loading/error states, and Cowiesburn branding.

## Acceptance criteria
- The Compliance Overview shows a colour-coded estate map; clicking a pin opens that site's drill-down.
- No screen shows a score/issue contradiction; People & Access shows one row per user with their sites; all dates are en-GB.
- The active-site selector no longer confuses the estate view; Contractor Pool shows per-site clearance and a realistic colour mix.
- Single-site customers and the isolation behaviour are unchanged.

## Do NOT
- Do not break the per-site drill-down, the role gating, or any site-scoping.
- Do not regress single-site customers.
