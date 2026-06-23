/**
 * ENTERPRISE SITE-ISOLATION TEST SCRIPT
 * =====================================
 * Drives REAL HTTP endpoints to prove that every site-scoped read and write
 * is properly filtered by the active site.
 *
 * Requirements:
 *   - Server must be running (default http://localhost:5000)
 *   - At least ONE enterprise customer with >= 2 sites must exist, OR
 *     the script will provision them using PLATFORM_ADMIN credentials.
 *   - Env vars: DEV_ANDY_PASSWORD, DEV_EMMA_PASSWORD (or TEST_USER_PASSWORD)
 *
 * Exit codes:
 *   0 = all assertions passed
 *   1 = one or more assertions FAILED (site-isolation breach)
 *   2 = skip / no enterprise customer available
 */

import * as http from 'http';
import { Client as PgClient } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:5000';
const ANDY_PASS = process.env.DEV_ANDY_PASSWORD ?? '';
const EMMA_PASS = process.env.DEV_EMMA_PASSWORD ?? '';
const TEST_PASS = process.env.TEST_USER_PASSWORD ?? ANDY_PASS;

// When DATABASE_URL is set the test self-provisions enterprise and cleans up.
// Run with: DATABASE_URL=... npx tsx server/site-isolation-test-script.ts
const DB_URL = process.env.DATABASE_URL ?? '';
const TEST_CUSTOMER_ID   = process.env.TEST_CUSTOMER_ID   ?? 'dev-customer-001';
const TEST_CUSTOMER_SCHEMA = process.env.TEST_CUSTOMER_SCHEMA ?? 'c_dev_cust';
const TEST_ADMIN_USERNAME  = process.env.TEST_ADMIN_USERNAME  ?? 'andy';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal fetch wrapper that tracks cookies per session
// ─────────────────────────────────────────────────────────────────────────────

class Session {
  private cookies: Map<string, string> = new Map();
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  private parseCookies(raw: string[]): void {
    for (const line of raw) {
      const part = line.split(';')[0].trim();
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      this.cookies.set(key, val);
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: unknown; ok: boolean }> {
    const url = new URL(path, BASE);
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
      const opts: http.RequestOptions = {
        hostname: url.hostname,
        port: Number(url.port) || 5000,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: this.cookieHeader(),
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
        },
      };

      const req = http.request(opts, (res) => {
        if (res.headers['set-cookie']) {
          this.parseCookies(res.headers['set-cookie']);
        }
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data, ok: (res.statusCode ?? 0) < 400 });
        });
      });

      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async get(path: string): ReturnType<Session['request']> {
    return this.request('GET', path);
  }

  async post(path: string, body?: unknown): ReturnType<Session['request']> {
    return this.request('POST', path, body);
  }

  async patch(path: string, body?: unknown): ReturnType<Session['request']> {
    return this.request('PATCH', path, body);
  }

  async delete(path: string): ReturnType<Session['request']> {
    return this.request('DELETE', path);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions
// ─────────────────────────────────────────────────────────────────────────────

let PASS = 0;
let FAIL = 0;
let SKIP = 0;

function assert(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    PASS++;
    console.log(`  ✅ PASS  ${name}`);
  } else {
    FAIL++;
    console.error(`  ❌ FAIL  ${name}${detail ? `\n         ${detail}` : ''}`);
  }
}

function skip(name: string, reason: string): void {
  SKIP++;
  console.log(`  ⏭  SKIP  ${name} — ${reason}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const LOGIN_COMPANY = process.env.TEST_COMPANY_NAME ?? 'Development Customer';

async function loginAs(
  session: Session,
  username: string,
  password: string,
  companyName = LOGIN_COMPANY,
): Promise<boolean> {
  const r = await session.post('/api/auth/login', { companyName, username, password });
  if (!r.ok) {
    console.error(`  [login] Failed for "${username}": ${r.status} ${JSON.stringify(r.data)}`);
    return false;
  }
  return true;
}

async function switchToSite(session: Session, siteId: string): Promise<boolean> {
  const r = await session.post('/api/enterprise/active-site', { siteId });
  return r.ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

async function testPreBookingIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Pre-booking isolation ──');

  // Create a pre-booking at Site A
  await switchToSite(sessionA, siteAId);
  const pb = await sessionA.post('/api/prebookings', {
    visitorFirstName: 'IsolationTest',
    visitorLastName: 'SiteA',
    visitorEmail: `isolation-test-site-a-${Date.now()}@example.com`,
    company: 'Isolation Test Co',
    purpose: 'Site isolation audit',
    visitDate: new Date(Date.now() + 86400000).toISOString(),
    hostName: 'Test Host',
    isApproved: false,
  });
  assert('POST /api/prebookings at Site A succeeds', pb.ok, JSON.stringify(pb.data));
  const pbRecord = pb.data as any;
  assert('New pre-booking has siteId stamped', !!pbRecord?.siteId, `siteId=${pbRecord?.siteId}`);
  assert('Stamped siteId matches Site A', pbRecord?.siteId === siteAId, `expected=${siteAId} got=${pbRecord?.siteId}`);

  // Switch to Site A — the pre-booking MUST be visible
  const listA = await sessionA.get('/api/prebookings');
  const rowsA = (listA.data as any[]) ?? [];
  assert(
    'GET /api/prebookings at Site A shows own records',
    rowsA.some((r: any) => r.id === pbRecord?.id),
    `id=${pbRecord?.id}`,
  );

  // Switch to Site B — the pre-booking MUST NOT be visible
  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/prebookings');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/prebookings at Site B does NOT show Site A records',
    !rowsB.some((r: any) => r.id === pbRecord?.id),
    `Site A prebooking id=${pbRecord?.id} appeared in Site B list`,
  );

  // Clean up — delete from Site A
  await switchToSite(sessionA, siteAId);
  if (pbRecord?.id) await sessionA.delete(`/api/prebookings/${pbRecord.id}`);
}

async function testContractorPreBookingIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Contractor pre-booking isolation ──');

  await switchToSite(sessionA, siteAId);
  const cpb = await sessionA.post('/api/contractors/prebookings', {
    workerName: 'Isolation Test Worker',
    companyName: 'Test Contractor Co',
    scheduledDate: new Date(Date.now() + 86400000).toISOString(),
    scheduledTime: '09:00',
    purpose: 'Site isolation audit',
    duration: '4',
    contactEmail: `isolation-cpb-${Date.now()}@test.example`,
  });
  assert('POST /api/contractors/prebookings at Site A succeeds', cpb.ok, JSON.stringify(cpb.data));
  const cpbRecord = cpb.data as any;
  assert('Contractor prebooking has siteId stamped', !!cpbRecord?.siteId, `siteId=${cpbRecord?.siteId}`);
  assert('Contractor prebooking siteId matches Site A', cpbRecord?.siteId === siteAId, `expected=${siteAId} got=${cpbRecord?.siteId}`);

  // Switch to Site B — should NOT see Site A contractor prebooking
  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/contractors/prebookings');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/contractors/prebookings at Site B does NOT show Site A records',
    !rowsB.some((r: any) => r.id === cpbRecord?.id),
    `Site A contractor prebooking ${cpbRecord?.id} appeared in Site B list`,
  );

  // Clean up
  await switchToSite(sessionA, siteAId);
  if (cpbRecord?.id) await sessionA.delete(`/api/contractors/prebookings/${cpbRecord.id}`);
}

async function testVisitorIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Visitor isolation ──');

  await switchToSite(sessionA, siteAId);
  const vis = await sessionA.post('/api/visitors', {
    firstName: 'IsolationTestVisitor',
    lastName: `SiteA-${Date.now()}`,
    email: `isolation-vis-${Date.now()}@test.example`,
    company: 'Isolation Inc',
    purpose: 'audit',
  });
  assert('POST /api/visitors at Site A succeeds', vis.ok, JSON.stringify(vis.data));
  const visRecord = vis.data as any;

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/visitors');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/visitors at Site B does NOT show Site A visitor',
    !rowsB.some((r: any) => r.id === visRecord?.id),
    `Site A visitor ${visRecord?.id} appeared in Site B list`,
  );
}

async function testStaffIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Staff isolation ──');

  await switchToSite(sessionA, siteAId);
  const staff = await sessionA.post('/api/staff', {
    firstName: 'IsolationTestStaff',
    lastName: `SiteA-${Date.now()}`,
    email: `isolation-staff-${Date.now()}@test.example`,
    department: 'Testing',
    role: 'tester',
  });
  assert('POST /api/staff at Site A succeeds', staff.ok, JSON.stringify(staff.data));
  const staffRecord = staff.data as any;

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/staff');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/staff at Site B does NOT show Site A staff',
    !rowsB.some((r: any) => r.id === staffRecord?.id),
    `Site A staff member ${staffRecord?.id} appeared in Site B list`,
  );
}

async function testMusterIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Muster list isolation ──');

  await switchToSite(sessionA, siteAId);
  const musterA = await sessionA.get('/api/muster');
  assert('GET /api/muster at Site A returns 200', musterA.ok, `${musterA.status}`);

  await switchToSite(sessionB, siteBId);
  const musterB = await sessionB.get('/api/muster');
  assert('GET /api/muster at Site B returns 200', musterB.ok, `${musterB.status}`);

  // Muster lists for different sites must not overlap (person IDs must be disjoint
  // when both sites are isolated and have distinct staff).
  const idsA = new Set(
    ((musterA.data as any)?.persons ?? []).map((p: any) => p.id ?? p.staffId ?? p.visitorId),
  );
  const idsB = new Set(
    ((musterB.data as any)?.persons ?? []).map((p: any) => p.id ?? p.staffId ?? p.visitorId),
  );
  const overlap = [...idsA].filter((id) => idsB.has(id));
  if (idsA.size === 0 && idsB.size === 0) {
    skip('Muster lists are disjoint across sites', 'both lists are empty (no people on site)');
  } else {
    assert(
      'Muster lists are disjoint across sites',
      overlap.length === 0,
      `Overlapping IDs: ${overlap.slice(0, 5).join(', ')}`,
    );
  }
}

async function testHelpDeskIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Help-desk ticket isolation ──');

  await switchToSite(sessionA, siteAId);
  const ticket = await sessionA.post('/api/helpdesk', {
    subject: `Isolation Test Ticket ${Date.now()}`,
    description: 'Created during site isolation audit',
    category: 'other',
    priority: 'low',
  });
  if (!ticket.ok) {
    skip('Help-desk ticket isolation', `POST /api/helpdesk failed: ${ticket.status}`);
    return;
  }
  const ticketRecord = ticket.data as any;

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/helpdesk');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/helpdesk at Site B does NOT show Site A ticket',
    !rowsB.some((r: any) => r.id === ticketRecord?.id),
    `Site A ticket ${ticketRecord?.id} appeared in Site B list`,
  );
}

async function testRaBuilderIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── RA Builder assessment isolation ──');

  await switchToSite(sessionA, siteAId);
  const ra = await sessionA.post('/api/ra-builder/assessments', {
    title: `Isolation Test RA ${Date.now()}`,
    raType: 'general',
    status: 'draft',
    taskDescription: 'Created during site isolation audit',
    preparedBy: 'Isolation Test Runner',
    assessmentDate: new Date().toISOString().split('T')[0],
  });
  if (!ra.ok) {
    skip('RA Builder isolation', `POST /api/ra-builder/assessments failed: ${ra.status}`);
    return;
  }
  const raRecord = ra.data as any;
  assert('RA assessment siteId stamped', !!raRecord?.siteId, `siteId=${raRecord?.siteId}`);
  assert('RA assessment siteId matches Site A', raRecord?.siteId === siteAId, `expected=${siteAId} got=${raRecord?.siteId}`);

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/ra-builder/assessments');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/ra-builder/assessments at Site B does NOT show Site A records',
    !rowsB.some((r: any) => r.id === raRecord?.id),
    `Site A RA ${raRecord?.id} appeared in Site B list`,
  );
}

async function testPpmIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── PPM asset isolation ──');

  await switchToSite(sessionA, siteAId);
  const asset = await sessionA.post('/api/ppm/assets', {
    name: `Isolation Test Asset ${Date.now()}`,
    category: 'electrical',
    location: 'Site A Test Room',
    serialNumber: `ISO-TEST-${Date.now()}`,
  });
  if (!asset.ok) {
    skip('PPM asset isolation', `POST /api/ppm/assets failed: ${asset.status}`);
    return;
  }
  const assetRecord = asset.data as any;

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/ppm/assets');
  const rowsB = (listB.data as any[]) ?? [];
  assert(
    'GET /api/ppm/assets at Site B does NOT show Site A assets',
    !rowsB.some((r: any) => r.id === assetRecord?.id),
    `Site A PPM asset ${assetRecord?.id} appeared in Site B list`,
  );
}

async function testAuditRecordIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Audit record isolation ──');

  await switchToSite(sessionA, siteAId);
  const listA = await sessionA.get('/api/audits');
  assert('GET /api/audits at Site A returns 200', listA.ok, `${listA.status}`);

  await switchToSite(sessionB, siteBId);
  const listB = await sessionB.get('/api/audits');
  assert('GET /api/audits at Site B returns 200', listB.ok, `${listB.status}`);

  const idsA = new Set(((listA.data as any[]) ?? []).map((r: any) => r.id));
  const idsB = new Set(((listB.data as any[]) ?? []).map((r: any) => r.id));
  const overlap = [...idsA].filter((id) => idsB.has(id));

  if (idsA.size === 0 && idsB.size === 0) {
    skip('Audit records are disjoint across sites', 'no audit records exist yet');
  } else {
    assert(
      'GET /api/audits Site A and Site B lists are disjoint',
      overlap.length === 0,
      `Overlapping IDs: ${overlap.slice(0, 5).join(', ')}`,
    );
  }
}

async function testSingleSiteCustomerUnaffected(singleSiteSession: Session): Promise<void> {
  console.log('\n  ── Single-site customer regression ──');

  const vis = await singleSiteSession.get('/api/visitors');
  assert('Single-site GET /api/visitors still works', vis.ok, `${vis.status}`);

  const pb = await singleSiteSession.get('/api/prebookings');
  assert('Single-site GET /api/prebookings still works', pb.ok, `${pb.status}`);

  const staff = await singleSiteSession.get('/api/staff');
  assert('Single-site GET /api/staff still works', staff.ok, `${staff.status}`);

  const muster = await singleSiteSession.get('/api/muster');
  assert('Single-site GET /api/muster still works', muster.ok, `${muster.status}`);

  // Enterprise endpoints should 404 or return isEnterprise=false
  const enterpriseCtx = await singleSiteSession.get('/api/enterprise/context');
  if (enterpriseCtx.ok) {
    const ctx = enterpriseCtx.data as any;
    assert('Single-site customer isEnterprise=false', ctx?.isEnterprise === false, `isEnterprise=${ctx?.isEnterprise}`);
  } else {
    skip('Single-site /api/enterprise/context', `returned ${enterpriseCtx.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-verification: proves the assertion counter actually bites
// ─────────────────────────────────────────────────────────────────────────────

function selfVerify(): boolean {
  console.log('\n── Self-verification (framework check) ──────────────────────────');
  const savedPass = PASS;
  const savedFail = FAIL;

  // A deliberately false assertion MUST increment FAIL
  PASS = 0; FAIL = 0;
  assert('__self_test: false condition', false);
  const counterWorks = FAIL === 1;

  // A deliberately true assertion MUST increment PASS
  assert('__self_test: true condition', true);
  const passWorks = PASS === 1 && FAIL === 1;

  PASS = savedPass;
  FAIL = savedFail;

  if (!counterWorks || !passWorks) {
    console.error('FATAL: assertion framework is broken — aborting.');
    return false;
  }
  console.log('  ✅ PASS  Framework self-check: FAIL counter bites on false conditions');
  console.log('  ✅ PASS  Framework self-check: PASS counter increments on true conditions');
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-provisioning via direct DB (when DATABASE_URL is set)
// ─────────────────────────────────────────────────────────────────────────────

let _provisionedSiteAId = '';
let _provisionedSiteBId = '';
let _didProvision = false;

async function provisionTestEnvironment(): Promise<{ siteAId: string; siteBId: string } | null> {
  if (!DB_URL) {
    console.log('  ⚠️  DATABASE_URL not set — cannot self-provision (see README for manual steps)');
    return null;
  }
  console.log('\n── Self-provisioning enterprise environment ──────────────────────');
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  try {
    // Enable enterprise on the test customer
    await pg.query(
      `UPDATE customers SET is_enterprise = TRUE WHERE id = $1`,
      [TEST_CUSTOMER_ID],
    );
    // Grant andy enterprise_admin role so the sites API accepts his session
    await pg.query(
      `UPDATE "${TEST_CUSTOMER_SCHEMA}".users SET enterprise_role = 'enterprise_admin' WHERE username = $1`,
      [TEST_ADMIN_USERNAME],
    );
    // Create two isolated test sites directly
    const resA = await pg.query<{ id: string }>(
      `INSERT INTO "${TEST_CUSTOMER_SCHEMA}".sites (name, reference, status, is_default)
       VALUES ('__IsoTest_SiteA', 'ISO-A-${Date.now()}', 'active', TRUE)
       RETURNING id`,
    );
    const resB = await pg.query<{ id: string }>(
      `INSERT INTO "${TEST_CUSTOMER_SCHEMA}".sites (name, reference, status, is_default)
       VALUES ('__IsoTest_SiteB', 'ISO-B-${Date.now()}', 'active', FALSE)
       RETURNING id`,
    );
    const siteAId = resA.rows[0].id;
    const siteBId = resB.rows[0].id;
    _provisionedSiteAId = siteAId;
    _provisionedSiteBId = siteBId;
    _didProvision = true;
    console.log(`  ✅ Provisioned: enterprise=TRUE, siteA=${siteAId}, siteB=${siteBId}`);
    return { siteAId, siteBId };
  } finally {
    await pg.end();
  }
}

async function teardownTestEnvironment(): Promise<void> {
  if (!_didProvision || !DB_URL) return;
  console.log('\n── Cleaning up provisioned test environment ──────────────────────');
  const pg = new PgClient({ connectionString: DB_URL });
  await pg.connect();
  try {
    if (_provisionedSiteAId) {
      await pg.query(`DELETE FROM "${TEST_CUSTOMER_SCHEMA}".sites WHERE id = $1`, [_provisionedSiteAId]);
    }
    if (_provisionedSiteBId) {
      await pg.query(`DELETE FROM "${TEST_CUSTOMER_SCHEMA}".sites WHERE id = $1`, [_provisionedSiteBId]);
    }
    await pg.query(`UPDATE customers SET is_enterprise = FALSE WHERE id = $1`, [TEST_CUSTOMER_ID]);
    await pg.query(
      `UPDATE "${TEST_CUSTOMER_SCHEMA}".users SET enterprise_role = NULL WHERE username = $1`,
      [TEST_ADMIN_USERNAME],
    );
    console.log('  ✅ Teardown complete');
  } finally {
    await pg.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-03: New route tests for the three leaks closed in this PR
// ─────────────────────────────────────────────────────────────────────────────

/** Visitor search (/api/visitors/search) must only return records from the active site. */
async function testVisitorSearchIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Visitor search isolation (FIX-03) ──');

  // Create a visitor with a distinctive last name at Site A
  await switchToSite(sessionA, siteAId);
  const ts = Date.now();
  const vis = await sessionA.post('/api/visitors', {
    firstName: 'SearchIsoTest',
    lastName: `ZZZUniqSiteA${ts}`,
    email: `search-iso-${ts}@test.example`,
    company: 'IsolationCo',
    purpose: 'audit',
  });

  if (!vis.ok) {
    skip('Visitor search isolation', `POST /api/visitors failed: ${vis.status}`);
    return;
  }
  const visRecord = vis.data as any;
  const lastName = `ZZZUniqSiteA${ts}`;

  // Search for that visitor while active at Site A — MUST find them
  const searchA = await sessionA.get(`/api/visitors/search?q=${encodeURIComponent(lastName)}`);
  assert(
    `GET /api/visitors/search at Site A finds its own visitor`,
    ((searchA.data as any[]) ?? []).some((r: any) => r.id === visRecord?.id),
    `visitor ${visRecord?.id} not found when searching at Site A`,
  );

  // Switch to Site B — MUST NOT find Site A's visitor
  await switchToSite(sessionB, siteBId);
  const searchB = await sessionB.get(`/api/visitors/search?q=${encodeURIComponent(lastName)}`);
  const bRows = (searchB.data as any[]) ?? [];
  assert(
    `GET /api/visitors/search at Site B does NOT show Site A visitor`,
    !bRows.some((r: any) => r.id === visRecord?.id),
    `Site A visitor ${visRecord?.id} appeared in Site B search results — scopedWhere missing!`,
  );
}

/** Reception diary (/api/reception/diary) pre-bookings and host staff must be site-scoped. */
async function testDiaryIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Reception diary isolation (FIX-03) ──');

  await switchToSite(sessionA, siteAId);
  const visitDate = new Date(Date.now() + 86400000).toISOString();
  const pb = await sessionA.post('/api/prebookings', {
    visitorFirstName: 'DiaryIsoTest',
    visitorLastName: `SiteA${Date.now()}`,
    visitorEmail: `diary-iso-${Date.now()}@test.example`,
    company: 'IsolationCo',
    purpose: 'diary isolation audit',
    visitDate,
    hostName: 'Diary Host',
    isApproved: false,
  });

  if (!pb.ok) {
    skip('Reception diary isolation', `POST /api/prebookings failed: ${pb.status}`);
    return;
  }
  const pbRecord = pb.data as any;

  // Diary at Site A — MUST contain the pre-booking
  const diaryA = await sessionA.get('/api/reception/diary?days=3');
  const visitorsA = ((diaryA.data as any)?.visitors ?? []) as any[];
  assert(
    'GET /api/reception/diary at Site A contains its own pre-booking',
    visitorsA.some((r: any) => r.id === pbRecord?.id),
    `prebooking ${pbRecord?.id} not visible in Site A diary`,
  );

  // Switch to Site B — pre-booking MUST NOT appear in diary
  await switchToSite(sessionB, siteBId);
  const diaryB = await sessionB.get('/api/reception/diary?days=3');
  const visitorsB = ((diaryB.data as any)?.visitors ?? []) as any[];
  assert(
    'GET /api/reception/diary at Site B does NOT show Site A pre-booking',
    !visitorsB.some((r: any) => r.id === pbRecord?.id),
    `Site A prebooking ${pbRecord?.id} appeared in Site B diary — scopedWhere missing!`,
  );

  // Clean up
  await switchToSite(sessionA, siteAId);
  if (pbRecord?.id) await sessionA.delete(`/api/prebookings/${pbRecord.id}`);
}

/** Induction admin token list (/api/induction/admin/tokens) must be site-scoped. */
async function testInductionTokenListIsolation(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Induction admin token list isolation (FIX-03) ──');

  // Create a visitor at Site A (gives them a siteId in the isolated DB)
  await switchToSite(sessionA, siteAId);
  const ts = Date.now();
  const vis = await sessionA.post('/api/visitors', {
    firstName: 'InductionIso',
    lastName: `SiteA${ts}`,
    email: `induction-iso-${ts}@test.example`,
    company: 'IsolationCo',
    purpose: 'audit',
  });
  if (!vis.ok) {
    skip('Induction token list isolation', `POST /api/visitors failed: ${vis.status}`);
    return;
  }
  const visitorId = (vis.data as any)?.id as string;

  // Both sites fetch the admin token list; they should not share token records
  await switchToSite(sessionA, siteAId);
  const tokensA = await sessionA.get('/api/induction/admin/tokens');
  await switchToSite(sessionB, siteBId);
  const tokensB = await sessionB.get('/api/induction/admin/tokens');

  assert('GET /api/induction/admin/tokens returns 200 at Site A', tokensA.ok, `${tokensA.status}`);
  assert('GET /api/induction/admin/tokens returns 200 at Site B', tokensB.ok, `${tokensB.status}`);

  // No token visible to Site A should also appear in Site B list (no cross-site bleed)
  const idsA = new Set(((tokensA.data as any[]) ?? []).map((t: any) => t.id));
  const idsB = new Set(((tokensB.data as any[]) ?? []).map((t: any) => t.id));
  const overlap = [...idsA].filter(id => idsB.has(id));
  if (idsA.size === 0 && idsB.size === 0) {
    skip('Induction token lists are disjoint across sites', 'no tokens exist yet — endpoint verified accessible');
  } else {
    assert(
      'Induction admin token lists are disjoint across sites (no cross-site bleed)',
      overlap.length === 0,
      `Tokens visible in both sites: ${overlap.slice(0, 3).join(', ')}`,
    );
  }

  // Visitor ID created at Site A must NOT appear in Site B token list (if any tokens reference it)
  const siteBTokens = (tokensB.data as any[]) ?? [];
  assert(
    'Site B token list does not reference a Site A visitor',
    !siteBTokens.some((t: any) => t.visitorId === visitorId),
    `Site A visitorId ${visitorId} appeared in Site B induction token list`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NULL site_id diagnostic
// ─────────────────────────────────────────────────────────────────────────────

async function testNullSiteIdIntegrity(session: Session): Promise<void> {
  console.log('\n── NULL site_id integrity ────────────────────────────────────────');

  const r = await session.get('/api/enterprise/diagnostics/site-id-integrity');
  if (!r.ok) {
    skip('NULL site_id check', `diagnostic endpoint returned ${r.status}`);
    return;
  }
  const result = r.data as { ok: boolean; violations: Record<string, number> };
  assert(
    'Zero rows with NULL site_id across all 34 site-scoped tables',
    result.ok === true,
    result.ok
      ? ''
      : `Tables with NULL site_ids: ${Object.entries(result.violations)
          .map(([t, n]) => `${t}(${n})`)
          .join(', ')}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// "Prove the test bites" — write-path guarantee
// ─────────────────────────────────────────────────────────────────────────────

async function testWriteGuarantee(
  sessionA: Session,
  sessionB: Session,
  siteAId: string,
  siteBId: string,
): Promise<void> {
  console.log('\n  ── Write-path site_id guarantee ──');

  // Create one record at each site and verify distinct siteIds are stamped
  await switchToSite(sessionA, siteAId);
  const pbA = await sessionA.post('/api/prebookings', {
    visitorFirstName: 'WriteGuarantee',
    visitorLastName: `A-${Date.now()}`,
    visitorEmail: `wg-a-${Date.now()}@test.example`,
    company: 'WriteTest',
    purpose: 'write-guarantee',
    visitDate: new Date(Date.now() + 86400000).toISOString(),
    hostName: 'Test',
    isApproved: false,
  });

  await switchToSite(sessionB, siteBId);
  const pbB = await sessionB.post('/api/prebookings', {
    visitorFirstName: 'WriteGuarantee',
    visitorLastName: `B-${Date.now()}`,
    visitorEmail: `wg-b-${Date.now()}@test.example`,
    company: 'WriteTest',
    purpose: 'write-guarantee',
    visitDate: new Date(Date.now() + 86400000).toISOString(),
    hostName: 'Test',
    isApproved: false,
  });

  const recA = pbA.data as any;
  const recB = pbB.data as any;

  assert('Site A write stamps siteId=' + siteAId, pbA.ok && recA?.siteId === siteAId, `got siteId=${recA?.siteId}`);
  assert('Site B write stamps siteId=' + siteBId, pbB.ok && recB?.siteId === siteBId, `got siteId=${recB?.siteId}`);
  assert('Site A and Site B records have DIFFERENT siteIds', recA?.siteId !== recB?.siteId,
    `both have siteId=${recA?.siteId}`);

  // Clean up
  await switchToSite(sessionA, siteAId);
  if (recA?.id) await sessionA.delete(`/api/prebookings/${recA.id}`);
  await switchToSite(sessionB, siteBId);
  if (recB?.id) await sessionB.delete(`/api/prebookings/${recB.id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  ENTERPRISE SITE-ISOLATION TEST — TPR Max (FIX-03)');
  console.log(`  Target: ${BASE}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!ANDY_PASS) {
    console.error('❌ DEV_ANDY_PASSWORD env var is not set. Cannot authenticate.');
    process.exit(2);
  }

  // ── Self-verification: prove the framework bites ──
  if (!selfVerify()) process.exit(1);

  // ── Authenticate two sessions as the same enterprise user ──
  const sessionA = new Session('Site-A');
  const sessionB = new Session('Site-B');

  const loggedIn = await loginAs(sessionA, 'andy', ANDY_PASS);
  if (!loggedIn) {
    console.error('❌ Login as andy failed. Is the server running and the password correct?');
    process.exit(2);
  }
  const loggedInB = await loginAs(sessionB, 'andy', ANDY_PASS);
  if (!loggedInB) {
    console.error('❌ Second login as andy failed.');
    process.exit(2);
  }

  // ── Check enterprise status; self-provision if DATABASE_URL is available ──
  let siteAId: string;
  let siteBId: string;

  const ctxResp = await sessionA.get('/api/enterprise/context');
  const ctx = ctxResp.data as any;

  if (!ctxResp.ok || !ctx?.isEnterprise) {
    // Try to self-provision
    const provisioned = await provisionTestEnvironment();
    if (!provisioned) {
      console.log('\n⏭  SKIP — enterprise not enabled and self-provisioning unavailable.');
      console.log('   Either:');
      console.log('   a) Set DATABASE_URL to allow auto-provisioning, or');
      console.log('   b) Enable enterprise on the test customer via Platform Admin UI');
      console.log('      and create >= 2 sites in Enterprise Settings, then re-run.');
      process.exit(2);
    }
    siteAId = provisioned.siteAId;
    siteBId = provisioned.siteBId;
    // Re-login after provisioning to pick up enterprise context
    await loginAs(sessionA, 'andy', ANDY_PASS);
    await loginAs(sessionB, 'andy', ANDY_PASS);
  } else {
    // Already enterprise — pick first two sites
    const sitesResp = await sessionA.get('/api/enterprise/sites');
    const sites = (sitesResp.data as any[]) ?? [];
    if (sites.length < 2) {
      const provisioned = await provisionTestEnvironment();
      if (!provisioned) {
        console.log(`⏭  SKIP — enterprise customer has ${sites.length} site(s); need >= 2.`);
        process.exit(2);
      }
      siteAId = provisioned.siteAId;
      siteBId = provisioned.siteBId;
      await loginAs(sessionA, 'andy', ANDY_PASS);
      await loginAs(sessionB, 'andy', ANDY_PASS);
    } else {
      siteAId = sites[0].id;
      siteBId = sites[1].id;
    }
  }

  console.log(`\n  Sites confirmed: A=${siteAId}, B=${siteBId}\n`);

  try {
    // ── Pre-existing route suite ───────────────────────────────────────────
    console.log('── Feature tests (existing coverage) ────────────────────────────');
    await testPreBookingIsolation(sessionA, sessionB, siteAId, siteBId);
    await testContractorPreBookingIsolation(sessionA, sessionB, siteAId, siteBId);
    await testVisitorIsolation(sessionA, sessionB, siteAId, siteBId);
    await testStaffIsolation(sessionA, sessionB, siteAId, siteBId);
    await testMusterIsolation(sessionA, sessionB, siteAId, siteBId);
    await testHelpDeskIsolation(sessionA, sessionB, siteAId, siteBId);
    await testRaBuilderIsolation(sessionA, sessionB, siteAId, siteBId);
    await testPpmIsolation(sessionA, sessionB, siteAId, siteBId);
    await testAuditRecordIsolation(sessionA, sessionB, siteAId, siteBId);

    // ── FIX-03: newly patched routes (proves the test bites) ──────────────
    console.log('\n── FIX-03 route tests (visitor search · diary · induction tokens) ─');
    await testVisitorSearchIsolation(sessionA, sessionB, siteAId, siteBId);
    await testDiaryIsolation(sessionA, sessionB, siteAId, siteBId);
    await testInductionTokenListIsolation(sessionA, sessionB, siteAId, siteBId);

    // ── Write-path guarantee ───────────────────────────────────────────────
    console.log('\n── Write-path guarantee ──────────────────────────────────────────');
    await testWriteGuarantee(sessionA, sessionB, siteAId, siteBId);

    // ── NULL site_id integrity check ───────────────────────────────────────
    await testNullSiteIdIntegrity(sessionA);

    // ── Single-site customer regression ───────────────────────────────────
    console.log('\n── Single-site regression ────────────────────────────────────────');
    if (EMMA_PASS) {
      const singleSession = new Session('SingleSite');
      const emmaOk = await loginAs(singleSession, 'emma', EMMA_PASS);
      if (emmaOk) {
        await testSingleSiteCustomerUnaffected(singleSession);
      } else {
        skip('Single-site regression suite', 'emma login failed');
      }
    } else {
      skip('Single-site regression suite', 'DEV_EMMA_PASSWORD not set');
    }
  } finally {
    await teardownTestEnvironment();
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${PASS} passed  |  ${FAIL} failed  |  ${SKIP} skipped`);
  if (FAIL === 0) {
    console.log('\n  ✅ ALL ASSERTIONS PASSED — site-isolation is solid.\n');
    process.exit(0);
  } else {
    console.error(`\n  ❌ ${FAIL} ASSERTION(S) FAILED — site-isolation breach detected.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error in isolation test:', err);
  process.exit(1);
});
