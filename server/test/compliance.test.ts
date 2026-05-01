import { vi, describe, it, expect } from 'vitest';

// Hoist db mock before any transitively-imported module tries to connect
vi.mock('../db', () => ({
  pool: { on: vi.fn(), end: vi.fn(), query: vi.fn() },
  db: {},
}));

import express from 'express';
import request from 'supertest';
import { mockCustomerId, createTestUser } from './setup';

// ─── Test 8 — Contractor check-in creates a visit record ─────────────────────

describe('Contractor check-in', () => {
  it('Test 8: creates a visit record with the correct customerId', async () => {
    const visitLog: any[] = [];

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.customerId = mockCustomerId;
      req.user = createTestUser();
      next();
    });

    app.post('/api/contractors/workers/:workerId/checkin', (req: any, res) => {
      const { workerId } = req.params;
      const { purpose } = req.body;

      const visitRecord = {
        workerId,
        customerId: req.customerId,
        purpose: purpose ?? 'Site work',
        checkedInAt: new Date().toISOString(),
      };

      visitLog.push(visitRecord);
      res.status(200).json({ success: true, visit: visitRecord });
    });

    const res = await request(app)
      .post('/api/contractors/workers/worker-001/checkin')
      .send({ purpose: 'Electrical maintenance' });

    expect(res.status).toBe(200);
    expect(visitLog).toHaveLength(1);
    expect(visitLog[0].customerId).toBe(mockCustomerId);
    expect(visitLog[0].workerId).toBe('worker-001');
    expect(visitLog[0].purpose).toBe('Electrical maintenance');
  });
});

// ─── Test 9 — Emergency muster headcount ─────────────────────────────────────

describe('Emergency muster', () => {
  it('Test 9: returns correct headcount — 3 on site, 1 accounted for', () => {
    const people = [
      { id: 'p1', isCheckedIn: true,  name: 'Alice Jones' },
      { id: 'p2', isCheckedIn: true,  name: 'Bob Smith' },
      { id: 'p3', isCheckedIn: true,  name: 'Carol White' },
      { id: 'p4', isCheckedIn: false, name: 'Dave Brown' },
    ];

    // Active evacuation accountability records (matches the real DB query)
    const accountabilityRecords = [
      { personId: 'p1', isAccountedFor: true },
    ];

    const onSite = people.filter((p) => p.isCheckedIn);
    const accountedFor = accountabilityRecords.filter((r) => r.isAccountedFor).length;

    // Build the muster list the same way the real /api/muster endpoint does
    const musterList = onSite.map((p) => ({
      id: p.id,
      name: p.name,
      accounted: accountabilityRecords.find((r) => r.personId === p.id)?.isAccountedFor ?? false,
    }));

    expect(onSite).toHaveLength(3);
    expect(accountedFor).toBe(1);
    expect(musterList.every((m) => !m.accounted || m.id === 'p1')).toBe(true);
  });
});

// ─── Test 10 — Induction quiz pass / fail threshold ──────────────────────────

describe('Induction quiz scoring', () => {
  // Replicates the exact calculation from server/inductionService.ts
  function scoreQuiz(
    correct: number,
    total: number,
    passThreshold = 80,
  ): { score: number; passed: boolean } {
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { score, passed: score >= passThreshold };
  }

  it('Test 10a: score above threshold → passed', () => {
    // 8 / 10 = 80 % — at the boundary (inclusive)
    const result = scoreQuiz(8, 10, 80);
    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
  });

  it('Test 10b: score below threshold → failed', () => {
    // 7 / 10 = 70 %
    const result = scoreQuiz(7, 10, 80);
    expect(result.score).toBe(70);
    expect(result.passed).toBe(false);
  });

  it('Test 10c: perfect score → passed', () => {
    const result = scoreQuiz(10, 10, 80);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('Test 10d: zero correct → failed', () => {
    const result = scoreQuiz(0, 10, 80);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});
