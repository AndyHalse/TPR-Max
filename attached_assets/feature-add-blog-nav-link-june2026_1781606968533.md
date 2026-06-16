# Replit Prompt — Add the "Blog" link back to the public site navigation

## What this is

The public blog already exists and works at `/blog` (`client/src/pages/BlogListPage.tsx`, routed in `client/src/App.tsx` ~line 325). But there is **no "Blog" link in the site navigation** any more, so visitors can't reach it. Add a **Blog** menu item back into the nav on both public pages, desktop and mobile.

The link should go to `/blog` (a normal page navigation, not an in-page scroll).

## Files & exact changes

### 1. `client/src/pages/MarketingPage.tsx`

**Desktop nav** — after the "Contact" button (ends ~line 272, just before the "Request Demo" `<Button>` at ~line 273), add a Blog button matching the others:

```tsx
<button
  onClick={() => window.location.href = "/blog"}
  className="text-slate-600 dark:text-slate-300 transition-colors hover:text-[#2460A9]"
  data-testid="link-blog"
>
  Blog
</button>
```

**Mobile dropdown** — after the "Contact" button (ends ~line 346, before the "Request Demo" wrapper `<div>` at ~line 347), add:

```tsx
<button
  onClick={() => { window.location.href = "/blog"; }}
  className="block w-full text-left px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-[#2460A9] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
>
  Blog
</button>
```

### 2. `client/src/pages/AboutPage.tsx`

This page builds its nav from an array, twice (desktop ~line 41–45, mobile ~line 95–99). Add a Blog entry to **both** arrays. The existing items point at `/marketing#...`; Blog is a real page, so use `/blog`:

```tsx
{ label: "Industries", href: "/marketing#industries" },
{ label: "Pricing", href: "/marketing#pricing" },
{ label: "Blog", href: "/blog" },
{ label: "Contact", href: "/marketing#contact" },
```

Add the same `{ label: "Blog", href: "/blog" }` line to the mobile array too. No other changes — the `.map()` handles styling.

## Placement

Put **Blog** between Pricing and Contact in all four spots, so the order reads: Features/Platform · Industries · About · Pricing · **Blog** · Contact. (On the About page "About" is shown separately as the current-page label, which is fine — leave that as is.)

## Acceptance checklist

- [ ] The marketing homepage nav shows a **Blog** link (desktop and mobile menu).
- [ ] The About page nav shows a **Blog** link (desktop and mobile menu).
- [ ] Clicking Blog goes to `/blog` and the blog listing page loads.
- [ ] Link styling matches the other nav items on each page.
- [ ] No console errors; existing links (Features, Industries, Pricing, Contact, Request Demo, Sign In) still work.
