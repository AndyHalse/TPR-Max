# UAT-06 — Fix: contractor worker phone number "goes missing" after creation

## Why (root cause found)
This is the long-reported bug: you enter a mandatory phone number when creating a new contractor worker, it saves, but the worker's profile then shows **"Not provided"** and the edit form comes back blank.

The phone is NOT actually lost — it's saved correctly to the database column `phone_number` (isolated schema key `phoneNumber`). The bug is a **read/key-name mismatch**:

- The worker-list/detail fetch method `getWorkersByCompanyId` in `server/databaseService.ts` (mapping starts ~line 1452) returns the field as **`phoneNumber`** only — it does NOT include a `phone` alias. See line ~1459: `phoneNumber: worker.phoneNumber,`.
- But the client reads `worker.phone`:
  - `client/src/pages/ContractorDetails.tsx` line ~1945: `{viewingWorker.phone || 'Not provided'}`
  - `client/src/pages/ContractorDetails.tsx` line ~550: `contactPhone: data.worker.phone || ''` (pre-fills the edit form)
- So `worker.phone` is `undefined` → displays "Not provided" and the edit form loads empty.

Other fetch methods in the same file already add the alias for exactly this reason — e.g. line ~2261 `phone: updated.phoneNumber, // Add phone alias for compatibility` and line ~2443 `phone: worker.phoneNumber`. `getWorkersByCompanyId` was simply missed.

## What to change
1. In `server/databaseService.ts`, in the `getWorkersByCompanyId` worker mapping (around line 1459 where `phoneNumber: worker.phoneNumber` is set), **add a `phone` alias** alongside it:
   ```
   phoneNumber: worker.phoneNumber,
   phone: worker.phoneNumber, // alias for client compatibility (UI reads worker.phone)
   ```
2. Check the other worker-fetch methods in the same file that feed contractor views and make sure they ALL expose both keys consistently. At minimum verify: `getWorkersByCompanyId` (~1419), `getWorkerById`/equivalent (~1497–1524), and `getWorkersByCompany` (~2348). Any that return `phoneNumber` without a `phone` alias should get the alias too.
3. Do NOT change the client to read `phoneNumber` instead — the alias approach matches the existing pattern and avoids touching many UI references.

## Acceptance test
- Create a new contractor worker with phone "07700 900123".
- Immediately open that worker's profile → the Phone field shows "07700 900123", NOT "Not provided".
- Open the edit form → the phone field is pre-filled with "07700 900123".
- Reload the page and re-open → phone still shows correctly.

## Note
This is a display/read-mapping fix only — no database migration needed. The underlying data has been correct all along, which is why the number "reappears" inconsistently depending on which screen loads it.
