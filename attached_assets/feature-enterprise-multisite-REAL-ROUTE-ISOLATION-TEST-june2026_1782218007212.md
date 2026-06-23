# Enterprise Multi-Site — REAL-ROUTE ISOLATION TEST (the actual test, written for you)

**This prompt contains the real test. Your job is to add two small enabling hooks, drop in the test, align the payloads to the real routes, run it, and prove it bites. Do NOT replace this with a helper-only test — the whole point is that it drives the real HTTP routes. Test/dev environment only.**

## Why
The existing `site-isolation-test-script.ts` only calls the scope helpers (`scopedWhere` / `withSiteId`) — it issues **no HTTP requests**, so it cannot catch a route that bypasses the helpers (e.g. the induction token route's custom filtering). This test fixes that by driving the **real `/api` endpoints** with `supertest` (already installed) as a Site-A vs Site-B user.

Grounded in the codebase:
- App is created at `server/index.ts:89` (`const app = express()`) and routes wired via `registerRoutes(app, server)` (`:657`).
- Login sets `req.session.userId` / `customerId` and, for enterprise users, `req.session.activeSiteId` (`server/routes/auth.ts:103-104,187`).
- Active site is switched via `POST /api/enterprise/active-site` (`server/routes/enterpriseSites.ts:245`).
- Site scoping reads `req.session.activeSiteId` (`server/siteScope.ts:105`).

---

## PREREQUISITE 1 — Make the app testable (`server/app.ts`)
Extract app construction into an exported factory so a test can build it **without starting a server**. Move the express setup + middleware + `await registerRoutes(app, server)` into:
```ts
// server/app.ts
export async function createApp() {
  const app = express();
  // ...all existing middleware (session, json, etc.) exactly as in server/index.ts...
  const server = createHttpServer(app);
  await registerRoutes(app, server);
  return app;
}
```
Have `server/index.ts` call `createApp()` and then `server.listen(...)`. **No behaviour change in production** — only the construction is now reusable.

## PREREQUISITE 2 — Test-only session login (guarded)
Add a route that only works in test mode, so a test can become any seeded user without OTP/email:
```ts
// register only when process.env.NODE_ENV === 'test'
if (process.env.NODE_ENV === 'test') {
  app.post('/api/__test__/session', (req, res) => {
    const { userId, customerId } = req.body;
    (req.session as any).userId = userId;
    (req.session as any).customerId = customerId;
    req.session.save(() => res.json({ ok: true }));
  });
}
```
This MUST be unreachable in development/production (guard on `NODE_ENV === 'test'`).

---

## THE TEST — drop this in as `tests/site-isolation.routes.test.ts`
Reuse the seeding already in `site-isolation-test-script.ts` (it creates an enterprise customer, Site A + Site B, and data). Expose its setup as `seedEnterpriseTestCustomer()` returning `{ customerId, siteAId, siteBId, adminUserId }` (the admin is an `enterprise_admin`, so allowed on all sites).

```ts
import { describe, it, beforeAll, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { seedEnterpriseTestCustomer, cleanupEnterpriseTestCustomer } from './helpers/seedEnterprise';

let app: any, customerId: string, siteAId: string, siteBId: string, adminUserId: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  app = await createApp();
  ({ customerId, siteAId, siteBId, adminUserId } = await seedEnterpriseTestCustomer());
});

// Authenticated supertest agent pinned to one active site
async function agentForSite(siteId: string) {
  const agent = request.agent(app);
  await agent.post('/api/__test__/session').send({ userId: adminUserId, customerId }).expect(200);
  await agent.post('/api/enterprise/active-site').send({ siteId }).expect(200);
  return agent;
}

// One reusable isolation assertion: create via Site A's endpoint, confirm Site B can't see it (and vice versa)
async function expectIsolated(opts: {
  createPath: string; createBody: (marker: string) => any;
  listPath: string; markerOf: (item: any) => string;
}) {
  const a = await agentForSite(siteAId);
  const b = await agentForSite(siteBId);
  const markerA = `ISO-A-${Date.now()}`;
  const markerB = `ISO-B-${Date.now()}`;

  const createdA = await a.post(opts.createPath).send(opts.createBody(markerA));
  expect([200, 201]).toContain(createdA.status);
  const createdB = await b.post(opts.createPath).send(opts.createBody(markerB));
  expect([200, 201]).toContain(createdB.status);

  const listA = await a.get(opts.listPath).expect(200);
  const listB = await b.get(opts.listPath).expect(200);
  const aMarkers = (listA.body.items ?? listA.body).map(opts.markerOf);
  const bMarkers = (listB.body.items ?? listB.body).map(opts.markerOf);

  expect(aMarkers).toContain(markerA);
  expect(aMarkers).not.toContain(markerB);   // ← cross-site leak if this fails
  expect(bMarkers).toContain(markerB);
  expect(bMarkers).not.toContain(markerA);   // ← cross-site leak if this fails
}

describe('site isolation — REAL ROUTES', () => {
  it('visitors', async () => {
    await expectIsolated({
      createPath: '/api/visitors',
      createBody: (m) => ({ name: m, /* + any required fields the real route needs */ }),
      listPath: '/api/visitors',
      markerOf: (v) => v.name,
    });
  });

  // Add the same pattern for EACH of these, aligning createBody/listPath/markerOf
  // to the real route's request + response shape:
  //   - contractors          POST/GET /api/contractors
  //   - staff                POST/GET /api/staff
  //   - induction admin      (create a token) / GET /api/induction/admin/tokens   ← the custom-filtered one, MUST be covered
  //   - RAMS                 /api/rams...
  //   - passes / pre-bookings
  //   - muster/emergency     activate at Site A → roll-call shows only Site A people
  //   - enterprise compliance GET /api/enterprise/compliance/sites scoped to caller
});
```

### MUST cover (the fragile/previously-broken routes)
`induction admin tokens`, `muster/emergency`, `RAMS`, `passes`, `contractors`, `visitors`, `staff`, `enterprise compliance`. Align each test's `createBody`, `listPath`, and `markerOf` to the **actual** route's request body and response JSON — read each route to get the field names right.

### Prove the test bites
Temporarily delete the site filter from ONE route (e.g. the induction admin-tokens query), run the suite, confirm that route's test goes **RED**, then restore it. Put the before/after in the report.

### Wire it up
- Add `"test:site-isolation": "vitest run tests/site-isolation.routes.test.ts"` (and a combined script if useful).
- The suite must **exit non-zero** on any failure.

---

## REPORT BACK
- Confirm Prerequisites 1 & 2 are in and production behaviour is unchanged.
- List every `/api` endpoint the test actually calls.
- The proof-it-bites result (which route you broke, that its test went red, and that it passed again after restoring).
- Final pass/fail, and a one-line verdict: **does the test now prove route-level site isolation — yes or no?**

## Rules / acceptance
- The test MUST issue real authenticated HTTP requests to `/api` routes via supertest. A version that only calls `scopedWhere`/`withSiteId` does NOT satisfy this prompt.
- The `__test__/session` route MUST be unreachable outside `NODE_ENV === 'test'`.
- No production behaviour change; single-site customers unaffected.
- Don't weaken an assertion to go green — a red test means a real leak; fix the route.
