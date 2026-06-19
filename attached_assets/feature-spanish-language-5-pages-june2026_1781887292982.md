# Add Spanish language support to 5 core TPR pages

## What I want

Add a Spanish (Español) language option to TPR, applied to **five pages only** for this first phase. A user picks their language once and the whole of those five pages switches between English and Spanish. English stays the default.

This is the first phase of a wider plan, so **build the translation system properly** — adding more pages and more languages later should be quick, not another rebuild.

## The five pages in scope (and only these)

1. **Dashboard** — `client/src/pages/Dashboard.tsx`
2. **Visitors** — `client/src/pages/Visitors.tsx`
3. **Contractors** — the LIVE module only: `client/src/pages/ContractorManagement.tsx` plus everything under `client/src/pages/contractor/`.
   - ⚠️ Do **NOT** touch `client/src/pages/Contractors.tsx` — that is a dead legacy page and must be left alone.
4. **Staff** — `client/src/pages/StaffManagement.tsx`
5. **Muster** — `client/src/pages/EmergencyMuster.tsx` and `client/src/pages/MusterList.tsx`
   - ⚠️ These are **life-safety screens**. Get the Spanish exactly right — clear, plain, unambiguous. Anything a person reads during an evacuation must be obvious under pressure. Flag the muster translations separately so they can be checked by a native Spanish speaker before go-live.

## Technical approach

- The app is React 18 + Vite + the **wouter** router. There is **no translation library yet**.
- Use **`react-i18next`** with **`i18next`** and **`i18next-browser-languagedetector`** (the standard, well-supported choice for this stack). Initialise i18next once in the app entry/root.
- **Translation files:** create `client/src/locales/en/` and `client/src/locales/es/` with one JSON file per page as a namespace, e.g. `dashboard.json`, `visitors.json`, `contractors.json`, `staff.json`, `muster.json`, plus a `common.json` for shared words (buttons like Save/Cancel/Delete, statuses, etc.). Reuse `common` across pages — don't duplicate the same word in five files.
- **Replace hardcoded text with translation keys** on the five pages above. Every visible English string on those pages — headings, labels, buttons, table column headers, placeholders, empty-state messages, toast/notification text, confirmation dialogs, validation messages — becomes a `t('key')` call with the English text living in the `en` JSON and the Spanish in the `es` JSON. Use clear, grouped key names (e.g. `dashboard.welcome`, `muster.markSafe`).
- **Language picker:** add a language selector in the UI. Mirror the existing `ThemeContext` pattern (`client/src/contexts/ThemeContext.tsx`) — create a small `LanguageContext` (or use react-i18next's own hook) and add a simple EN / ES switcher in the same area as the theme/settings control so it's easy to find. Persist the choice to `localStorage` so it survives a refresh and login.
- **Dates and times:** the app currently hardcodes `en-GB` formatting in many places (e.g. `toLocaleDateString('en-GB', …)`). On the five pages in scope, make the locale follow the active language — `en-GB` when English, `es-ES` when Spanish — via a small shared helper (e.g. `client/src/utils/formatDate.ts`) rather than scattering the locale string around. Keep 24-hour time. Do not break the existing en-GB behaviour for English users.

## Out of scope for this phase (do not build)

- The other ~120 pages, all emails, and any AI-generated content (inductions, risk assessments) — separate later phases.
- The Multi-Site / portfolio platform — that is a completely separate piece of work.
- Any new database changes. This is a **frontend-only** change — no `npm run db:push` should be required.

## Acceptance criteria

- A user can switch between English and Spanish from the UI, and the choice sticks after refresh and re-login.
- On all five pages, **every** visible piece of text switches language correctly — nothing left in English when Spanish is selected, no missing-key placeholders showing.
- Dates and times on the five pages format as `es-ES` in Spanish and `en-GB` in English, still 24-hour.
- The legacy `Contractors.tsx` is untouched.
- English remains the default for anyone who has never chosen a language.
- The translation setup (libraries, locale folders, namespaces) is in place so a sixth page or a third language can be added by just adding keys/files — no re-architecting.
- App builds and runs with no console errors introduced.

## Note for review

After this is built, the **muster Spanish wording** needs a native-speaker check before it goes in front of the European customer — translation accuracy on evacuation screens is non-negotiable.
