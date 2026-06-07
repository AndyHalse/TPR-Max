# Replit Prompt — Accreditation Verification (CHAS, SafeContractor, Constructionline)

## What This Does

Adds real-time verification of UK contractor accreditations directly against the issuing body's database. Right now TPR stores whatever the contractor says their accreditation status is. This feature lets the admin hit a "Verify now" button and get a live confirmation back from CHAS, SafeContractor, or Constructionline.

This is a genuine differentiator. Every competitor stores records. Almost none actually verify them. For a site manager who needs to prove due diligence to an auditor or insurer, "we checked against the live database at 09:14 on 3 June 2026" is a fundamentally stronger compliance position than "the contractor told us they were CHAS-accredited."

Feature flag: `featureAccreditationVerify` (default: `false` — TPR Pro and above).

---

## Important: API Availability

CHAS, SafeContractor, and Constructionline all publish APIs for third-party verification, but access requires a commercial agreement with each body. **This prompt builds the integration framework and the UI — but the API credentials (API keys, client IDs) will need to be obtained from each body separately and stored as environment variables.**

Build the integrations behind a clear "not yet configured" state. If the API credentials are not set, the verify button shows "Not connected — contact support to enable [CHAS/SafeContractor/Constructionline] verification."

---

## Files to Create

- `server/utils/accreditationVerifier.ts` — adapter pattern for each body
- `server/routes/accreditationVerify.ts`

## Files to Change

- `server/isolatedSchema.ts` — add `accreditationVerifications` table
- `server/customerDatabase.ts` — migration
- `client/src/pages/Contractors.tsx` — add "Verify" button in contractor compliance view
- `client/src/pages/contractor-detail` (whichever page shows CDM/compliance tabs) — verification badge

---

## 1. Database — `server/isolatedSchema.ts`

Store a log of every verification attempt. This is the audit trail.

```typescript
export const accreditationVerifications = pgTable('accreditation_verifications', {
  id: serial('id').primaryKey(),
  contractorCompanyId: integer('contractor_company_id').notNull(),
  accreditationType: text('accreditation_type').notNull(),   // 'chas' | 'safecontractor' | 'constructionline'
  membershipNumber: text('membership_number').notNull(),
  verifiedAt: timestamp('verified_at').defaultNow(),
  verifiedBy: text('verified_by').notNull(),                 // TPR user who triggered it
  result: text('result').notNull(),                          // 'valid' | 'expired' | 'not_found' | 'error'
  expiryDate: text('expiry_date'),                           // returned by the API if available
  rawResponse: jsonb('raw_response'),                        // full API response for audit
  errorMessage: text('error_message'),
});
```

Migration:
```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS "${schemaName}".accreditation_verifications (
    id SERIAL PRIMARY KEY,
    contractor_company_id INTEGER NOT NULL,
    accreditation_type TEXT NOT NULL,
    membership_number TEXT NOT NULL,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by TEXT NOT NULL,
    result TEXT NOT NULL,
    expiry_date TEXT,
    raw_response JSONB,
    error_message TEXT
  )
`);
```

---

## 2. Verifier Utility — `server/utils/accreditationVerifier.ts`

Use an adapter pattern so each body is self-contained. Adding a new body later is just adding a new adapter.

```typescript
export type AccreditationType = 'chas' | 'safecontractor' | 'constructionline';

export interface VerificationResult {
  success: boolean;
  result: 'valid' | 'expired' | 'not_found' | 'error';
  expiryDate?: string;
  membershipLevel?: string;      // e.g. CHAS Premium, Constructionline Silver
  companyName?: string;          // name returned by the body (useful to cross-check)
  rawResponse?: any;
  errorMessage?: string;
}

export async function verifyAccreditation(
  type: AccreditationType,
  membershipNumber: string,
  companyName?: string
): Promise<VerificationResult> {
  switch (type) {
    case 'chas': return verifyCHAS(membershipNumber, companyName);
    case 'safecontractor': return verifySafeContractor(membershipNumber, companyName);
    case 'constructionline': return verifyConstructionline(membershipNumber, companyName);
    default: return { success: false, result: 'error', errorMessage: 'Unknown accreditation type' };
  }
}
```

### CHAS Adapter

CHAS provides a verification API. Credentials: `process.env.CHAS_API_KEY`.

```typescript
async function verifyCHAS(membershipNumber: string, companyName?: string): Promise<VerificationResult> {
  if (!process.env.CHAS_API_KEY) {
    return { success: false, result: 'error', errorMessage: 'CHAS API not configured' };
  }
  try {
    const response = await fetch(
      `https://api.chas.co.uk/v1/verify?membershipNumber=${encodeURIComponent(membershipNumber)}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.CHAS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!response.ok) {
      return { success: false, result: 'error', errorMessage: `CHAS API returned ${response.status}` };
    }
    const data = await response.json();
    // Parse CHAS response — adjust field names to match actual CHAS API response shape
    // when credentials are obtained and tested
    const isValid = data.status === 'active' || data.accreditationStatus === 'current';
    return {
      success: true,
      result: isValid ? 'valid' : 'expired',
      expiryDate: data.expiryDate || data.accreditationExpiry,
      membershipLevel: data.grade || data.level,
      companyName: data.companyName,
      rawResponse: data,
    };
  } catch (err: any) {
    return { success: false, result: 'error', errorMessage: err.message };
  }
}
```

Build identical adapters for SafeContractor and Constructionline following the same pattern. Use placeholder API endpoints — the exact endpoints and field names will need adjusting once credentials are obtained and the API responses can be tested.

**Note to developer:** The CHAS API base URL, SafeContractor API URL, and Constructionline API URL should be confirmed directly with each body's developer team. The structure above is a sensible starting point. Field names in the response parsers (`data.status`, `data.expiryDate`, etc.) will need updating once a test call can be made.

---

## 3. Backend Routes — `server/routes/accreditationVerify.ts`

Register on `/api/accreditation-verify`.

### POST /api/accreditation-verify

Body:
```typescript
{
  contractorCompanyId: number;
  accreditationType: 'chas' | 'safecontractor' | 'constructionline';
  membershipNumber: string;
  companyName?: string;
}
```

1. Check `featureAccreditationVerify` is enabled for this customer.
2. Rate limit: max 1 verification per accreditation type per contractor per 60 seconds (prevent API hammering).
3. Call `verifyAccreditation(type, membershipNumber, companyName)`.
4. Log the result to `accreditation_verifications`.
5. If `result === 'valid'` and `expiryDate` returned, update the corresponding accreditation record on the contractor company (CHAS expiry, SafeContractor expiry, etc.) with the verified date.
6. Return the result to the frontend.

### GET /api/accreditation-verify/:contractorCompanyId/history

Returns the 10 most recent verification attempts for this contractor company. Used to show the verification history in the UI.

---

## 4. Frontend Integration

In the contractor company detail view (the compliance tab where CHAS, SafeContractor, Constructionline fields are shown):

For each accreditation type, add a "Verify now" button next to the membership number field.

**Button states:**
- Default: "Verify with [CHAS/SafeContractor/Constructionline] →"
- Loading: spinner + "Verifying..."
- Success (valid): green badge "✅ Verified [date] — Valid until [expiry]"
- Success (expired): red badge "❌ Verified [date] — Accreditation EXPIRED"
- Not found: amber badge "⚠️ Verified [date] — Membership number not found"
- API not configured: grey badge "Not connected" with tooltip "Contact support to enable live verification"
- Error: amber badge "Verification failed — try again"

**Verification history:** Below the accreditation field, show the last verification result with date and who triggered it. Click to expand full history.

---

## 5. Environment Variables Required

Add to `.env.example` (do not add real values — these need commercial agreements):

```
# Accreditation verification APIs
CHAS_API_KEY=
SAFECONTRACTOR_API_KEY=
SAFECONTRACTOR_API_URL=
CONSTRUCTIONLINE_CLIENT_ID=
CONSTRUCTIONLINE_CLIENT_SECRET=
CONSTRUCTIONLINE_API_URL=
```

---

## 6. Feature Flag

```typescript
featureAccreditationVerify: boolean('feature_accreditation_verify').default(false),
```

Migration:
```typescript
await pool.query(`ALTER TABLE "${schemaName}".company_settings ADD COLUMN IF NOT EXISTS feature_accreditation_verify BOOLEAN DEFAULT false`);
```

Set `true` for TPR Pro and above.

---

## Done When

- [ ] `accreditation_verifications` table created with migration
- [ ] Adapter pattern in place for CHAS, SafeContractor, Constructionline
- [ ] "API not configured" state handled gracefully (no crashes, clear UI message)
- [ ] Every verification attempt logged with full `rawResponse` for audit trail
- [ ] Rate limiting prevents more than 1 verification per contractor per type per 60 seconds
- [ ] Verified expiry date auto-updates the contractor's accreditation record when API returns it
- [ ] UI shows "Verify" button with all states (loading, valid, expired, not found, error, not configured)
- [ ] Verification history viewable in contractor detail view
- [ ] Environment variables documented in `.env.example`
- [ ] `featureAccreditationVerify` flag defaults to `false`
- [ ] `npm run check` passes with no new errors

---

*Prompt written: June 2026*
