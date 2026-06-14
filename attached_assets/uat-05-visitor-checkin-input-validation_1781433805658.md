# UAT-05 — Fix visitor check-in input validation (email + single-word names)

## Why
Two data-quality defects in the visitor check-in form, `client/src/pages/VisitorCheckIn.tsx`:

1. **Malformed email passes through silently** (~line 294). The form only converts an EMPTY email to `null`; a malformed value like `"bob@"` is submitted as-is. The e-pass send then fails silently and the visitor never gets their digital pass — with no error shown to anyone.

2. **Single-word names duplicate into the surname** (~line 285). The name split does:
   ```
   const lastName = nameParts.slice(1).join(' ') || firstName;
   ```
   So a mononym like `"Cher"` becomes `firstName: "Cher", lastName: "Cher"`. This produces wrong names on printed passes and on the emergency muster list.

## What to change
In `client/src/pages/VisitorCheckIn.tsx`:

1. **Email validation:** before submitting (in `handleSubmit`, alongside the existing name/host checks), if `formData.email` is non-empty, validate it against a basic email regex. If it's non-empty and invalid, show an inline error toast ("Please enter a valid email address, or leave it blank") and stop — do NOT submit. Empty email should still be allowed (it just means no e-pass).

2. **Name split:** change the surname fallback so a single-word name does NOT duplicate. If there is only one word, set `lastName` to an empty string (or keep `firstName` only), rather than copying `firstName` into `lastName`. Make sure downstream display (pass print, muster) handles an empty surname gracefully — if a non-empty surname is genuinely required by the backend schema, use a single space or the same value but flag this to the developer to confirm what the `visitors` table requires.

3. Keep all existing required-field checks (name, host) and the H&S/NDA gating exactly as they are.

## Acceptance test
- Enter email `"bob@"` → submit is blocked with a clear inline message; nothing is created.
- Enter a valid email → check-in proceeds and e-pass sends as before.
- Enter name `"Cher"` → the visitor is created with first name "Cher" and the surname is NOT "Cher" duplicated; the printed pass and muster show the name correctly.
- Enter name `"Mary Jane Watson"` → first name "Mary", surname "Jane Watson" (unchanged behaviour).
