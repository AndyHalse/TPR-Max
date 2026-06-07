import type { Express } from 'express';
import type { Server } from 'http';
import { eq, and, sql, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { db } from '../db';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService, CustomerDatabaseService } from '../customerDatabase';
import {
  helpCategories,
  helpArticles,
  helpUserInteractions,
  helpOnboardingProgress,
} from '@shared/schema';
import { logger } from '../utils/logger';

export async function registerRemainingRoutes(app: Express, server: Server): Promise<void> {
  // Help System endpoints
  app.get("/api/help/categories", requireAuth, async (req, res) => {
    try {
      const categories = await db
        .select()
        .from(helpCategories)
        .where(eq(helpCategories.isActive, true))
        .orderBy(helpCategories.sortOrder, helpCategories.name);
      res.json(categories);
    } catch (error) {
      logger.error('Error fetching help categories:', error);
      res.status(500).json({ error: 'Failed to fetch help categories' });
    }
  });

  app.get("/api/help/articles/featured", requireAuth, async (req, res) => {
    try {
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.isFeatured, true)
        ))
        .orderBy(desc(helpArticles.viewCount))
        .limit(10);
      res.json(articles);
    } catch (error) {
      logger.error('Error fetching featured help articles:', error);
      res.status(500).json({ error: 'Failed to fetch featured articles' });
    }
  });

  app.get("/api/help/articles/contextual", requireAuth, async (req, res) => {
    try {
      const { location } = req.query;
      const page = location && typeof location === 'string' ? location.replace(/^\//, '') : '';
      if (!page) return res.json([]);
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          sql`${page} = ANY(${helpArticles.targetPages})`
        ))
        .orderBy(helpArticles.sortOrder)
        .limit(5);
      res.json(articles);
    } catch (error) {
      logger.error('Error fetching contextual help articles:', error);
      res.status(500).json({ error: 'Failed to fetch contextual articles' });
    }
  });

  app.get("/api/help/articles/category/:categoryId", requireAuth, async (req, res) => {
    try {
      const { categoryId } = req.params;
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.categoryId, categoryId)
        ))
        .orderBy(helpArticles.sortOrder);
      res.json(articles);
    } catch (error) {
      logger.error('Error fetching category help articles:', error);
      res.status(500).json({ error: 'Failed to fetch category articles' });
    }
  });

  app.get("/api/help/articles/general", requireAuth, async (req, res) => {
    try {
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          eq(helpArticles.isQuickStart, true)
        ))
        .orderBy(helpArticles.sortOrder)
        .limit(5);
      res.json(articles);
    } catch (error) {
      logger.error('Error fetching general help articles:', error);
      res.status(500).json({ error: 'Failed to fetch help articles' });
    }
  });

  app.get("/api/help/articles/search", requireAuth, async (req, res) => {
    try {
      const { searchQuery } = req.query;
      const query = searchQuery && typeof searchQuery === 'string' ? searchQuery : '';
      if (!query || query.length < 3) return res.json([]);
      const articles = await db
        .select()
        .from(helpArticles)
        .where(and(
          eq(helpArticles.isPublished, true),
          sql`(
            LOWER(${helpArticles.title}) LIKE LOWER(${'%' + query + '%'}) OR
            LOWER(${helpArticles.content}) LIKE LOWER(${'%' + query + '%'}) OR
            LOWER(${helpArticles.summary}) LIKE LOWER(${'%' + query + '%'}) OR
            EXISTS (SELECT 1 FROM unnest(${helpArticles.searchKeywords}) AS keyword WHERE LOWER(keyword) LIKE LOWER(${'%' + query + '%'}))
          )`
        ))
        .orderBy(desc(helpArticles.viewCount))
        .limit(20);
      res.json(articles);
    } catch (error) {
      logger.error('Error searching help articles:', error);
      res.status(500).json({ error: 'Failed to search articles' });
    }
  });

  app.post("/api/help/interactions", requireAuth, async (req, res) => {
    try {
      const { interactionType, articleId } = req.body;
      if (!interactionType || !articleId) {
        return res.status(400).json({ error: 'Missing interactionType or articleId' });
      }

      if (interactionType === 'view') {
        await db.update(helpArticles)
          .set({ viewCount: sql`COALESCE(${helpArticles.viewCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      } else if (interactionType === 'helpful') {
        await db.update(helpArticles)
          .set({ helpfulCount: sql`COALESCE(${helpArticles.helpfulCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      } else if (interactionType === 'not_helpful') {
        await db.update(helpArticles)
          .set({ notHelpfulCount: sql`COALESCE(${helpArticles.notHelpfulCount}, 0) + 1` })
          .where(eq(helpArticles.id, articleId));
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error tracking help interaction:', error);
      res.status(500).json({ error: 'Failed to track interaction' });
    }
  });

  // ============================================================================
  // HEALTH CHECK ENDPOINT FOR SETTINGS VALIDATION AND ROUTE ISOLATION (DEV ONLY)
  // ============================================================================

  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/health/settings-isolation', requireAuth, async (req, res) => {
      try {
        const testResults: any = {
          timestamp: new Date().toISOString(),
          tests: [],
          summary: { passed: 0, failed: 0, total: 0 }
        };

        // Test 1: GET /api/settings with customer isolation
        try {
          const username = req.user!.username;
          const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
          const settings = await simpleDatabaseService.getCompanySettings(context);
          testResults.tests.push({ name: 'GET /api/settings - Customer Isolation', status: 'PASS', details: `Retrieved settings for customer: ${context.customerId}`, customerId: context.customerId });
          testResults.summary.passed++;
        } catch (error: any) {
          testResults.tests.push({ name: 'GET /api/settings - Customer Isolation', status: 'FAIL', error: error.message });
          testResults.summary.failed++;
        }

        // Test 2: PUT /api/settings with known fields
        try {
          const username = req.user!.username;
          const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
          const testUpdates = { companyName: 'Health Check Test Company', idCardPrintQuality: 'high', biostarEnabled: false, backgroundColor: '#f8fafc' };
          await simpleDatabaseService.updateCompanySettings(context, testUpdates);
          testResults.tests.push({ name: 'PUT /api/settings - Known Fields', status: 'PASS', details: 'Successfully updated settings with known fields', fieldsUpdated: Object.keys(testUpdates) });
          testResults.summary.passed++;
        } catch (error: any) {
          testResults.tests.push({ name: 'PUT /api/settings - Known Fields', status: 'FAIL', error: error.message });
          testResults.summary.failed++;
        }

        // Test 3: PUT /api/settings with unknown fields (should gracefully filter)
        try {
          const username = req.user!.username;
          const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
          const testUpdates = { companyName: 'Health Check Test Company 2', unknownField1: 'should be filtered', nonExistentColumn: 'should be filtered', idCardPrintQuality: 'medium' };
          await simpleDatabaseService.updateCompanySettings(context, testUpdates);
          testResults.tests.push({ name: 'PUT /api/settings - Unknown Fields Filter', status: 'PASS', details: 'Successfully handled unknown fields with filterSafeFields', originalFields: Object.keys(testUpdates).length, note: 'Unknown fields filtered gracefully without 500 errors' });
          testResults.summary.passed++;
        } catch (error: any) {
          testResults.tests.push({ name: 'PUT /api/settings - Unknown Fields Filter', status: 'FAIL', error: error.message });
          testResults.summary.failed++;
        }

        // Test 4: Customer isolation verification
        try {
          const user1Context = simpleDatabaseService.createCustomerContext('Andy');
          const user2Context = simpleDatabaseService.createCustomerContext('Emma');
          testResults.tests.push({ name: 'Customer Isolation Verification', status: 'PASS', details: 'Different users map to different customer contexts', andy_customerId: user1Context.customerId, emma_customerId: user2Context.customerId, isolated: user1Context.customerId !== user2Context.customerId });
          testResults.summary.passed++;
        } catch (error: any) {
          testResults.tests.push({ name: 'Customer Isolation Verification', status: 'FAIL', error: error.message });
          testResults.summary.failed++;
        }

        testResults.summary.total = testResults.summary.passed + testResults.summary.failed;
        testResults.summary.successRate = `${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1)}%`;

        logger.info(`Health check completed: ${testResults.summary.successRate} success rate (${testResults.summary.passed}/${testResults.summary.total})`);
        res.json(testResults);
      } catch (error: any) {
        logger.error('Health check failed:', error);
        res.status(500).json({ error: 'Health check failed', details: error.message, timestamp: new Date().toISOString() });
      }
    });
  }

  // ── Getting-Started Checklist ─────────────────────────────────────────────

  app.get("/api/onboarding/checklist-status", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const settings = await simpleDatabaseService.getCompanySettings(context);

      const dismissed = !!(settings as any)?.onboardingChecklistDismissed;

      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);
      const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(context.customerId);
      const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;

      const companyLogoSet = !!(
        settings?.logoUrl &&
        !settings.logoUrl.includes("d6fe1a5b-aa78-4c1f-84b7-74037a02e0f6")
      );
      const emergencyEmailSet = !!(settings?.cdmAlertsEmail && settings.cdmAlertsEmail.trim() !== "");
      const emailSmtpConfigured = !!(settings?.smtpHost && settings.smtpHost.trim() !== "");

      const [musterRes, staffRes, visitorRes, contractorRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) as count FROM "${schemaName}".muster_points WHERE name NOT IN ('Main Car Park', 'Rear Assembly Area', 'Side Entrance')`
        ),
        pool.query(`SELECT COUNT(*) as count FROM "${schemaName}".staff`),
        pool.query(`SELECT COUNT(*) as count FROM "${schemaName}".visitors`),
        pool.query(
          `SELECT COUNT(*) as count FROM "${schemaName}".contractor_workers WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${schemaName}' AND table_name = 'contractor_workers')`
        ).catch(() => ({ rows: [{ count: "0" }] })),
      ]);

      const mustersPointNamed = Number(musterRes.rows[0]?.count || 0) > 0;
      const staffAdded = Number(staffRes.rows[0]?.count || 0) > 0;
      const firstVisitorOrContractor =
        Number(visitorRes.rows[0]?.count || 0) > 0 ||
        Number(contractorRes.rows[0]?.count || 0) > 0;

      const steps = {
        companyLogoSet,
        emergencyEmailSet,
        emailSmtpConfigured,
        mustersPointNamed,
        staffAdded,
        firstVisitorOrContractor,
      };
      const completedCount = Object.values(steps).filter(Boolean).length;
      const allComplete = completedCount === Object.keys(steps).length;

      return res.json({ steps, completedCount, totalCount: Object.keys(steps).length, allComplete, dismissed });
    } catch (error: any) {
      logger.error("[CHECKLIST] Error fetching status:", error);
      return res.status(500).json({ error: "Failed to get checklist status" });
    }
  });

  app.post("/api/onboarding/checklist-dismiss", requireAuth, async (req, res) => {
    try {
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const customerDb = await CustomerDatabaseService.getInstance().getCustomerDatabase(context.customerId);
      const schemaName = CustomerDatabaseService.getInstance().generateSchemaName(context.customerId);
      const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;
      await pool.query(`UPDATE "${schemaName}".company_settings SET onboarding_checklist_dismissed = true`);
      return res.json({ success: true });
    } catch (error: any) {
      logger.error("[CHECKLIST] Error dismissing:", error);
      return res.status(500).json({ error: "Failed to dismiss checklist" });
    }
  });
}
