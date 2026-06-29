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

There are FOUR places that generate SVG data URLs for induction HTML — ALL must use base64:

1. `ImageFallbackChain.ts` `FallbackSvgImageGenerator.generate()`: use `Buffer.from(safeSvg).toString('base64')`.
2. `VideoGenerationService.generateFallbackImage()` (line ~1264): the chain-exhausted path — also must use `Buffer.from(safeSvg).toString('base64')`. This is the PRIMARY path in production when no AI API keys exist.
3. `IMG_ERR_RECOVERY_SCRIPT` `PH` placeholder in `induction.ts` (line ~147): use `btoa(PH_SVG)` (client-side base64, safe in browser).
4. Company logo: `VideoGenerationService.fetchLogoAsDataUrl()` fetches bytes from object storage server-side and returns `data:image/png;base64,...`. Called in `createEnhancedHTMLPresentation()` and `generateVideoPresentation()` simple-template branch.

**Critical**: inline `onerror` on `<img>` tags in the HTML template must NOT set `opacity='0'` — that hides the image before the recovery script can replace it. Use `onerror="this.onerror=null;"` instead.

**After any fix**: user must regenerate the induction — stored HTML in DB/object-storage keeps the old format.
