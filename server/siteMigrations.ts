import { logger } from './utils/logger';
import type { Migration } from './migrationRunner';

/**
 * Enterprise Multi-Site — Phase 1a
 * Creates areas + sites tables and adds nullable site_id to all 34 operational
 * tables.  A single "Primary Site" (is_default=true) is inserted for every
 * existing customer so that all legacy rows are attached to one default site.
 * This keeps non-enterprise behaviour identical to before.
 */

const SITE_SCOPED_TABLES: string[] = [
  'staff',
  'visitors',
  'members',
  'visitor_history',
  'staff_attendance_history',
  'pre_bookings',
  'departments',
  'muster_points',
  'evacuation_zones',
  'safety_tokens',
  'contractor_companies',
  'contractor_workers',
  'contractor_documents',
  'compliance_documents',
  'rams_documents',
  'worker_certifications',
  'induction_tokens',
  'contractor_visits',
  'contractor_prebookings',
  'local_labour_records',
  'meeting_rooms',
  'room_bookings',
  'ppm_assets',
  'ppm_work_orders',
  'cdm_projects',
  'hs_incidents',
  'fire_risk_assessments',
  'compliance_certificates',
  'permit_to_work',
  'audit_records',
  'ra_builder_assessments',
  'incident_reports',
  'lone_worker_sessions',
  'help_desk_tickets',
];

export const siteMigrations: Migration[] = [
  {
    version: '20260622_065_create_sites_and_site_id',
    description: 'Create areas + sites tables; add nullable site_id to 34 operational tables; backfill default site',
    async up(db: any) {

      // ── 1. areas table ────────────────────────────────────────────────────
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS areas (
            id      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name    TEXT NOT NULL,
            description TEXT,
            created_at  TIMESTAMP DEFAULT NOW()
          )
        `);
        logger.info('✅ [065] areas table ensured');
      } catch (err: any) {
        logger.warn(`⚠️ [065] areas table: ${err.message?.substring(0, 100)}`);
      }

      // ── 2. sites table ────────────────────────────────────────────────────
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS sites (
            id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name        TEXT NOT NULL,
            reference   TEXT UNIQUE,
            address     TEXT,
            postcode    TEXT,
            region      TEXT,
            area_id     VARCHAR REFERENCES areas(id),
            status      TEXT NOT NULL DEFAULT 'active',
            is_default  BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMP DEFAULT NOW(),
            archived_at TIMESTAMP
          )
        `);
        logger.info('✅ [065] sites table ensured');
      } catch (err: any) {
        logger.warn(`⚠️ [065] sites table: ${err.message?.substring(0, 100)}`);
      }

      // ── 3. Add site_id column to all 34 operational tables ────────────────
      for (const table of SITE_SCOPED_TABLES) {
        try {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
        } catch (err: any) {
          logger.warn(`⚠️ [065] add site_id → ${table}: ${err.message?.substring(0, 80)}`);
        }
      }
      logger.info(`✅ [065] site_id column ensured on ${SITE_SCOPED_TABLES.length} tables`);

      // ── 4. Indexes on site_id ─────────────────────────────────────────────
      for (const table of SITE_SCOPED_TABLES) {
        try {
          await db.execute(
            `CREATE INDEX IF NOT EXISTS idx_${table}_site_id ON ${table}(site_id)`
          );
        } catch (err: any) {
          logger.warn(`⚠️ [065] index ${table}: ${err.message?.substring(0, 80)}`);
        }
      }
      logger.info('✅ [065] site_id indexes ensured');

      // ── 5. Insert default site (idempotent) ───────────────────────────────
      try {
        await db.execute(`
          INSERT INTO sites (id, name, reference, status, is_default, created_at)
          SELECT gen_random_uuid()::text, 'Primary Site', 'SITE-001', 'active', true, NOW()
          WHERE NOT EXISTS (SELECT 1 FROM sites LIMIT 1)
        `);
        logger.info('✅ [065] Default site ensured (Primary Site / SITE-001)');
      } catch (err: any) {
        logger.warn(`⚠️ [065] default site insert: ${err.message?.substring(0, 100)}`);
      }

      // ── 6. Backfill every table with the default site_id ──────────────────
      try {
        const result = await db.execute(
          `SELECT id FROM sites WHERE is_default = true LIMIT 1`
        );
        const defaultSiteId: string | undefined = result.rows?.[0]?.id;

        if (!defaultSiteId) {
          logger.warn('⚠️ [065] No default site found — skipping row backfill');
          return;
        }

        for (const table of SITE_SCOPED_TABLES) {
          try {
            await db.execute(
              `UPDATE ${table} SET site_id = '${defaultSiteId}' WHERE site_id IS NULL`
            );
          } catch (err: any) {
            // Table may not exist yet (e.g. optional feature table) — non-fatal
            logger.warn(`⚠️ [065] backfill site_id on ${table}: ${err.message?.substring(0, 80)}`);
          }
        }
        logger.info(`✅ [065] All tables backfilled → site ${defaultSiteId}`);
      } catch (err: any) {
        logger.warn(`⚠️ [065] backfill phase: ${err.message?.substring(0, 100)}`);
      }
    },
  },
];
