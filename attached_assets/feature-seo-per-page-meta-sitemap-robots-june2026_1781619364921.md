# Feature: Proper SEO across all public pages (per-page meta, sitemap, robots, social cards)

**Date:** 16 June 2026
**Area:** SEO / public marketing pages
**Type:** Feature (no breaking changes to app behaviour)

---

## Plain-English summary (for Andy)

Right now TPR is a single-page React app, so **every public page serves the exact same SEO tags** from one `client/index.html`. Google and social networks (LinkedIn, WhatsApp, Facebook) see an identical title, description and — critically — a **canonical link hard-coded to the homepage** on every page, which tells Google "all these pages are just copies of the homepage, don't index them separately."

This prompt makes the **server fill in the correct SEO tags for each page before the page is sent**, so it works for Google *and* for social link previews (which don't run JavaScript). It also adds the two files search engines look for — `robots.txt` and `sitemap.xml` — and gives every blog post its own title, description and share image.

**Do not change any app behaviour, styling, or authenticated routes. This is additive.**

---

## Current state (verified in codebase)

- Single SPA. One template at `client/index.html` with a hard-coded SEO block (title, description, canonical, Open Graph, Twitter, JSON-LD). The canonical is `https://www.tpr-max.com/` on **every** route — this is the main bug.
- HTML is served two ways in `server/vite.ts`:
  - **Dev:** reads `client/index.html`, runs `vite.transformIndexHtml(url, template)`, sends it.
  - **Prod:** `serveStatic` falls through to `res.sendFile(distPath/index.html)`.
- Public, unauthenticated routes (all currently share the same template):
  - `/` (homepage)
  - `/marketing` → `MarketingPage`
  - `/about` → `AboutPage`
  - `/blog` → `BlogListPage`
  - `/blog/:slug` → `BlogPostPage`
- Blog data: `blogPosts` table in `shared/schema.ts` with `title`, `slug`, `summary`, `content`, `author`, `status` (`draft`/`published`), `coverImageUrl`, `tags`, `publishedAt`, `updatedAt`.
- Public blog API already exists in `server/routes/onboarding.ts`: `GET /api/blog` (published list) and `GET /api/blog/:slug` (single published post).
- No `react-helmet`, no `robots.txt`, no `sitemap.xml`.
- A new social share image has been added at `client/public/og-image.png` (1200×630). Use this as the default `og:image`.

---

## Approach

Server-side meta injection. Replace the static SEO block in `client/index.html` with a single placeholder token, and have Express inject the correct tags per request — in **both** the dev and prod serving paths. Per-route metadata comes from a small config map; blog-post metadata is fetched from the database by slug.

This is the robust approach for a Vite + Express SPA: it does not require switching frameworks, and it produces correct previews for social scrapers that never execute JavaScript.

---

## Implementation

### 1. Add a placeholder to `client/index.html`

Replace the existing hand-written SEO block (everything from `<!-- SEO Meta Tags -->` through the `<!-- JSON-LD Schema Markup -->` script, i.e. title, description, keywords, author, robots, canonical, all `og:`/`twitter:` tags, and the JSON-LD script) with a **single placeholder**:

```html
    <!--SEO_HEAD-->
```

Keep all non-SEO head content (charset, viewport, manifest, theme-color, apple tags, favicon, font preconnects). Keep `<html lang="en-GB">`.

> Why: the server now owns these tags so they can differ per page. Leaving the old static tags in would cause duplicates.

### 2. Create `server/seo.ts`

Export:

- `BASE_URL = 'https://www.tpr-max.com'`
- `DEFAULT_OG_IMAGE = 'https://www.tpr-max.com/og-image.png'`
- A `ROUTE_META` map for the static public routes:

| Path | Title | Description |
|---|---|---|
| `/` | `Connected Workforce & Site Safety Platform UK \| TPR` | `TPR is a UK-built connected workforce & site safety platform — contractor compliance, emergency mustering, audits & inspections, risk assessments, CDM 2015, PPM, HR lifecycle and lone worker protection. Book a free demo.` |
| `/marketing` | `TPR — Connected Workforce & Site Safety Platform \| Book a Demo` | `See how TPR brings contractor compliance, emergency mustering, audits, risk assessments and CDM 2015 into one UK-built platform. No app download. Book a free demo.` |
| `/about` | `About ACS — The Team Behind TPR \| Site Safety Software UK` | `ACS Safety & Security Ltd builds TPR, a UK connected workforce and site safety platform. Learn about the company, our mission and how we help sites stay compliant.` |
| `/blog` | `TPR Blog — Site Safety, Compliance & Workforce Management` | `Practical guidance on contractor compliance, CDM 2015, emergency mustering, risk assessments and site safety from the team behind TPR.` |

- A function `buildHead(meta)` that returns the full SEO `<head>` HTML string (title, description, `robots`, canonical, Open Graph, Twitter card, JSON-LD) from a metadata object `{ title, description, canonical, ogImage, ogType, jsonLd }`. Defaults: `ogType = 'website'`, `ogImage = DEFAULT_OG_IMAGE`, `og:site_name = 'TPR'`, `og:locale = 'en_GB'`, `twitter:card = 'summary_large_image'`, `twitter:creator = '@ACSSystemsUK'`, `robots = 'index, follow'`. HTML-escape all interpolated text.
- A function `resolveMeta(pathname)` that:
  - Returns the matching `ROUTE_META` entry (with `canonical = BASE_URL + pathname`, or `BASE_URL + '/'` for `/`) for known static routes.
  - For `/blog/:slug`: looks up the published post by slug (reuse the same query as `GET /api/blog/:slug` in `server/routes/onboarding.ts`). If found, returns:
    - `title`: `<post.title> | TPR Blog`
    - `description`: `post.summary` (trim to ~160 chars)
    - `canonical`: `BASE_URL + '/blog/' + post.slug`
    - `ogImage`: `post.coverImageUrl` (absolute URL — prefix `BASE_URL` if it starts with `/`) else `DEFAULT_OG_IMAGE`
    - `ogType`: `'article'`
    - `jsonLd`: a `BlogPosting` schema object (`headline`, `description`, `image`, `datePublished` = `publishedAt`, `dateModified` = `updatedAt`, `author` = `post.author`, `publisher` = ACS Organization, `mainEntityOfPage` = canonical)
    - If the slug is not found / not published, return `null` (caller falls back to homepage default or lets the SPA render its own 404).
  - For unknown public routes, return the homepage/default meta so nothing ever renders an empty SEO block.
  - Keep the existing `SoftwareApplication` JSON-LD (with the ACS Organization, address, phone, email from the current `index.html`) as the default `jsonLd` for non-article pages.

### 3. Wire injection into `server/vite.ts` (both paths)

Add a helper `injectSeo(template, url)` that:
- Parses the pathname from `url`.
- Calls `resolveMeta(pathname)`; if `null`, uses default meta.
- Replaces `<!--SEO_HEAD-->` in the template with `buildHead(meta)`.

**Dev path:** after `vite.transformIndexHtml(url, template)`, run the result through `injectSeo(page, url)` (await it — it may hit the DB). Make the handler `async` is already; just await.

**Prod path (`serveStatic`):** the current fallback does `res.sendFile(...index.html)`. Change it so that for HTML navigation requests it instead **reads** the built `index.html` into a string, runs `injectSeo(html, req.originalUrl)`, and sends it with `Content-Type: text/html`. Cache the base template read in memory (read once) for performance; only the injection runs per request. Static asset requests must still be served by the existing static handler — only intercept requests where the client accepts `text/html` and the path is not a file with an extension and not `/api/...`.

> Guardrail: never intercept `/api/*`, `/assets/*`, or any path containing a file extension. If injection throws for any reason, fall back to sending the original template unmodified — the page must never fail to load because of SEO.

### 4. `robots.txt`

Serve `GET /robots.txt` from Express (register before the SPA catch-all) returning:

```
User-agent: *
Allow: /$
Allow: /marketing
Allow: /about
Allow: /blog
Disallow: /platform-admin
Disallow: /contractor-portal
Disallow: /contractor
Disallow: /kiosk
Disallow: /fire-marshal
Disallow: /lone-worker
Disallow: /bug-feedback
Disallow: /settings
Disallow: /staff
Disallow: /visitors
Disallow: /members
Disallow: /contractors
Disallow: /muster
Disallow: /reports
Disallow: /api/

Sitemap: https://www.tpr-max.com/sitemap.xml
```

Set `Content-Type: text/plain`.

### 5. `sitemap.xml`

Serve `GET /sitemap.xml` from Express (dynamic) with `Content-Type: application/xml`:
- Static entries for `/`, `/marketing`, `/about`, `/blog` (set `<changefreq>` weekly, `<priority>` 1.0 for `/`, 0.8 for the rest).
- One `<url>` per **published** blog post: `<loc>https://www.tpr-max.com/blog/<slug></loc>` with `<lastmod>` = `updatedAt` (or `publishedAt`) in `YYYY-MM-DD` format.
- Escape slugs. If the DB query fails, still return the static entries (never 500 the sitemap).

### 6. (Optional, low priority) client-side title sync

So the browser tab updates on client-side navigation, set `document.title` from the same `ROUTE_META` in a small `useEffect` in `App.tsx` keyed on `location`. Server injection remains the source of truth for crawlers; this is only cosmetic for users clicking around. Skip if it adds risk.

---

## Acceptance criteria

1. `curl -s https://www.tpr-max.com/marketing | grep -i '<title>'` shows the **marketing** title, not the homepage title.
2. `curl -s https://www.tpr-max.com/blog/<a-published-slug>` shows that post's title, its `summary` as the description, `og:type` = `article`, a canonical pointing at `/blog/<slug>`, the post's cover image (or the default) as `og:image`, and a `BlogPosting` JSON-LD block.
3. Each public page's `<link rel="canonical">` points to **its own URL**, never always the homepage.
4. `https://www.tpr-max.com/robots.txt` and `https://www.tpr-max.com/sitemap.xml` return valid content; the sitemap lists every published blog post.
5. Pasting `https://www.tpr-max.com/marketing` into the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) or [opengraph.xyz](https://www.opengraph.xyz) shows the new `og-image.png` banner and the correct title/description (no JS required).
6. App pages (`/`, dashboards, portals, kiosk) still load and behave exactly as before. `/api/*` and static assets are untouched. No console errors.
7. Works in both `npm run dev` and the production build.

---

## Notes

- The 1200×630 share image is already in the repo at `client/public/og-image.png` (served at `/og-image.png`). No need to create one.
- Keep British spelling and the ACS Organization details (Wittas House, Two Rivers, Station Lane, Witney, OX28 4BH; tel +441344771569; andy@acsltd.eu) consistent with the existing JSON-LD.
- Do not add `<meta name="keywords">` per page — Google ignores it; the homepage one can stay or go, your call, but don't expand it.
