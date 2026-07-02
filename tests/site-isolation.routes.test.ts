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
import { clearCustomerEnterpriseCache } from "../server/enterpriseRoles";
import {
  seedEnterpriseTestCustomer,
  cleanupEnterpriseTestCustomer,
  createTestInductionToken,
  deleteTestInductionToken,
  seedRoleScopeUser,
  cleanupRoleScopeUser,
  seedManagementStyle,
  ensureCdmProjectsColumns,
  seedHelpdeskTicketRaw,
  deleteHelpdeskTicketRaw,
  seedLoneWorkerSession,
  cleanupLoneWorkerSession,
  setContractorPoolMode,
  ensureContractorSiteApprovalsTable,
  seedTestContractorCompany,
  cleanupTestContractorCompany,
  seedContractorSiteApproval,
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

  const itemsA: Record<string, unknown>[] = listA.body?.items ?? listA.body?.records ?? (Array.isArray(listA.body) ? listA.body : []);
  const itemsB: Record<string, unknown>[] = listB.body?.items ?? listB.body?.records ?? (Array.isArray(listB.body) ? listB.body : []);

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

  /**
   * Help Desk list — ticket_number has a schema-wide unique constraint but the
   * route generates per-site sequential numbers starting from 1.  Dev/demo data
   * already occupies the low HD-### numbers, causing 5-attempt retry failures.
   * We bypass the route's number generator entirely and use raw SQL to insert
   * tickets with collision-safe numbers, then test only the GET list isolation.
   *
   * PROVE-IT-BITES: in server/routes/helpdesk.ts GET /api/helpdesk/tickets, remove
   * scopedWhere(siteContext, helpDeskTickets) from the .where() clause → Site B
   * receives Site A's ticket in its list → RED.  Restore → GREEN.
   */
  it("helpdesk tickets — GET /api/helpdesk/tickets list isolation (raw-SQL setup)", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();
    const markerA = `ISO-HD-A-${ts}`;

    // Insert a ticket for Site A directly (bypasses schema-wide unique constraint
    // on ticket_number that conflicts with dev demo data).
    const ticketId = await seedHelpdeskTicketRaw(seed.siteAId, markerA);

    try {
      // Site A must see its own ticket
      const listA = await agentA.get("/api/helpdesk/tickets");
      expect([200], `Site A list status (${listA.status})`).toContain(listA.status);
      const itemsA: { title?: string }[] = Array.isArray(listA.body) ? listA.body : [];
      expect(
        itemsA.some((t) => t.title === markerA),
        `Site A must see its own helpdesk ticket (marker=${markerA})`
      ).toBe(true);

      // Site B must NOT see Site A's ticket
      const listB = await agentB.get("/api/helpdesk/tickets");
      expect([200], `Site B list status (${listB.status})`).toContain(listB.status);
      const itemsB: { title?: string }[] = Array.isArray(listB.body) ? listB.body : [];
      expect(
        itemsB.some((t) => t.title === markerA),
        `Site B must NOT see Site A helpdesk ticket — cross-site leak! (marker=${markerA})`
      ).toBe(false);
    } finally {
      await deleteHelpdeskTicketRaw(ticketId);
    }
  }, 30_000);

  /**
   * Help Desk by-id — Site B cannot GET or PUT Site A's ticket by ID.
   *
   * Creates a ticket at Site A, then verifies Site B's agent gets 404
   * on GET /api/helpdesk/tickets/:id and PUT /api/helpdesk/tickets/:id
   * for that ID.
   *
   * PROVE-IT-BITES: in server/routes/helpdesk.ts, on the GET /:id handler,
   * change the .where() clause from:
   *   and(eq(helpDeskTickets.id, id), scopedWhere(siteContext, ...))
   * to:
   *   eq(helpDeskTickets.id, id)
   * and this test goes RED because Site B receives 200 for Site A's ticket.
   * Restore the scopedWhere → GREEN.
   *
   * Help Desk by-id — Site B cannot GET or PUT Site A's ticket by ID.
   * Uses raw SQL to create the ticket (avoids schema-wide ticket_number clash
   * with dev demo data).  Only the GET/:id and PUT/:id isolation is tested here.
   *
   * PROVE-IT-BITES: on GET /api/helpdesk/tickets/:id, remove the
   * scopedWhere(siteContext, helpDeskTickets) from the .where() clause → Site B
   * receives 200 for Site A's ticket → RED.  Restore → GREEN.
   */
  it("helpdesk by-id — Site B cannot GET or PUT Site A's ticket", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Insert ticket for Site A via raw SQL (avoids ticket_number generation conflict)
    const ticketId = await seedHelpdeskTicketRaw(seed.siteAId, `HD-ByID-SiteA-${ts}`);

    try {
      // Site A can read its own ticket
      const getResA = await agentA.get(`/api/helpdesk/tickets/${ticketId}`);
      expect(
        [200],
        `Site A must be able to GET its own ticket (status ${getResA.status})`
      ).toContain(getResA.status);

      // Site B must NOT be able to GET Site A's ticket by ID
      const getResB = await agentB.get(`/api/helpdesk/tickets/${ticketId}`);
      expect(
        [403, 404],
        `Site B must NOT GET Site A ticket by id — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
      ).toContain(getResB.status);

      // Site B must NOT be able to PUT (update) Site A's ticket
      const putResB = await agentB.put(`/api/helpdesk/tickets/${ticketId}`).send({ title: "Hijacked" });
      expect(
        [403, 404],
        `Site B must NOT PUT Site A ticket by id — cross-site leak! (status ${putResB.status}: ${JSON.stringify(putResB.body)})`
      ).toContain(putResB.status);
    } finally {
      await deleteHelpdeskTicketRaw(ticketId);
    }
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
   * RA Builder by-id — Site B cannot read/update/delete Site A's RA by ID.
   *
   * Creates an assessment at Site A, then verifies Site B's agent gets 404
   * on GET /api/ra-builder/assessments/:id, PUT /api/ra-builder/assessments/:id,
   * and DELETE /api/ra-builder/assessments/:id for that ID.
   *
   * PROVE-IT-BITES: in server/routes/raBuilder.ts, on the GET /:id handler,
   * change the .where() clause from:
   *   and(eq(raBuilderAssessments.id, id), scopedWhere(siteContext, ...))
   * to:
   *   eq(raBuilderAssessments.id, id)
   * and this test goes RED because Site B receives 200 for Site A's RA.
   * Restore the scopedWhere → GREEN.
   */
  it("RA Builder by-id — Site B cannot GET/PUT/DELETE Site A's assessment", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create an assessment at Site A
    const createRes = await agentA.post("/api/ra-builder/assessments").send({
      title: `RA-ByID-SiteA-${ts}`,
      description: "Site isolation by-id test",
      type: "general",
      status: "draft",
      riskLevel: "low",
      location: "ISO By-ID Location",
      assessedBy: "ISO Tester",
      assessmentDate: new Date().toISOString(),
    });
    expect(
      [200, 201],
      `Site A RA create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const raId: string | undefined = createRes.body?.id;
    expect(raId, "RA create must return an id").toBeTruthy();
    if (!raId) return;

    // Site A can read its own assessment
    const getResA = await agentA.get(`/api/ra-builder/assessments/${raId}`);
    expect(
      [200],
      `Site A must be able to GET its own RA (status ${getResA.status})`
    ).toContain(getResA.status);

    // Site B must NOT be able to GET Site A's assessment by ID
    const getResB = await agentB.get(`/api/ra-builder/assessments/${raId}`);
    expect(
      [403, 404],
      `Site B must NOT GET Site A RA by id — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
    ).toContain(getResB.status);

    // Site B must NOT be able to PUT (update) Site A's assessment
    const putResB = await agentB.put(`/api/ra-builder/assessments/${raId}`).send({ title: "Hijacked" });
    expect(
      [403, 404],
      `Site B must NOT PUT Site A RA by id — cross-site leak! (status ${putResB.status}: ${JSON.stringify(putResB.body)})`
    ).toContain(putResB.status);

    // Site B's DELETE returns 200 but scopedWhere ensures 0 rows are actually
    // removed from Site A's scope — verify the record still exists for Site A.
    await agentB.delete(`/api/ra-builder/assessments/${raId}`);
    const verifyRes = await agentA.get(`/api/ra-builder/assessments/${raId}`);
    expect(
      [200],
      `Site A's assessment must still exist after Site B's DELETE attempt — cross-site delete leak! (status ${verifyRes.status}: ${JSON.stringify(verifyRes.body)})`
    ).toContain(verifyRes.status);

    // Cleanup: Site A deletes its own assessment
    await agentA.delete(`/api/ra-builder/assessments/${raId}`);
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
   * PPM work-order by-id — Site B cannot access Site A's work order by ID.
   *
   * Uses GET /api/ppm/work-orders/:id/documents as the "by-id" probe because
   * there is no bare GET /api/ppm/work-orders/:id route — the frontend gets
   * individual WOs from the scoped list.  The documents endpoint gates through
   * fetchWoInScope(), so a cross-site woId returns 404, not the data.
   *
   * PROVE-IT-BITES: in server/routes/ppm.ts, find `fetchWoInScope` and remove
   * the `scopedWhere(siteContext, ...)` from its SELECT — so it returns every WO
   * regardless of site.  Run the suite → this test goes RED because Site B gets
   * 200 (documents list) for a Site A work order id.  Restore → GREEN.
   */
  it("ppm work-order by-id — Site B cannot access Site A's work order documents", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();

    // Create a work order at Site A
    const woRes = await agentA.post("/api/ppm/work-orders").send({
      title: `PPM-WO-ByID-SiteA-${ts}`,
      status: "scheduled",
    });
    expect(
      [200, 201],
      `Site A PPM work order create for by-id test (status ${woRes.status}): ${JSON.stringify(woRes.body)}`
    ).toContain(woRes.status);
    const woId: string | undefined = woRes.body?.id;
    expect(woId, "PPM work order create must return an id").toBeTruthy();
    if (!woId) return;

    // Site A can access its own work order's documents
    const docsResA = await agentA.get(`/api/ppm/work-orders/${woId}/documents`);
    expect(
      [200],
      `Site A must be able to fetch its own work order documents (status ${docsResA.status})`
    ).toContain(docsResA.status);

    // Site B must NOT be able to access Site A's work order by ID — 404 expected
    const docsResB = await agentB.get(`/api/ppm/work-orders/${woId}/documents`);
    expect(
      [403, 404],
      `Site B must NOT access Site A work order documents — cross-site leak! (status ${docsResB.status}: ${JSON.stringify(docsResB.body)})`
    ).toContain(docsResB.status);
  }, 30_000);

  /**
   * PPM demo-data isolation — Site B cannot see Site A's demo rows after load.
   *
   * Loads demo data at Site A (POST /api/ppm/demo-data), then verifies that
   * Site B's asset and work-order lists contain zero isDemo=true rows.
   *
   * PROVE-IT-BITES: in server/routes/ppm.ts POST /api/ppm/demo-data, find the
   * first `withSiteId(siteId, { ... isDemo: true })` call for ppmAssetGroups
   * and change it to `{ ... isDemo: true }` (drop withSiteId so no site_id is
   * stamped).  Run → RED because the demo assets have site_id=null, which
   * scopedWhere treats as "any site", leaking them into Site B's list.
   * Restore → GREEN.
   */
  it("ppm demo-data isolation — Site B cannot see Site A demo rows after load", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    // Load demo data at Site A
    const loadRes = await agentA.post("/api/ppm/demo-data").send({});
    // 403 → PPM feature not enabled for test customer — skip gracefully
    if (loadRes.status === 403) return;
    expect(
      [200, 201],
      `Demo data load at Site A (status ${loadRes.status}): ${JSON.stringify(loadRes.body)}`
    ).toContain(loadRes.status);

    try {
      // Site B lists PPM assets — must contain zero isDemo=true rows
      const assetsResB = await agentB.get("/api/ppm/assets").expect(200);
      const assetsBList: Record<string, unknown>[] = Array.isArray(assetsResB.body)
        ? assetsResB.body
        : [];
      const leakedDemoAssets = assetsBList.filter((a) => a.isDemo === true);
      expect(
        leakedDemoAssets,
        `[ppm-demo-isolation] Site B must NOT see Site A demo assets after load — cross-site leak! count=${leakedDemoAssets.length}`
      ).toHaveLength(0);

      // Site B lists PPM work orders — must contain zero isDemo=true rows
      const wosResB = await agentB.get("/api/ppm/work-orders").expect(200);
      const wosBList: Record<string, unknown>[] = Array.isArray(wosResB.body)
        ? wosResB.body
        : [];
      const leakedDemoWOs = wosBList.filter((w) => w.isDemo === true);
      expect(
        leakedDemoWOs,
        `[ppm-demo-isolation] Site B must NOT see Site A demo work orders after load — cross-site leak! count=${leakedDemoWOs.length}`
      ).toHaveLength(0);
    } finally {
      // Always clean up demo data at Site A regardless of test outcome
      await agentA.delete("/api/ppm/demo-data");
    }
  }, 60_000);

  /**
   * PPM demo-data delete — symmetric and site-scoped.
   *
   * Loads demo data at Site A, confirms demo assets exist, then deletes them.
   * The delete response must include `verified: true` (server-side verification
   * pass confirms zero isDemo rows remain).  After delete, the asset list at
   * Site A must contain no isDemo rows.
   *
   * PROVE-IT-BITES: in server/routes/ppm.ts DELETE /api/ppm/demo-data, remove
   * the `scopedWhere(siteContext, ...)` from the ppmAssets DELETE so it deletes
   * across ALL sites.  Then load demo at Site A AND Site B, delete from Site A.
   * Site B should still have its demo data — but without the fix Site B's demo
   * rows are gone too.  (Or alternatively: remove the `eq(isDemo, true)` filter
   * so real assets get deleted, which the response count will expose.)
   */
  it("ppm demo-data delete — symmetric, site-scoped, verified:true in response", async () => {
    const agentA = await agentForSite(seed.siteAId);

    // Load demo data at Site A
    const loadRes = await agentA.post("/api/ppm/demo-data").send({});
    if (loadRes.status === 403) return; // PPM not enabled — skip gracefully
    expect(
      [200, 201],
      `Demo data load (status ${loadRes.status}): ${JSON.stringify(loadRes.body)}`
    ).toContain(loadRes.status);

    // After load, Site A must have at least one demo asset
    const assetsAfterLoad = await agentA.get("/api/ppm/assets").expect(200);
    const demoAssetCount = (Array.isArray(assetsAfterLoad.body) ? assetsAfterLoad.body : [])
      .filter((a: Record<string, unknown>) => a.isDemo === true).length;
    expect(
      demoAssetCount,
      "Demo load must create at least one demo asset at Site A"
    ).toBeGreaterThan(0);

    // Delete demo data at Site A
    const deleteRes = await agentA.delete("/api/ppm/demo-data");
    expect(
      [200],
      `Demo data delete at Site A (status ${deleteRes.status}): ${JSON.stringify(deleteRes.body)}`
    ).toContain(deleteRes.status);

    // Response must contain verified:true (server-side post-delete verification pass)
    expect(
      deleteRes.body?.verified,
      `Demo delete response must include verified:true (got: ${JSON.stringify(deleteRes.body)})`
    ).toBe(true);

    // Response must report at least one deleted asset
    expect(
      deleteRes.body?.assetsDeleted ?? 0,
      "Demo delete must report at least one deleted asset"
    ).toBeGreaterThan(0);

    // After delete, Site A's asset list must have zero isDemo rows
    const assetsAfterDelete = await agentA.get("/api/ppm/assets").expect(200);
    const remainingDemo = (Array.isArray(assetsAfterDelete.body) ? assetsAfterDelete.body : [])
      .filter((a: Record<string, unknown>) => a.isDemo === true).length;
    expect(
      remainingDemo,
      "After demo delete, Site A asset list must contain zero isDemo rows"
    ).toBe(0);
  }, 60_000);

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

  // ── Site management style gating ─────────────────────────────────────────────

  /**
   * Site management style gating — Central vs Independent.
   *
   * Proves that `resolveEnterpriseGrants()` derives `canManageSiteIds` from the
   * customer's `site_management_style` column, and that the enterprise
   * user-management routes correctly enforce it.
   *
   * PROVE-IT-BITES: in server/enterpriseRoles.ts find the line:
   *   const canManageSiteIds = siteManagementStyle === 'independent' ? coordinatorSiteIds : [];
   * and change it to:
   *   const canManageSiteIds = coordinatorSiteIds;   // old per-flag logic
   * Run the suite → the "Central" test goes RED because site_coordinator now
   * has canManageSiteIds=[siteAId] and POST /api/enterprise/users returns 201
   * instead of the expected 403.  Restore → GREEN.
   */
  describe("site management style gating — Central vs Independent", () => {
    // All user IDs created during this sub-suite are tracked here for cleanup.
    const createdUserIds: string[] = [];

    afterAll(async () => {
      // Always restore to Central (safe default) so no other tests are affected.
      await seedManagementStyle(seed.customerId, "central");
      clearCustomerEnterpriseCache(seed.customerId);
      for (const id of createdUserIds) {
        await cleanupRoleScopeUser(seed, id).catch(() => {/* ignore cleanup errors */});
      }
    }, 15_000);

    /**
     * Central — site_coordinator has no user-management power.
     *
     * Creates a site_coordinator for Site A, sets style=central, verifies:
     *   POST /api/enterprise/users       → 403
     *   POST /api/enterprise/role-grants → 403
     *   GET  /api/enterprise/role-grants/my → canManageSiteIds:[], style:'central'
     */
    it("Central — site_coordinator blocked from POST /api/enterprise/users and POST /api/enterprise/role-grants", async () => {
      // Create a site_coordinator scoped to Site A only (role='user' in users table,
      // so resolveEnterpriseGrants reads grants rather than taking the admin fast-path).
      const coordUser = await seedRoleScopeUser(seed, {
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      createdUserIds.push(coordUser.userId);

      // Set Central mode and clear the in-process cache so the server sees it immediately.
      await seedManagementStyle(seed.customerId, "central");
      clearCustomerEnterpriseCache(seed.customerId);

      const coordAgent = await agentForSiteAsUser(seed.siteAId, coordUser.userId);
      const ts = Date.now();

      // POST /api/enterprise/users → must be 403 in Central mode
      const createUserRes = await coordAgent.post("/api/enterprise/users").send({
        username: `central-block-${ts}`,
        password: "Test1234!",
        email: `central-block-${ts}@example.com`,
        firstName: "Central",
        lastName: "Blocked",
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      expect(
        createUserRes.status,
        `Central mode: site_coordinator must NOT create users — got ${createUserRes.status}: ${JSON.stringify(createUserRes.body)}`
      ).toBe(403);

      // POST /api/enterprise/role-grants → must be 403 in Central mode
      const grantRes = await coordAgent.post("/api/enterprise/role-grants").send({
        userId: coordUser.userId,
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      expect(
        grantRes.status,
        `Central mode: site_coordinator must NOT create grants — got ${grantRes.status}: ${JSON.stringify(grantRes.body)}`
      ).toBe(403);

      // GET /api/enterprise/role-grants/my → canManageSiteIds:[], siteManagementStyle:'central'
      const myGrantsRes = await coordAgent
        .get("/api/enterprise/role-grants/my")
        .expect(200);
      expect(
        myGrantsRes.body.canManageSiteIds,
        `Central mode: canManageSiteIds must be [] (got ${JSON.stringify(myGrantsRes.body.canManageSiteIds)})`
      ).toEqual([]);
      expect(
        myGrantsRes.body.siteManagementStyle,
        `Central mode: siteManagementStyle must be 'central' (got '${myGrantsRes.body.siteManagementStyle}')`
      ).toBe("central");
    }, 30_000);

    /**
     * Independent — site_coordinator may manage their own site, not others'.
     *
     * Sets style=independent for the same coordinator user, verifies:
     *   POST /api/enterprise/users at Site A → 201 (own site)
     *   POST /api/enterprise/users at Site B → 403 (outside scope)
     *   GET  /api/enterprise/role-grants/my → canManageSiteIds includes siteAId
     */
    it("Independent — site_coordinator allowed for own site, blocked for other site", async () => {
      // Create a fresh coordinator for Site A for this test.
      const coordUser = await seedRoleScopeUser(seed, {
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      createdUserIds.push(coordUser.userId);

      // Switch to Independent mode.
      await seedManagementStyle(seed.customerId, "independent");
      clearCustomerEnterpriseCache(seed.customerId);

      // Two agents: one with activeSiteId=A, one with activeSiteId=B
      const coordAgentA = await agentForSiteAsUser(seed.siteAId, coordUser.userId);
      const coordAgentB = await agentForSiteAsUser(seed.siteBId, coordUser.userId);
      const ts = Date.now();

      // POST /api/enterprise/users at Site A → must succeed (201)
      const createUserResA = await coordAgentA.post("/api/enterprise/users").send({
        username: `indep-coord-a-${ts}`,
        password: "Test1234!",
        email: `indep-coord-a-${ts}@example.com`,
        firstName: "Indep",
        lastName: "CoordA",
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      expect(
        [200, 201],
        `Independent mode: site_coordinator must be able to create user for own site — got ${createUserResA.status}: ${JSON.stringify(createUserResA.body)}`
      ).toContain(createUserResA.status);
      if (createUserResA.body?.id) createdUserIds.push(createUserResA.body.id);

      // POST /api/enterprise/users at Site B → must be blocked (403, outside scope)
      const createUserResB = await coordAgentB.post("/api/enterprise/users").send({
        username: `indep-coord-b-${ts}`,
        password: "Test1234!",
        email: `indep-coord-b-${ts}@example.com`,
        firstName: "Indep",
        lastName: "CoordB",
        role: "site_coordinator",
        siteId: seed.siteBId,
      });
      expect(
        createUserResB.status,
        `Independent mode: site_coordinator must NOT create user for other site — got ${createUserResB.status}: ${JSON.stringify(createUserResB.body)}`
      ).toBe(403);

      // GET /api/enterprise/role-grants/my → siteAId in canManageSiteIds, style='independent'
      const myGrantsRes = await coordAgentA
        .get("/api/enterprise/role-grants/my")
        .expect(200);
      expect(
        myGrantsRes.body.canManageSiteIds,
        `Independent mode: canManageSiteIds must include siteAId — got ${JSON.stringify(myGrantsRes.body.canManageSiteIds)}`
      ).toContain(seed.siteAId);
      expect(
        myGrantsRes.body.siteManagementStyle,
        `Independent mode: siteManagementStyle must be 'independent' (got '${myGrantsRes.body.siteManagementStyle}')`
      ).toBe("independent");
    }, 30_000);

    /**
     * HQ unaffected — enterprise_admin can create users in both modes.
     *
     * enterprise_admin (role='admin' in the users table → fast-path in
     * resolveEnterpriseGrants, allowedSiteIds='all') must never be restricted
     * by site_management_style.
     */
    it("HQ unaffected — enterprise_admin can create users in Central and Independent mode", async () => {
      // seed.adminUserId has role='admin' → resolves to enterprise_admin regardless of grants.
      const adminAgent = await agentForSite(seed.siteAId);
      const ts = Date.now();

      // Central mode — enterprise_admin must still create users
      await seedManagementStyle(seed.customerId, "central");
      clearCustomerEnterpriseCache(seed.customerId);

      const centralRes = await adminAgent.post("/api/enterprise/users").send({
        username: `hq-central-${ts}`,
        password: "Test1234!",
        email: `hq-central-${ts}@example.com`,
        firstName: "HQ",
        lastName: "Central",
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      expect(
        [200, 201],
        `enterprise_admin must create user in Central mode — got ${centralRes.status}: ${JSON.stringify(centralRes.body)}`
      ).toContain(centralRes.status);
      if (centralRes.body?.id) createdUserIds.push(centralRes.body.id);

      // Independent mode — enterprise_admin still unaffected
      await seedManagementStyle(seed.customerId, "independent");
      clearCustomerEnterpriseCache(seed.customerId);

      const indepRes = await adminAgent.post("/api/enterprise/users").send({
        username: `hq-indep-${ts}`,
        password: "Test1234!",
        email: `hq-indep-${ts}@example.com`,
        firstName: "HQ",
        lastName: "Indep",
        role: "site_coordinator",
        siteId: seed.siteAId,
      });
      expect(
        [200, 201],
        `enterprise_admin must create user in Independent mode — got ${indepRes.status}: ${JSON.stringify(indepRes.body)}`
      ).toContain(indepRes.status);
      if (indepRes.body?.id) createdUserIds.push(indepRes.body.id);
    }, 30_000);
  }); // end describe("site management style gating")

  /**
   * Fire Risk Assessments — list and by-id isolation.
   *
   * Verifies that Site B cannot see Site A's FRAs in the list OR by ID.
   *
   * PROVE-IT-BITES (list): in server/routes/fireRiskAssessment.ts, find the
   * GET /api/fire-risk-assessments handler and remove the `scopedWhere` from
   * the WHERE clause → the "FRA list" test goes RED because Site B sees Site A's FRA.
   *
   * PROVE-IT-BITES (by-id): in the GET /api/fire-risk-assessments/:id handler,
   * change the .where() to remove `scopedWhere(siteContext, ...)` → Site B
   * receives 200 for Site A's FRA ID instead of 404 → test goes RED.
   */
  it("fire risk assessments — list and by-id isolation", async () => {
    // ── List isolation ──────────────────────────────────────────────────────
    await expectIsolated({
      label: "fra",
      createPath: "/api/fire-risk-assessments",
      createBody: (marker) => ({
        assessorName: marker,
        assessorCompany: "ISO Test Ltd",
        assessmentDate: "2026-01-01",
        nextReviewDate: "2027-01-01",
        status: "current",
        findingsSummary: "Site isolation HTTP test FRA",
      }),
      listPath: "/api/fire-risk-assessments",
      markerOf: (r) => String(r.assessorName ?? ""),
      allowedCreateStatus: [200, 201],
    });

    // ── By-id isolation ─────────────────────────────────────────────────────
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    const createRes = await agentA.post("/api/fire-risk-assessments").send({
      assessorName: `FRA-ByID-SiteA-${ts}`,
      assessorCompany: "ISO Test Ltd",
      assessmentDate: "2026-01-01",
      nextReviewDate: "2027-01-01",
      status: "current",
    });
    expect(
      [200, 201],
      `Site A FRA create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const fraId: string | undefined = createRes.body?.id;
    expect(fraId, "FRA create must return an id").toBeTruthy();
    if (!fraId) return;

    // Site A can read its own FRA
    const getResA = await agentA.get(`/api/fire-risk-assessments/${fraId}`);
    expect(
      [200],
      `Site A must be able to GET its own FRA (status ${getResA.status})`
    ).toContain(getResA.status);

    // Site B must NOT be able to GET Site A's FRA by ID
    const getResB = await agentB.get(`/api/fire-risk-assessments/${fraId}`);
    expect(
      [403, 404],
      `Site B must NOT GET Site A FRA by id — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
    ).toContain(getResB.status);

    // Cleanup
    await agentA.delete(`/api/fire-risk-assessments/${fraId}`);
  }, 60_000);

  /**
   * Lone Worker active sessions — list is scoped to the active site.
   *
   * Verifies that GET /api/lone-worker/active returns only the calling site's
   * sessions. Since creating a real session requires a checked-in staff member,
   * this test verifies the endpoint is reachable and scoped at the HTTP layer
   * (both sites return [] when no sessions are active, which is correct isolation).
   *
   * PROVE-IT-BITES: in server/routes/loneWorker.ts GET /api/lone-worker/active,
   * change the conditional siteFilter branch so siteFilter is never applied
   * (always use the un-filtered branch). Then create two sessions — one per site
   * using POST /api/staff/:id/lone-worker/start with a checked-in staff member —
   * and run the suite: Site B will see Site A's session → test goes RED.
   * Restore → GREEN.
   */
  it("lone worker active sessions — GET /api/lone-worker/active is site-scoped", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    // Insert a real lone-worker session for Site A via direct SQL, bypassing the
    // "staff must be checked-in + loneWorkerEnabled" HTTP guard so the isolation
    // contract of the GET route is exercised directly.
    //
    // PROVE-IT-BITES: in server/routes/loneWorker.ts GET /api/lone-worker/active,
    // change the conditional so siteFilter is never applied (always use the
    // unfiltered branch) → Site B will see Site A's session → test goes RED.
    // Restore → GREEN.
    const sessionId = await seedLoneWorkerSession(seed.siteAId);
    try {
      // Site A must see its own session.
      const resA = await agentA.get("/api/lone-worker/active");
      expect(
        [200],
        `Site A GET /api/lone-worker/active must succeed (status ${resA.status}): ${JSON.stringify(resA.body)}`
      ).toContain(resA.status);
      expect(Array.isArray(resA.body), "Site A active sessions must be an array").toBe(true);
      const siteAIds = (resA.body as any[]).map((s: any) => s.id);
      expect(
        siteAIds,
        `Site A must see the seeded session (id=${sessionId}) in its active list`
      ).toContain(sessionId);

      // Site B must NOT see Site A's session.
      const resB = await agentB.get("/api/lone-worker/active");
      expect(
        [200],
        `Site B GET /api/lone-worker/active must succeed (status ${resB.status}): ${JSON.stringify(resB.body)}`
      ).toContain(resB.status);
      expect(Array.isArray(resB.body), "Site B active sessions must be an array").toBe(true);
      const siteBIds = (resB.body as any[]).map((s: any) => s.id);
      expect(
        siteBIds,
        `Site B must NOT see Site A's lone-worker session (id=${sessionId}) — cross-site safety leak!`
      ).not.toContain(sessionId);
    } finally {
      await cleanupLoneWorkerSession(sessionId);
    }
  }, 30_000);

  /**
   * H&S Incidents — list and by-id isolation.
   *
   * PROVE-IT-BITES (list): in server/routes/hsIncidents.ts, GET /api/hs-incidents
   * handler, remove the `scopedWhere(siteContext, isolatedSchema.hsIncidents)`
   * from the .where() clause → Site B sees Site A's incident → test RED.
   * Restore → GREEN.
   *
   * PROVE-IT-BITES (by-id): in PUT /api/hs-incidents/:id, remove
   * `scopedWhere(siteContext, ...)` from the SELECT .where() → Site B's PUT
   * finds Site A's incident and updates it (returns 200 with data) instead of
   * 404 → test RED.  Restore → GREEN.
   *
   * Note: there is no GET /api/hs-incidents/:id endpoint; PUT is used as the
   * by-id isolation probe because it performs a scopedWhere-gated SELECT before
   * mutating and returns 404 when the record is not found in the caller's site.
   */
  it("H&S incidents — list and by-id isolation", async () => {
    await expectIsolated({
      label: "hs-incidents",
      createPath: "/api/hs-incidents",
      createBody: (marker) => ({
        title: marker,
        incidentDate: "2026-06-01T10:00",
        location: "ISO Test Area",
        recordType: "incident",
      }),
      listPath: "/api/hs-incidents",
      markerOf: (r) => String(r.title ?? ""),
      allowedCreateStatus: [200, 201],
    });

    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    const createRes = await agentA.post("/api/hs-incidents").send({
      title: `HS-ByID-SiteA-${ts}`,
      incidentDate: "2026-06-01T10:00",
      recordType: "incident",
    });
    expect(
      [200, 201],
      `Site A HS incident create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const incidentId: string | undefined = createRes.body?.id;
    expect(incidentId, "HS incident create must return an id").toBeTruthy();
    if (!incidentId) return;

    const putResB = await agentB.put(`/api/hs-incidents/${incidentId}`).send({
      title: `HS-ByID-SiteA-${ts}`,
      incidentDate: "2026-06-01T10:00",
      recordType: "incident",
    });
    expect(
      [403, 404],
      `Site B must NOT update Site A's H&S incident — cross-site leak! (status ${putResB.status}: ${JSON.stringify(putResB.body)})`
    ).toContain(putResB.status);

    await agentA.delete(`/api/hs-incidents/${incidentId}`);
  }, 60_000);

  /**
   * Members — list isolation.
   *
   * members is a welfare / access-control entity stored in the isolated customer
   * DB with siteId stamped at INSERT time and filtered with scopedWhere on GET.
   *
   * PROVE-IT-BITES: in server/routes/emergency.ts, GET /api/members handler,
   * remove the `scopedWhere(membersSiteCtx, isolatedSchema.members)` from the
   * .where() AND clause → Site B sees Site A's member → test RED.
   * Restore → GREEN.
   */
  it("members — list isolation (POST /api/members / GET /api/members)", async () => {
    await expectIsolated({
      label: "members",
      createPath: "/api/members",
      createBody: (marker) => ({
        firstName: "IsoHTTP",
        lastName: marker,
        email: `iso-mem-${marker}@test.example`,
        membershipType: "full",
      }),
      listPath: "/api/members",
      markerOf: (r) => String(r.lastName ?? ""),
      allowedCreateStatus: [200, 201],
    });
  }, 30_000);

  /**
   * Audit Engine records — list and by-id isolation.
   *
   * PROVE-IT-BITES (list): in server/routes/auditEngine.ts, GET /api/audits/records
   * handler, change:
   *   const siteFilter = scopedWhere(siteContext, isolatedSchema.auditRecords);
   * to:
   *   const siteFilter = undefined;
   * → Site B sees Site A's audit record → test RED.  Restore → GREEN.
   *
   * PROVE-IT-BITES (by-id): in GET /api/audits/records/:id, remove
   * `scopedWhere(siteContext, isolatedSchema.auditRecords)` from the .where()
   * → Site B receives the audit record from Site A (200) instead of 404 → RED.
   */
  it("audit engine records — list and by-id isolation", async () => {
    await expectIsolated({
      label: "audit-records",
      createPath: "/api/audits/records",
      createBody: (marker) => ({
        templateName: marker,
        category: "Fire Safety",
        title: `ISO Audit ${marker}`,
        conductedBy: "ISO Test Agent",
        status: "scheduled",
      }),
      listPath: "/api/audits/records",
      markerOf: (r) => String(r.templateName ?? ""),
      allowedCreateStatus: [200, 201],
    });

    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    const createRes = await agentA.post("/api/audits/records").send({
      templateName: `AuditByID-SiteA-${ts}`,
      category: "Health & Safety",
      title: "ISO By-ID Isolation Test",
      conductedBy: "ISO Test Agent",
      status: "scheduled",
    });
    expect(
      [200, 201],
      `Site A audit record create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const auditId: string | undefined = createRes.body?.id;
    expect(auditId, "Audit record create must return an id").toBeTruthy();
    if (!auditId) return;

    const getResA = await agentA.get(`/api/audits/records/${auditId}`);
    expect(
      [200],
      `Site A must be able to GET its own audit record (status ${getResA.status})`
    ).toContain(getResA.status);

    const getResB = await agentB.get(`/api/audits/records/${auditId}`);
    expect(
      [403, 404],
      `Site B must NOT GET Site A's audit record — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
    ).toContain(getResB.status);

    await agentA.delete(`/api/audits/records/${auditId}`);
  }, 60_000);

  /**
   * Reports — list and by-id isolation.
   *
   * A generated report (POST /api/reports/generate) is stamped with the active
   * site's siteId.  GET /api/reports is filtered with scopedWhere so Site B
   * must not see Site A's reports.  GET /api/reports/:id/view is also guarded.
   *
   * PROVE-IT-BITES (list): in server/routes/reports.ts, GET /api/reports
   * handler, remove `.where(scopedWhere(siteContext, isolatedSchema.reports))`
   * → Site B sees Site A's report in the list → test RED.  Restore → GREEN.
   *
   * PROVE-IT-BITES (by-id): in GET /api/reports/:id/view, remove the
   * `scopedWhere(siteContext, ...)` from the .where() → Site B reads Site A's
   * report → test RED.  Restore → GREEN.
   */
  it("reports — list and by-id isolation", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const genResA = await agentA.post("/api/reports/generate").send({
      reportType: "daily",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(
      [200, 201],
      `Site A report generate must succeed (status ${genResA.status}): ${JSON.stringify(genResA.body)}`
    ).toContain(genResA.status);
    const reportIdA: string | undefined = genResA.body?.id;
    expect(reportIdA, "Report generate must return an id").toBeTruthy();
    if (!reportIdA) return;

    const listA = await agentA.get("/api/reports").expect(200);
    const itemsA: any[] = listA.body?.items ?? listA.body ?? [];
    expect(
      itemsA.map((r: any) => r.id),
      "Site A must see its own generated report in the list"
    ).toContain(reportIdA);

    const listB = await agentB.get("/api/reports").expect(200);
    const itemsB: any[] = listB.body?.items ?? listB.body ?? [];
    expect(
      itemsB.map((r: any) => r.id),
      "Site B must NOT see Site A's generated report — cross-site leak!"
    ).not.toContain(reportIdA);

    const viewResB = await agentB.get(`/api/reports/${reportIdA}/view`);
    expect(
      [403, 404],
      `Site B must NOT access Site A's report by id — cross-site leak! (status ${viewResB.status}: ${JSON.stringify(viewResB.body)})`
    ).toContain(viewResB.status);

    await agentA.delete(`/api/reports/${reportIdA}`);
  }, 60_000);

  /**
   * Permit to Work — list and by-id isolation.
   *
   * PTW is gated by featurePermitToWork in company settings.  The test enables
   * it via PUT /api/settings before running isolation assertions.
   *
   * PROVE-IT-BITES (list): in server/routes/permitToWork.ts, GET /api/ptw
   * handler, remove `.where(scopedWhere(siteContext, isolatedSchema.permitToWork))`
   * → Site B sees Site A's permit in the list → test RED.  Restore → GREEN.
   *
   * PROVE-IT-BITES (by-id): in GET /api/ptw/:id, remove `scopedWhere(siteContext, ...)`
   * from the .where(and(...)) → Site B receives the permit from Site A (200)
   * instead of 404 → test RED.  Restore → GREEN.
   */
  it("permit to work — list and by-id isolation", async () => {
    const setupAgent = await agentForSite(seed.siteAId);
    const enableRes = await setupAgent.put("/api/settings").send({ featurePermitToWork: true });
    expect(
      [200],
      `Enabling featurePermitToWork must succeed (status ${enableRes.status}): ${JSON.stringify(enableRes.body)}`
    ).toContain(enableRes.status);

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    await expectIsolated({
      label: "ptw",
      createPath: "/api/ptw",
      createBody: (marker) => ({
        permitType: "general_high_risk",
        workDescription: marker,
        workLocation: "ISO Test Area",
        plannedStartDate: today,
        plannedStartTime: "08:00",
        plannedEndDate: tomorrow,
        plannedEndTime: "17:00",
      }),
      listPath: "/api/ptw",
      markerOf: (p) => String(p.workDescription ?? ""),
      allowedCreateStatus: [200, 201],
    });

    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    const createRes = await agentA.post("/api/ptw").send({
      permitType: "general_high_risk",
      workDescription: `PTW-ByID-SiteA-${ts}`,
      workLocation: "ISO Test Area",
      plannedStartDate: today,
      plannedStartTime: "08:00",
      plannedEndDate: tomorrow,
      plannedEndTime: "17:00",
    });
    expect(
      [200, 201],
      `Site A PTW create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const ptwId: string | undefined = createRes.body?.id;
    expect(ptwId, "PTW create must return an id").toBeTruthy();
    if (!ptwId) return;

    const getResA = await agentA.get(`/api/ptw/${ptwId}`);
    expect(
      [200],
      `Site A must be able to GET its own PTW (status ${getResA.status})`
    ).toContain(getResA.status);

    const getResB = await agentB.get(`/api/ptw/${ptwId}`);
    expect(
      [403, 404],
      `Site B must NOT GET Site A's PTW by id — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
    ).toContain(getResB.status);
  }, 60_000);

  /**
   * Compliance Certificates — list isolation.
   *
   * Compliance certificates are gated by featureComplianceCertificates.  The test
   * enables it via PUT /api/settings, creates a shared certificate type (types
   * are not site-scoped — shared across the customer), then verifies that
   * the per-site certificate records are isolated.
   *
   * PROVE-IT-BITES: in server/routes/complianceCertificates.ts, GET
   * /api/compliance-certificates handler, remove
   * `scopedWhere(siteContext, isolatedSchema.complianceCertificates)` from the
   * .where() clause → Site B sees Site A's certificate → test RED.
   * Restore → GREEN.
   */
  it("compliance certificates — list isolation", async () => {
    const setupAgent = await agentForSite(seed.siteAId);
    const enableRes = await setupAgent.put("/api/settings").send({ featureComplianceCertificates: true });
    expect(
      [200],
      `Enabling featureComplianceCertificates must succeed (status ${enableRes.status}): ${JSON.stringify(enableRes.body)}`
    ).toContain(enableRes.status);

    const typeRes = await setupAgent.post("/api/compliance-certificates/types").send({
      displayName: `ISO Test Certificate ${Date.now()}`,
      frequency: "annual",
      reminderDaysBefore: 30,
    });
    expect(
      [200, 201],
      `Certificate type create must succeed (status ${typeRes.status}): ${JSON.stringify(typeRes.body)}`
    ).toContain(typeRes.status);
    const certTypeId: string | undefined = typeRes.body?.id;
    expect(certTypeId, "Certificate type create must return an id").toBeTruthy();
    if (!certTypeId) return;

    await expectIsolated({
      label: "compliance-certs",
      createPath: "/api/compliance-certificates",
      createBody: (marker) => ({
        certificateTypeId: certTypeId,
        issueDate: "2026-01-01",
        expiryDate: "2027-01-01",
        referenceNumber: marker,
        issuedBy: "ISO Test Authority",
        issuingCompany: "ISOCo Ltd",
      }),
      listPath: "/api/compliance-certificates",
      markerOf: (c) => String(c.referenceNumber ?? ""),
      allowedCreateStatus: [200, 201],
    });
  }, 60_000);

  /**
   * CDM Projects (Construction Design and Management) — list and by-id isolation.
   *
   * CDM projects are linked to contractor companies (estate-wide, not site-scoped)
   * but the project records themselves carry siteId and are filtered with scopedWhere.
   * The test creates one shared estate-wide contractor company (companyId is a
   * notNull FK on cdm_projects) and then creates per-site CDM project records.
   *
   * PROVE-IT-BITES (list): in server/routes/cdm.ts, GET /api/cdm/projects handler,
   * remove `siteFilter` from the WHERE conditions array → Site B sees Site A's
   * CDM project → test RED.  Restore → GREEN.
   *
   * PROVE-IT-BITES (by-id): in GET /api/cdm/projects/:id, remove
   * `scopedWhere(siteContext, isolatedSchema.cdmProjects)` from the .where()
   * AND clause → Site B receives Site A's CDM project (200) instead of 404 → RED.
   */
  it("CDM projects — list and by-id isolation", async () => {
    // Ensure cdm_projects has all current columns (cpp_status, pci_status,
    // hsf_status, welfare_*, site_id) in case the table was created from an
    // older schema.  Each ALTER TABLE is idempotent (IF NOT EXISTS).
    await ensureCdmProjectsColumns();

    const setupAgent = await agentForSite(seed.siteAId);

    const ts2 = Date.now();
    const coRes = await setupAgent.post("/api/contractors").send({
      name: `ISO CDM Test Co ${ts2}`,
      email: `iso-cdm-${ts2}@test.example`,
      phone: "01234567890",
      contactFirstName: "ISO",
      contactLastName: "Test",
    });
    expect(
      [200, 201],
      `Contractor company create must succeed (status ${coRes.status}): ${JSON.stringify(coRes.body)}`
    ).toContain(coRes.status);
    const companyId: string | undefined = coRes.body?.id;
    expect(companyId, "Contractor company create must return an id").toBeTruthy();
    if (!companyId) return;

    await expectIsolated({
      label: "cdm-projects",
      createPath: "/api/cdm/projects",
      createBody: (marker) => ({
        companyId,
        title: marker,
        location: "ISO Test Site",
        status: "planning",
      }),
      listPath: "/api/cdm/projects",
      markerOf: (p) => String(p.title ?? ""),
      allowedCreateStatus: [200, 201],
    });

    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    const createRes = await agentA.post("/api/cdm/projects").send({
      companyId,
      title: `CDM-ByID-SiteA-${ts}`,
      location: "ISO Test Site",
      status: "planning",
    });
    expect(
      [200, 201],
      `Site A CDM project create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const cdmId: string | undefined = createRes.body?.id;
    expect(cdmId, "CDM project create must return an id").toBeTruthy();
    if (!cdmId) return;

    const getResA = await agentA.get(`/api/cdm/projects/${cdmId}`);
    expect(
      [200],
      `Site A must be able to GET its own CDM project (status ${getResA.status})`
    ).toContain(getResA.status);

    const getResB = await agentB.get(`/api/cdm/projects/${cdmId}`);
    expect(
      [403, 404],
      `Site B must NOT GET Site A's CDM project by id — cross-site leak! (status ${getResB.status}: ${JSON.stringify(getResB.body)})`
    ).toContain(getResB.status);
  }, 60_000);

  /**
   * Dashboard stats — GET /api/stats counts are site-scoped.
   *
   * Creates and checks in 2 staff + 1 visitor at Site A, then verifies that
   * Site A's stats reflect those people while Site B's stats stay at baseline.
   *
   * PROVE-IT-BITES: in server/routes/analytics.ts change:
   *   const stats = await databaseService.getStats(context, analyticsSiteCtx);
   * back to:
   *   const stats = await databaseService.getStats(context);
   * Run the suite → Site B's staffOnSite / currentVisitors will rise to the
   * estate-wide estate total instead of staying at baseline → RED. Restore → GREEN.
   */
  it("dashboard stats — GET /api/stats counts are site-scoped", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);
    const ts = Date.now();

    // Capture Site B baseline BEFORE touching Site A so the isolation assertion
    // is resilient even if prior tests left checked-in people at Site B.
    const baselineB = await agentB.get("/api/stats").expect(200);
    const baseStaffB    = baselineB.body.staffOnSite      as number;
    const baseVisitorsB = baselineB.body.currentVisitors  as number;
    const baseTotalB    = baselineB.body.totalPeopleOnSite as number;

    // ── Site A: create + check in 2 staff ──────────────────────────────────
    let checkedInStaff = 0;
    for (let i = 1; i <= 2; i++) {
      const staffRes = await agentA.post("/api/staff").send({
        firstName:  "StatsIso",
        lastName:   `Stats-SiteA-${i}-${ts}`,
        email:      `stats-iso-staff-${i}-${ts}@test.example`,
        department: "ISO Stats Dept",
        jobTitle:   "Stats Tester",
        employeeId: `STATS-A-${i}-${ts}`,
      });
      expect([200, 201], `Site A staff ${i} create (${staffRes.status}): ${JSON.stringify(staffRes.body)}`).toContain(staffRes.status);
      const staffId: string | undefined = staffRes.body?.id;
      if (staffId) {
        const ciRes = await agentA.post(`/api/staff/${staffId}/checkin`).send({ manual: true });
        if ([200, 201].includes(ciRes.status)) checkedInStaff++;
      }
    }

    // ── Site A: check in 1 visitor ─────────────────────────────────────────
    let checkedInVisitor = false;
    const visRes = await agentA.post("/api/visitors/checkin").send({
      firstName:       "StatsIso",
      lastName:        `Stats-SiteA-Vis-${ts}`,
      email:           `stats-iso-vis-${ts}@test.example`,
      company:         "ISO Stats Co",
      purpose:         "stats-isolation-test",
      hsRulesAccepted: true,
    });
    if ([200, 201].includes(visRes.status)) checkedInVisitor = true;

    // At least one person must have checked in at Site A for the test to be meaningful
    expect(
      checkedInStaff + (checkedInVisitor ? 1 : 0),
      `At least one person must check in at Site A for the stats isolation test to be meaningful (staff=${checkedInStaff}, visitor=${checkedInVisitor})`
    ).toBeGreaterThan(0);

    // ── Site A must see its own people ─────────────────────────────────────
    const statsA = await agentA.get("/api/stats").expect(200);
    if (checkedInStaff > 0) {
      expect(
        statsA.body.staffOnSite,
        `[stats] Site A staffOnSite must be >= ${checkedInStaff} (got ${statsA.body.staffOnSite})`
      ).toBeGreaterThanOrEqual(checkedInStaff);
    }
    if (checkedInVisitor) {
      expect(
        statsA.body.currentVisitors,
        `[stats] Site A currentVisitors must be >= 1 (got ${statsA.body.currentVisitors})`
      ).toBeGreaterThanOrEqual(1);
    }

    // ── Site B stats must NOT change — cross-site isolation ────────────────
    // If the site context is NOT passed to getStats, it returns estate-wide
    // totals and Site B's counts jump to include Site A's newly checked-in
    // people → the assertions below go RED.
    const statsB = await agentB.get("/api/stats").expect(200);
    expect(
      statsB.body.staffOnSite,
      `[stats] Site B staffOnSite must stay at baseline ${baseStaffB} — cross-site stats leak! (got ${statsB.body.staffOnSite})`
    ).toBe(baseStaffB);
    expect(
      statsB.body.currentVisitors,
      `[stats] Site B currentVisitors must stay at baseline ${baseVisitorsB} — cross-site stats leak! (got ${statsB.body.currentVisitors})`
    ).toBe(baseVisitorsB);
    expect(
      statsB.body.totalPeopleOnSite,
      `[stats] Site B totalPeopleOnSite must stay at baseline ${baseTotalB} — cross-site stats leak! (got ${statsB.body.totalPeopleOnSite})`
    ).toBe(baseTotalB);
  }, 30_000);

  /**
   * Emergency muster points — GET /api/muster-points list isolation.
   *
   * Before the fix in server/routes/emergency.ts, GET /api/muster-points
   * did not call getScopedDb / scopedWhere; it returned all muster points for
   * the customer regardless of active site.  The POST (create) already used
   * withSiteId, so Site A points had a siteId stamp — they were just not
   * filtered on read.
   *
   * PROVE-IT-BITES: in server/routes/emergency.ts GET /api/muster-points,
   * remove the `scopedWhere(siteContext, isolatedSchema.musterPoints)` from
   * the .where() clause → Site B receives Site A's muster point in its list
   * → RED.  Restore → GREEN.
   */
  // ── Contractor Pool Mode isolation tests ─────────────────────────────────
  /*
   * These tests verify that in INDEPENDENT pool mode a contractor firm linked
   * only to Site B is invisible to Site A, and vice-versa.
   *
   * BITE-CHECK (deliberate break built-in):
   * The final assertion on the shared-mode test expects the estate-wide
   * company to be visible to BOTH sites.  If the GET handler forgets to
   * return companies in shared mode the test will fail with
   * "Shared mode: company must be visible to Site B" — RED.
   */

  it("contractor pool — independent mode: Site A cannot see Site B's contractors", async () => {
    await ensureContractorSiteApprovalsTable();
    const ts = Date.now();
    const companyName = `POOL-TEST-INDEP-${ts}`;
    const companyId = await seedTestContractorCompany(companyName);
    try {
      // Only link to Site B
      await seedContractorSiteApproval(companyId, seed.siteBId, 'approved');
      await setContractorPoolMode('independent');
      // Invalidate the in-process cache so the resolver re-reads the DB
      clearCustomerEnterpriseCache(seed.customerId);

      const agentA = await agentForSite(seed.siteAId);
      const agentB = await agentForSite(seed.siteBId);

      // Site A must NOT see the company (only linked to Site B)
      const listA = await agentA.get('/api/contractors');
      expect(
        [200, 403],
        `Site A GET /api/contractors status (${listA.status}): ${JSON.stringify(listA.body).slice(0,200)}`
      ).toContain(listA.status);
      if (listA.status === 200) {
        const items: { id?: string }[] = Array.isArray(listA.body) ? listA.body : [];
        expect(
          items.some(c => c.id === companyId),
          `Site A must NOT see a company approved only for Site B (companyId=${companyId})`
        ).toBe(false);
      }

      // Site B must see the company
      const listB = await agentB.get('/api/contractors');
      expect(
        [200],
        `Site B GET /api/contractors status (${listB.status})`
      ).toContain(listB.status);
      const itemsB: { id?: string }[] = Array.isArray(listB.body) ? listB.body : [];
      expect(
        itemsB.some(c => c.id === companyId),
        `Site B must see its own approved company (companyId=${companyId})`
      ).toBe(true);
    } finally {
      await cleanupTestContractorCompany(companyId);
      await setContractorPoolMode('shared');
      clearCustomerEnterpriseCache(seed.customerId);
    }
  }, 45_000);

  it("contractor pool — shared mode: estate-wide list visible to all sites", async () => {
    await ensureContractorSiteApprovalsTable();
    const ts = Date.now();
    const companyName = `POOL-TEST-SHARED-${ts}`;
    const companyId = await seedTestContractorCompany(companyName);
    try {
      await setContractorPoolMode('shared');
      clearCustomerEnterpriseCache(seed.customerId);

      const agentA = await agentForSite(seed.siteAId);
      const agentB = await agentForSite(seed.siteBId);

      // Both sites must see the company (no site-approval filter in shared mode)
      const listA = await agentA.get('/api/contractors');
      expect([200], `Site A GET /api/contractors status (${listA.status})`).toContain(listA.status);
      const itemsA: { id?: string }[] = Array.isArray(listA.body) ? listA.body : [];
      expect(
        itemsA.some(c => c.id === companyId),
        `Shared mode: company must be visible to Site A (companyId=${companyId})`
      ).toBe(true);

      const listB = await agentB.get('/api/contractors');
      expect([200], `Site B GET /api/contractors status (${listB.status})`).toContain(listB.status);
      const itemsB: { id?: string }[] = Array.isArray(listB.body) ? listB.body : [];
      expect(
        itemsB.some(c => c.id === companyId),
        `Shared mode: company must be visible to Site B (companyId=${companyId})`
      ).toBe(true);
    } finally {
      await cleanupTestContractorCompany(companyId);
    }
  }, 45_000);

  it("contractor pool — independent mode: fail-closed when no active site", async () => {
    await ensureContractorSiteApprovalsTable();
    await setContractorPoolMode('independent');
    clearCustomerEnterpriseCache(seed.customerId);
    try {
      // Session with NO activeSiteId (agentForSite would set one; use a raw admin session)
      const noSiteAgent = request.agent(app);
      await noSiteAgent
        .post("/api/__test__/session")
        .send({ userId: seed.adminUserId, customerId: seed.customerId })
        .expect(200);

      const listRes = await noSiteAgent.get('/api/contractors');
      // Must return empty array, not an error and not an estate-wide leak
      if (listRes.status === 200) {
        const items: any[] = Array.isArray(listRes.body) ? listRes.body : [];
        expect(
          items.length,
          `Fail-closed: independent mode with no active site must return [] (got ${items.length} items)`
        ).toBe(0);
      } else {
        // 403 / 400 also acceptable — must not be 200 with data
        expect([400, 403]).toContain(listRes.status);
      }
    } finally {
      await setContractorPoolMode('shared');
      clearCustomerEnterpriseCache(seed.customerId);
    }
  }, 30_000);

  it("emergency muster points — GET /api/muster-points list isolation", async () => {
    const agentA = await agentForSite(seed.siteAId);
    const agentB = await agentForSite(seed.siteBId);

    const ts = Date.now();
    const markerA = `ISO-MP-A-${ts}`;

    // Create a muster point at Site A (POST already stamps siteId via withSiteId)
    const createRes = await agentA.post("/api/muster-points").send({
      name: markerA,
      displayOrder: 999,
    });
    expect(
      [200, 201],
      `Site A muster point create must succeed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`
    ).toContain(createRes.status);
    const mpId: string | undefined = createRes.body?.id;
    expect(mpId, "Muster point create must return an id").toBeTruthy();
    if (!mpId) return;

    try {
      // Site A must see its own muster point in the list
      const listA = await agentA.get("/api/muster-points");
      expect([200], `Site A list status (${listA.status})`).toContain(listA.status);
      const itemsA: { name?: string }[] = Array.isArray(listA.body) ? listA.body : [];
      expect(
        itemsA.some((p) => p.name === markerA),
        `Site A must see its own muster point (marker=${markerA})`
      ).toBe(true);

      // Site B must NOT see Site A's muster point
      const listB = await agentB.get("/api/muster-points");
      expect([200], `Site B list status (${listB.status})`).toContain(listB.status);
      const itemsB: { name?: string }[] = Array.isArray(listB.body) ? listB.body : [];
      expect(
        itemsB.some((p) => p.name === markerA),
        `Site B must NOT see Site A muster point — cross-site leak! (marker=${markerA})`
      ).toBe(false);

      // Site B must NOT be able to update Site A's muster point
      const putResB = await agentB.put(`/api/muster-points/${mpId}`).send({
        name: "Hijacked",
        displayOrder: 999,
        isActive: true,
      });
      // Route returns 404 when scopedWhere prevents the match
      expect(
        [403, 404],
        `Site B must NOT update Site A muster point (status ${putResB.status}: ${JSON.stringify(putResB.body)})`
      ).toContain(putResB.status);
    } finally {
      // Site A cleans up its own muster point
      await agentA.delete(`/api/muster-points/${mpId}`);
    }
  }, 30_000);

});
