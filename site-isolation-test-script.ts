/**
 * SITE ISOLATION TEST SCRIPT — Enterprise Multi-Site Phase 1c
 *
 * ⚠️  SECURITY: Only runs in development/test environments.
 *     All credentials from environment variables — never hardcoded.
 *     Run only against test/dev customers, never live data.
 *
 * Tests cross-site data isolation inside one enterprise customer account.
 * Verifies the siteScope.ts security spine (Phase 1b) holds for all 34
 * site-scoped tables.
 *
 * Usage:
 *   npx tsx site-isolation-test-script.ts
 *
 * Or add to package.json scripts:
 *   "test:site-isolation": "tsx site-isolation-test-script.ts"
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more isolation breaches or script errors
 */

import { CustomerDatabaseService } from './server/customerDatabase';
import { scopedWhere, withSiteId } from './server/siteScope';
import type { SiteContext } from './server/siteScope';
import { eq, and, sql } from 'drizzle-orm';
import * as S from './server/isolatedSchema';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Safety guard
// ─────────────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.error('🚨 SECURITY: Site isolation test cannot run in production');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enterprise test customer. Override via SITE_ISO_TEST_CUSTOMER_ID env var.
 * Defaults to the 'ACS Safety & Security Ltd' dev customer (dev-customer-001).
 * The script tests the DATA-LAYER filtering directly; the customer does not need
 * the is_enterprise flag set — we pass enterprise SiteContext explicitly.
 * All test data is namespaced under RUN_ID and cleaned up afterwards.
 */
const ENTERPRISE_CUSTOMER_ID =
  process.env.SITE_ISO_TEST_CUSTOMER_ID || 'dev-customer-001';

/**
 * Non-enterprise test customer (single-site). Override via SITE_ISO_NON_ENT_CUSTOMER_ID.
 * Used for the regression test that proves non-enterprise customers are unaffected.
 * Defaults to the 'Customer Two' dev customer (dev-customer-002).
 */
const NON_ENTERPRISE_CUSTOMER_ID =
  process.env.SITE_ISO_NON_ENT_CUSTOMER_ID || 'dev-customer-002';

/** Unique run token — every test record is stamped with this so cleanup is safe. */
const RUN_ID = `SITE-ISO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TableResult {
  table: string;
  pass: boolean;
  error?: string;
}

interface TestRun {
  siteAId: string;
  siteBId: string;
  /** All IDs inserted by this test run, keyed by table name for targeted cleanup. */
  insertedIds: Map<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID();
}

function label(prefix: string, site: 'A' | 'B') {
  return `${RUN_ID}-${prefix}-${site}`;
}

function pass(table: string): TableResult {
  return { table, pass: true };
}

function fail(table: string, reason: string): TableResult {
  return { table, pass: false, error: reason };
}

/** Build a SiteContext for enterprise mode with a specific active site. */
function enterpriseCtx(activeSiteId: string): SiteContext {
  return { isEnterprise: true, activeSiteId, allowedSiteIds: [activeSiteId] };
}

/** Build a SiteContext for non-enterprise mode. */
function nonEnterpriseCtx(): SiteContext {
  return { isEnterprise: false, activeSiteId: null, allowedSiteIds: 'all' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup — create two test sites
// ─────────────────────────────────────────────────────────────────────────────

async function setupTestSites(db: any): Promise<{ siteAId: string; siteBId: string }> {
  const [siteA] = await db.insert(S.sites).values({
    name: `${RUN_ID}-Site-A`,
    reference: `${RUN_ID}-A`,
    status: 'active',
    isDefault: false,
  }).returning({ id: S.sites.id });

  const [siteB] = await db.insert(S.sites).values({
    name: `${RUN_ID}-Site-B`,
    reference: `${RUN_ID}-B`,
    status: 'active',
    isDefault: false,
  }).returning({ id: S.sites.id });

  return { siteAId: siteA.id, siteBId: siteB.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prerequisite records (needed as FKs for some tables)
// ─────────────────────────────────────────────────────────────────────────────

interface Prerequisites {
  contractorCompanyAId: string;
  contractorCompanyBId: string;
  contractorWorkerAId: string;
  contractorWorkerBId: string;
  meetingRoomAId: string;
  meetingRoomBId: string;
  certTypeId: string;
  visitorAId: string;
  visitorBId: string;
  staffAId: string;
  staffBId: string;
  systemUserId: string | null;
}

async function setupPrerequisites(
  db: any,
  siteAId: string,
  siteBId: string,
  ids: Map<string, string[]>,
): Promise<Prerequisites> {

  const track = (table: string, id: string) => {
    const arr = ids.get(table) ?? [];
    arr.push(id);
    ids.set(table, arr);
    return id;
  };

  // Contractor companies (one per site)
  const [ccA] = await db.insert(S.contractorCompanies).values(withSiteId(siteAId, {
    companyName: label('CoA', 'A'),
    contactEmail: `${RUN_ID}-a@test.invalid`,
    contactFirstName: 'TestA',
    contactLastName: 'CompanyA',
  })).returning({ id: S.contractorCompanies.id });
  track('contractorCompanies', ccA.id);

  const [ccB] = await db.insert(S.contractorCompanies).values(withSiteId(siteBId, {
    companyName: label('CoB', 'B'),
    contactEmail: `${RUN_ID}-b@test.invalid`,
    contactFirstName: 'TestB',
    contactLastName: 'CompanyB',
  })).returning({ id: S.contractorCompanies.id });
  track('contractorCompanies', ccB.id);

  // Look up an existing user for uploadedBy FK on contractor_documents
  const existingUsers = await db.select({ id: S.users.id }).from(S.users).limit(1);
  const systemUserId = existingUsers[0]?.id ?? null;

  // Contractor workers
  const [cwA] = await db.insert(S.contractorWorkers).values(withSiteId(siteAId, {
    companyId: ccA.id,
    firstName: label('WorkerA', 'A'),
    lastName: 'Test',
  })).returning({ id: S.contractorWorkers.id });
  track('contractorWorkers', cwA.id);

  const [cwB] = await db.insert(S.contractorWorkers).values(withSiteId(siteBId, {
    companyId: ccB.id,
    firstName: label('WorkerB', 'B'),
    lastName: 'Test',
  })).returning({ id: S.contractorWorkers.id });
  track('contractorWorkers', cwB.id);

  // Meeting rooms
  const [mrA] = await db.insert(S.meetingRooms).values(withSiteId(siteAId, {
    name: label('RoomA', 'A'),
    capacity: 10,
  })).returning({ id: S.meetingRooms.id });
  track('meetingRooms', mrA.id);

  const [mrB] = await db.insert(S.meetingRooms).values(withSiteId(siteBId, {
    name: label('RoomB', 'B'),
    capacity: 10,
  })).returning({ id: S.meetingRooms.id });
  track('meetingRooms', mrB.id);

  // Compliance certificate type (shared — not site-scoped itself)
  const [ct] = await db.insert(S.complianceCertificateTypes).values({
    certificateType: label('CertType', 'A'),
    displayName: label('CertType', 'A'),
    frequency: 'annual',
    reminderDaysBefore: 30,
  }).returning({ id: S.complianceCertificateTypes.id });
  ids.set('complianceCertificateTypes', [ct.id]);

  // Visitors (for visitor_history FK)
  const [vA] = await db.insert(S.visitors).values(withSiteId(siteAId, {
    firstName: label('VisitorA', 'A'),
    lastName: 'Test',
    qrCode: label('qr-visitor-A', 'A'),
  })).returning({ id: S.visitors.id });
  track('visitors', vA.id);

  const [vB] = await db.insert(S.visitors).values(withSiteId(siteBId, {
    firstName: label('VisitorB', 'B'),
    lastName: 'Test',
    qrCode: label('qr-visitor-B', 'B'),
  })).returning({ id: S.visitors.id });
  track('visitors', vB.id);

  // Staff (for staff_attendance_history FK)
  const [stA] = await db.insert(S.staff).values(withSiteId(siteAId, {
    firstName: label('StaffA', 'A'),
    lastName: 'Test',
    email: `${RUN_ID}-staffA@test.invalid`,
    department: 'Testing',
    employeeId: label('EMP-A', 'A'),
    accessLevel: 'staff',
  })).returning({ id: S.staff.id });
  track('staff', stA.id);

  const [stB] = await db.insert(S.staff).values(withSiteId(siteBId, {
    firstName: label('StaffB', 'B'),
    lastName: 'Test',
    email: `${RUN_ID}-staffB@test.invalid`,
    department: 'Testing',
    employeeId: label('EMP-B', 'B'),
    accessLevel: 'staff',
  })).returning({ id: S.staff.id });
  track('staff', stB.id);

  return {
    contractorCompanyAId: ccA.id,
    contractorCompanyBId: ccB.id,
    contractorWorkerAId: cwA.id,
    contractorWorkerBId: cwB.id,
    meetingRoomAId: mrA.id,
    meetingRoomBId: mrB.id,
    certTypeId: ct.id,
    visitorAId: vA.id,
    visitorBId: vB.id,
    staffAId: stA.id,
    staffBId: stB.id,
    systemUserId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core isolation test helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert one record at Site A, one at Site B, then verify:
 *  1. Querying with active site = A only returns the A record.
 *  2. Querying with active site = B only returns the B record.
 *  3. A write stamped from Site A context always has siteId = A (never B or null).
 *
 * Returns pass/fail plus tracks inserted IDs for cleanup.
 */
async function testTableIsolation<TTable extends { siteId: any; id: any }>(opts: {
  tableName: string;
  table: TTable;
  db: any;
  siteAId: string;
  siteBId: string;
  valuesA: Record<string, any>;
  valuesB: Record<string, any>;
  ids: Map<string, string[]>;
}): Promise<TableResult> {
  const { tableName, table, db, siteAId, siteBId, valuesA, valuesB, ids } = opts;

  try {
    // ── 1. INSERT ────────────────────────────────────────────────────────────

    const [recA] = await db
      .insert(table)
      .values(withSiteId(siteAId, valuesA))
      .returning({ id: table.id, siteId: table.siteId });

    const [recB] = await db
      .insert(table)
      .values(withSiteId(siteBId, valuesB))
      .returning({ id: table.id, siteId: table.siteId });

    // Track for cleanup
    const arr = ids.get(tableName) ?? [];
    arr.push(recA.id, recB.id);
    ids.set(tableName, arr);

    // ── 2. WRITE STAMP CHECK ─────────────────────────────────────────────────

    if (recA.siteId !== siteAId) {
      return fail(tableName, `Write stamp incorrect: expected siteId=${siteAId}, got ${recA.siteId}`);
    }
    if (recB.siteId !== siteBId) {
      return fail(tableName, `Write stamp incorrect: expected siteId=${siteBId}, got ${recB.siteId}`);
    }

    // ── 3. READ ISOLATION — Site A context ───────────────────────────────────

    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, table);

    const rowsAsSeenFromSiteA = await db
      .select({ id: table.id, siteId: table.siteId })
      .from(table)
      .where(and(filterA, eq(table.id, recB.id)));

    if (rowsAsSeenFromSiteA.length > 0) {
      return fail(
        tableName,
        `ISOLATION BREACH: Site A context can see Site B record (id=${recB.id})`,
      );
    }

    // Confirm Site A's own record IS visible from Site A
    const ownRowFromA = await db
      .select({ id: table.id })
      .from(table)
      .where(and(filterA, eq(table.id, recA.id)));

    if (ownRowFromA.length === 0) {
      return fail(tableName, `Site A record not visible from Site A context — scoping is too aggressive`);
    }

    // ── 4. READ ISOLATION — Site B context ───────────────────────────────────

    const ctxB = enterpriseCtx(siteBId);
    const filterB = scopedWhere(ctxB, table);

    const rowsAsSeenFromSiteB = await db
      .select({ id: table.id, siteId: table.siteId })
      .from(table)
      .where(and(filterB, eq(table.id, recA.id)));

    if (rowsAsSeenFromSiteB.length > 0) {
      return fail(
        tableName,
        `ISOLATION BREACH: Site B context can see Site A record (id=${recA.id})`,
      );
    }

    // Confirm Site B's own record IS visible from Site B
    const ownRowFromB = await db
      .select({ id: table.id })
      .from(table)
      .where(and(filterB, eq(table.id, recB.id)));

    if (ownRowFromB.length === 0) {
      return fail(tableName, `Site B record not visible from Site B context — scoping is too aggressive`);
    }

    return pass(tableName);
  } catch (err: any) {
    return fail(tableName, `Unexpected error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw-SQL isolation test — for tables where Drizzle schema has columns the
// actual DB doesn't have yet (migration drift). Uses parameterised raw SQL for
// the INSERT so only real DB columns are referenced, then re-uses the normal
// Drizzle scoped-query path for the isolation assertion.
// ─────────────────────────────────────────────────────────────────────────────

async function testTableIsolationRaw<TTable extends { siteId: any; id: any }>(opts: {
  tableName: string;
  dbTable: string;          // actual SQL table name (snake_case)
  table: TTable;            // Drizzle table (for scoped-where queries)
  db: any;
  siteAId: string;
  siteBId: string;
  insertSqlA: string;       // raw INSERT SQL for site A — must RETURNING id, site_id
  insertSqlB: string;       // raw INSERT SQL for site B
  ids: Map<string, string[]>;
}): Promise<TableResult> {
  const { tableName, dbTable, table, db, siteAId, siteBId, insertSqlA, insertSqlB, ids } = opts;
  try {
    // 1. INSERT via raw SQL
    const resA = await db.execute(sql.raw(insertSqlA));
    const resB = await db.execute(sql.raw(insertSqlB));

    const recA = resA.rows[0] as { id: string; site_id: string };
    const recB = resB.rows[0] as { id: string; site_id: string };

    if (!recA?.id || !recB?.id) {
      return fail(tableName, `Raw insert returned no id — check SQL`);
    }

    // Track for cleanup
    const arr = ids.get(tableName) ?? [];
    arr.push(recA.id, recB.id);
    ids.set(tableName, arr);

    // 2. WRITE STAMP
    if (recA.site_id !== siteAId) return fail(tableName, `Write stamp wrong: expected ${siteAId} got ${recA.site_id}`);
    if (recB.site_id !== siteBId) return fail(tableName, `Write stamp wrong: expected ${siteBId} got ${recB.site_id}`);

    // 3. READ ISOLATION — Site A context must not see Site B record
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, table);
    const breachA = await db.select({ id: table.id }).from(table).where(and(filterA, eq(table.id, recB.id)));
    if (breachA.length > 0) return fail(tableName, `ISOLATION BREACH: Site A context can see Site B record (id=${recB.id})`);

    const ownA = await db.select({ id: table.id }).from(table).where(and(filterA, eq(table.id, recA.id)));
    if (ownA.length === 0) return fail(tableName, `Site A record not visible from Site A context — scoping too aggressive`);

    // 4. READ ISOLATION — Site B context must not see Site A record
    const ctxB = enterpriseCtx(siteBId);
    const filterB = scopedWhere(ctxB, table);
    const breachB = await db.select({ id: table.id }).from(table).where(and(filterB, eq(table.id, recA.id)));
    if (breachB.length > 0) return fail(tableName, `ISOLATION BREACH: Site B context can see Site A record (id=${recA.id})`);

    const ownB = await db.select({ id: table.id }).from(table).where(and(filterB, eq(table.id, recB.id)));
    if (ownB.length === 0) return fail(tableName, `Site B record not visible from Site B context — scoping too aggressive`);

    return pass(tableName);
  } catch (err: any) {
    return fail(tableName, `Unexpected error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all 34 table tests
// ─────────────────────────────────────────────────────────────────────────────

async function runSiteIsolationTests(
  db: any,
  run: TestRun,
  prereqs: Prerequisites,
): Promise<TableResult[]> {
  const results: TableResult[] = [];
  const { siteAId, siteBId, insertedIds } = run;
  const t = (name: string, table: any, valA: any, valB: any) =>
    testTableIsolation({ tableName: name, table, db, siteAId, siteBId, valuesA: valA, valuesB: valB, ids: insertedIds });

  const rawT = (name: string, dbTable: string, table: any, sqlA: string, sqlB: string) =>
    testTableIsolationRaw({ tableName: name, dbTable, table, db, siteAId, siteBId, insertSqlA: sqlA, insertSqlB: sqlB, ids: insertedIds });

  // ── 1. staff (already inserted as prerequisites — test isolation of those rows) ──
  // We re-use the prereq staff rows; just verify isolation directly.
  try {
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, S.staff);
    const breach = await db.select({ id: S.staff.id }).from(S.staff)
      .where(and(filterA, eq(S.staff.id, prereqs.staffBId)));
    if (breach.length > 0) {
      results.push(fail('staff', `ISOLATION BREACH: Site A context sees Site B staff (id=${prereqs.staffBId})`));
    } else {
      results.push(pass('staff'));
    }
  } catch (e: any) {
    results.push(fail('staff', e.message));
  }

  // ── 2. visitors (prereq rows already tested implicitly; add explicit check) ──
  try {
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, S.visitors);
    const breach = await db.select({ id: S.visitors.id }).from(S.visitors)
      .where(and(filterA, eq(S.visitors.id, prereqs.visitorBId)));
    if (breach.length > 0) {
      results.push(fail('visitors', `ISOLATION BREACH: Site A context sees Site B visitor`));
    } else {
      results.push(pass('visitors'));
    }
  } catch (e: any) {
    results.push(fail('visitors', e.message));
  }

  // ── 3. members ────────────────────────────────────────────────────────────
  results.push(await t('members', S.members, {
    firstName: label('MemberA', 'A'), lastName: 'Test',
    qrCode: label('qr-member-A', 'A'),
  }, {
    firstName: label('MemberB', 'B'), lastName: 'Test',
    qrCode: label('qr-member-B', 'B'),
  }));

  // ── 4. visitor_history ────────────────────────────────────────────────────
  results.push(await t('visitorHistory', S.visitorHistory, {
    visitorId: prereqs.visitorAId,
    checkInTime: new Date(),
    hostName: label('HostA', 'A'),
  }, {
    visitorId: prereqs.visitorBId,
    checkInTime: new Date(),
    hostName: label('HostB', 'B'),
  }));

  // ── 5. staff_attendance_history ───────────────────────────────────────────
  // Uses rawT: Drizzle schema has extra columns not yet in real DB (migration drift)
  results.push(await rawT(
    'staffAttendanceHistory', 'staff_attendance_history', S.staffAttendanceHistory,
    `INSERT INTO staff_attendance_history (staff_id, check_in_time, site_id)
     VALUES ('${prereqs.staffAId}', NOW(), '${siteAId}')
     RETURNING id, site_id`,
    `INSERT INTO staff_attendance_history (staff_id, check_in_time, site_id)
     VALUES ('${prereqs.staffBId}', NOW(), '${siteBId}')
     RETURNING id, site_id`,
  ));

  // ── 6. pre_bookings ───────────────────────────────────────────────────────
  results.push(await t('preBookings', S.preBookings, {
    visitorFirstName: label('PreVisitA', 'A'), visitorLastName: 'Test',
    visitorEmail: `${RUN_ID}-prev-a@test.invalid`,
    visitDate: new Date(),
    qrCode: label('qr-pre-A', 'A'),
  }, {
    visitorFirstName: label('PreVisitB', 'B'), visitorLastName: 'Test',
    visitorEmail: `${RUN_ID}-prev-b@test.invalid`,
    visitDate: new Date(),
    qrCode: label('qr-pre-B', 'B'),
  }));

  // ── 7. departments ────────────────────────────────────────────────────────
  results.push(await t('departments', S.departments, {
    name: label('DeptA', 'A'),
  }, {
    name: label('DeptB', 'B'),
  }));

  // ── 8. muster_points ──────────────────────────────────────────────────────
  results.push(await t('musterPoints', S.musterPoints, {
    name: label('MusterA', 'A'),
  }, {
    name: label('MusterB', 'B'),
  }));

  // ── 9. evacuation_zones ───────────────────────────────────────────────────
  results.push(await t('evacuationZones', S.evacuationZones, {
    name: label('ZoneA', 'A'),
  }, {
    name: label('ZoneB', 'B'),
  }));

  // ── 10. safety_tokens ─────────────────────────────────────────────────────
  results.push(await t('safetyTokens', S.safetyTokens, {
    token: label('safety-tok-A', 'A'),
    evacuationId: label('evac-safety-A', 'A'),
    personId: prereqs.visitorAId,
    personType: 'visitor',
    personName: label('SafetyPersonA', 'A'),
    personEmail: `${RUN_ID}-safety-a@test.invalid`,
    expiresAt: new Date(Date.now() + 3600_000),
  }, {
    token: label('safety-tok-B', 'B'),
    evacuationId: label('evac-safety-B', 'B'),
    personId: prereqs.visitorBId,
    personType: 'visitor',
    personName: label('SafetyPersonB', 'B'),
    personEmail: `${RUN_ID}-safety-b@test.invalid`,
    expiresAt: new Date(Date.now() + 3600_000),
  }));

  // ── 11. contractor_companies (prereq rows tested explicitly) ──────────────
  try {
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, S.contractorCompanies);
    const breach = await db.select({ id: S.contractorCompanies.id }).from(S.contractorCompanies)
      .where(and(filterA, eq(S.contractorCompanies.id, prereqs.contractorCompanyBId)));
    if (breach.length > 0) {
      results.push(fail('contractorCompanies', `ISOLATION BREACH: Site A sees Site B contractor company`));
    } else {
      results.push(pass('contractorCompanies'));
    }
  } catch (e: any) {
    results.push(fail('contractorCompanies', e.message));
  }

  // ── 12. contractor_workers (prereq rows tested explicitly) ────────────────
  try {
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, S.contractorWorkers);
    const breach = await db.select({ id: S.contractorWorkers.id }).from(S.contractorWorkers)
      .where(and(filterA, eq(S.contractorWorkers.id, prereqs.contractorWorkerBId)));
    if (breach.length > 0) {
      results.push(fail('contractorWorkers', `ISOLATION BREACH: Site A sees Site B contractor worker`));
    } else {
      results.push(pass('contractorWorkers'));
    }
  } catch (e: any) {
    results.push(fail('contractorWorkers', e.message));
  }

  // ── 13. contractor_documents ──────────────────────────────────────────────
  results.push(await t('contractorDocuments', S.contractorDocuments, {
    companyId: prereqs.contractorCompanyAId,
    documentName: label('DocA', 'A'),
    documentUrl: 'https://test.invalid/a',
    documentType: 'insurance',
    uploadedBy: prereqs.systemUserId,
  }, {
    companyId: prereqs.contractorCompanyBId,
    documentName: label('DocB', 'B'),
    documentUrl: 'https://test.invalid/b',
    documentType: 'insurance',
    uploadedBy: prereqs.systemUserId,
  }));

  // ── 14. compliance_documents ──────────────────────────────────────────────
  // Uses rawT: real DB schema differs from isolatedSchema.ts (migration drift).
  // Real NOT-NULL cols: company_id, document_name, document_type, document_url.
  // document_category / is_required / validity_period_months etc. don't exist yet.
  results.push(await rawT(
    'complianceDocuments', 'compliance_documents', S.complianceDocuments,
    `INSERT INTO compliance_documents (company_id, document_name, document_type, document_url, site_id)
     VALUES ('${prereqs.contractorCompanyAId}', '${label('CompDocA', 'A')}', 'insurance', 'https://test.invalid/comp-a', '${siteAId}')
     RETURNING id, site_id`,
    `INSERT INTO compliance_documents (company_id, document_name, document_type, document_url, site_id)
     VALUES ('${prereqs.contractorCompanyBId}', '${label('CompDocB', 'B')}', 'insurance', 'https://test.invalid/comp-b', '${siteBId}')
     RETURNING id, site_id`,
  ));

  // ── 15. worker_certifications ─────────────────────────────────────────────
  results.push(await t('workerCertifications', S.workerCertifications, {
    workerId: prereqs.contractorWorkerAId,
    certificationType: 'CSCS',
  }, {
    workerId: prereqs.contractorWorkerBId,
    certificationType: 'CSCS',
  }));

  // ── 16. rams_documents ────────────────────────────────────────────────────
  results.push(await t('ramsDocuments', S.ramsDocuments, {
    ramsIdRef: label('RAMS-A', 'A'),
    documentName: label('RamsDocA', 'A'),
    documentUrl: 'https://test.invalid/rams-a',
    expiryDate: new Date(Date.now() + 86400_000 * 365),
  }, {
    ramsIdRef: label('RAMS-B', 'B'),
    documentName: label('RamsDocB', 'B'),
    documentUrl: 'https://test.invalid/rams-b',
    expiryDate: new Date(Date.now() + 86400_000 * 365),
  }));

  // ── 17. induction_tokens ──────────────────────────────────────────────────
  // Uses rawT: Drizzle schema has extra columns not yet in real DB (migration drift)
  results.push(await rawT(
    'inductionTokens', 'induction_tokens', S.inductionTokens,
    `INSERT INTO induction_tokens (token, expires_at, site_id)
     VALUES ('${label('ind-tok-A', 'A')}', NOW() + INTERVAL '1 hour', '${siteAId}')
     RETURNING id, site_id`,
    `INSERT INTO induction_tokens (token, expires_at, site_id)
     VALUES ('${label('ind-tok-B', 'B')}', NOW() + INTERVAL '1 hour', '${siteBId}')
     RETURNING id, site_id`,
  ));

  // ── 18. contractor_visits ─────────────────────────────────────────────────
  results.push(await t('contractorVisits', S.contractorVisits, {
    workerId: prereqs.contractorWorkerAId,
    companyId: prereqs.contractorCompanyAId,
  }, {
    workerId: prereqs.contractorWorkerBId,
    companyId: prereqs.contractorCompanyBId,
  }));

  // ── 19. contractor_prebookings ────────────────────────────────────────────
  results.push(await t('contractorPreBookings', S.contractorPreBookings, {
    companyName: label('PreCoA', 'A'),
    contactEmail: `${RUN_ID}-pre-co-a@test.invalid`,
    workerName: label('PreWorkerA', 'A'),
    purpose: 'Testing',
    scheduledDate: new Date(),
    scheduledTime: '09:00',
    qrCode: label('qr-ctr-pre-A', 'A'),
  }, {
    companyName: label('PreCoB', 'B'),
    contactEmail: `${RUN_ID}-pre-co-b@test.invalid`,
    workerName: label('PreWorkerB', 'B'),
    purpose: 'Testing',
    scheduledDate: new Date(),
    scheduledTime: '09:00',
    qrCode: label('qr-ctr-pre-B', 'B'),
  }));

  // ── 20. local_labour_records ──────────────────────────────────────────────
  results.push(await t('localLabourRecords', S.localLabourRecords, {
    workerId: prereqs.contractorWorkerAId,
    companyId: prereqs.contractorCompanyAId,
    postcode: 'SW1A 1AA',
  }, {
    workerId: prereqs.contractorWorkerBId,
    companyId: prereqs.contractorCompanyBId,
    postcode: 'EC1A 1BB',
  }));

  // ── 21. meeting_rooms (prereq rows tested explicitly) ─────────────────────
  try {
    const ctxA = enterpriseCtx(siteAId);
    const filterA = scopedWhere(ctxA, S.meetingRooms);
    const breach = await db.select({ id: S.meetingRooms.id }).from(S.meetingRooms)
      .where(and(filterA, eq(S.meetingRooms.id, prereqs.meetingRoomBId)));
    if (breach.length > 0) {
      results.push(fail('meetingRooms', `ISOLATION BREACH: Site A sees Site B meeting room`));
    } else {
      results.push(pass('meetingRooms'));
    }
  } catch (e: any) {
    results.push(fail('meetingRooms', e.message));
  }

  // ── 22. room_bookings ─────────────────────────────────────────────────────
  // Uses rawT: booked_by_staff_id is NOT NULL in real DB; provide staffId from prereqs
  results.push(await rawT(
    'roomBookings', 'room_bookings', S.roomBookings,
    `INSERT INTO room_bookings (meeting_room_id, booked_by_staff_id, title, start_time, end_time, expected_attendees, site_id)
     VALUES ('${prereqs.meetingRoomAId}', '${prereqs.staffAId}', '${label('BookingA', 'A')}', NOW(), NOW() + INTERVAL '1 hour', 1, '${siteAId}')
     RETURNING id, site_id`,
    `INSERT INTO room_bookings (meeting_room_id, booked_by_staff_id, title, start_time, end_time, expected_attendees, site_id)
     VALUES ('${prereqs.meetingRoomBId}', '${prereqs.staffBId}', '${label('BookingB', 'B')}', NOW(), NOW() + INTERVAL '1 hour', 1, '${siteBId}')
     RETURNING id, site_id`,
  ));

  // ── 23. ppm_assets ────────────────────────────────────────────────────────
  results.push(await t('ppmAssets', S.ppmAssets, {
    name: label('AssetA', 'A'),
  }, {
    name: label('AssetB', 'B'),
  }));

  // ── 24. ppm_work_orders ───────────────────────────────────────────────────
  results.push(await t('ppmWorkOrders', S.ppmWorkOrders, {
    title: label('WO-A', 'A'),
  }, {
    title: label('WO-B', 'B'),
  }));

  // ── 25. cdm_projects ──────────────────────────────────────────────────────
  // Uses rawT: Drizzle schema has extra columns not yet in real DB (migration drift)
  results.push(await rawT(
    'cdmProjects', 'cdm_projects', S.cdmProjects,
    `INSERT INTO cdm_projects (company_id, title, site_id)
     VALUES ('${prereqs.contractorCompanyAId}', '${label('CDM-A', 'A')}', '${siteAId}')
     RETURNING id, site_id`,
    `INSERT INTO cdm_projects (company_id, title, site_id)
     VALUES ('${prereqs.contractorCompanyBId}', '${label('CDM-B', 'B')}', '${siteBId}')
     RETURNING id, site_id`,
  ));

  // ── 26. hs_incidents ──────────────────────────────────────────────────────
  results.push(await t('hsIncidents', S.hsIncidents, {
    title: label('IncidentA', 'A'),
    incidentDate: new Date(),
  }, {
    title: label('IncidentB', 'B'),
    incidentDate: new Date(),
  }));

  // ── 27. fire_risk_assessments ─────────────────────────────────────────────
  results.push(await t('fireRiskAssessments', S.fireRiskAssessments, {
    assessorName: label('AssessorA', 'A'),
    assessmentDate: '2026-01-01',
    nextReviewDate: '2027-01-01',
  }, {
    assessorName: label('AssessorB', 'B'),
    assessmentDate: '2026-01-01',
    nextReviewDate: '2027-01-01',
  }));

  // ── 28. compliance_certificates ───────────────────────────────────────────
  results.push(await t('complianceCertificates', S.complianceCertificates, {
    certificateTypeId: prereqs.certTypeId,
    certificateType: label('CertA', 'A'),
    issueDate: '2026-01-01',
  }, {
    certificateTypeId: prereqs.certTypeId,
    certificateType: label('CertB', 'B'),
    issueDate: '2026-01-01',
  }));

  // ── 29. permit_to_work ────────────────────────────────────────────────────
  const now = new Date();
  const later = new Date(now.getTime() + 3600_000);
  results.push(await t('permitToWork', S.permitToWork, {
    permitNumber: label('PTW-A', 'A'),
    permitType: 'hot_work',
    workDescription: 'Test A',
    workLocation: 'Site A Area',
    plannedStartDate: '2026-01-01',
    plannedStartTime: '09:00',
    plannedEndDate: '2026-01-01',
    plannedEndTime: '17:00',
    permitValidFrom: now,
    permitValidUntil: later,
  }, {
    permitNumber: label('PTW-B', 'B'),
    permitType: 'hot_work',
    workDescription: 'Test B',
    workLocation: 'Site B Area',
    plannedStartDate: '2026-01-01',
    plannedStartTime: '09:00',
    plannedEndDate: '2026-01-01',
    plannedEndTime: '17:00',
    permitValidFrom: now,
    permitValidUntil: later,
  }));

  // ── 30. audit_records ─────────────────────────────────────────────────────
  results.push(await t('auditRecords', S.auditRecords, {
    templateName: label('AuditTplA', 'A'),
    category: 'safety',
    title: label('AuditA', 'A'),
    conductedBy: label('InspectorA', 'A'),
  }, {
    templateName: label('AuditTplB', 'B'),
    category: 'safety',
    title: label('AuditB', 'B'),
    conductedBy: label('InspectorB', 'B'),
  }));

  // ── 31. ra_builder_assessments ────────────────────────────────────────────
  results.push(await t('raBuilderAssessments', S.raBuilderAssessments, {
    title: label('RA-A', 'A'),
  }, {
    title: label('RA-B', 'B'),
  }));

  // ── 32. incident_reports ──────────────────────────────────────────────────
  results.push(await t('incidentReports', S.incidentReports, {
    evacuationId: label('evac-A', 'A'),
    customerId: ENTERPRISE_CUSTOMER_ID,
  }, {
    evacuationId: label('evac-B', 'B'),
    customerId: ENTERPRISE_CUSTOMER_ID,
  }));

  // ── 33. lone_worker_sessions ──────────────────────────────────────────────
  results.push(await t('loneWorkerSessions', S.loneWorkerSessions, {
    customerId: ENTERPRISE_CUSTOMER_ID,
    personId: prereqs.staffAId,
    personType: 'staff',
    personName: label('LoneA', 'A'),
  }, {
    customerId: ENTERPRISE_CUSTOMER_ID,
    personId: prereqs.staffBId,
    personType: 'staff',
    personName: label('LoneB', 'B'),
  }));

  // ── 34. help_desk_tickets ─────────────────────────────────────────────────
  results.push(await t('helpDeskTickets', S.helpDeskTickets, {
    title: label('TicketA', 'A'),
  }, {
    title: label('TicketB', 'B'),
  }));

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fail-closed test: enterprise with no active site → must throw / return no rows
// ─────────────────────────────────────────────────────────────────────────────

async function testFailClosed(db: any, siteAId: string): Promise<TableResult> {
  // With no activeSiteId, scopedWhere on an enterprise context with an empty
  // activeSiteId should return sql`false` which returns zero rows.
  const noSiteCtx: SiteContext = {
    isEnterprise: true,
    activeSiteId: null,
    allowedSiteIds: [],
  };

  try {
    const filter = scopedWhere(noSiteCtx, S.departments);
    // The filter should be sql`false` — querying should return no rows.
    const rows = await db
      .select({ id: S.departments.id })
      .from(S.departments)
      .where(filter);

    if (rows.length === 0) {
      return pass('FAIL-CLOSED (no active site → no rows)');
    } else {
      return fail(
        'FAIL-CLOSED (no active site → no rows)',
        `Expected zero rows but got ${rows.length} — fail-closed is NOT working`,
      );
    }
  } catch (e: any) {
    // Throwing is also acceptable fail-closed behaviour.
    return pass('FAIL-CLOSED (no active site → no rows)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-enterprise regression test
// ─────────────────────────────────────────────────────────────────────────────

async function testNonEnterpriseRegression(nonEntDb: any): Promise<TableResult> {
  const ctx = nonEnterpriseCtx();

  // scopedWhere should return undefined for non-enterprise, meaning no filter.
  const filter = scopedWhere(ctx, S.departments);
  if (filter !== undefined) {
    return fail(
      'NON-ENTERPRISE REGRESSION',
      `scopedWhere returned a filter for a non-enterprise context — ordinary customers will be broken`,
    );
  }

  // withSiteId should pass through values unchanged when siteId = null.
  const stamped = withSiteId(null, { name: 'test-dept' });
  if ('siteId' in stamped) {
    return fail(
      'NON-ENTERPRISE REGRESSION',
      `withSiteId(null, ...) added a siteId field — non-enterprise write-stamp is broken`,
    );
  }

  // Querying non-enterprise DB with no filter should succeed and return rows
  // (or an empty array if DB is empty — both are fine as long as it doesn't throw).
  try {
    await nonEntDb.select({ id: S.departments.id }).from(S.departments).limit(5);
    return pass('NON-ENTERPRISE REGRESSION');
  } catch (e: any) {
    return fail('NON-ENTERPRISE REGRESSION', `Query failed on non-enterprise DB: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

async function cleanup(db: any, run: TestRun, prereqs: Prerequisites) {
  console.log('\n🧹 Cleaning up test data...');

  // Delete in FK-safe reverse order.
  const deleteByIds = async (table: any, tableName: string, ids: string[]) => {
    if (!ids?.length) return;
    try {
      // Use raw SQL to delete by id IN (...) safely
      for (const id of ids) {
        await db.delete(table).where(eq(table.id, id)).catch(() => {/* already gone */});
      }
    } catch (e: any) {
      console.warn(`   ⚠️  Cleanup warning for ${tableName}: ${e.message}`);
    }
  };

  const ids = run.insertedIds;

  // Child → parent order
  await deleteByIds(S.roomBookings, 'roomBookings', ids.get('roomBookings') ?? []);
  await deleteByIds(S.contractorVisits, 'contractorVisits', ids.get('contractorVisits') ?? []);
  await deleteByIds(S.workerCertifications, 'workerCertifications', ids.get('workerCertifications') ?? []);
  await deleteByIds(S.cdmProjects, 'cdmProjects', ids.get('cdmProjects') ?? []);
  await deleteByIds(S.contractorDocuments, 'contractorDocuments', ids.get('contractorDocuments') ?? []);
  await deleteByIds(S.complianceDocuments, 'complianceDocuments', ids.get('complianceDocuments') ?? []);
  await deleteByIds(S.contractorWorkers, 'contractorWorkers', ids.get('contractorWorkers') ?? []);
  await deleteByIds(S.contractorCompanies, 'contractorCompanies', ids.get('contractorCompanies') ?? []);
  await deleteByIds(S.complianceCertificates, 'complianceCertificates', ids.get('complianceCertificates') ?? []);
  await deleteByIds(S.ramsDocuments, 'ramsDocuments', ids.get('ramsDocuments') ?? []);
  await deleteByIds(S.permitToWork, 'permitToWork', ids.get('permitToWork') ?? []);
  await deleteByIds(S.auditRecords, 'auditRecords', ids.get('auditRecords') ?? []);
  await deleteByIds(S.raBuilderAssessments, 'raBuilderAssessments', ids.get('raBuilderAssessments') ?? []);
  await deleteByIds(S.hsIncidents, 'hsIncidents', ids.get('hsIncidents') ?? []);
  await deleteByIds(S.fireRiskAssessments, 'fireRiskAssessments', ids.get('fireRiskAssessments') ?? []);
  await deleteByIds(S.helpDeskTickets, 'helpDeskTickets', ids.get('helpDeskTickets') ?? []);
  await deleteByIds(S.loneWorkerSessions, 'loneWorkerSessions', ids.get('loneWorkerSessions') ?? []);
  await deleteByIds(S.incidentReports, 'incidentReports', ids.get('incidentReports') ?? []);
  await deleteByIds(S.ppmWorkOrders, 'ppmWorkOrders', ids.get('ppmWorkOrders') ?? []);
  await deleteByIds(S.ppmAssets, 'ppmAssets', ids.get('ppmAssets') ?? []);
  await deleteByIds(S.inductionTokens, 'inductionTokens', ids.get('inductionTokens') ?? []);
  await deleteByIds(S.safetyTokens, 'safetyTokens', ids.get('safetyTokens') ?? []);
  await deleteByIds(S.contractorPreBookings, 'contractorPreBookings', ids.get('contractorPreBookings') ?? []);
  await deleteByIds(S.localLabourRecords, 'localLabourRecords', ids.get('localLabourRecords') ?? []);
  await deleteByIds(S.members, 'members', ids.get('members') ?? []);
  await deleteByIds(S.preBookings, 'preBookings', ids.get('preBookings') ?? []);
  await deleteByIds(S.visitorHistory, 'visitorHistory', ids.get('visitorHistory') ?? []);
  await deleteByIds(S.staffAttendanceHistory, 'staffAttendanceHistory', ids.get('staffAttendanceHistory') ?? []);
  await deleteByIds(S.visitors, 'visitors', ids.get('visitors') ?? []);
  await deleteByIds(S.staff, 'staff', ids.get('staff') ?? []);
  await deleteByIds(S.departments, 'departments', ids.get('departments') ?? []);
  await deleteByIds(S.musterPoints, 'musterPoints', ids.get('musterPoints') ?? []);
  await deleteByIds(S.evacuationZones, 'evacuationZones', ids.get('evacuationZones') ?? []);
  await deleteByIds(S.meetingRooms, 'meetingRooms', ids.get('meetingRooms') ?? []);

  // Compliance cert types
  if (ids.get('complianceCertificateTypes')?.length) {
    for (const id of ids.get('complianceCertificateTypes')!) {
      await db.delete(S.complianceCertificateTypes)
        .where(eq(S.complianceCertificateTypes.id, id))
        .catch(() => {});
    }
  }

  // Sites last
  await db.delete(S.sites).where(eq(S.sites.name, `${RUN_ID}-Site-A`)).catch(() => {});
  await db.delete(S.sites).where(eq(S.sites.name, `${RUN_ID}-Site-B`)).catch(() => {});

  console.log('   ✅ Cleanup complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(80));
  console.log(' SITE ISOLATION TEST — Enterprise Multi-Site Phase 1c');
  console.log('='.repeat(80));
  console.log(`\n🔑 Run ID : ${RUN_ID}`);
  console.log(`🏢 Enterprise customer : ${ENTERPRISE_CUSTOMER_ID}`);
  console.log(`🏢 Non-enterprise customer : ${NON_ENTERPRISE_CUSTOMER_ID}`);
  console.log(`⚠️  Environment : ${process.env.NODE_ENV || 'development'}\n`);

  const customerDbService = CustomerDatabaseService.getInstance();
  let db: any;
  let nonEntDb: any;
  let run: TestRun | undefined;

  try {
    db = await customerDbService.getCustomerDatabase(ENTERPRISE_CUSTOMER_ID);
    nonEntDb = await customerDbService.getCustomerDatabase(NON_ENTERPRISE_CUSTOMER_ID);
  } catch (e: any) {
    console.error('❌ FATAL: Could not connect to test customer databases:', e.message);
    process.exit(1);
  }

  const insertedIds = new Map<string, string[]>();

  try {
    // ── Setup ────────────────────────────────────────────────────────────────
    console.log('🔧 Creating test sites...');
    const { siteAId, siteBId } = await setupTestSites(db);
    console.log(`   Site A: ${siteAId}`);
    console.log(`   Site B: ${siteBId}`);

    run = { siteAId, siteBId, insertedIds };

    console.log('\n🔧 Creating prerequisite records...');
    const prereqs = await setupPrerequisites(db, siteAId, siteBId, insertedIds);
    console.log('   ✅ Prerequisites ready\n');

    // ── Isolation tests (34 tables) ──────────────────────────────────────────
    console.log('🔐 Running cross-site isolation tests (34 tables)...\n');
    const tableResults = await runSiteIsolationTests(db, run, prereqs);

    // ── Fail-closed test ─────────────────────────────────────────────────────
    console.log('🔒 Running fail-closed test...');
    const failClosedResult = await testFailClosed(db, siteAId);
    tableResults.push(failClosedResult);

    // ── Non-enterprise regression test ───────────────────────────────────────
    console.log('🔁 Running non-enterprise regression test...');
    const regressionResult = await testNonEnterpriseRegression(nonEntDb);
    tableResults.push(regressionResult);

    // ── Report ───────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(80));
    console.log(' RESULTS PER TABLE');
    console.log('='.repeat(80));

    let passed = 0;
    let failed = 0;
    const breaches: TableResult[] = [];

    for (const r of tableResults) {
      if (r.pass) {
        console.log(`   ✅ PASS  ${r.table}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL  ${r.table}`);
        console.log(`            └─ ${r.error}`);
        failed++;
        breaches.push(r);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(' SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Total tests   : ${tableResults.length}`);
    console.log(`   Passed        : ${passed}`);
    console.log(`   Failed        : ${failed}`);

    if (failed === 0) {
      console.log('\n   ✅ ALL TESTS PASSED — Site isolation wall is holding.');
      console.log('   ✅ GATE CLEARED — Phase 2 may proceed.\n');
    } else {
      console.log(`\n   ❌ ${failed} TEST(S) FAILED — ISOLATION BREACH(ES) DETECTED`);
      console.log('   ⛔ GATE NOT CLEARED — Fix Phase 1b scoping before proceeding.\n');
      for (const b of breaches) {
        console.log(`   ⚠️  ${b.table}: ${b.error}`);
      }
      console.log('');
    }

    return failed;
  } finally {
    if (run) {
      await cleanup(db, run, {} as any).catch(e => {
        console.warn('⚠️  Cleanup error (non-fatal):', e.message);
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(failed => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('💥 FATAL ERROR:', err);
      process.exit(1);
    });
}

export { main as runSiteIsolationTests };
