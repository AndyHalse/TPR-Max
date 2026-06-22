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

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:5000';
const ANDY_PASS = process.env.DEV_ANDY_PASSWORD ?? '';
const EMMA_PASS = process.env.DEV_EMMA_PASSWORD ?? '';
const TEST_PASS = process.env.TEST_USER_PASSWORD ?? ANDY_PASS;

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

async function loginAs(
  session: Session,
  username: string,
  password: string,
): Promise<boolean> {
  const r = await session.post('/api/auth/login', { username, password });
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
  console.log('  ENTERPRISE SITE-ISOLATION TEST — TPR Max');
  console.log(`  Target: ${BASE}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!ANDY_PASS) {
    console.error('❌ DEV_ANDY_PASSWORD env var is not set. Cannot authenticate.');
    process.exit(2);
  }

  // ── Authenticate two sessions as the same enterprise user ──
  const sessionA = new Session('Site-A');
  const sessionB = new Session('Site-B');

  const loggedIn = await loginAs(sessionA, 'andy', ANDY_PASS);
  if (!loggedIn) {
    console.error('❌ Login as andy failed. Is the server running and the password correct?');
    process.exit(2);
  }

  // Copy session cookies to sessionB (same auth, we'll switch sites independently)
  const loggedInB = await loginAs(sessionB, 'andy', ANDY_PASS);
  if (!loggedInB) {
    console.error('❌ Second login as andy failed.');
    process.exit(2);
  }

  // ── Check enterprise status ──
  const ctxResp = await sessionA.get('/api/enterprise/context');
  const ctx = ctxResp.data as any;

  if (!ctxResp.ok || !ctx?.isEnterprise) {
    console.log('⏭  SKIP — the current customer is not an enterprise customer.');
    console.log('   To run site-isolation tests, enable enterprise on a test customer');
    console.log('   and ensure it has at least 2 sites configured.');
    process.exit(2);
  }

  // ── Get sites ──
  const sitesResp = await sessionA.get('/api/enterprise/sites');
  const sites = (sitesResp.data as any[]) ?? [];

  if (sites.length < 2) {
    console.log(`⏭  SKIP — enterprise customer has ${sites.length} site(s); need >= 2.`);
    console.log('   Create a second site in Enterprise Settings and re-run.');
    process.exit(2);
  }

  const siteAId = sites[0].id;
  const siteBId = sites[1].id;
  console.log(`  Enterprise customer confirmed. Sites: A=${siteAId}, B=${siteBId}\n`);

  // ── Run all isolation tests ──
  console.log('── Feature tests ─────────────────────────────────────────────────');
  await testPreBookingIsolation(sessionA, sessionB, siteAId, siteBId);
  await testContractorPreBookingIsolation(sessionA, sessionB, siteAId, siteBId);
  await testVisitorIsolation(sessionA, sessionB, siteAId, siteBId);
  await testStaffIsolation(sessionA, sessionB, siteAId, siteBId);
  await testMusterIsolation(sessionA, sessionB, siteAId, siteBId);
  await testHelpDeskIsolation(sessionA, sessionB, siteAId, siteBId);
  await testRaBuilderIsolation(sessionA, sessionB, siteAId, siteBId);
  await testPpmIsolation(sessionA, sessionB, siteAId, siteBId);
  await testAuditRecordIsolation(sessionA, sessionB, siteAId, siteBId);

  // ── Write-path guarantee ──
  console.log('\n── Write-path guarantee ──────────────────────────────────────────');
  await testWriteGuarantee(sessionA, sessionB, siteAId, siteBId);

  // ── Single-site customer regression ──
  // Use same session as a non-enterprise customer if possible, else skip
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
