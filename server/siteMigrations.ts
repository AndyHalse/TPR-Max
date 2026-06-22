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
  {
    version: "20260622_066_site_id_ensure_all_tables",
    description: "Re-run ADD COLUMN IF NOT EXISTS site_id on all SITE_SCOPED_TABLES to catch tables created after migration 065 ran.",
    up: async (db: any) => {
      for (const table of SITE_SCOPED_TABLES) {
        try {
          await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
        } catch (err: any) {
          logger.warn(`⚠️ [066] add site_id → ${table}: ${err.message?.substring(0, 80)}`);
        }
      }
      // Backfill any new NULLs with the default site
      try {
        const result = await db.execute(`SELECT id FROM sites WHERE is_default = true LIMIT 1`);
        const defaultSiteId: string | undefined = result.rows?.[0]?.id;
        if (defaultSiteId) {
          for (const table of SITE_SCOPED_TABLES) {
            try {
              await db.execute(`UPDATE ${table} SET site_id = '${defaultSiteId}' WHERE site_id IS NULL`);
            } catch {}
          }
          logger.info(`✅ [066] site_id backfill done → site ${defaultSiteId}`);
        }
      } catch (err: any) {
        logger.warn(`⚠️ [066] backfill: ${err.message?.substring(0, 100)}`);
      }
    },
  },

  // ── 067 ────────────────────────────────────────────────────────────────────
  {
    version: '20260622_067_site_user_roles',
    description: 'Create site_user_roles table for enterprise per-user site access grants; auto-grant enterprise_admin to existing admin users',
    async up(db: any) {
      // Create table
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS site_user_roles (
            id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id    VARCHAR NOT NULL,
            role       TEXT    NOT NULL,
            area_id    VARCHAR REFERENCES areas(id)  ON DELETE CASCADE,
            site_id    VARCHAR REFERENCES sites(id)  ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
      } catch (err: any) {
        logger.warn(`⚠️ [067] create site_user_roles: ${err.message?.substring(0, 120)}`);
      }

      // Unique index using COALESCE so (user, role, NULL, NULL) is truly unique
      try {
        await db.execute(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_sur_unique
            ON site_user_roles(user_id, role, COALESCE(area_id, ''), COALESCE(site_id, ''))
        `);
      } catch (err: any) {
        logger.warn(`⚠️ [067] unique index: ${err.message?.substring(0, 120)}`);
      }

      // Bootstrap: grant enterprise_admin to every existing admin user so existing
      // enterprise customers don't lose access when the fail-closed middleware activates.
      try {
        await db.execute(`
          INSERT INTO site_user_roles (user_id, role)
          SELECT id, 'enterprise_admin'
          FROM   users
          WHERE  role = 'admin'
          ON CONFLICT DO NOTHING
        `);
        logger.info('✅ [067] site_user_roles ready; existing admins bootstrapped as enterprise_admin');
      } catch (err: any) {
        logger.warn(`⚠️ [067] bootstrap grants: ${err.message?.substring(0, 120)}`);
      }
    },
  },

  // ── Migration 068: compliance engine tables ──────────────────────────────────
  {
    version: '20260622_068_compliance_engine',
    description: 'Creates compliance_items, compliance_snapshots, compliance_alerts tables for the scoring engine',
    async up(db) {
      // compliance_items — one row per tracked entity per site
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS compliance_items (
            id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            site_id      VARCHAR NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            category     TEXT NOT NULL,
            source_table TEXT NOT NULL,
            source_id    VARCHAR NOT NULL,
            status       TEXT NOT NULL,
            severity     TEXT NOT NULL,
            expires_at   DATE,
            updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE (site_id, category, source_table, source_id)
          )
        `);
      } catch (err: any) {
        logger.warn(`⚠️ [068] compliance_items: ${err.message?.substring(0, 120)}`);
      }

      // compliance_snapshots — daily score history; site_id NULL = estate-wide
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS compliance_snapshots (
            id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            site_id         VARCHAR,
            date            DATE NOT NULL,
            overall_score   INTEGER NOT NULL,
            category_scores JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          )
        `);
        // COALESCE unique index so NULL site_id (estate row) is still unique per date
        await db.execute(`
          CREATE UNIQUE INDEX IF NOT EXISTS uidx_compliance_snapshots_site_date
            ON compliance_snapshots (COALESCE(site_id, ''), date)
        `);
      } catch (err: any) {
        logger.warn(`⚠️ [068] compliance_snapshots: ${err.message?.substring(0, 120)}`);
      }

      // compliance_alerts — open/acknowledged/resolved alert feed
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS compliance_alerts (
            id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
            site_id     VARCHAR NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
            category    TEXT NOT NULL,
            severity    TEXT NOT NULL,
            title       TEXT NOT NULL,
            detail      JSONB NOT NULL DEFAULT '{}',
            status      TEXT NOT NULL DEFAULT 'open',
            created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            resolved_at TIMESTAMP WITH TIME ZONE
          )
        `);
      } catch (err: any) {
        logger.warn(`⚠️ [068] compliance_alerts: ${err.message?.substring(0, 120)}`);
      }

      // Performance indexes
      try {
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_ci_site     ON compliance_items(site_id)`);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_ci_category ON compliance_items(category)`);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_cs_date     ON compliance_snapshots(date)`);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_ca_site     ON compliance_alerts(site_id)`);
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_ca_status   ON compliance_alerts(status)`);
        logger.info('✅ [068] compliance engine tables ready');
      } catch (err: any) {
        logger.warn(`⚠️ [068] indexes: ${err.message?.substring(0, 120)}`);
      }
    },
  },
];
