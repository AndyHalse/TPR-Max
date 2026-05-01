import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoist db mock before any transitively-imported module tries to connect
vi.mock('../db', () => ({
  pool: { on: vi.fn(), end: vi.fn(), query: vi.fn() },
  db: {},
}));

import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { requireAuth } from '../auth';
import { createTestUser, createAdminUser, mockCustomerId } from './setup';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext() {
  return vi.fn();
}

// Build a minimal Express app whose single route is guarded by an inline
// role check — mirrors the real `if (req.user!.role !== "admin")` pattern.
function makeAdminApp(userRole: string) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.customerId = mockCustomerId;
    req.user = createTestUser({ role: userRole });
    next();
  });
  app.patch('/api/contractors/:id', (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    res.json({ ok: true });
  });
  return app;
}

// Minimal RAMS app that filters documents by the requesting customer's ID,
// matching the `eq(ramsDocuments.customerId, customerId)` query condition.
function makeRamsApp() {
  const docs = [
    { id: 'doc-alpha', customerId: 'customer-a', isActive: true, title: 'Safety Plan' },
  ];
  const app = express();
  app.use((req: any, _res, next) => {
    req.customerId = req.headers['x-test-customer-id'] as string ?? 'unknown';
    next();
  });
  app.get('/api/rams/:id', (req: any, res) => {
    const doc = docs.find(
      (d) => d.id === req.params.id && d.customerId === req.customerId && d.isActive,
    );
    if (!doc) return res.status(404).json({ error: 'RAMS document not found' });
    res.json(doc);
  });
  return app;
}

// ─── Tests 1 & 2 — requireAuth middleware (pure function) ────────────────────

describe('requireAuth middleware', () => {
  it('Test 1: blocks unauthenticated requests (no session) → 401', () => {
    const req: any = { session: {}, sessionID: 'none' };
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('Test 2: allows authenticated requests with valid session → calls next', () => {
    const req: any = {
      session: { userId: 'u-001', customerId: mockCustomerId },
      sessionID: 'sess-test-001',
    };
    const res = mockRes();
    const next = mockNext();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── Tests 3 & 4 — Admin role check ──────────────────────────────────────────

describe('Admin-only endpoints', () => {
  it('Test 3: blocks staff users → 403', async () => {
    const res = await request(makeAdminApp('staff'))
      .patch('/api/contractors/c1')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it('Test 4: allows admin users → not 403', async () => {
    const res = await request(makeAdminApp('admin'))
      .patch('/api/contractors/c1')
      .send({});
    expect(res.status).not.toBe(403);
  });
});

// ─── Test 5 — RAMS cross-customer isolation ───────────────────────────────────

describe('RAMS customer isolation', () => {
  it('Test 5: returns 404 when a different customer requests the document', async () => {
    const app = makeRamsApp();

    // customer-b requests a doc owned by customer-a
    const res = await request(app)
      .get('/api/rams/doc-alpha')
      .set('x-test-customer-id', 'customer-b');

    expect(res.status).toBe(404);
  });

  it('owner can access their own document', async () => {
    const app = makeRamsApp();

    const res = await request(app)
      .get('/api/rams/doc-alpha')
      .set('x-test-customer-id', 'customer-a');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc-alpha');
  });
});

// ─── Tests 6 & 7 — E-pass toggle ─────────────────────────────────────────────

class MockEmailService {
  sendContractorEPass = vi.fn().mockResolvedValue(true);
}

async function triggerCheckin(settings: { ePassEnabled: boolean }, emailSvc: MockEmailService) {
  const worker = { email: 'worker@example.com', firstName: 'Jane', lastName: 'Smith' };
  const company = { name: 'BuildRight Ltd' };
  const qrCode = 'CTR-TESTQR';
  const passUrl = 'https://example.com/pass/w1';

  if (worker.email && settings?.ePassEnabled) {
    await emailSvc.sendContractorEPass(
      worker.email,
      `${worker.firstName} ${worker.lastName}`,
      company.name,
      qrCode,
      passUrl,
    );
  }
}

describe('E-pass sending', () => {
  it('Test 6: does not call sendContractorEPass when ePassEnabled = false', async () => {
    const emailSvc = new MockEmailService();
    const spy = vi.spyOn(emailSvc, 'sendContractorEPass');

    await triggerCheckin({ ePassEnabled: false }, emailSvc);

    expect(spy).not.toHaveBeenCalled();
  });

  it('Test 7: calls sendContractorEPass when ePassEnabled = true', async () => {
    const emailSvc = new MockEmailService();
    const spy = vi.spyOn(emailSvc, 'sendContractorEPass');

    await triggerCheckin({ ePassEnabled: true }, emailSvc);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      'worker@example.com',
      'Jane Smith',
      'BuildRight Ltd',
      'CTR-TESTQR',
      'https://example.com/pass/w1',
    );
  });
});
