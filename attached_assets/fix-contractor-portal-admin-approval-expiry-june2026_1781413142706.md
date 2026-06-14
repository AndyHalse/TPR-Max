# Fix — Contractor Portal Admin: approving a document doesn't update compliance (verified against live codebase 14 June 2026)

## The problem (read this first)

On the **Contractor Portal** admin page, the "Pending Documents" card tells the admin that approving a document *"updates the contractor record and compliance dashboard."* The approve button's tooltip says the same: *"Mark as approved — updates contractor compliance status."*

**It doesn't.** Approving a portal-uploaded document only flips that document's `status` to `'approved'`. It never writes the document's expiry date back to the contractor company record. And the Compliance Dashboard reads its insurance/policy scores from the **company-level expiry columns** (`public_liability_expiry_date`, `employers_liability_expiry_date`, etc.) — not from the documents.

So this happens in real use:

1. A contractor's Public Liability insurance has expired. They show **red** on the Compliance Dashboard.
2. The contractor logs into the portal and uploads a fresh PL certificate with a new expiry date.
3. The admin opens the portal admin page and clicks **Approve**.
4. The document is marked approved — but the company's `public_liability_expiry_date` is untouched, so the dashboard **still shows them as expired/red.**

The admin then has to go into Contractor Management and manually re-type the expiry date they can already see on the document they just approved. That defeats the main point of the self-service portal: contractors keeping their own compliance current.

This fix makes approval do what the UI already promises — when an approved document is a recognised insurance/policy type and carries an expiry date, copy that date onto the matching company column.

**Scope:** one file, one handler. Do **not** change the dashboard, the schema, or the contractor-side portal. Run `npm run check` when done.

---

## File to change

`server/routes/contractors.ts`

The handler is `app.put('/api/contractors/documents/:docId/review', …)` — currently around lines 5214–5325.

## How the pieces line up

The portal upload form sends these `documentType` keys (from `client/src/pages/contractor-portal/ContractorPortalDocuments.tsx`):

| Portal `documentType` | Maps to company column (`isolatedSchema.contractorCompanies`) |
|---|---|
| `publicLiability` | `publicLiabilityExpiryDate` |
| `employersLiability` | `employersLiabilityExpiryDate` |
| `professionalIndemnity` | `professionalIndemnityExpiryDate` |
| `healthSafety` | `healthSafetyPolicyExpiryDate` |

`rams` is handled by the separate RAMS table and workflow — **leave it alone here.** `cisRegistration`, `modernSlavery`, `environmentalPolicy`, `other` have no company expiry column and no dashboard expiry check — skip them.

## What to do

Inside the review handler, the document row is updated like this (around lines 5227–5241):

```ts
      const [updated] = await db
        .update(isolatedSchema.contractorDocuments)
        .set({
          status,
          approvedBy: reviewerId,
          approvedAt: status === 'approved' ? new Date() : null,
          rejectedReason: status === 'rejected' ? (rejectedReason || 'Document rejected') : null,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.contractorDocuments.id, docId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Document not found.' });
      }
```

**Immediately after that `if (!updated)` block**, add this:

```ts
      // ── On approval, push the document's expiry date onto the contractor
      //    company record so the Compliance Dashboard actually reflects it.
      //    (The dashboard reads company-level expiry columns, not documents.)
      if (status === 'approved' && (updated as any).companyId) {
        const COMPANY_EXPIRY_COLUMN: Record<string, keyof typeof isolatedSchema.contractorCompanies.$inferInsert> = {
          publicLiability: 'publicLiabilityExpiryDate',
          employersLiability: 'employersLiabilityExpiryDate',
          professionalIndemnity: 'professionalIndemnityExpiryDate',
          healthSafety: 'healthSafetyPolicyExpiryDate',
        };
        const docType = (updated as any).documentType as string | undefined;
        const expiry = (updated as any).expiryDate as Date | string | null | undefined;
        const column = docType ? COMPANY_EXPIRY_COLUMN[docType] : undefined;

        // Only company-level docs (no workerId) update the company record.
        if (column && expiry && !(updated as any).workerId) {
          try {
            await db
              .update(isolatedSchema.contractorCompanies)
              .set({ [column]: new Date(expiry) } as any)
              .where(eq(isolatedSchema.contractorCompanies.id, (updated as any).companyId));
          } catch (syncErr: any) {
            logger.warn('[portal-review] Failed to sync company expiry (non-fatal):', syncErr.message?.substring(0, 80));
          }
        }
      }
```

### Why it's written this way

- **Only on `approved`.** Rejecting or leaving pending must never change the company's compliance dates.
- **Only recognised insurance/policy types.** Anything not in the map (CIS, modern slavery, RAMS, "other", worker certs) is left exactly as it is today.
- **Only company-level documents** (`!workerId`). Worker-specific certificates belong to the worker, not the company insurance columns, so they're excluded.
- **Only when the document actually has an expiry date.** No expiry → nothing to copy.
- **Non-fatal.** If the company update fails for any reason, the document approval still succeeds and we log a warning — same pattern the handler already uses for the rejection email and worker-note audit entry.

The frontend already invalidates `/api/compliance-dashboard` after a review, so the dashboard will refresh on its own — no client change needed.

---

## Verify

1. `npm run check` passes.
2. In a test customer, set a contractor company's **Public Liability** expiry to **yesterday**. The Compliance Dashboard shows them red under Contractor Insurance.
3. As that contractor (portal side), upload a Public Liability document with an expiry **one year from now**. It lands in Pending Documents.
4. On the portal admin page, click **Approve**. Then open the Compliance Dashboard:
   - Contractor Insurance for that company is now **green** and the expiry shows the new date.
   - The contractor's record in Contractor Management shows the updated Public Liability expiry.
5. Repeat for **Employers' Liability**, **Professional Indemnity**, and **Health & Safety Policy** — each updates its matching column.
6. Approve a **worker** certificate and a **CIS / Other** document: the company insurance columns are **unchanged** (correct — those aren't company insurance dates).
7. **Reject** an insurance document: company columns are **unchanged** (correct).

---

## Not covered by this prompt (separate jobs)

Found in the same review, out of scope here — ask if you want prompts:

- **Resend toast shows an empty name.** On the Portal Users list, clicking **Resend** on a pending invite fires a success toast reading "Portal invite sent to ." — the message reads `inviteEmail || postCreateEmail`, but neither is set when resending from the row. It should use the row's email (`ContractorPortalAdmin.tsx`, `sendInviteMutation.onSuccess`).
- **Revoked users look identical to never-accepted invites.** After Revoke, the user stays in the list as "Invite pending" and is counted in the "Pending invites" stat, with a Resend button — indistinguishable from a genuine pending invite. Consider a distinct "Revoked" state or removing them from the pending count.
- **Portal admin endpoints aren't feature-gated.** The nav item is hidden behind `featureContractorPortal`, but the `/api/contractor-portal/*` and related admin routes don't check the flag. Still tenant-isolated and admin-only, so low risk, but a customer without the feature could call them directly.
