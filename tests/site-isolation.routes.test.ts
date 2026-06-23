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
