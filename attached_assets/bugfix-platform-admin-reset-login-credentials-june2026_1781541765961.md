# Bugfix — Platform Admin "Reset Login Details" is broken (missing imports)

## What's wrong
On the Platform Admin dashboard, when you Edit a customer and try to reset their
login details (New Username / New Password fields at the bottom of the Edit
Customer dialog), the save fails with:

> "Customer details saved, but credential reset failed: ..."

The UI and the API route both exist. The bug is purely a missing import.

The route `PATCH /platform-admin/customers/:customerId/credentials` in
`server/routes/platformAdmin.ts` uses `CustomerDatabaseService` and
`isolatedSchema`, but neither is imported in that file. At runtime the handler
throws `ReferenceError: CustomerDatabaseService is not defined`, returns a 500,
and the credential reset never happens.

## The fix
In `server/routes/platformAdmin.ts`, add the two missing imports near the top,
right after the `requirePlatformAdmin` import. Use these exact paths (the file
lives in `server/routes/`, so it's one level deeper than `server/auth.ts`):

```ts
import { requirePlatformAdmin } from '../auth';
import { CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { db } from '../db';
```

No other changes needed — `bcrypt` is already imported and the handler logic is
correct.

## How to test
1. Log in to `/platform-admin/dashboard`.
2. Edit any customer (e.g. Tudor Hotels Collection Ltd).
3. Scroll to the bottom of the Edit Customer dialog → "Reset Login Details".
4. Enter a new password (and/or new username) and Save.
5. You should see "Customer updated successfully" — not the credential-reset
   error.
6. Confirm by logging into that customer account with the new password.

## Note for later (not part of this fix)
The reset only updates the customer's **primary admin** user (first user with
role = admin). If a customer has several logins that each need resetting, that's
a separate enhancement.
