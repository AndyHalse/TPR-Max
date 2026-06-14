# Bugfix: Kiosk notice message shows twice on mobile (June 2026)

On the main check-in kiosk (`/kiosk`, the `KioskMode` page), the configurable notice message — the amber "!" banner set via `kioskNoticeMessage` in settings — renders **twice** on a phone-sized screen. There are two copies of the notice card in the page: a mobile version and a desktop version. The mobile one is correctly hidden on larger screens (`sm:hidden`), but the desktop one has no responsive class, so it shows at every screen size. On a phone you therefore get both, stacked one on top of the other. On tablet/desktop it's correct (only one shows).

Tiny fix — one className change. Copy everything below the line into the Replit agent.

---

## THE BUG

In `client/src/pages/KioskMode.tsx`, the home screen renders the kiosk notice in two places, meant to be mutually exclusive by screen size:

1. **Mobile notice** (~line 1044):
   ```tsx
   {/* Mobile notice — shown when kioskNoticeMessage is set */}
   {(settings as any)?.kioskNoticeMessage?.trim() && (
     <GlassCard solid className="p-4 flex-shrink-0 sm:hidden">
   ```
   `sm:hidden` = visible below `sm`, hidden at `sm` and up. Correct.

2. **Desktop notice** (~line 1107):
   ```tsx
   {/* Desktop notice — shown when kioskNoticeMessage is set */}
   {(settings as any)?.kioskNoticeMessage?.trim() && (
     <GlassCard solid className="p-5 sm:p-6 flex-shrink-0">
   ```
   No `hidden` / `sm:` class — so it's visible at **every** width, including mobile.

Net effect on a phone (< 640px): the mobile card shows (it's below `sm`) **and** the desktop card shows (no hiding) → the same notice message appears twice. On tablet/desktop the mobile card is hidden by `sm:hidden`, so only the desktop card shows — which is why the duplication only bites on mobile.

The intent is clearly one-or-the-other: the contractor kiosk (`ContractorKiosk.tsx`) uses `hidden sm:block` for its desktop-only text, the same pattern this card is missing.

## THE FIX

In `client/src/pages/KioskMode.tsx`, on the **desktop notice** `GlassCard` (~line 1107), add `hidden sm:block` so it only renders at `sm` and up:

```tsx
<GlassCard solid className="hidden sm:block p-5 sm:p-6 flex-shrink-0">
```

That's the whole fix. Don't touch the mobile card (~line 1044) — its `sm:hidden` is already correct. Now the two cards are properly exclusive: mobile card below `sm`, desktop card at `sm` and up.

## VERIFICATION

1. Set a notice in Settings (the kiosk notice / `kioskNoticeMessage` field) so the banner is enabled.
2. Open `/kiosk` on a narrow / phone-width viewport (or DevTools device toolbar, e.g. 390px) → the notice now shows **once**, not twice.
3. Resize to tablet/desktop width (≥ 640px) → the notice still shows once, with the larger desktop styling (the round amber "!" icon).
4. Clear the notice in Settings → no banner shows at any width.
5. `npx tsc --noEmit` clean for the touched file.
