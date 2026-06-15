# Platform Admin — User Management per customer

## Why
Today the Platform Admin dashboard can only reset the **primary admin** login for
a customer (username/password/email). If a customer has several logins — or the
person who left wasn't the primary admin — there's no way to see or fix the other
accounts, and the 6-digit login code can still go to the wrong inbox.

Build a proper **Manage Users** screen so a platform admin can, for any customer:
see every login on the account, add a new one, edit one (username, email,
password, role, name), enable/disable one, and delete one — with guards so you
can never lock a customer out by removing their last admin.

This works on the customer's **isolated database** (each customer has their own).
Use the same pattern as the existing credentials route: get the customer DB via
`CustomerDatabaseService.getInstance().getCustomerDatabase(customerId)` and query
`isolatedSchema.users`.

---

## The users table (per-customer DB, `server/isolatedSchema.ts`)
`users`: `id`, `username` (unique, required), `password` (nullable, bcrypt hash),
`email` (nullable — this is where the 2FA code is sent), `role` (required,
default `"user"`; values: `admin`, `user`, `tenant_admin`, `tenant_staff`),
`firstName`, `lastName`, `isActive` (default true), `lastLoginAt`, `createdAt`.

Never return the `password` field to the client.

---

## Backend — `server/routes/platformAdmin.ts`
All routes use `requirePlatformAdmin`. `CustomerDatabaseService`, `isolatedSchema`
and `bcrypt` are already imported in this file. Add these four routes.

### 1. List users
`GET /platform-admin/customers/:customerId/users`
- Load the customer DB, select all users (omit password), order by `createdAt`.
- Return `{ success: true, users: [...] }` with id, username, email, role,
  isActive, firstName, lastName, lastLoginAt, createdAt.

### 2. Create user
`POST /platform-admin/customers/:customerId/users`
- Body: `username`, `email`, `password`, `role`, `firstName`, `lastName`.
- Validate: username and password required; password ≥ 8 chars; email, if given,
  matches a basic email regex; role must be one of the four allowed values.
- Hash password with `bcrypt.hash(password, 10)`, insert, return the new user
  (no password).
- On unique-constraint error (`error.code === '23505'`) for username, return 409
  "That username is already in use."

### 3. Update user
`PATCH /platform-admin/customers/:customerId/users/:userId`
- Body: any of `username`, `email`, `password`, `role`, `firstName`, `lastName`,
  `isActive`. Only update the fields provided.
- Hash password if provided. Validate email/role as above.
- **Lock-out guard:** if the change would set `isActive: false` or change the role
  away from `admin` on a user who is currently an admin, first count how many
  **active admin** users remain. If this is the last active admin, reject with
  400 "You can't disable or demote the last active admin — the customer would be
  locked out."
- On username unique-constraint error, return 409 as above.

### 4. Delete user
`DELETE /platform-admin/customers/:customerId/users/:userId`
- **Lock-out guard:** never delete the last active admin (same count check) —
  reject with the same kind of 400 message.
- The `staff` table has a `userId` foreign key to `users`. If the delete fails on
  a foreign-key constraint (`error.code === '23503'`), don't crash — return 409
  "This login is linked to a staff record. Deactivate it instead, or unlink the
  staff record first." (Deactivate should be the normal path; delete is for
  genuine mistakes/duplicates.)

---

## Frontend — `client/src/pages/PlatformAdminDashboard.tsx`
Use the existing patterns in this file: `apiRequest`, `useQuery`/`useMutation`,
`queryClient.invalidateQueries`, `toast`, shadcn `Dialog`, `Input`, `Button`,
`Switch`, `Badge`, `Select`.

1. **Add a "Users" button** to each customer row, next to the existing Edit /
   Deactivate / Delete buttons (around the `button-edit-${customer.id}` button).
   Use the `Users` icon (already imported from lucide-react). Clicking it sets a
   new state `managingUsersCustomer` to that customer and opens a dialog.

2. **Manage Users dialog** (`max-w-2xl max-h-[90vh] overflow-y-auto`), titled
   "Manage Users — {company name}":
   - Fetch `GET /platform-admin/customers/{id}/users` when open.
   - Show a list/table of users: username, email, role (Badge), Active/Inactive
     (Badge), last login (`en-GB` date or "Never"). Per row: **Edit**, an
     **Active** toggle (`Switch` → PATCH `isActive`), and **Delete**.
   - **Add User** button at the top opens an inline form: username, email,
     password, role (Select with the four roles), first name, last name → POST.
   - **Edit** opens an inline form pre-filled (password left blank = keep
     current; show helper text "Leave blank to keep current password") → PATCH.
   - After any create/edit/delete/toggle, invalidate the users query and show a
     success/error toast. Surface backend 400/409 messages verbatim (they explain
     the lock-out and staff-link guards).

3. Make the email field prominent with helper text: **"The 6-digit login code is
   sent to this email."** — that's the bit that bit us before.

---

## Test plan
1. Platform admin → a customer → **Users**. You see every login on the account.
2. Add a new admin user with your own email + a password. Log in to TPR with the
   company name + that username + password; the 6-digit code arrives at your
   email; you get in.
3. Edit an existing user's email and confirm the next login code goes to the new
   address.
4. Try to disable/delete the only admin — it should be blocked with a clear
   message.
5. Try to delete a login that's linked to a staff record — you get the "deactivate
   instead" message, not a crash.

---

## Note
The older `PATCH /platform-admin/customers/:customerId/credentials` route (resets
the primary admin only) can stay for now but is effectively superseded by this
screen. Leave the existing Edit Customer dialog's "Reset Login Details" section as
a quick shortcut, or remove it once this screen is in — your call.
