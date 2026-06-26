import type { Express } from 'express';
import { logger } from '../utils/logger';
import type { Server } from 'http';
import { requireAuth } from '../auth';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import { emailService } from '../emailService';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as isolatedSchema from '../isolatedSchema';
import { getScopedDb, scopedWhere, withSiteId, SiteContextError } from '../siteScope';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mintLoneWorkerToken = (crypto: typeof import('crypto')): string => {
  return crypto.randomBytes(32).toString('hex');
};

async function getLoneWorkerSettings(context: any) {
  const [settings] = await (context.db || db).select().from(isolatedSchema.companySettings).limit(1);
  return settings;
}

async function sendFirstWelfareEmail(
  customerDb: any,
  session: any,
  token: string,
  settings: any,
  baseUrl: string
) {
  const confirmUrl = `${baseUrl}/lone-worker/ok/${session.customerId}/${token}`;
  const emailSvc = emailService.forCustomer(session.customerId);
  await emailSvc.sendLoneWorkerWelfareCheck({
    to: session.personEmail || '',
    workerName: session.personName,
    confirmUrl,
    nextCheckMins: session.intervalMins,
    companyName: settings?.companyName || 'Your Company',
    siteName: settings?.companyName || 'Site',
  });
}

async function processLoneWorkerSession(session: any, customerDb: any, now: Date) {
  try {
    const settings = await getLoneWorkerSettings({ db: customerDb });

    let person: any = null;
    if (session.personType === 'staff') {
      const [p] = await customerDb.select().from(isolatedSchema.staff).where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
      person = p;
    } else {
      const [p] = await customerDb.select().from(isolatedSchema.contractorWorkers).where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
      person = p;
    }
    if (!person || !person.isLoneWorker || !person.loneWorkerDeadline) return;

    const deadline = new Date(person.loneWorkerDeadline);
    const msOverdue = now.getTime() - deadline.getTime();
    if (msOverdue <= 0) return;

    const minsOverdue = Math.floor(msOverdue / 60000);
    const gracePeriod = session.gracePeriodMins || settings?.loneWorkerGracePeriodMins || 10;
    const l2Delay = settings?.loneWorkerL2DelayMins || 15;
    const l3Delay = settings?.loneWorkerL3DelayMins || 30;
    const currentLevel = person.loneWorkerEscalationLevel || 0;

    const emailSvc = emailService.forCustomer(session.customerId);
    const escalationOpts = {
      workerName: session.personName,
      workerEmail: session.personEmail || '',
      minutesMissed: minsOverdue,
      startedAt: new Date(session.startedAt),
      companyName: settings?.companyName || 'Your Company',
      siteName: settings?.companyName || 'Site',
    };

    if (currentLevel < 1 && minsOverdue >= gracePeriod) {
      const l1Email = settings?.loneWorkerL1Email;
      if (l1Email) {
        await emailSvc.sendLoneWorkerEscalation({ to: l1Email, contactName: settings.loneWorkerL1Name || 'Supervisor', level: 1, ...escalationOpts });
      } else {
        logger.warn(`⚠️ Lone Worker L1 escalation triggered for ${session.personName} (${session.customerId}) but no L1 contact email is configured — alert not sent`);
      }
      const updateData = { loneWorkerEscalationLevel: 1 };
      if (session.personType === 'staff') {
        await customerDb.update(isolatedSchema.staff).set(updateData).where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
      } else {
        await customerDb.update(isolatedSchema.contractorWorkers).set(updateData).where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
      }
      await customerDb.update(isolatedSchema.loneWorkerSessions).set({ escalationsFired: (session.escalationsFired || 0) + 1 }).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${session.id}`);
      logger.info(`🚨 Lone Worker L1 alert fired for ${session.personName} (${session.customerId})`);
    } else if (currentLevel < 2 && minsOverdue >= gracePeriod + l2Delay) {
      const l2Email = settings?.loneWorkerL2Email;
      if (l2Email) {
        await emailSvc.sendLoneWorkerEscalation({ to: l2Email, contactName: settings.loneWorkerL2Name || 'Manager', level: 2, ...escalationOpts });
      } else {
        logger.warn(`⚠️ Lone Worker L2 escalation triggered for ${session.personName} (${session.customerId}) but no L2 contact email is configured — alert not sent`);
      }
      const updateData = { loneWorkerEscalationLevel: 2 };
      if (session.personType === 'staff') {
        await customerDb.update(isolatedSchema.staff).set(updateData).where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
      } else {
        await customerDb.update(isolatedSchema.contractorWorkers).set(updateData).where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
      }
      await customerDb.update(isolatedSchema.loneWorkerSessions).set({ escalationsFired: (session.escalationsFired || 0) + 1 }).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${session.id}`);
      logger.info(`🚨 Lone Worker L2 alert fired for ${session.personName} (${session.customerId})`);
    } else if (currentLevel < 3 && minsOverdue >= gracePeriod + l2Delay + l3Delay) {
      const l1Email = settings?.loneWorkerL1Email;
      const l2Email = settings?.loneWorkerL2Email;
      if (l1Email) await emailSvc.sendLoneWorkerEscalation({ to: l1Email, contactName: settings.loneWorkerL1Name || 'Supervisor', level: 3, ...escalationOpts });
      if (l2Email) await emailSvc.sendLoneWorkerEscalation({ to: l2Email, contactName: settings.loneWorkerL2Name || 'Manager', level: 3, ...escalationOpts });
      const updateData = { loneWorkerEscalationLevel: 3 };
      if (session.personType === 'staff') {
        await customerDb.update(isolatedSchema.staff).set(updateData).where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
      } else {
        await customerDb.update(isolatedSchema.contractorWorkers).set(updateData).where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
      }
      await customerDb.update(isolatedSchema.loneWorkerSessions)
        .set({ status: 'escalated', escalationsFired: (session.escalationsFired || 0) + 1 })
        .where(sql`${isolatedSchema.loneWorkerSessions.id} = ${session.id}`);

      try {
        await customerDb.insert(isolatedSchema.incidentReports).values({
          evacuationId: `lone-worker-${session.id}`,
          customerId: session.customerId,
          isDrill: false,
          activatedBy: 'Lone Worker System (L3 Alert)',
          startedAt: new Date(session.startedAt),
          completedAt: now,
          durationSeconds: Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000),
          totalOnSite: 1,
          accountedFor: 0,
          unaccounted: 1,
          completionPct: 0,
        });
        logger.info(`📋 Incident record created for lone worker L3 emergency: ${session.personName}`);
      } catch (irErr: any) {
        logger.warn('Could not create incident record for lone worker L3:', irErr.message?.substring(0, 100));
      }

      logger.info(`🚨 Lone Worker L3 EMERGENCY alert fired for ${session.personName} (${session.customerId})`);
    }
  } catch (sessionErr: any) {
    logger.warn(`Lone worker cron error for session ${session.id}:`, sessionErr.message?.substring(0, 100));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function registerLoneWorkerRoutes(app: Express, _server: Server): void {

  // GET /api/lone-worker/active — list all active lone worker sessions
  app.get("/api/lone-worker/active", requireAuth, async (req, res) => {
    try {
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const siteFilter = scopedWhere(siteContext, isolatedSchema.loneWorkerSessions);
      const sessions = await customerDb
        .select()
        .from(isolatedSchema.loneWorkerSessions)
        .where(siteFilter
          ? sql`${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated') AND ${siteFilter}`
          : sql`${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`);

      const now = Date.now();
      const augmented = await Promise.all(sessions.map(async (s: any) => {
        let nextDeadline: Date | null = null;
        let escalationLevel = 0;
        try {
          if (s.personType === 'staff') {
            const [person] = await customerDb.select({
              loneWorkerDeadline: isolatedSchema.staff.loneWorkerDeadline,
              loneWorkerEscalationLevel: isolatedSchema.staff.loneWorkerEscalationLevel,
            }).from(isolatedSchema.staff).where(sql`${isolatedSchema.staff.id} = ${s.personId}`);
            if (person) { nextDeadline = person.loneWorkerDeadline; escalationLevel = person.loneWorkerEscalationLevel || 0; }
          } else {
            const [person] = await customerDb.select({
              loneWorkerDeadline: isolatedSchema.contractorWorkers.loneWorkerDeadline,
              loneWorkerEscalationLevel: isolatedSchema.contractorWorkers.loneWorkerEscalationLevel,
            }).from(isolatedSchema.contractorWorkers).where(sql`${isolatedSchema.contractorWorkers.id} = ${s.personId}`);
            if (person) { nextDeadline = person.loneWorkerDeadline; escalationLevel = person.loneWorkerEscalationLevel || 0; }
          }
        } catch {}
        const startMs = new Date(s.startedAt).getTime();
        const minutesSinceStart = Math.floor((now - startMs) / 60000);
        return { ...s, minutesSinceStart, nextDeadline, escalationLevel };
      }));
      res.json(augmented);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('does not exist') || msg.includes('undefined_table') || err?.code === '42P01') {
        return res.json([]);
      }
      logger.error('GET /api/lone-worker/active error:', err);
      res.status(500).json({ error: 'Failed to fetch active lone workers' });
    }
  });


  // POST /api/contractor-workers/:id/lone-worker/start
  app.post("/api/contractor-workers/:id/lone-worker/start", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { db: customerDb, siteId } = await getScopedDb(req);
      const { id } = req.params;
      const cryptoMod = await import('crypto');

      const [worker] = await customerDb.select().from(isolatedSchema.contractorWorkers).where(sql`${isolatedSchema.contractorWorkers.id} = ${id}`);
      if (!worker) return res.status(404).json({ error: 'Contractor worker not found' });
      if (!worker.isCheckedIn) return res.status(400).json({ error: 'Worker must be checked in to start lone worker mode' });
      if (!worker.email) return res.status(400).json({ error: 'Worker must have an email address to use lone worker protection' });

      const settings = await getLoneWorkerSettings({ db: customerDb });
      if (!settings?.loneWorkerEnabled) return res.status(400).json({ error: 'Lone Worker Protection is not enabled for this organisation' });

      const [existingSession] = await customerDb.select().from(isolatedSchema.loneWorkerSessions)
        .where(sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'contractor' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`)
        .limit(1);
      if (existingSession) return res.status(409).json({ error: 'An active lone worker session already exists for this person', sessionId: existingSession.id });

      const intervalMins = settings?.loneWorkerCheckIntervalMins || 30;
      const gracePeriodMins = settings?.loneWorkerGracePeriodMins || 10;
      const deadline = new Date(Date.now() + intervalMins * 60000);

      const [session] = await customerDb.insert(isolatedSchema.loneWorkerSessions).values(withSiteId(siteId, {
        customerId,
        personId: id,
        personType: 'contractor',
        personName: `${worker.firstName} ${worker.lastName}`,
        personEmail: worker.email || '',
        intervalMins,
        gracePeriodMins,
        status: 'active',
      })).returning();

      const token = mintLoneWorkerToken(cryptoMod);
      await customerDb.insert(isolatedSchema.loneWorkerTokens).values({
        token,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + (intervalMins + gracePeriodMins) * 60000),
      });

      await customerDb.update(isolatedSchema.contractorWorkers)
        .set({ isLoneWorker: true, loneWorkerSince: new Date(), loneWorkerDeadline: deadline, loneWorkerEscalationLevel: 0 })
        .where(sql`${isolatedSchema.contractorWorkers.id} = ${id}`);

      if (worker.email) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        try {
          await sendFirstWelfareEmail(customerDb, { ...session, personEmail: worker.email }, token, settings, baseUrl);
        } catch (emailErr: any) {
          logger.error(`🛡️ Lone worker session ${session.id} started but welfare email failed to send:`, emailErr?.message || emailErr);
        }
      }

      res.json({ success: true, session, deadline });
    } catch (err: any) {
      logger.error('POST /api/contractor-workers/:id/lone-worker/start error:', err);
      res.status(500).json({ error: 'Failed to start lone worker session' });
    }
  });

  // POST /api/contractor-workers/:id/lone-worker/end
  app.post("/api/contractor-workers/:id/lone-worker/end", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId!;
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const { id } = req.params;
      const endedBy = req.body?.endedBy || 'supervisor';
      const siteFilter = scopedWhere(siteContext, isolatedSchema.loneWorkerSessions);

      await customerDb.update(isolatedSchema.loneWorkerSessions)
        .set({ status: 'ended_ok', endedAt: new Date(), endedBy })
        .where(siteFilter
          ? sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'contractor' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated') AND ${siteFilter}`
          : sql`${isolatedSchema.loneWorkerSessions.personId} = ${id} AND ${isolatedSchema.loneWorkerSessions.personType} = 'contractor' AND ${isolatedSchema.loneWorkerSessions.status} IN ('active','escalated')`);

      await customerDb.update(isolatedSchema.contractorWorkers)
        .set({ isLoneWorker: false, loneWorkerSince: null, loneWorkerDeadline: null, loneWorkerEscalationLevel: 0 })
        .where(sql`${isolatedSchema.contractorWorkers.id} = ${id}`);

      res.json({ success: true });
    } catch (err: any) {
      logger.error('POST /api/contractor-workers/:id/lone-worker/end error:', err);
      res.status(500).json({ error: 'Failed to end lone worker session' });
    }
  });

  // GET /api/lone-worker/ok/:token — token-only alias (no customerId in URL); iterates all customers
  app.get("/api/lone-worker/ok/:token", async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid token' });
      const cryptoMod = await import('crypto');
      const allCustomers = await CustomerDatabaseService.getInstance().getAllCustomers();
      for (const cust of allCustomers) {
        try {
          const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(cust.id);
          const [tokenRow] = await customerDb
            .select()
            .from(isolatedSchema.loneWorkerTokens)
            .where(sql`${isolatedSchema.loneWorkerTokens.token} = ${token}`)
            .limit(1);
          if (!tokenRow) continue;
          if (tokenRow.usedAt) return res.status(400).json({ error: 'This confirmation link has already been used', alreadyUsed: true });
          if (new Date(tokenRow.expiresAt) < new Date()) {
            // Fix (B): expired token — re-send a fresh welfare email so the worker can still self-confirm.
            const [expSess] = await customerDb.select().from(isolatedSchema.loneWorkerSessions)
              .where(sql`${isolatedSchema.loneWorkerSessions.id} = ${tokenRow.sessionId}`).limit(1);
            if (!expSess || (expSess.status !== 'active' && expSess.status !== 'escalated')) {
              return res.status(400).json({ error: 'This confirmation link has expired and the session is no longer active. Please contact your supervisor.', expired: true });
            }
            // Spam guard: only re-send if no fresh unused token already exists for this session
            const [alreadyFresh] = await customerDb.select({ id: isolatedSchema.loneWorkerTokens.id })
              .from(isolatedSchema.loneWorkerTokens)
              .where(sql`${isolatedSchema.loneWorkerTokens.sessionId} = ${expSess.id} AND ${isolatedSchema.loneWorkerTokens.usedAt} IS NULL AND ${isolatedSchema.loneWorkerTokens.expiresAt} > NOW()`)
              .limit(1);
            if (alreadyFresh) {
              return res.status(400).json({ error: 'This link has expired, but a fresh check-in email has already been sent. Please check your inbox.', expired: true });
            }
            const expSettings = await getLoneWorkerSettings({ db: customerDb });
            const expInterval = expSess.intervalMins;
            const freshTok = mintLoneWorkerToken(cryptoMod);
            await customerDb.insert(isolatedSchema.loneWorkerTokens).values({
              token: freshTok, sessionId: expSess.id,
              expiresAt: new Date(Date.now() + (expInterval + (expSettings?.loneWorkerGracePeriodMins || 10)) * 60000),
            });
            if (expSess.personEmail) {
              const baseUrl = `${req.protocol}://${req.get('host')}`;
              try {
                await emailService.forCustomer(expSess.customerId).sendLoneWorkerWelfareCheck({
                  to: expSess.personEmail, workerName: expSess.personName,
                  confirmUrl: `${baseUrl}/lone-worker/ok/${expSess.customerId}/${freshTok}`,
                  nextCheckMins: expInterval,
                  companyName: expSettings?.companyName || 'Your Company',
                  siteName: expSettings?.companyName || 'Site',
                });
              } catch (emailErr: any) {
                logger.warn(`🛡️ Failed to re-send welfare email for expired token (session ${expSess.id}):`, emailErr?.message || emailErr);
              }
            }
            return res.status(400).json({ error: "This link had expired — we've sent you a fresh check-in link. Please check your email.", expired: true, refreshed: true });
          }
          const [session] = await customerDb.select().from(isolatedSchema.loneWorkerSessions).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${tokenRow.sessionId}`).limit(1);
          if (!session || (session.status !== 'active' && session.status !== 'escalated')) return res.status(400).json({ error: 'Lone worker session is no longer active', inactive: true });
          const settings = await getLoneWorkerSettings({ db: customerDb });
          const intervalMins = session.intervalMins;
          await customerDb.update(isolatedSchema.loneWorkerTokens).set({ usedAt: new Date() }).where(sql`${isolatedSchema.loneWorkerTokens.id} = ${tokenRow.id}`);
          const newDeadline = new Date(Date.now() + intervalMins * 60000);
          await customerDb.update(isolatedSchema.loneWorkerSessions).set({ checkInsCompleted: (session.checkInsCompleted || 0) + 1, status: 'active' }).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${session.id}`);
          if (session.personType === 'staff') {
            await customerDb.update(isolatedSchema.staff).set({ loneWorkerDeadline: newDeadline, loneWorkerEscalationLevel: 0 }).where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
          } else {
            await customerDb.update(isolatedSchema.contractorWorkers).set({ loneWorkerDeadline: newDeadline, loneWorkerEscalationLevel: 0 }).where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
          }
          const newToken = mintLoneWorkerToken(cryptoMod);
          await customerDb.insert(isolatedSchema.loneWorkerTokens).values({ token: newToken, sessionId: session.id, expiresAt: new Date(Date.now() + (intervalMins + (settings?.loneWorkerGracePeriodMins || 10)) * 60000) });
          if (session.personEmail) {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const emailSvc = emailService.forCustomer(session.customerId);
            try {
              await emailSvc.sendLoneWorkerWelfareCheck({ to: session.personEmail, workerName: session.personName, confirmUrl: `${baseUrl}/lone-worker/ok/${session.customerId}/${newToken}`, nextCheckMins: intervalMins, companyName: settings?.companyName || 'Your Company', siteName: settings?.companyName || 'Site' });
            } catch (emailErr: any) {
              logger.error(`🛡️ Lone worker confirmation for session ${session.id} succeeded but next welfare email failed:`, emailErr?.message || emailErr);
            }
          }
          return res.json({ success: true, nextCheckMins: intervalMins, workerName: session.personName, companyName: settings?.companyName || 'Your Company' });
        } catch (_) { /* skip failed customer DB and try next */ }
      }
      return res.status(404).json({ error: 'Token not found or already used' });
    } catch (err: any) {
      logger.error('GET /api/lone-worker/ok/:token (alias) error:', err);
      res.status(500).json({ error: 'Failed to process welfare check confirmation' });
    }
  });

  // GET /api/lone-worker/ok/:customerId/:token — public confirmation endpoint (no auth required)
  app.get("/api/lone-worker/ok/:customerId/:token", async (req, res) => {
    try {
      const { customerId, token } = req.params;
      const cryptoMod = await import('crypto');

      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customerId);

      const [tokenRow] = await customerDb
        .select()
        .from(isolatedSchema.loneWorkerTokens)
        .where(sql`${isolatedSchema.loneWorkerTokens.token} = ${token}`)
        .limit(1);

      if (!tokenRow) return res.status(404).json({ error: 'Token not found or already used' });
      if (tokenRow.usedAt) return res.status(400).json({ error: 'This confirmation link has already been used', alreadyUsed: true });
      if (new Date(tokenRow.expiresAt) < new Date()) {
        // Fix (B): expired token — re-send a fresh welfare email so the worker can still self-confirm.
        const [expSess] = await customerDb.select().from(isolatedSchema.loneWorkerSessions)
          .where(sql`${isolatedSchema.loneWorkerSessions.id} = ${tokenRow.sessionId}`).limit(1);
        if (!expSess || (expSess.status !== 'active' && expSess.status !== 'escalated')) {
          return res.status(400).json({ error: 'This confirmation link has expired and the session is no longer active. Please contact your supervisor.', expired: true });
        }
        // Spam guard: only re-send if no fresh unused token already exists for this session
        const [alreadyFresh] = await customerDb.select({ id: isolatedSchema.loneWorkerTokens.id })
          .from(isolatedSchema.loneWorkerTokens)
          .where(sql`${isolatedSchema.loneWorkerTokens.sessionId} = ${expSess.id} AND ${isolatedSchema.loneWorkerTokens.usedAt} IS NULL AND ${isolatedSchema.loneWorkerTokens.expiresAt} > NOW()`)
          .limit(1);
        if (alreadyFresh) {
          return res.status(400).json({ error: 'This link has expired, but a fresh check-in email has already been sent. Please check your inbox.', expired: true });
        }
        const expSettings = await getLoneWorkerSettings({ db: customerDb });
        const expInterval = expSess.intervalMins;
        const freshTok = mintLoneWorkerToken(cryptoMod);
        await customerDb.insert(isolatedSchema.loneWorkerTokens).values({
          token: freshTok, sessionId: expSess.id,
          expiresAt: new Date(Date.now() + (expInterval + (expSettings?.loneWorkerGracePeriodMins || 10)) * 60000),
        });
        if (expSess.personEmail) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          try {
            await emailService.forCustomer(expSess.customerId).sendLoneWorkerWelfareCheck({
              to: expSess.personEmail, workerName: expSess.personName,
              confirmUrl: `${baseUrl}/lone-worker/ok/${expSess.customerId}/${freshTok}`,
              nextCheckMins: expInterval,
              companyName: expSettings?.companyName || 'Your Company',
              siteName: expSettings?.companyName || 'Site',
            });
          } catch (emailErr: any) {
            logger.warn(`🛡️ Failed to re-send welfare email for expired token (session ${expSess.id}):`, emailErr?.message || emailErr);
          }
        }
        return res.status(400).json({ error: "This link had expired — we've sent you a fresh check-in link. Please check your email.", expired: true, refreshed: true });
      }

      const [session] = await customerDb.select().from(isolatedSchema.loneWorkerSessions).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${tokenRow.sessionId}`).limit(1);
      if (!session || (session.status !== 'active' && session.status !== 'escalated')) return res.status(400).json({ error: 'Lone worker session is no longer active', inactive: true });
      const settings = await getLoneWorkerSettings({ db: customerDb });
      const intervalMins = session.intervalMins;

      await customerDb.update(isolatedSchema.loneWorkerTokens).set({ usedAt: new Date() }).where(sql`${isolatedSchema.loneWorkerTokens.id} = ${tokenRow.id}`);

      const newDeadline = new Date(Date.now() + intervalMins * 60000);
      await customerDb.update(isolatedSchema.loneWorkerSessions).set({
        checkInsCompleted: (session.checkInsCompleted || 0) + 1,
        status: 'active',
      }).where(sql`${isolatedSchema.loneWorkerSessions.id} = ${session.id}`);

      if (session.personType === 'staff') {
        await customerDb.update(isolatedSchema.staff)
          .set({ loneWorkerDeadline: newDeadline, loneWorkerEscalationLevel: 0 })
          .where(sql`${isolatedSchema.staff.id} = ${session.personId}`);
      } else {
        await customerDb.update(isolatedSchema.contractorWorkers)
          .set({ loneWorkerDeadline: newDeadline, loneWorkerEscalationLevel: 0 })
          .where(sql`${isolatedSchema.contractorWorkers.id} = ${session.personId}`);
      }

      const newToken = mintLoneWorkerToken(cryptoMod);
      await customerDb.insert(isolatedSchema.loneWorkerTokens).values({
        token: newToken,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + (intervalMins + (settings?.loneWorkerGracePeriodMins || 10)) * 60000),
      });

      if (session.personEmail) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const emailSvc = emailService.forCustomer(session.customerId);
        try {
          await emailSvc.sendLoneWorkerWelfareCheck({
            to: session.personEmail,
            workerName: session.personName,
            confirmUrl: `${baseUrl}/lone-worker/ok/${session.customerId}/${newToken}`,
            nextCheckMins: intervalMins,
            companyName: settings?.companyName || 'Your Company',
            siteName: settings?.companyName || 'Site',
          });
        } catch (emailErr: any) {
          logger.error(`🛡️ Lone worker confirmation for session ${session.id} succeeded but next welfare email failed:`, emailErr?.message || emailErr);
        }
      }

      res.json({ success: true, nextCheckMins: intervalMins, workerName: session.personName, companyName: settings?.companyName || 'Your Company' });
    } catch (err: any) {
      logger.error('GET /api/lone-worker/ok/:token error:', err);
      res.status(500).json({ error: 'Failed to process welfare check confirmation' });
    }
  });

  // GET /api/lone-worker/sessions — session log for Reports page (paginated)
  app.get("/api/lone-worker/sessions", requireAuth, async (req, res) => {
    try {
      const { db: customerDb, siteContext } = await getScopedDb(req);
      const siteFilter = scopedWhere(siteContext, isolatedSchema.loneWorkerSessions);
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const [{ count }] = await customerDb
        .select({ count: sql<number>`count(*)::int` })
        .from(isolatedSchema.loneWorkerSessions)
        .where(siteFilter);

      const sessions = await customerDb
        .select()
        .from(isolatedSchema.loneWorkerSessions)
        .where(siteFilter)
        .orderBy(sql`${isolatedSchema.loneWorkerSessions.startedAt} DESC`)
        .limit(limit)
        .offset(offset);

      res.json({ sessions, total: count, page, limit, totalPages: Math.ceil(count / limit) });
    } catch (err: any) {
      logger.error('GET /api/lone-worker/sessions error:', err);
      res.status(500).json({ error: 'Failed to fetch lone worker sessions' });
    }
  });

  // ─── Background: Lone Worker Monitoring ──────────────────────────────────────
  // Runs every 60 seconds; checks for overdue sessions and fires escalation emails.
  // Singleton guard: prevents duplicate intervals if registerRoutes is called more than once.
  if (!(globalThis as any).__loneWorkerCronStarted) {
    (globalThis as any).__loneWorkerCronStarted = true;
    setInterval(async () => {
      try {
        const now = new Date();
        const allCustomers = await customerDbService.getAllCustomers();
        for (const customer of allCustomers) {
          try {
            const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(customer.id);
            const customerSessions = await customerDb
              .select()
              .from(isolatedSchema.loneWorkerSessions)
              .where(sql`${isolatedSchema.loneWorkerSessions.status} = 'active'`);
            for (const session of customerSessions) {
              await processLoneWorkerSession(session, customerDb, now);
            }
          } catch (custErr: any) {
            logger.warn(`Lone worker cron error for customer ${customer.id}:`, custErr.message?.substring(0, 100));
          }
        }
      } catch (err: any) {
        logger.error('Lone worker cron top-level error:', err.message?.substring(0, 100));
      }
    }, 60000);
  } else {
    logger.info('🛡️ Lone Worker cron already running — skipping duplicate registration');
  }

}
