# BUGFIX — "Add Worker" Vehicle/Transport field should start blank (like postcode)

**Source:** TPR Bug Report BR-008 (Emma Leschenko, 15 Jun 2026, `/contractors`).
**Reported:** "Add Worker — Vehicle field needs to be cleared blank, same as the postcode field is."

## The problem
In the Add Worker dialog, the **Vehicle / Transport** field is a `<select>` bound to `form.transportMethod`, and `BLANK_FORM` defaults it to `"car_diesel"` (`client/src/pages/contractor/ContractorAddWorkerDialog.tsx` line 12). The postcode field correctly defaults to blank (`""`).

Because the dropdown is pre-set to "Diesel car", **every worker added without touching that field is silently recorded as a diesel car**. That's wrong data — the person filling the form hasn't actually chosen a transport method, so it shouldn't assume one. Emma wants it to start blank, the same as postcode, so a value is only stored when someone actually picks it.

## The fix
**`client/src/pages/contractor/ContractorAddWorkerDialog.tsx`:**
1. In `BLANK_FORM`, change `transportMethod: "car_diesel"` to `transportMethod: ""` so it starts unselected.
2. Add a blank placeholder as the first option in the Vehicle / Transport `<select>` (around line 90), e.g. `<option value="">Select transport method…</option>`, so the empty default renders as an obvious "not chosen" state rather than defaulting to the first real option.
3. The `reset()` function already spreads `BLANK_FORM`, so it'll inherit the blank default — confirm Vehicle clears back to blank after "Add Another Worker" and after closing/reopening the dialog (same as postcode does).

## Watch out for (check before shipping)
- **Is `transportMethod` required by the backend or an enum?** Check the create-worker endpoint and the `transportMethod` column. If the DB/schema expects a non-null enum value, allow blank by either (a) making the column nullable / storing `null` when blank, or (b) validating on submit and prompting the user to pick one if your data model needs it. Do NOT let a blank submit throw a 500 — handle it cleanly.
- If transport feeds any carbon/commute reporting, a blank value should read as "unknown", not be counted as a default vehicle.

## Acceptance criteria
- Opening Add Worker shows the Vehicle / Transport field blank ("Select transport method…"), not pre-set to Diesel car.
- Saving a worker without choosing a transport method stores blank/unknown — never silently records "car_diesel", and never 500s.
- Postcode behaviour is unchanged; Vehicle now matches it.
