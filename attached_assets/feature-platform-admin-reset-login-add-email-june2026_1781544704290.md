# Platform Admin — add "New Email" to Reset Login Details

## The problem
On the Platform Admin dashboard you can now reset a customer's login **username**
and **password** (Edit Customer → Reset Login Details). That works — the new
username/password let you past the first login screen.

But login is 2-step: after the password, TPR emails a **6-digit verification
code** to the user's email address. The reset never changes the email, so the
code still goes to the **old/departed person's inbox** (e.g. Mark). Whoever has
taken over still can't get in.

Fix: let the admin also set a **new email** when resetting login details. The
verification code then goes to the new person.

---

## Change 1 — Backend: accept and update `email`

File: `server/routes/platformAdmin.ts`
Route: `PATCH /platform-admin/customers/:customerId/credentials`

Currently it reads `{ username, password }` from the body and builds `updateData`
with username/password only. Add `email` alongside them.

1. Read `email` from the body:
```ts
const { username, password, email } = req.body;
```

2. Update the "nothing provided" guard so email counts too:
```ts
if (!username && !password && !email) {
  return res.status(400).json({ success: false, error: 'Username, password or email required' });
}
```

3. Validate the email if provided (basic check is fine):
```ts
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
  return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
}
```

4. Add it to `updateData` (the email column is `notNull().unique()`, so only set
   it when it actually changes):
```ts
if (email && email.trim() !== adminUser.email) updateData.email = email.trim();
```
   Note: include `email: isolatedSchema.users.email` in the two `.select({...})`
   queries that load `adminUser`, so `adminUser.email` is available for the
   comparison above.

5. The existing duplicate-key handler already returns a clean 409 for usernames.
   Add the same for email — if the error is a unique-constraint violation on the
   email column, return:
```ts
if (error?.code === '23505' && error?.constraint?.includes('email')) {
  return res.status(409).json({ success: false, error: 'That email is already in use by another user. Please choose a different email.' });
}
```

---

## Change 2 — Frontend: add a "New Email" field

File: `client/src/pages/PlatformAdminDashboard.tsx`

1. Add `email` to the `credentialReset` state (initial value `''`), and reset it
   to `''` everywhere the other two are reset (the `useEffect` on
   `editingCustomer` and the mutation's `onSuccess`).

2. In the Reset Login Details section, add a **New Email** input next to New
   Username and New Password, wired to `credentialReset.email`:
```tsx
<div className="space-y-2">
  <Label htmlFor="reset-email">New Email (for the 6-digit login code)</Label>
  <Input
    id="reset-email"
    type="email"
    value={credentialReset.email}
    onChange={(e) => setCredentialReset({ ...credentialReset, email: e.target.value })}
    placeholder="Leave blank to keep current"
    data-testid="input-reset-email"
  />
</div>
```

3. In `editCustomerMutation`, include email in the credential payload and in the
   "did anything change?" check:
```ts
if (credentialReset.username || credentialReset.password || credentialReset.email) {
  const credPayload: Record<string, string> = {};
  if (credentialReset.username) credPayload.username = credentialReset.username;
  if (credentialReset.password) credPayload.password = credentialReset.password;
  if (credentialReset.email)    credPayload.email    = credentialReset.email;
  // ...existing apiRequest PATCH .../credentials with credPayload...
}
```

---

## How to test
1. Platform admin → Edit Tudor Hotels Collection Ltd → Reset Login Details.
2. Set New Username, New Password, and **New Email** (your own email), Save.
3. Log in at the normal TPR login with the company name + new username + new
   password.
4. The 6-digit code should now arrive at the **new** email, not Mark's. Enter it
   and you're in.

---

## Note (unchanged limitation)
This still only updates the customer's **primary admin** user (first user with
role = admin). Other logins on the account aren't touched — that's a separate
user-management feature for later.
