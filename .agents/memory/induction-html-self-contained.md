---
name: Induction HTML self-contained image rules
description: Rules for embedding images in generated induction HTML that is stored in object storage / DB and served as standalone HTML
---

## Rule

All images in generated induction HTML must be embedded as base64 data: URLs. Never reference `/objects/...` paths, relative paths, or percent-encoded SVG data URLs.

## Why

1. **`/objects/...` paths need Bearer auth** — the Express route enforces auth headers. `<img>` tags in standalone HTML cannot send headers, so they always 403 silently in both dev and production.

2. **Percent-encoded SVG data URLs break in production** — `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` works in dev but can be re-encoded or truncated by production proxies/CDNs. Always use `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` instead.

3. **Company logo path** — `companySettings.logoUrl` is a raw path like `/uploads/d3f206b7-...`. It must be fetched server-side (from object storage) and embedded as `data:image/png;base64,...` before the HTML is built. Use `fetchLogoAsDataUrl()` method in `VideoGenerationService`.

## How to apply

- `ImageFallbackChain.ts` `FallbackSvgImageGenerator`: use `Buffer.from(safeSvg).toString('base64')` for SVG data URL.
- `VideoGenerationService.createEnhancedHTMLPresentation()`: call `await this.fetchLogoAsDataUrl(rawLogoPath)` before building the HTML template literal.
- `VideoGenerationService.generateVideoPresentation()` else branch: same — pre-fetch logo as `logoDataUrlSimple` before the HTML template literal.
- `IMG_ERR_RECOVERY_SCRIPT` in `induction.ts`: do NOT exclude `data:` URLs from the already-failed check — a bad data: URL should also trigger the placeholder, not go invisible.
