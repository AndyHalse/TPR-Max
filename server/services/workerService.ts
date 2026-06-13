/**
 * workerService.ts
 *
 * Single source of truth for all writes to the contractor_workers table and
 * the associated audit-note tables (workerNotes, companyNotes, cardIssues).
 *
 * Each exported function:
 *  - validates its input (throws ServiceError on bad input)
 *  - applies the DB change
 *  - writes the appropriate audit notes
 *
 * Route handlers are thin wrappers that do auth/role checks, call a function
 * here, and return the HTTP response.
 */

import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as isolatedSchema from '../isolatedSchema';
import { insertContractorWorkerSchema } from '@shared/schema';
import { customerDbService } from '../customerDatabase';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { logger } from '../utils/logger';
import { z } from 'zod';

// ─── Shared error type ────────────────────────────────────────────────────────

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// ─── Context passed by every caller ──────────────────────────────────────────

export interface WorkerServiceContext {
  /** Already-fetched drizzle instance for the customer's database. */
  db: any;
  /** Customer identifier (used for databaseService passthrough calls). */
  customerId: string;
  /** Authenticated username — recorded in all audit notes. */
  actor: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowLabel(): { dateStr: string; timeStr: string; ts: string } {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { dateStr, timeStr, ts: `${dateStr} at ${timeStr}` };
}

/** Normalise phone input: `phoneNumber` → `mobileNumber` → `phone`; trims whitespace. */
function normalisePhone(body: Record<string, any>): string | undefined {
  const raw =
    body.phoneNumber !== undefined ? body.phoneNumber :
    body.mobileNumber !== undefined ? body.mobileNumber :
    body.phone;
  const trimmed = String(raw ?? '').trim();
  return trimmed || undefined;
}

// ─── 1. createWorker ─────────────────────────────────────────────────────────

/**
 * Create a contractor worker.
 *
 * `origin = 'admin'`     — full Zod validation, compliance fields, 3 audit notes.
 * `origin = 'portal'`    — minimal insert (personal details only), 3 audit notes.
 * `origin = 'prebooking'`— auto-create from pre-booking; only firstName/lastName required.
 */
export async function createWorker(
  ctx: WorkerServiceContext,
  companyId: string,
  body: Record<string, any>,
  origin: 'admin' | 'portal' | 'prebooking' = 'admin',
): Promise<any> {
  // ── Mandatory field validation ────────────────────────────────────────────
  if (!body.firstName || !String(body.firstName).trim()) {
    throw new ServiceError(400, 'First name is required.');
  }
  if (!body.lastName || !String(body.lastName).trim()) {
    throw new ServiceError(400, 'Last name is required.');
  }

  // Portal and admin paths also require email + phone
  if (origin !== 'prebooking') {
    if (!body.email || !String(body.email).trim()) {
      throw new ServiceError(400, 'Email address is required.');
    }
  }

  const normalisedPhone = normalisePhone(body);
  if (origin !== 'prebooking' && !normalisedPhone) {
    throw new ServiceError(400, 'Phone number is required.');
  }

  // ── Pre-booking auto-create path ─────────────────────────────────────────
  if (origin === 'prebooking') {
    const insertValues: Record<string, any> = {
      companyId,
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      email: body.email || null,
      phoneNumber: body.phoneNumber?.trim() || body.phone?.trim() || null, // isolated key
      rightToWork: body.rightToWork ?? 'pending',
      isActive: true,
      siteInductionCompleted: false, // isolated key (not `inductionCompleted`)
      safetyRating: body.safetyRating ?? 'N/A',
    };
    if (body.id) insertValues.id = body.id;
    const [worker] = await ctx.db
      .insert(isolatedSchema.contractorWorkers)
      .values(insertValues)
      .returning();
    return worker;
  }

  // ── Portal path ───────────────────────────────────────────────────────────
  if (origin === 'portal') {
    const [worker] = await ctx.db
      .insert(isolatedSchema.contractorWorkers)
      .values({
        companyId,
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        email: String(body.email).trim(),
        mobileNumber: body.mobileNumber?.trim() || null,
        phoneNumber: normalisedPhone,
        jobTitle: body.jobTitle?.trim() || null,
        trade: body.trade?.trim() || null,
        isActive: true,
      })
      .returning();

    await _writePortalCreateNotes(ctx, worker, body, normalisedPhone!);
    return worker;
  }

  // ── Admin path ────────────────────────────────────────────────────────────
  // IMPORTANT: insertContractorWorkerSchema is generated from shared/schema.ts which diverges
  // from isolatedSchema.ts on two fields:
  //   shared JS key `phone`             (col: phone)       ≠  isolated JS key `phoneNumber` (col: phone_number)
  //   shared JS key `inductionCompleted` (col: site_induction_completed) ≠ isolated `siteInductionCompleted`
  // Zod strips unknown keys, so phoneNumber + siteInductionCompleted passed into .parse() are silently dropped.
  // We MUST re-add them as isolated-table key names AFTER the parse call.
  const hsToken = randomBytes(16).toString('hex');

  const workerData: any = insertContractorWorkerSchema.parse({
    ...body,
    companyId,
    hsRulesAcceptanceToken: hsToken,
    // These shared-schema JS keys survive Zod parse (same key name in both schemas):
    asbestosAwareness:
      body.asbestosAwareness !== undefined ? Boolean(body.asbestosAwareness) : false,
    manualHandling:
      body.manualHandling !== undefined ? Boolean(body.manualHandling) : false,
  });

  // Bridge isolated-table field names that Zod stripped (shared ≠ isolated key names).
  workerData.phoneNumber = normalisedPhone;                           // isolated: phoneNumber  (phone_number)
  workerData.siteInductionCompleted =                                 // isolated: siteInductionCompleted (site_induction_completed)
    body.inductionCompleted !== undefined ? Boolean(body.inductionCompleted) : false;
  workerData.workingAtHeight =                                        // isolated: workingAtHeight (working_at_height)
    body.workingAtHeight !== undefined ? Boolean(body.workingAtHeight) : false;
  // Remove shared-schema-only keys so they don't shadow or confuse the isolated insert.
  delete workerData.phone;
  delete workerData.inductionCompleted;

  const context = simpleDatabaseService.createCustomerContext(ctx.actor, ctx.customerId);
  const worker = await databaseService.createContractorWorker(context, workerData);

  logger.info(`[workerService] Created worker ${worker.id} for customer ${ctx.customerId}`);
  await _writeAdminCreateNotes(ctx, worker, workerData, body);
  return worker;
}

// ─── 2. updateWorker ─────────────────────────────────────────────────────────

/**
 * Update a contractor worker profile.
 * Returns `{ worker }` on success.  Throws ServiceError on bad input / not found.
 */
export async function updateWorker(
  ctx: WorkerServiceContext,
  workerId: string,
  uiData: Record<string, any>,
): Promise<{ worker: any }> {
  let mappedData: any = {};

  // ── Mandatory field validation ────────────────────────────────────────────
  if (uiData.firstName !== undefined && !String(uiData.firstName).trim()) {
    throw new ServiceError(400, 'First name cannot be empty.');
  }
  if (uiData.lastName !== undefined && !String(uiData.lastName).trim()) {
    throw new ServiceError(400, 'Last name cannot be empty.');
  }
  if (uiData.email !== undefined && !String(uiData.email).trim()) {
    throw new ServiceError(400, 'Email address cannot be empty.');
  }

  // ── Direct field mappings ─────────────────────────────────────────────────
  const directFields: Record<string, string> = {
    companyId: 'companyId',
    firstName: 'firstName',
    lastName: 'lastName',
    email: 'email',
    homeAddress: 'homeAddress',
    postcode: 'postcode',
    jobTitle: 'jobTitle',
    department: 'department',
    emergencyContactName: 'emergencyContactName',
    emergencyContactPhone: 'emergencyContactPhone',
    emergencyContactRelationship: 'emergencyContactRelationship',
    transportMethod: 'transportMethod',
    rightToWork: 'rightToWork',
    cscsCard: 'cscsCard',
    photoUrl: 'photoUrl',
  };

  Object.entries(directFields).forEach(([uiField, dbField]) => {
    if (uiData[uiField] !== undefined) mappedData[dbField] = uiData[uiField];
  });

  // ── Phone normalisation (single location) ────────────────────────────────
  if (uiData.phoneNumber !== undefined || uiData.phone !== undefined) {
    const trimmed = normalisePhone(uiData);
    if (!trimmed) throw new ServiceError(400, 'Phone number cannot be empty.');
    mappedData.phoneNumber = trimmed;
    logger.info(`[workerService] Mapped phone → phoneNumber: '${trimmed}'`);
  }

  // ── Special fields ────────────────────────────────────────────────────────
  if (uiData.cscsStatus !== undefined) mappedData.cscsStatus = uiData.cscsStatus;
  if (uiData.inductionCompleted !== undefined) mappedData.inductionCompleted = uiData.inductionCompleted;
  if (uiData.ipafStatus !== undefined) mappedData.ipafStatus = uiData.ipafStatus;
  if (uiData.asbestosAwareness !== undefined) mappedData.asbestosAwareness = Boolean(uiData.asbestosAwareness);
  if (uiData.manualHandling !== undefined) mappedData.manualHandling = Boolean(uiData.manualHandling);
  if (uiData.needsEvacuationAssistance !== undefined)
    mappedData.needsEvacuationAssistance = Boolean(uiData.needsEvacuationAssistance);

  (['workingAtHeight', 'isCheckedIn', 'hsRulesAccepted'] as const).forEach((f) => {
    if (uiData[f] !== undefined) mappedData[f] = uiData[f];
  });

  mappedData.updatedAt = new Date();

  // ── Zod validation ────────────────────────────────────────────────────────
  const validatedData = insertContractorWorkerSchema.partial().parse(mappedData);

  // Preserve fields that Zod may strip (not in shared schema)
  const preserveFields = [
    'inductionCompleted', 'ipafStatus', 'asbestosAwareness', 'manualHandling',
    'transportMethod', 'needsEvacuationAssistance', 'phoneNumber', 'photoUrl',
    'rightToWorkVerifiedBy', 'rightToWorkVerifiedAt',
  ];
  for (const f of preserveFields) {
    if (mappedData[f] !== undefined) (validatedData as any)[f] = mappedData[f];
  }

  // ── DB update ─────────────────────────────────────────────────────────────
  const context = simpleDatabaseService.createCustomerContext(ctx.actor, ctx.customerId);
  const currentWorker = await databaseService.getContractorWorkerById(context, workerId);
  if (!currentWorker) throw new ServiceError(404, 'Contractor worker not found');

  // Auto-stamp RTW verification when rightToWork changes to 'valid'
  const rtwVerified =
    (validatedData as any).rightToWork === 'valid' && currentWorker.rightToWork !== 'valid';
  if (rtwVerified) {
    (validatedData as any).rightToWorkVerifiedBy = ctx.actor;
    (validatedData as any).rightToWorkVerifiedAt = new Date();
    logger.info(`[workerService] RTW verification stamped for worker ${workerId} by ${ctx.actor}`);
  }

  const updatedWorker = await databaseService.updateContractorWorker(context, workerId, validatedData);
  if (!updatedWorker) throw new ServiceError(404, 'Contractor worker not found');

  // ── Consolidated audit note ────────────────────────────────────────────────
  await _writeUpdateAuditNote(ctx, workerId, currentWorker, validatedData, rtwVerified);

  return { worker: { ...updatedWorker } };
}

// ─── 3. archiveWorker ────────────────────────────────────────────────────────

export async function archiveWorker(
  ctx: WorkerServiceContext,
  workerId: string,
  reason?: string,
): Promise<void> {
  // Ensure archive columns exist (lazy migration)
  try {
    const schemaName = customerDbService.generateSchemaName(ctx.customerId);
    const pool = (ctx.db as any).$client ?? (ctx.db as any).session?.client;
    await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archived_by TEXT`);
    await pool.query(`ALTER TABLE "${schemaName}".contractor_workers ADD COLUMN IF NOT EXISTS archive_reason TEXT`);
  } catch (migErr) {
    logger.warn('[workerService] Archive migration warning (non-fatal):', migErr);
  }

  const [worker] = await ctx.db
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId))
    .limit(1);

  if (!worker) throw new ServiceError(404, 'Worker not found');
  if (!worker.isActive) throw new ServiceError(400, 'Worker is already archived.');

  await ctx.db.execute(sql`
    UPDATE contractor_workers
    SET is_active = false,
        archived_at = NOW(),
        archived_by = ${ctx.actor},
        archive_reason = ${reason || null},
        updated_at = NOW()
    WHERE id = ${workerId}
  `);

  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'worker_archived',
      notes: `Worker archived by ${ctx.actor}.${reason ? ` Reason: ${reason}` : ''}`,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write archive audit note:', noteErr);
  }
}

// ─── 4. unarchiveWorker ──────────────────────────────────────────────────────

export async function unarchiveWorker(
  ctx: WorkerServiceContext,
  workerId: string,
): Promise<void> {
  const [worker] = await ctx.db
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId))
    .limit(1);

  if (!worker) throw new ServiceError(404, 'Worker not found');

  await ctx.db.execute(sql`
    UPDATE contractor_workers
    SET is_active = true,
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        updated_at = NOW()
    WHERE id = ${workerId}
  `);

  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'worker_unarchived',
      notes: `Worker unarchived (reactivated) by ${ctx.actor}.`,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write unarchive audit note:', noteErr);
  }
}

// ─── 5. hardDeleteWorker ─────────────────────────────────────────────────────

/**
 * Permanently delete a worker and all child records.
 * `confirmName` must exactly match the worker's full name.
 * Returns `{ fullName }` on success.
 */
export async function hardDeleteWorker(
  ctx: WorkerServiceContext,
  workerId: string,
  confirmName?: string,
): Promise<{ fullName: string }> {
  const [worker] = await ctx.db
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId))
    .limit(1);

  if (!worker) throw new ServiceError(404, 'Worker not found');

  const fullName = `${worker.firstName} ${worker.lastName}`;
  if (!confirmName || confirmName.trim() !== fullName.trim()) {
    throw new ServiceError(
      400,
      `Name confirmation required. Please type "${fullName}" to confirm deletion.`,
      { expectedName: fullName },
    );
  }

  // Company-level audit note before deletion
  try {
    await ctx.db.insert(isolatedSchema.companyNotes).values({
      companyId: worker.companyId,
      changeType: 'worker_deleted',
      notes: `Worker "${fullName}" permanently deleted by ${ctx.actor}. All records purged.`,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write deletion company note:', noteErr);
  }

  // Delete all child rows then the worker (in a transaction)
  await ctx.db.transaction(async (tx: any) => {
    await tx.delete(isolatedSchema.workerDocumentAcceptances)
      .where(eq(isolatedSchema.workerDocumentAcceptances.workerId, workerId));
    await tx.delete(isolatedSchema.workerDocumentAssignments)
      .where(eq(isolatedSchema.workerDocumentAssignments.workerId, workerId));
    await tx.delete(isolatedSchema.workerNotes)
      .where(eq(isolatedSchema.workerNotes.workerId, workerId));
    await tx.delete(isolatedSchema.cardIssues)
      .where(eq(isolatedSchema.cardIssues.workerId, workerId));
    await tx.delete(isolatedSchema.contractorVisits)
      .where(eq(isolatedSchema.contractorVisits.workerId, workerId));
    await tx.delete(isolatedSchema.contractorDocuments)
      .where(eq(isolatedSchema.contractorDocuments.workerId, workerId));
    await tx.delete(isolatedSchema.workerCompetencies)
      .where(eq(isolatedSchema.workerCompetencies.workerId, workerId));
    await tx.delete(isolatedSchema.nvqQualifications)
      .where(eq(isolatedSchema.nvqQualifications.workerId, workerId));
    await tx.delete(isolatedSchema.workerCertifications)
      .where(eq(isolatedSchema.workerCertifications.workerId, workerId));
    await tx.delete(isolatedSchema.co2Records)
      .where(eq(isolatedSchema.co2Records.workerId, workerId));
    await tx.delete(isolatedSchema.co2EmissionsData)
      .where(eq(isolatedSchema.co2EmissionsData.workerId, workerId));
    await tx.delete(isolatedSchema.localLabourRecords)
      .where(eq(isolatedSchema.localLabourRecords.workerId, workerId));
    // inductionTokens has nullable workerId — SET NULL rather than hard-delete
    await tx.execute(sql`UPDATE induction_tokens SET worker_id = NULL WHERE worker_id = ${workerId}`);
    await tx.delete(isolatedSchema.contractorWorkers)
      .where(eq(isolatedSchema.contractorWorkers.id, workerId));
  });

  return { fullName };
}

// ─── 6. issueCard ────────────────────────────────────────────────────────────

/**
 * Issue a disciplinary card (yellow or red) to a worker.
 * Returns the created cardIssue record.
 * NOTE: email notification is fired by the route handler (async, non-blocking).
 */
export async function issueCard(
  ctx: WorkerServiceContext,
  cardData: Record<string, any>,
): Promise<any> {
  const context = simpleDatabaseService.createCustomerContext(ctx.actor, ctx.customerId);
  const issue = await databaseService.createCardIssue(context, cardData);

  logger.info(`[workerService] Card issue created for worker ${cardData.workerId} customer ${ctx.customerId}`);

  // Audit note
  try {
    const { workerId, offenceId, cardType, description, location, witness } = cardData;
    const cardLabel = cardType === 'red' ? '🔴 Red' : '🟡 Yellow';

    let offenceName: string | null = null;
    if (offenceId) {
      try {
        const [offence] = await ctx.db
          .select({ offenceName: isolatedSchema.cardOffences.offenceName })
          .from(isolatedSchema.cardOffences)
          .where(eq(isolatedSchema.cardOffences.id, offenceId))
          .limit(1);
        if (offence) offenceName = offence.offenceName;
      } catch (_) {}
    }

    const noteText = [
      `${cardLabel} card issued by ${ctx.actor}.`,
      offenceName ? `Offence: ${offenceName}` : null,
      description ? `Description: ${description}` : null,
      location ? `Location: ${location}` : null,
      witness ? `Witness: ${witness}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'card_issued',
      oldValue: 'clear',
      newValue: cardType,
      notes: noteText,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write card-issue audit note (non-blocking):', noteErr);
  }

  return issue;
}

// ─── 7. revokeCard ───────────────────────────────────────────────────────────

/**
 * Reset a worker's disciplinary card status (e.g. red → yellow, yellow → clear).
 */
export async function revokeCard(
  ctx: WorkerServiceContext,
  workerId: string,
  newStatus: string,
): Promise<void> {
  // Fetch current status for the audit note
  const [current] = await ctx.db
    .select({ currentCardStatus: isolatedSchema.contractorWorkers.currentCardStatus })
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId))
    .limit(1);

  if (!current) throw new ServiceError(404, 'Worker not found');

  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ currentCardStatus: newStatus, updatedAt: new Date() })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));

  const { dateStr, timeStr } = nowLabel();
  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'card_issued',
      oldValue: current.currentCardStatus || 'unknown',
      newValue: newStatus,
      notes: `🟡 Card status reset to ${newStatus} by ${ctx.actor} on ${dateStr} at ${timeStr}. Previous status: ${current.currentCardStatus || 'unknown'}.`,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write card-reset audit note:', noteErr);
  }
}

// ─── 8. checkInWorker ────────────────────────────────────────────────────────

/**
 * Stamp check-in fields on a worker record.
 *
 * Designed to be called both standalone and from inside a drizzle transaction —
 * pass the transaction object as `ctx.db` to enrol in the outer transaction.
 */
export async function checkInWorker(
  ctx: WorkerServiceContext,
  workerId: string,
  data: {
    isCheckedIn: boolean;
    checkedInAt?: Date;
    qrCode?: string;
    hsRulesAccepted?: boolean;
    hsRulesAcceptedAt?: Date | null;
    ndaAccepted?: boolean;
    ndaAcceptedAt?: Date | null;
  },
): Promise<void> {
  const set: Record<string, any> = {
    isCheckedIn: data.isCheckedIn,
    checkedInAt: data.checkedInAt ?? new Date(),
    updatedAt: new Date(),
  };
  if (data.qrCode !== undefined) set.qrCode = data.qrCode;
  if (data.hsRulesAccepted !== undefined) set.hsRulesAccepted = data.hsRulesAccepted;
  if (data.hsRulesAcceptedAt !== undefined) set.hsRulesAcceptedAt = data.hsRulesAcceptedAt;
  if (data.ndaAccepted !== undefined) set.ndaAccepted = data.ndaAccepted;
  if (data.ndaAcceptedAt !== undefined) set.ndaAcceptedAt = data.ndaAcceptedAt;

  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set(set)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── 9. clearLoneWorkerState ─────────────────────────────────────────────────

/**
 * Clear lone-worker tracking fields on a worker record (called on check-out).
 */
export async function clearLoneWorkerState(
  ctx: WorkerServiceContext,
  workerId: string,
): Promise<void> {
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({
      isLoneWorker: false,
      loneWorkerSince: null,
      loneWorkerDeadline: null,
      loneWorkerEscalationLevel: 0,
      updatedAt: new Date(),
    })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── 10. markInductionCompleted ──────────────────────────────────────────────

/**
 * Mark a worker's site induction as completed.
 *
 * Designed to be called from inside a drizzle transaction — pass `tx` as
 * `ctx.db` to enrol in the outer transaction.
 */
export async function markInductionCompleted(
  ctx: WorkerServiceContext,
  workerId: string,
  completedAt?: Date,
): Promise<void> {
  const now = completedAt ?? new Date();
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ siteInductionCompleted: true, siteInductionCompletedAt: now })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── 11. correctCardStatus ───────────────────────────────────────────────────

/**
 * Directly set a worker's currentCardStatus (admin migration / correction).
 * Writes an audit note recording the phantom-status correction.
 */
export async function correctCardStatus(
  ctx: WorkerServiceContext,
  workerId: string,
  newStatus: string,
  oldStatus: string,
): Promise<void> {
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ currentCardStatus: newStatus, updatedAt: new Date() })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));

  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'card_status_correction',
      oldValue: oldStatus,
      newValue: newStatus,
      notes: `Automatic migration: phantom ${oldStatus} card reset to ${newStatus} (no active card_issues record found)`,
      changedBy: ctx.actor || 'system',
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write card-correction audit note:', noteErr);
  }
}

// ─── 12. persistQrCode ───────────────────────────────────────────────────────

/**
 * Persist a worker's QR-code identifier on first generation.
 * Called when a QR pass is requested and the worker has no code yet.
 */
export async function persistQrCode(
  ctx: WorkerServiceContext,
  workerId: string,
  qrCode: string,
): Promise<void> {
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ qrCode, updatedAt: new Date() })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── 13. persistHsToken ──────────────────────────────────────────────────────

/**
 * Persist a worker's H&S acceptance token on first generation.
 * Called during check-in e-pass dispatch when no token yet exists.
 */
export async function persistHsToken(
  ctx: WorkerServiceContext,
  workerId: string,
  token: string,
): Promise<void> {
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ hsRulesAcceptanceToken: token, updatedAt: new Date() })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── 14. checkOutWorker ──────────────────────────────────────────────────────

/**
 * Stamp check-out fields on a worker record.
 * Returns the updated worker.
 */
export async function checkOutWorker(
  ctx: WorkerServiceContext,
  workerId: string,
  opts?: { checkoutType?: string },
): Promise<any> {
  const checkOutTime = new Date();
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ isCheckedIn: false, checkedOutAt: checkOutTime, updatedAt: checkOutTime })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));

  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId,
      changeType: 'check_out',
      oldValue: 'Checked In',
      newValue: 'Checked Out',
      notes: `Checked out${opts?.checkoutType ? ` (${opts.checkoutType})` : ''}`,
      changedBy: ctx.actor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Failed to write check-out audit note:', noteErr);
  }

  const [updated] = await ctx.db
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId))
    .limit(1);
  return updated ?? null;
}

// ─── 15. updateWorkerPostcode ────────────────────────────────────────────────

/**
 * Update a worker's stored postcode (called from transport/CO2 endpoint).
 */
export async function updateWorkerPostcode(
  ctx: WorkerServiceContext,
  workerId: string,
  postcode: string,
): Promise<void> {
  await ctx.db
    .update(isolatedSchema.contractorWorkers)
    .set({ postcode, updatedAt: new Date() })
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));
}

// ─── Private audit-note helpers ───────────────────────────────────────────────

async function _writeAdminCreateNotes(
  ctx: WorkerServiceContext,
  worker: any,
  workerData: any,
  body: any,
): Promise<void> {
  try {
    const auditTs = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });

    const transportLabels: Record<string, string> = {
      car_diesel: 'Car (diesel)', car_petrol: 'Car (petrol)', electric_car: 'Electric car',
      public_transport: 'Public transport', motorcycle: 'Motorcycle',
    };

    // Note 1 — personal details
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'worker_created',
      notes: `Worker profile created by ${ctx.actor} on ${auditTs}. Personal details recorded — Name: ${workerData.firstName} ${workerData.lastName}, Email: ${workerData.email || '—'}, Phone: ${workerData.phoneNumber || '—'}, Postcode: ${body.postcode || '—'}, Transport: ${transportLabels[body.transportMethod] || body.transportMethod || '—'}.`,
      changedBy: ctx.actor,
    });

    // Note 2 — compliance
    const rtwLabel: Record<string, string> = { valid: 'Valid ✅', pending: 'Pending ⏳', expired: 'Expired ❌', not_required: 'Not required' };
    const cardLabel: Record<string, string> = { valid: 'Valid ✅', pending: 'Pending ⏳', expired: 'Expired ❌', none: 'Not held' };
    const rtwExpiry = workerData.rightToWorkExpiryDate
      ? ` (expiry: ${new Date(workerData.rightToWorkExpiryDate).toLocaleDateString('en-GB')})`
      : '';
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'compliance_recorded',
      notes: `Compliance data recorded by ${ctx.actor} on ${auditTs}. Right to Work: ${rtwLabel[workerData.rightToWork || ''] || workerData.rightToWork || '—'}${rtwExpiry}. CSCS: ${cardLabel[workerData.cscsStatus || ''] || workerData.cscsStatus || '—'}${workerData.cscsCard ? ` (card no. ${workerData.cscsCard})` : ''}. IPAF: ${cardLabel[workerData.ipafStatus || ''] || workerData.ipafStatus || '—'}.`,
      changedBy: ctx.actor,
    });

    // Note 3 — training
    const certs: string[] = [];
    if (workerData.asbestosAwareness) certs.push('Asbestos Awareness');
    if (workerData.manualHandling) certs.push('Manual Handling');
    if (workerData.workingAtHeight) certs.push('Working at Height');
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'training_recorded',
      notes: `Training data recorded by ${ctx.actor} on ${auditTs}. Certificates declared: ${certs.length > 0 ? certs.join(', ') : 'None'}. Site induction: ${workerData.siteInductionCompleted ? `Completed (confirmed by ${ctx.actor})` : 'Not yet completed'}.`,
      changedBy: ctx.actor,
    });

    // Company audit note
    await ctx.db.insert(isolatedSchema.companyNotes).values({
      companyId: workerData.companyId,
      changeType: 'worker_added',
      notes: `Worker "${workerData.firstName} ${workerData.lastName}" added by ${ctx.actor} on ${auditTs}`,
      changedBy: ctx.actor,
    });

    // Optional induction confirmation note
    if (workerData.siteInductionCompleted) {
      await ctx.db.insert(isolatedSchema.workerNotes).values({
        workerId: worker.id,
        changeType: 'induction_confirmed',
        notes: `Site induction confirmed by ${ctx.actor} on ${auditTs}`,
        changedBy: ctx.actor,
      });
    }
  } catch (auditErr) {
    logger.error('[workerService] Failed to create worker audit note (continuing):', auditErr);
  }
}

async function _writePortalCreateNotes(
  ctx: WorkerServiceContext,
  worker: any,
  body: any,
  normalisedPhone: string,
): Promise<void> {
  const portalActor = `portal:${ctx.actor}`;
  const auditNow = new Date();
  const auditTs =
    auditNow.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    auditNow.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  try {
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'worker_created',
      notes: `Worker profile created via contractor portal by ${ctx.actor} on ${auditTs}. Personal details recorded — Name: ${worker.firstName} ${worker.lastName}, Email: ${worker.email || '—'}, Phone: ${normalisedPhone || '—'}${body.jobTitle ? `, Job title: ${String(body.jobTitle).trim()}` : ''}${body.trade ? `, Trade: ${String(body.trade).trim()}` : ''}.`,
      changedBy: portalActor,
    });
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'compliance_recorded',
      notes: `Compliance data recorded via contractor portal on ${auditTs}. Right to Work: Pending ⏳. CSCS: Pending ⏳. IPAF: Not held. (To be verified by site admin.)`,
      changedBy: portalActor,
    });
    await ctx.db.insert(isolatedSchema.workerNotes).values({
      workerId: worker.id,
      changeType: 'training_recorded',
      notes: `Training data recorded via contractor portal on ${auditTs}. Certificates declared: None. Site induction: Not yet completed.`,
      changedBy: portalActor,
    });
    await ctx.db.insert(isolatedSchema.companyNotes).values({
      companyId: worker.companyId,
      changeType: 'worker_added',
      notes: `Worker "${worker.firstName} ${worker.lastName}" added via contractor portal by ${ctx.actor} on ${auditTs}`,
      changedBy: portalActor,
    });
  } catch (noteErr) {
    logger.error('[workerService] Portal add-worker: failed to create audit notes:', noteErr);
  }
}

async function _writeUpdateAuditNote(
  ctx: WorkerServiceContext,
  workerId: string,
  currentWorker: any,
  validatedData: any,
  rtwVerified: boolean,
): Promise<void> {
  const auditFieldLabels: Record<string, string> = {
    firstName: 'First Name', lastName: 'Last Name', email: 'Email',
    mobileNumber: 'Mobile Number', phoneNumber: 'Phone Number',
    homeAddress: 'Home Address', postcode: 'Postcode',
    jobTitle: 'Job Title', department: 'Department', trade: 'Trade',
    transportMethod: 'Transport Method',
    emergencyContactName: 'Emergency Contact Name',
    emergencyContactPhone: 'Emergency Contact Phone',
    emergencyContactRelationship: 'Emergency Contact Relationship',
    companyId: 'Contractor Company', rightToWork: 'Right to Work Status',
    rightToWorkExpiryDate: 'RTW Expiry Date',
    rightToWorkVerifiedBy: 'RTW Verified By', rightToWorkVerifiedAt: 'RTW Verified At',
    cscsCard: 'CSCS Card Number', cscsStatus: 'CSCS Status', ipafStatus: 'IPAF Status',
    asbestosAwareness: 'Asbestos Awareness', manualHandling: 'Manual Handling',
    inductionCompleted: 'Site Induction Completed', workingAtHeight: 'Working at Height',
    isActive: 'Active Status', currentCardStatus: 'Card Status', hsRulesAccepted: 'H&S Rules Accepted',
    needsEvacuationAssistance: 'Evacuation Assistance',
    photoUrl: 'Profile Photo',
  };

  const trainingConfirmFields = new Set([
    'inductionCompleted', 'asbestosAwareness', 'manualHandling', 'workingAtHeight',
    'hsRulesAccepted', 'needsEvacuationAssistance',
  ]);

  const auditSkipFields = new Set([
    'id', 'createdAt', 'updatedAt', 'hsRulesAcceptanceToken', 'inductionToken',
    'redCardBanUntil', 'siteInductionCompleted',
  ]);

  const fieldsToCheck = { ...(validatedData as any) };
  if (rtwVerified) {
    fieldsToCheck.rightToWorkVerifiedBy = ctx.actor;
    fieldsToCheck.rightToWorkVerifiedAt = (validatedData as any).rightToWorkVerifiedAt;
  }

  const changeLines: string[] = [];
  for (const field of Object.keys(fieldsToCheck)) {
    if (auditSkipFields.has(field)) continue;
    const oldStr = (currentWorker as any)[field] == null ? 'Not set' : String((currentWorker as any)[field]);
    const newStr = fieldsToCheck[field] == null ? 'Not set' : String(fieldsToCheck[field]);
    if (oldStr !== newStr) {
      const label = auditFieldLabels[field] ?? field;
      if (trainingConfirmFields.has(field) && (newStr === 'true' || newStr === 'false')) {
        changeLines.push(newStr === 'true' ? `✅ ${label} confirmed` : `❌ ${label} record removed`);
      } else {
        changeLines.push(`${label}: "${oldStr}" → "${newStr}"`);
      }
    }
  }

  if (changeLines.length > 0) {
    const { ts } = nowLabel();
    const noteText = `Profile updated by ${ctx.actor} on ${ts}. Changes: ${changeLines.join('; ')}.`;
    try {
      await ctx.db.insert(isolatedSchema.workerNotes).values({
        workerId, changeType: 'profile_update', notes: noteText, changedBy: ctx.actor,
      });
    } catch (noteErr) {
      logger.error('[workerService] Failed to create consolidated profile audit note:', noteErr);
    }
    logger.info(`[workerService] AUDIT: ${changeLines.length} change(s) by ${ctx.actor}: ${changeLines.join(', ')}`);
  }
}
