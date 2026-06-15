# Platform Admin — fix & surface "Reset Login Details"

Two changes to the Platform Admin dashboard. Goal: let an admin change a
customer's login username and/or password from the Edit Customer dialog, so the
company can still get into TPR when the person who set it up has left.

The feature already exists in the code but (1) the backend route is broken by two
missing imports, so saving a reset silently fails, and (2) the reset fields are
buried at the very bottom of the dialog, under ~26 module toggles, so they're
hard to find.

---

## Change 1 — Fix the broken backend route (REQUIRED — this is why resets fail)

File: `server/routes/platformAdmin.ts`

The route `PATCH /platform-admin/customers/:customerId/credentials` uses
`CustomerDatabaseService` and `isolatedSchema`, but neither is imported in the
file. At runtime the handler throws `ReferenceError: CustomerDatabaseService is
not defined`, returns a 500, and the username/password is never changed.

Add the two missing imports near the top, right after the `requirePlatformAdmin`
import (note the `../` paths — this file is in `server/routes/`):

```ts
import { requirePlatformAdmin } from '../auth';
import { CustomerDatabaseService } from '../customerDatabase';
import * as isolatedSchema from '../isolatedSchema';
import { db } from '../db';
```

No other backend changes needed — `bcrypt` is already imported and the handler
logic is correct.

---

## Change 2 — Move the reset fields to the top of the Edit Customer dialog

File: `client/src/pages/PlatformAdminDashboard.tsx`

Right now the "Reset Customer Admin Credentials (Optional)" block sits **after**
the entire "Module Features" block, so it's right at the bottom of a long scroll.
Move that whole block so it sits **immediately after the Contact Email field and
before the Module Features block**.

- Cut the entire `<div className="border-t pt-4 mt-4">` block whose heading is
  **"Reset Customer Admin Credentials (Optional)"** (contains the New Username and
  New Password inputs).
- Paste it directly after the Contact Email field's closing `</div>` and before
  the `<div className="border-t pt-4 mt-4">` block that contains the
  **"Module Features"** heading.

While moving it, also change the heading and helper text so its purpose is
obvious:

- Heading: **"Reset Login Details"**
- Helper text: **"Use this to change the customer's login username or password —
  e.g. when the person who set up the account has left. Leave blank to keep the
  current details."**

Keep the two input fields, their `data-testid` attributes, and all wiring exactly
as they are.

---

## How to test

1. Log in to `/platform-admin/dashboard`.
2. Edit a customer (e.g. Tudor Hotels Collection Ltd). The **Reset Login Details**
   section should now be near the top, just under Contact Email.
3. Enter a new username and a new password, click **Save Changes**.
4. You should see "Customer updated successfully" — NOT "credential reset failed".
5. Go to the normal TPR login, enter the company name, the new username, and the
   new password — you should get in (it will send the 6-digit email code as usual).

---

## Known limitation (not part of this fix — note for later)

The reset only updates the customer's **primary admin** user (the first user with
role = admin). If a customer has several separate logins, or the leaver wasn't the
primary admin, this won't touch those other accounts. A full per-user management
screen would be a separate piece of work.
