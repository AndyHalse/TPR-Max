# Replit Prompt — Contractor Self-Service Document Portal

## What This Does

Gives each contractor company their own secure login portal where they can upload and manage their own compliance documents — insurance certificates, CSCS cards, CHAS/SafeContractor accreditations, DBS certificates, and any other documents the site admin requires.

Right now, the site admin has to chase every contractor for their documents and upload them manually. This feature flips that around: the admin invites the contractor, the contractor logs into their own portal, uploads their documents, and the admin reviews and approves. The admin is notified when new documents arrive. Contractors are prompted automatically when documents are about to expire.

This is the single biggest admin time-saver possible for H&S managers running contractor-heavy sites.

Feature flag: `featureContractorPortal` (default: `false` — TPR Pro and above).

---

## Architecture Note

The contractor portal is a **separate, simplified login experience** from the main TPR app. Contractors access it at `/contractor-portal` — it has its own auth flow (email/password or invite token) and shows only what's relevant to their company. They cannot see any other customer's data, other contractor companies, or any TPR admin features.

---

## Files to Create

- `server/routes/contractorPortal.ts` — auth + portal API routes
- `server/utils/contractorPortalAuth.ts` — JWT/session for portal users
- `client/src/pages/contractor-portal/ContractorPortalLogin.tsx`
- `client/src/pages/contractor-portal/ContractorPortalDashboard.tsx`
- `client/src/pages/contractor-portal/ContractorPortalDocuments.tsx`
- `client/src/pages/contractor-portal/ContractorPortalWorkers.tsx`

## Files to Change

- `server/isolatedSchema.ts` — add `contractorPortalUsers` table
- `server/customerDatabase.ts` — migration
- `server/routes/contractors.ts` — add "Invite to portal" action and document approval flow
- `client/src/pages/Contractors.tsx` — "Invite to portal" button and portal status indicator
- `client/src/App.tsx` — add portal routes (public, no main app auth required)

---

## 1. Database — `server/isolatedSchema.ts`

```typescript
export const contractorPortalUsers = pgTable('contractor_portal_users', {
  id: serial('id').primaryKey(),
  contractorCompanyId: integer('contractor_company_id').notNull(),   // FK to contractor_companies
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text('role').default('editor'),          // 'admin' | 'editor' (portal-level roles only)
  inviteToken: text('invite_token'),             // one-time invite token
  inviteExpiry: timestamp('invite_expiry'),
  inviteAccepted: boolean('invite_accepted').default(false),
  active: boolean('active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

Migration:
```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".contractor_portal_users (
    id SERIAL PRIMARY KEY,
    contractor_company_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    invite_token TEXT,
    invite_expiry TIMESTAMPTZ,
    invite_accepted BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
```

---

## 2. Invite Flow

### Admin invites a contractor to the portal

In `server/routes/contractors.ts`, add:

`POST /api/contractors/:companyId/portal/invite`

Body: `{ email, firstName, lastName }`

1. Generate a secure random `inviteToken` (32-byte hex).
2. Set `inviteExpiry` to 7 days from now.
3. Insert a `contractorPortalUsers` record with `inviteAccepted = false`.
4. Send invite email to the contractor:

**Subject:** `You've been invited to manage your compliance documents for [Company Name]`

**Body:**
- Brief explanation: "Site admin at [Company Name] has invited you to manage your compliance documents online."
- Link: `[your TPR URL]/contractor-portal/accept-invite?token=[inviteToken]`
- Token expires in 7 days.

### Contractor accepts invite

`GET /api/contractor-portal/accept-invite?token=xxx` (public, no auth)

1. Validate token exists, not expired, not already accepted.
2. Return the contractor company name and the invitee's name for the accept page.

`POST /api/contractor-portal/accept-invite` (public)

Body: `{ token, password, confirmPassword }`

1. Validate token again.
2. Hash password with bcrypt.
3. Set `passwordHash`, `inviteAccepted = true`, clear `inviteToken`.
4. Return JWT session for the portal.

---

## 3. Portal Authentication

Portal sessions are separate from main app sessions. Use a separate JWT secret (e.g. `CONTRACTOR_PORTAL_JWT_SECRET` env var, or derive from the main secret with a prefix).

Portal JWT payload:
```typescript
{
  portalUserId: number;
  contractorCompanyId: number;
  customerId: string;           // which customer's schema to use
  schemaName: string;
  role: 'admin' | 'editor';
  iat: number;
  exp: number;                  // 8 hours
}
```

`POST /api/contractor-portal/login` — email + password, return JWT.

Create `requireContractorPortalAuth` middleware that validates the portal JWT and attaches `req.portalUser` (similar to the main `requireAuth` middleware).

---

## 4. Portal API Endpoints — `server/routes/contractorPortal.ts`

All require `requireContractorPortalAuth`. All scoped to the portal user's `contractorCompanyId`.

### Company overview
`GET /api/contractor-portal/company` — returns the contractor company record (name, address, compliance status summary).

### Documents
`GET /api/contractor-portal/documents` — lists all compliance documents for this contractor company (insurance, accreditations, CSCS, etc.) with expiry status.

`POST /api/contractor-portal/documents` — upload a new document. Multipart form: file + document type + expiry date. Stores in Google Cloud Storage following the existing `uploadToGCS` pattern. Sets `status = 'pending_review'`.

`PUT /api/contractor-portal/documents/:id` — update expiry date or re-upload a document.

### Workers
`GET /api/contractor-portal/workers` — list workers belonging to this contractor company.

`PUT /api/contractor-portal/workers/:id/documents` — upload a document for a specific worker (CSCS card, DBS cert).

### Inductions
`GET /api/contractor-portal/inductions` — list any pending or completed inductions for this company's workers.

---

## 5. Admin-Side: Review and Approval

When a contractor uploads a document via the portal, the site admin receives an email notification:

**Subject:** `[Contractor Company] has uploaded new compliance documents — review required`

In the main TPR app, on the Contractors page for that company, show a "Documents awaiting review" badge. Admin can approve or reject each document, optionally adding a note on rejection.

`PUT /api/contractors/:companyId/documents/:docId/approve` — admin approves, sets status to `approved`.
`PUT /api/contractors/:companyId/documents/:docId/reject` — admin rejects with a required `reason` field. The contractor portal user receives an email explaining what was rejected and why, with a prompt to re-upload.

---

## 6. Expiry Reminders to Contractors

Extend the existing daily compliance cron to also check contractor portal users. For any document expiring within 30 days (and again at 7 days), send an email to the contractor portal user:

**Subject:** `Action required — your [document type] expires in [X] days`

**Body:** Direct link to the portal documents page so they can upload the renewal immediately.

---

## 7. Frontend — Portal Pages

These pages are served at `/contractor-portal/*` and use a minimal layout (no main app sidebar). Use the same shadcn/ui components for consistency.

**`/contractor-portal/login`** — email + password form. "Forgot password" link (email reset flow).

**`/contractor-portal/accept-invite?token=xxx`** — accept invite and set password.

**`/contractor-portal/dashboard`** — shows:
- Compliance status summary (green/amber/red based on expired/expiring documents)
- List of "action required" items (expired docs, pending inductions)
- Quick links to Documents and Workers pages

**`/contractor-portal/documents`** — list of all documents with status badges (Valid / Expiring Soon / Expired / Pending Review / Rejected). Upload button per document type. Re-upload button on expired/rejected docs.

**`/contractor-portal/workers`** — list of workers with their individual document status (CSCS, DBS, training certs).

---

## 8. Feature Flag

```typescript
featureContractorPortal: boolean('feature_contractor_portal').default(false),
```

Migration:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_contractor_portal BOOLEAN DEFAULT false`);
```

Set `true` for TPR Pro and above.

---

## Done When

- [ ] `contractor_portal_users` table created with migration
- [ ] Invite flow works end-to-end: admin invites → email sent → contractor accepts → password set → portal accessible
- [ ] Portal JWT auth is separate from main app auth
- [ ] Contractor can only see their own company's data — no cross-contamination between companies
- [ ] Contractor can upload documents from the portal (stored in GCS)
- [ ] Uploaded documents show as "Pending review" and admin receives email notification
- [ ] Admin can approve or reject documents with a note
- [ ] Contractor receives rejection email with reason and re-upload prompt
- [ ] Expiry reminder emails sent to contractor portal users at 30 days and 7 days
- [ ] Portal pages use minimal layout (no main app sidebar)
- [ ] Portal is accessible without main app auth (separate JWT)
- [ ] `featureContractorPortal` flag defaults to `false`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
