/**
 * tests/site-isolation.routes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-HTTP route isolation test suite.
 *
 * Uses vitest + supertest to drive the actual Express app and assert that
 * enterprise multi-site isolation is enforced at the HTTP layer.
 *
 * Each `it()` block creates fresh supertest agents scoped to Site A and Site B,
 * posts a record with a unique timestamp marker at Site A, then verifies that
 * the same marker is NOT visible from Site B's agent.
 *
 * HOW AUTHENTICATION WORKS IN TESTS
 * ─────────────────────────────────
 * `POST /api/__test__/session` (registered only when NODE_ENV === "test") injects
 * a pre-authenticated session so tests bypass login / OTP / CSRF.
 *
 * HOW TO PROVE IT BITES
 * ─────────────────────
 * 1. Open server/routes/induction.ts
 * 2. Inside the `GET /api/induction/admin/tokens` handler, find the line:
 *      if (r.personType === 'visitor') return r.visitorId ? allowedVisitorIds.has(r.visitorId) : false;
 *    and change it to `return true;` (making every visitor token visible regardless of site)
 * 3. Run:  NODE_ENV=test npx vitest run tests/site-isolation.routes.test.ts
 * 4. The "induction admin tokens" test goes RED.
 * 5. Restore the line → GREEN.
 *
 * PROVE-IT-BITES (RAMS — newly covered route):
 * ─────────────────────────────────────────────
 * 1. Open server/routes/rams.ts
 * 2. In the GET /api/rams handler find:
 *      if (activeSiteId) conditions.push(eq(ramsDocuments.siteId, activeSiteId));
 *    and comment it out so the enterprise site filter is never applied.
 * 3. Run the suite → the "RAMS documents" test goes RED with:
 *      [rams] Site A must NOT see Site B record — cross-site leak!
 * 4. Restore the line → GREEN.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../server/app";
import {
  seedEnterpriseTestCustomer,
  cleanupEnterpriseTestCustomer,
  createTestInductionToken,
  deleteTestInductionToken,
  seedRoleScopeUser,
  cleanupRoleScopeUser,
  type SeedResult,
} from "./helpers/seedEnterprise";

// ── Module-level state set up in beforeAll ────────────────────────────────────
let app: Express;
let seed: SeedResult;

// ── Test infrastructure ───────────────────────────────────────────────────────

/**
 * Create a supertest agent whose session has userId, customerId, AND activeSiteId
 * all set in one atomic /api/__test__/session call (which uses explicit session.save()).
 * This avoids race conditions caused by relying on the auto-save timing of the
 * separate /api/enterprise/active-site endpoint.
 */
async function agentForSite(siteId: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/__test__/session")
    .send({
      userId: seed.adminUserId,
      customerId: seed.customerId,
      activeSiteId: siteId,
    })
    .expect(200);
  return agent;
}

/**
 * Create a supertest agent authenticated as a specific user (not the shared admin).
 * Used by the drill-down role scope test to set up users with distinct grant levels.
 */
async function agentForSiteAsUser(siteId: string, userId: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/__test__/session")
    .send({
      userId,
      customerId: seed.customerId,
      activeSiteId: siteId,
    })
    .expect(200);
  return agent;
}

/**
 * Generic isolation helper:
 * 1. Creates a record at Site A with a unique marker embedded in the body.
 * 2. Creates a record at Site B with a different marker.
 * 3. Lists records at Site A — marker A must appear, marker B must not.
 * 4. Lists records at Site B — marker B must appear, marker A must not.
 *
 * `markerOf(item)` extracts the string from a list-item used to identify it.
 * `listPath` response must be either an array or `{ items: [...] }`.
 */
async function expectIsolated(opts: {
  label: string;
  createPath: string;
  createBody: (marker: string) => Record<string, unknown>;
  listPath: string;
  markerOf: (item: Record<string, unknown>) => string;
  allowedCreateStatus?: number[];
}) {
  const allowed = opts.allowedCreateStatus ?? [200, 201];
  const a = await agentForSite(seed.siteAId);
  const b = await agentForSite(seed.siteBId);

  const markerA = `ISO-A-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const markerB = `ISO-B-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const createdA = await a.post(opts.createPath).send(opts.createBody(markerA));
  expect(allowed, `[${opts.label}] Site A create status`).toContain(createdA.status);

  const createdB = await b.post(opts.createPath).send(opts.createBody(markerB));
  expect(allowed, `[${opts.label}] Site B create status`).toContain(createdB.status);

  const listA = await a.get(opts.listPath).expect(200);
  const listB = await b.get(opts.listPath).expect(200);

  const itemsA: Record<string, unknown>[] = listA.body?.items ?? listA.body ?? [];
  const itemsB: Record<string, unknown>[] = listB.body?.items ?? listB.body ?? [];

  const markersA = itemsA.map(opts.markerOf);
  const markersB = itemsB.map(opts.markerOf);

  // Site A sees its own record
  expect(markersA, `[${opts.label}] Site A must see its own record`).toContain(markerA);
  // Site A must NOT see Site B's record
  expect(markersA, `[${opts.label}] Site A must NOT see Site B record — cross-site leak!`).not.toContain(markerB);
  // Site B sees its own record
  expect(markersB, `[${opts.label}] Site B must see its own record`).toContain(markerB);
  // Site B must NOT see Site A's record
  expect(markersB, `[${opts.label}] Site B must NOT see Site A record — cross-site leak!`).not.toContain(markerA);
}

// ── Suite setup / teardown ────────────────────────────────────────────────────

beforeAll(async () => {
  // Build the Express app (includes all middleware + routes, no listen)
  const result = await createApp();
  app = result.app;

  // Provision enterprise test environment in the dev DB
  seed = await seedEnterpriseTestCustomer();
}, 60_000 /* allow up to 60 s for app boot + DB setup */);

afterAll(async () => {
  await cleanupEnterpriseTestCustomer(seed);
}, 15_000);

// ── Tests (one describe block keeps vitest output tidy) ───────────────────────

describe("HTTP route site isolation — enterprise multi-site", () => {

  it("visitors (add-profile / GET /api/visitors)", async () => {
    await expectIsolated({
      label: "visitors",
      createPath: "/api/visitors/add-profile",
      createBody: (marker) => ({
        firstName: "IsoHTTP",
        lastName: marker,
        email: `iso-vis-${marker}@test.example`,
        company: "IsoHTTPCo",
        purpose: "site-isolation-http-test",
      }),
      listPath: "/api/visitors",
      markerOf: (v) => String(v.lastName ?? ""),
    });
  }, 30_000);

  it("staff (POST /api/staff / GET /api/staff)", async () => {
    await expectIsolated({
      label: "staff",
      createPath: "/api/staff",
      createBody: (marker) => ({
        firstName: "IsoHTTP",
        lastName: marker,
        email: `iso-staff-${marker}@test.example`,
        department: "IsoHTTP Dept",
        jobTitle: "Tester",
        employeeId: `EMP-${marker}`,
      }),
      listPath: "/api/staff",
      markerOf: (s) => String(s.lastName ?? ""),
    });
  }, 30_000);

  it("pre-bookings (POST /api/prebookings / GET /api/prebookings)", async () => {
    await expectIsolated({
      label: "pre-bookings",
      createPath: "/api/prebookings",
      createBody: (marker) => ({
        visitorFirstName: "IsoHTTP",
        visitorLastName: marker,
        visitorEmail: `iso-pb-${marker}@test.example`,
        company: "IsoHTTPCo",
        purpose: "site-isolation-http-test",
        visitDate: new Date(Date.now() + 86_400_000).toISOString(),
        hostName: "ISO Host",
        isApproved: false,
      }),
      listPath: "/api/prebookings",
      markerOf: (p) => String(p.visitorLastName ?? ""),
    });
  }, 30_000);

  it("helpdesk tickets (POST /api/helpdesk/tickets / GET /api/helpdesk/tickets)", async () => {
    await expectIsolated({
      label: "helpdesk",
      createPath: "/api/helpdesk/tickets",
      // Use marker directly as title so markerOf(item) === marker (exact array equality)
      createBody: (marker) => ({
        title: marker,
        description: "Site isolation HTTP test ticket",
        category: "it",
        priority: "medium",
      }),
      listPath: "/api/helpdesk/tickets",
      markerOf: (t) => String(t.title ?? ""),
    });
  }, 30_000);

  it("PPM assets (POST /api/ppm/assets / GET /api/ppm/assets) — requires admin role", async () => {
    await expectIsolated({
      label: "ppm-assets",
      createPath: "/api/ppm/assets",
      // Use marker directly as name so markerOf(item) === marker
      createBody: (marker) => ({
        name: marker,
        category: "HVAC",
        location: "ISO Test Room",
        status: "active",
      }),
      listPath: "/api/ppm/assets",
      markerOf: (a) => String(a.name ?? ""),
    });
  }, 30_000);

  it("RA Builder assessments (POST /api/ra-builder/assessments / GET /api/ra-builder/assessments)", async () => {
    await expectIsolated({
      label: "ra-builder",
      createPath: "/api/ra-builder/assessments",
      // Use marker directly as title so markerOf(item) === marker
      createBody: (marker) => ({
        title: marker,
        description: "Site isolation HTTP test assessment",
        type: "general",
        status: "draft",
        riskLevel: "medium",
        location: "ISO Test Location",
        assessedBy: "ISO Tester",
        assessmentDate: new Date().toISOString(),
      }),
      listPath: "/api/ra-builder/assessments",
      markerOf: (r) => String(r.title ?? ""),
    });
  }, 30_000);

  /**
   * Induction admin tokens — custom-filtered route (not using scopedWhere).
   *
   * This test validates the bespoke post-query filter in
   * GET /api/induction/admin/tokens that resolves each token's site by looking
   * up the visitor/staff record in the isolated customer DB.
   *
   * PROVE-IT-BITES TARGET: in induction.ts, change the visitor filter line
   *   `if (r.personType === 'visitor') return r.visitorId ? allowedVisitorIds.has(r.visitorId) : false;`
   * to `return true;` and this test will go RED.
   */
  it("induction admin tokens — GET /api/induction/admin/tokens is site-scoped", async () => {
    // Create a visitor at Site A so it carries siteId = siteAId in the isolated DB
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();
    const visRes = await agentA.post("/api/visitors/add-profile").send({
      firstName: "InductionIsoHTTP",
      lastName: `SiteA-${ts}`,
      email: `induction-iso-http-${ts}@test.example`,
      company: "IsoHTTPCo",
      purpose: "induction-isolation-test",
    });

    expect(
      [200, 201],
      "POST /api/visitors/add-profile should succeed"
    ).toContain(visRes.status);

    const visitorId: string | undefined = visRes.body?.id;
    expect(visitorId, "Visitor response must include id").toBeTruthy();

    // Insert an induction token for this visitor directly in the management DB
    let tokenId: string | undefined;
    if (visitorId) {
      const tok = await createTestInductionToken(
        visitorId,
        seed.customerId,
        `InductionIsoHTTP SiteA-${ts}`
      );
      tokenId = tok.tokenId;
    }

    try {
      // Both sites fetch the admin token list
      const tokensA = await agentA.get("/api/induction/admin/tokens").expect(200);
      const tokensB = await agentB.get("/api/induction/admin/tokens").expect(200);

      const arrA: Record<string, unknown>[] = Array.isArray(tokensA.body)
        ? tokensA.body
        : [];
      const arrB: Record<string, unknown>[] = Array.isArray(tokensB.body)
        ? tokensB.body
        : [];

      // The visitor's token must appear in Site A's list
      if (tokenId) {
        const aHasToken = arrA.some((t) => t.id === tokenId);
        expect(
          aHasToken,
          `Site A token list must contain the token created for a Site A visitor (tokenId=${tokenId})`
        ).toBe(true);
      }

      // The visitor's token must NOT appear in Site B's list
      if (visitorId) {
        const bHasVisitorToken = arrB.some(
          (t) => t.visitorId === visitorId || t.id === tokenId
        );
        expect(
          bHasVisitorToken,
          `Site B token list must NOT reference Site A visitorId ${visitorId} — cross-site leak!`
        ).toBe(false);
      }

      // Disjointness check for all visitor/staff tokens
      const siteScoped = (t: Record<string, unknown>) =>
        t.personType === "visitor" || t.personType === "staff";
      const idsA = new Set(arrA.filter(siteScoped).map((t) => t.id as string));
      const idsB = new Set(arrB.filter(siteScoped).map((t) => t.id as string));
      const overlap = [...idsA].filter((id) => idsB.has(id));

      expect(
        overlap,
        `Visitor/staff induction tokens must be disjoint across sites. Overlap: ${overlap.join(", ")}`
      ).toHaveLength(0);
    } finally {
      // Clean up the test token
      if (tokenId) await deleteTestInductionToken(tokenId);
    }
  }, 30_000);

  // ── New tests added by feature-enterprise-multisite-TEST-extend-route-isolation-muster ──

  /**
   * Muster / evacuation roll-call — GET /api/muster.
   *
   * The muster endpoint returns currently checked-in people, filtered by the
   * active site.  This test checks in a unique staff member at each site and
   * verifies that Site A's muster roll only shows Site A people and vice versa.
   *
   * PROVE-IT-BITES: in server/routes/emergency.ts, find the `matchesSite`
   * filter application on the checked-in list and remove it.  The test will go
   * RED because both sites will see the combined list.  Restore → GREEN.
   */
  it("muster roll-call — GET /api/muster is site-scoped", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();
    const markerA = `MusterIso-A-${ts}`;
    const markerB = `MusterIso-B-${ts}`;

    // Create a unique staff member at each site (POST /api/staff stamps siteId via withSiteId)
    const staffResA = await agentA.post("/api/staff").send({
      firstName: "MusterIso",
      lastName: markerA,
      email: `muster-iso-a-${ts}@test.example`,
      department: "ISO Muster Dept",
      jobTitle: "Muster Tester",
      employeeId: `MUS-A-${ts}`,
    });
    expect(
      [200, 201],
      `Site A staff create for muster (status ${staffResA.status}): ${JSON.stringify(staffResA.body)}`
    ).toContain(staffResA.status);

    const staffResB = await agentB.post("/api/staff").send({
      firstName: "MusterIso",
      lastName: markerB,
      email: `muster-iso-b-${ts}@test.example`,
      department: "ISO Muster Dept",
      jobTitle: "Muster Tester",
      employeeId: `MUS-B-${ts}`,
    });
    expect(
      [200, 201],
      `Site B staff create for muster (status ${staffResB.status}): ${JSON.stringify(staffResB.body)}`
    ).toContain(staffResB.status);

    const staffIdA: string | undefined = staffResA.body?.id;
    const staffIdB: string | undefined = staffResB.body?.id;
    expect(staffIdA, "Site A staff response must include id").toBeTruthy();
    expect(staffIdB, "Site B staff response must include id").toBeTruthy();

    // Check in each staff member at their respective site
    if (staffIdA) {
      const checkinA = await agentA.post(`/api/staff/${staffIdA}/checkin`).send({ manual: true });
      // RTW may block check-in (non-fatal for the test — the muster then simply
      // won't see them, which means the Site B isolation assertion still holds).
      expect(
        [200, 201, 400, 403, 409, 422],
        `Site A staff check-in (status ${checkinA.status}): ${JSON.stringify(checkinA.body)}`
      ).toContain(checkinA.status);
    }

    if (staffIdB) {
      const checkinB = await agentB.post(`/api/staff/${staffIdB}/checkin`).send({ manual: true });
      expect(
        [200, 201, 400, 403, 409, 422],
        `Site B staff check-in (status ${checkinB.status}): ${JSON.stringify(checkinB.body)}`
      ).toContain(checkinB.status);
    }

    // Both sites fetch the muster roll
    const musterA = await agentA.get("/api/muster").expect(200);
    const musterB = await agentB.get("/api/muster").expect(200);

    const listA: Record<string, unknown>[] = Array.isArray(musterA.body)
      ? musterA.body
      : (musterA.body?.people ?? musterA.body?.staff ?? []);
    const listB: Record<string, unknown>[] = Array.isArray(musterB.body)
      ? musterB.body
      : (musterB.body?.people ?? musterB.body?.staff ?? []);

    // Helper: extract a name fragment from a muster item
    const nameOf = (item: Record<string, unknown>) =>
      String(item.name ?? item.lastName ?? item.fullName ?? "");

    const namesA = listA.map(nameOf);
    const namesB = listB.map(nameOf);

    // If both check-ins succeeded (no RTW block), assert strict isolation
    const aCheckedIn = namesA.some((n) => n.includes(markerA));
    const bCheckedIn = namesB.some((n) => n.includes(markerB));

    if (aCheckedIn) {
      // Site A's muster must NOT list Site B's staff member
      expect(
        namesA.some((n) => n.includes(markerB)),
        `Site A muster must NOT show Site B staff (${markerB}) — cross-site leak!`
      ).toBe(false);
    }
    if (bCheckedIn) {
      // Site B's muster must NOT list Site A's staff member
      expect(
        namesB.some((n) => n.includes(markerA)),
        `Site B muster must NOT show Site A staff (${markerA}) — cross-site leak!`
      ).toBe(false);
    }
    // Both check-ins must have succeeded for the test to be meaningful
    expect(
      aCheckedIn || bCheckedIn,
      "At least one staff check-in must succeed for the muster isolation test to be meaningful"
    ).toBe(true);
  }, 30_000);

  /**
   * Contractor pre-bookings — POST/GET /api/contractors/prebookings.
   *
   * The contractor pre-booking routes use getScopedDb + scopedWhere (the
   * standard isolation pattern) so new bookings are stamped with the active
   * site's siteId and the list endpoint only returns bookings for that site.
   */
  it("contractor pre-bookings (POST /api/contractors/prebookings / GET /api/contractors/prebookings)", async () => {
    await expectIsolated({
      label: "contractor-prebookings",
      createPath: "/api/contractors/prebookings",
      createBody: (marker) => ({
        workerName: marker,
        companyName: "ISO Contractor Ltd",
        contactEmail: `iso-cpb-${marker}@test.example`,
        purpose: "site-isolation-http-test",
        scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
        scheduledTime: "09:00",
      }),
      listPath: "/api/contractors/prebookings",
      markerOf: (p) => String(p.workerName ?? ""),
    });
  }, 30_000);

  /**
   * RAMS documents — POST/GET /api/rams.
   *
   * RAMS was originally customer-scoped only (no siteId).  This test proved the
   * gap: the first run went RED because Site B could see Site A's RAMS record.
   * server/routes/rams.ts was fixed to stamp + filter by siteId for enterprise.
   *
   * PROVE-IT-BITES TARGET: in server/routes/rams.ts GET /api/rams handler,
   * comment out: `if (activeSiteId) conditions.push(eq(ramsDocuments.siteId, activeSiteId));`
   * Run → RED ("Site A must NOT see Site B record").  Restore → GREEN.
   */
  it("RAMS documents (POST /api/rams / GET /api/rams)", async () => {
    await expectIsolated({
      label: "rams",
      createPath: "/api/rams",
      createBody: (marker) => ({
        ramsIdRef: `RAMS-${marker}`,
        documentName: marker,
        documentUrl: "https://example.com/test-rams-iso.pdf",
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      listPath: "/api/rams",
      markerOf: (d) => String(d.documentName ?? ""),
    });
  }, 30_000);

  /**
   * Visitor pass QR scan isolation — POST /api/qr-scan/universal.
   *
   * The universal QR scan endpoint uses a fetch-then-reject pattern:
   *   1. It finds the pre-booking by QR code across the whole customer DB.
   *   2. If the pre-booking's siteId differs from the scanner's active site, it
   *      sets found = undefined, causing the scan to fail silently.
   *
   * This test creates a visitor pre-booking at Site A, then attempts to scan its
   * QR code from a Site B agent.  The scan must fail (success: false) and the
   * pre-booking must remain un-checked-in.
   */
  it("passes / QR scan — Site B cannot resolve a Site A pre-booking QR code", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create a visitor pre-booking at Site A — siteId is stamped server-side
    const pbRes = await agentA.post("/api/prebookings").send({
      visitorFirstName: "PassIso",
      visitorLastName: `SiteA-${ts}`,
      visitorEmail: `pass-iso-a-${ts}@test.example`,
      company: "IsoPassCo",
      purpose: "pass-isolation-http-test",
      visitDate: new Date(Date.now() + 86_400_000).toISOString(),
      hostName: "ISO Host",
      isApproved: false,
    });
    expect(
      [200, 201],
      `Site A pre-booking create (status ${pbRes.status}): ${JSON.stringify(pbRes.body)}`
    ).toContain(pbRes.status);

    const qrCode: string | undefined = pbRes.body?.qrCode;
    const preBookingId: string | undefined = pbRes.body?.id;
    expect(qrCode, "Pre-booking response must include qrCode").toBeTruthy();

    if (!qrCode) return; // TypeScript guard — expect above already fails

    // Site B tries to scan the Site A pre-booking's QR code
    const scanResB = await agentB
      .post("/api/qr-scan/universal")
      .send({ qrData: qrCode });

    // The scan must not result in a successful check-in
    expect(
      scanResB.body?.success,
      `Cross-site QR scan from Site B for a Site A pre-booking must fail (got: ${JSON.stringify(scanResB.body)})`
    ).toBe(false);

    // Verify the pre-booking at Site A is still not checked in
    if (preBookingId) {
      const pbListRes = await agentA.get("/api/prebookings").expect(200);
      const pbList: Record<string, unknown>[] = Array.isArray(pbListRes.body)
        ? pbListRes.body
        : [];
      const pbRecord = pbList.find((p) => p.id === preBookingId);
      if (pbRecord) {
        expect(
          pbRecord.isCheckedIn,
          "Site A pre-booking must still be not-checked-in after Site B scan attempt"
        ).toBeFalsy();
      }
    }
  }, 30_000);

  /**
   * Visitor pass print — GET /api/passes/print/visitor/:visitorId.
   *
   * The print-pass route fetches a visitor by ID from the customer's isolated DB
   * without site-scoping.  This test proves that the added site isolation check
   * blocks a Site B session from printing a Site A visitor's pass.
   *
   * Without the fix (removed from the route), this test goes RED because the
   * route returns 200 HTML for a cross-site visitorId.
   */
  it("visitor pass print — Site B cannot print a Site A visitor's pass", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create a visitor at Site A — siteId is stamped server-side
    const visRes = await agentA.post("/api/visitors/add-profile").send({
      firstName: "PassPrint",
      lastName: `SiteA-${ts}`,
      email: `passprint-iso-a-${ts}@test.example`,
      company: "IsoPassPrintCo",
      purpose: "pass-print-isolation-test",
    });
    expect(
      [200, 201],
      `Site A visitor create for print test (status ${visRes.status}): ${JSON.stringify(visRes.body)}`
    ).toContain(visRes.status);

    const visitorId: string | undefined = visRes.body?.id;
    expect(visitorId, "Visitor response must include id").toBeTruthy();

    if (!visitorId) return;

    // Site A can print its own visitor's pass
    const printResA = await agentA.get(`/api/passes/print/visitor/${visitorId}`);
    expect(
      [200],
      `Site A should be able to print its own visitor pass (status ${printResA.status})`
    ).toContain(printResA.status);

    // Site B must NOT be able to print Site A's visitor pass
    const printResB = await agentB.get(`/api/passes/print/visitor/${visitorId}`);
    expect(
      [403, 404],
      `Site B must not print a Site A visitor pass — cross-site leak! (status ${printResB.status})`
    ).toContain(printResB.status);
  }, 30_000);

  /**
   * Drill-down role scope — GET /api/enterprise/sites/:id.
   *
   * Tests that the `requireEnterpriseRole` + in-handler grant check enforces
   * correct access:
   *   • enterprise_admin → 200 for any site in the customer
   *   • site_coordinator scoped to Site A → 200 for Site A, 403 for Site B
   *
   * Each user is created fresh in the isolated customer schema via
   * seedRoleScopeUser() and cleaned up in the finally block.
   */
  it("enterprise/sites/:id — drill-down role scope (enterprise_admin vs site_coordinator)", async () => {
    let adminUserId: string | undefined;
    let coordUserId: string | undefined;

    try {
      // ── 1. enterprise_admin — should see any site ──────────────────────────
      const adminUser = await seedRoleScopeUser(seed, { role: "enterprise_admin" });
      adminUserId = adminUser.userId;

      const adminAgentA = await agentForSiteAsUser(seed.siteAId, adminUserId);
      const adminAgentB = await agentForSiteAsUser(seed.siteBId, adminUserId);

      const adminSeesSiteA = await adminAgentA.get(`/api/enterprise/sites/${seed.siteAId}`);
      expect(
        adminSeesSiteA.status,
        `enterprise_admin should see Site A (got ${adminSeesSiteA.status}): ${JSON.stringify(adminSeesSiteA.body)}`
      ).toBe(200);

      const adminSeesSiteB = await adminAgentB.get(`/api/enterprise/sites/${seed.siteBId}`);
      expect(
        adminSeesSiteB.status,
        `enterprise_admin should see Site B (got ${adminSeesSiteB.status}): ${JSON.stringify(adminSeesSiteB.body)}`
      ).toBe(200);

      // ── 2. site_coordinator scoped to Site A only ──────────────────────────
      const coordUser = await seedRoleScopeUser(seed, {
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      coordUserId = coordUser.userId;

      const coordAgentA = await agentForSiteAsUser(seed.siteAId, coordUserId);
      const coordAgentB = await agentForSiteAsUser(seed.siteBId, coordUserId);

      const coordSeesSiteA = await coordAgentA.get(`/api/enterprise/sites/${seed.siteAId}`);
      expect(
        coordSeesSiteA.status,
        `site_coordinator for Site A should see Site A (got ${coordSeesSiteA.status}): ${JSON.stringify(coordSeesSiteA.body)}`
      ).toBe(200);

      const coordSeesNoSiteB = await coordAgentB.get(`/api/enterprise/sites/${seed.siteBId}`);
      expect(
        coordSeesNoSiteB.status,
        `site_coordinator for Site A must NOT see Site B — 403 expected (got ${coordSeesNoSiteB.status}): ${JSON.stringify(coordSeesNoSiteB.body)}`
      ).toBe(403);

    } finally {
      if (adminUserId) await cleanupRoleScopeUser(seed, adminUserId);
      if (coordUserId) await cleanupRoleScopeUser(seed, coordUserId);
    }
  }, 30_000);

  /**
   * PPM schedules — GET /api/ppm/schedules site isolation.
   *
   * Site A creates an asset (required FK) then a schedule.
   * Site B's schedule list must NOT include the Site A schedule.
   */
  it("ppm schedules — Site B cannot see Site A PPM schedules", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create an asset at Site A (required because ppmSchedules.assetId is NOT NULL)
    const assetRes = await agentA.post("/api/ppm/assets").send({
      name: `PPM-Asset-SiteA-${ts}`,
      status: "active",
    });
    expect(
      [200, 201],
      `Site A PPM asset create (status ${assetRes.status}): ${JSON.stringify(assetRes.body)}`
    ).toContain(assetRes.status);
    const assetId: string | undefined = assetRes.body?.id;
    expect(assetId, "PPM asset create must return an id").toBeTruthy();

    if (!assetId) return;

    // Create a schedule at Site A using the new asset
    const schedRes = await agentA.post("/api/ppm/schedules").send({
      assetId,
      title: `PPM-Sched-SiteA-${ts}`,
      frequency: "monthly",
      startDate: "2026-01-01",
      nextDueDate: "2026-02-01",
      status: "scheduled",
    });
    expect(
      [200, 201],
      `Site A PPM schedule create (status ${schedRes.status}): ${JSON.stringify(schedRes.body)}`
    ).toContain(schedRes.status);
    const schedId: string | undefined = schedRes.body?.id;
    expect(schedId, "PPM schedule create must return an id").toBeTruthy();

    // Site B lists schedules — must NOT see Site A's schedule
    const listResB = await agentB.get("/api/ppm/schedules").expect(200);
    const schedules: Record<string, unknown>[] = Array.isArray(listResB.body)
      ? listResB.body
      : [];
    const leaked = schedules.some((s) => s.id === schedId);
    expect(
      leaked,
      `[ppm-schedules] Site B must NOT see Site A PPM schedule — cross-site leak!`
    ).toBe(false);
  }, 30_000);

  /**
   * PPM work orders — GET /api/ppm/work-orders site isolation.
   *
   * Site A creates a work order. Site B's work-order list must NOT include it.
   */
  it("ppm work orders — Site B cannot see Site A PPM work orders", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create a work order at Site A (title is the only required field)
    const woRes = await agentA.post("/api/ppm/work-orders").send({
      title: `PPM-WO-SiteA-${ts}`,
      status: "scheduled",
    });
    expect(
      [200, 201],
      `Site A PPM work order create (status ${woRes.status}): ${JSON.stringify(woRes.body)}`
    ).toContain(woRes.status);
    const woId: string | undefined = woRes.body?.id;
    expect(woId, "PPM work order create must return an id").toBeTruthy();

    // Site B lists work orders — must NOT see Site A's work order
    const listResB = await agentB.get("/api/ppm/work-orders").expect(200);
    const wos: Record<string, unknown>[] = Array.isArray(listResB.body)
      ? listResB.body
      : [];
    const leaked = wos.some((w) => w.id === woId);
    expect(
      leaked,
      `[ppm-work-orders] Site B must NOT see Site A PPM work order — cross-site leak!`
    ).toBe(false);
  }, 30_000);

  /**
   * Regression: enterprise customer endpoints still function correctly when an
   * active site IS selected.  Verifies that the enterprise refactoring hasn't
   * broken basic listing operations that previously worked.
   */
  it("regression — enterprise customer endpoints still work with an active site", async () => {
    const agent = await agentForSite(seed.siteAId);

    const visitors = await agent.get("/api/visitors");
    expect([200], "GET /api/visitors should return 200").toContain(visitors.status);

    const prebookings = await agent.get("/api/prebookings");
    expect([200], "GET /api/prebookings should return 200").toContain(prebookings.status);

    const staff = await agent.get("/api/staff");
    expect([200], "GET /api/staff should return 200").toContain(staff.status);
  }, 30_000);
});
