import type { Express } from 'express';
import { requireAuth } from '../auth';
import { CustomerDatabaseService } from '../customerDatabase';
import { db } from '../db';
import { customers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { geocodePostcodesBulk } from '../geocodeService';

const customerDbService = CustomerDatabaseService.getInstance();

// Tables that need is_demo added at runtime
const DEMO_TABLES = [
  'areas', 'sites', 'site_user_roles', 'users',
  'compliance_certificate_types', 'compliance_certificates',
  'fire_risk_assessments', 'hs_incidents',
  'contractor_companies', 'contractor_workers', 'contractor_site_clearances',
  'visit_reasons', 'induction_settings',
];

async function ensureDemoColumns(pool: any, sn: string): Promise<void> {
  for (const t of DEMO_TABLES) {
    try {
      await pool.query(
        `ALTER TABLE "${sn}"."${t}" ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`
      );
    } catch { /* table may not exist — ignore */ }
  }

  // Extra columns that were added to isolatedSchema.ts after the tables were first provisioned
  const safe = async (sql: string) => { try { await pool.query(sql); } catch { /* non-fatal */ } };

  // visit_reasons: scope + site_id added later
  await safe(`ALTER TABLE IF EXISTS "${sn}".visit_reasons ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'site'`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".visit_reasons ADD COLUMN IF NOT EXISTS site_id VARCHAR`);

  // induction_settings: kiosk_enabled, scope, site_id added later
  await safe(`ALTER TABLE IF EXISTS "${sn}".induction_settings ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT false`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".induction_settings ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'site'`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".induction_settings ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
}

/**
 * Ensures PPM tables exist and have the site_id + is_demo columns needed by the
 * enterprise demo loader. The provisioning code in customerDatabase.ts creates these
 * tables WITHOUT site_id on ppm_asset_groups/ppm_schedules and WITHOUT is_demo on
 * any PPM table, so a fresh enterprise schema would fail on the PPM INSERTs.
 */
async function ensurePpmForDemo(pool: any, sn: string): Promise<void> {
  const safe = async (sql: string) => { try { await pool.query(sql); } catch { /* non-fatal */ } };

  // 1. Create tables if they don't exist (mirrors customerDatabase.ts provisioning)
  await safe(`CREATE TABLE IF NOT EXISTS "${sn}".ppm_asset_groups (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS "${sn}".ppm_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, description TEXT, category TEXT,
    type TEXT NOT NULL DEFAULT 'non-statutory', regulation_reference TEXT,
    frequency TEXT NOT NULL DEFAULT 'monthly', custom_days INTEGER,
    estimated_hours TEXT, checklist TEXT, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS "${sn}".ppm_assets (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, asset_ref TEXT, category TEXT, location TEXT,
    manufacturer TEXT, model_number TEXT, serial_number TEXT,
    install_date TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS "${sn}".ppm_schedules (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id VARCHAR NOT NULL REFERENCES "${sn}".ppm_assets(id) ON DELETE CASCADE,
    template_id VARCHAR REFERENCES "${sn}".ppm_templates(id) ON DELETE SET NULL,
    title TEXT NOT NULL, frequency TEXT NOT NULL DEFAULT 'monthly',
    custom_days INTEGER, start_date TEXT NOT NULL, next_due_date TEXT NOT NULL,
    last_completed_date TEXT, assigned_to TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS "${sn}".ppm_work_orders (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id VARCHAR REFERENCES "${sn}".ppm_schedules(id) ON DELETE SET NULL,
    asset_id VARCHAR REFERENCES "${sn}".ppm_assets(id) ON DELETE SET NULL,
    title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'scheduled',
    contractor_company_id VARCHAR, contractor_company_name TEXT,
    contractor_worker_id VARCHAR, contractor_worker_name TEXT,
    assigned_email TEXT, due_date TEXT, completed_date TEXT,
    notes TEXT, completion_notes TEXT, access_token VARCHAR,
    requires_certificate BOOLEAN DEFAULT false, certificate_uploaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // 2. Add columns that may be missing from older provisioned schemas
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_asset_groups ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_asset_groups ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_assets ADD COLUMN IF NOT EXISTS group_id VARCHAR REFERENCES "${sn}".ppm_asset_groups(id) ON DELETE SET NULL`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_assets ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_assets ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_schedules ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_schedules ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS group_id VARCHAR REFERENCES "${sn}".ppm_asset_groups(id) ON DELETE SET NULL`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS site_id VARCHAR`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS overdue_alerted_at TIMESTAMP`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS missing_cert_alerted_at TIMESTAMP`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS missing_docs_alerted_at TIMESTAMP`);
  await safe(`ALTER TABLE IF EXISTS "${sn}".ppm_work_orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP`);
}

async function getPool(customerId: string) {
  const customerDb = await customerDbService.getCustomerDatabase(customerId);
  const sn = customerDbService.generateSchemaName(customerId);
  const pool = (customerDb as any).$client ?? (customerDb as any).session?.client;
  return { pool, sn };
}

// FK-safe deletion order for all demo tables
async function deleteAllDemoRows(pool: any, sn: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const del = async (table: string, extra = '') => {
    try {
      const r = await pool.query(`DELETE FROM "${sn}"."${table}" WHERE is_demo = true ${extra} RETURNING id`);
      counts[table] = r.rowCount ?? 0;
    } catch { counts[table] = 0; }
  };

  // 1. Leaf tables first (nothing references them with real FK constraints)
  await del('contractor_site_clearances');          // → workers, companies, users
  await del('ppm_work_orders');
  await del('ppm_schedules');
  await del('ppm_assets');
  await del('ppm_asset_groups');
  await del('contractor_workers');                  // → companies
  await del('contractor_companies');
  await del('compliance_certificates');             // → cert_types
  await del('compliance_certificate_types');
  await del('fire_risk_assessments');
  await del('hs_incidents');
  await del('site_user_roles');
  await del('visit_reasons');
  await del('induction_settings');
  await del('users');
  await del('sites');                               // areas last
  await del('areas');

  return counts;
}

export function registerEnterpriseDemoRoutes(app: Express): void {

  // ── Status ──────────────────────────────────────────────────────────────────
  app.get('/api/enterprise-demo/status', requireAuth, async (req, res) => {
    try {
      const cid = req.customerId!;
      const [cust] = await db.select({ isEnterprise: customers.isEnterprise })
        .from(customers).where(eq(customers.id, cid)).limit(1);
      const isEnterprise = cust?.isEnterprise ?? false;

      const { pool, sn } = await getPool(cid);
      const colCheck = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'sites' AND column_name = 'is_demo'`,
        [sn]
      );
      let loaded = false, siteCount = 0;
      if (colCheck.rows.length > 0) {
        const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM "${sn}".sites WHERE is_demo = true`);
        siteCount = cnt.rows[0].n;
        loaded = siteCount > 0;
      }
      return res.json({ isEnterprise, loaded, siteCount });
    } catch (e) {
      logger.error('[enterprise-demo/status]', e);
      return res.status(500).json({ error: 'Failed to check status' });
    }
  });

  // ── Load Enterprise Demo ─────────────────────────────────────────────────────
  app.post('/api/enterprise-demo/load', requireAuth, async (req, res) => {
    let _step = 'init';
    try {
      const cid = req.customerId!;

      // Enterprise guard
      const [cust] = await db.select({ isEnterprise: customers.isEnterprise })
        .from(customers).where(eq(customers.id, cid)).limit(1);
      if (!cust?.isEnterprise) {
        return res.status(403).json({ error: 'Enterprise demo is only available for enterprise customers.' });
      }

      const { pool, sn } = await getPool(cid);
      await ensureDemoColumns(pool, sn);
      await ensurePpmForDemo(pool, sn);

      // Idempotency guard
      const existCheck = await pool.query(`SELECT COUNT(*)::int AS n FROM "${sn}".sites WHERE is_demo = true`);
      if ((existCheck.rows[0].n as number) > 0) {
        return res.status(409).json({ error: 'Enterprise demo already loaded. Use "Reset — Remove All Demo Data" first.' });
      }

      const ts = Date.now();
      const B = `ed${ts}`;          // batch prefix for all IDs

      // ── Area IDs ─────────────────────────────────────────────────────────────
      const aC = `${B}-ac`;  // Central Scotland
      const aE = `${B}-ae`;  // East Scotland
      const aN = `${B}-an`;  // North Scotland
      const aS = `${B}-as`;  // South Scotland

      // ── Site IDs ─────────────────────────────────────────────────────────────
      const sGla = `${B}-s01`;  // Glasgow Royal Infirmary       Critical  ~54
      const sAbd = `${B}-s02`;  // Aberdeen Retail Park           Critical  ~63
      const sEdH = `${B}-s03`;  // Edinburgh HQ                   Warning   ~71
      const sSti = `${B}-s04`;  // Stirling Office Park           Warning   ~79
      const sPer = `${B}-s05`;  // Perth Retail Centre            Warning   ~85
      const sDun = `${B}-s06`;  // Dundee Waterfront              Compliant ~88
      const sInv = `${B}-s07`;  // Inverness Business Park        Compliant ~92
      const sFal = `${B}-s08`;  // Falkirk Distribution Hub       Compliant ~95
      const sEdR = `${B}-s09`;  // Edinburgh Retail Centre        Compliant ~98
      const sAyr = `${B}-s10`;  // Ayr Seafront Offices           Compliant ~100

      // ── User IDs (area managers + coordinators in isolated users table) ───────
      const uSarah  = `${B}-u1`;   // Sarah MacDonald  — Area Manager Central
      const uDuncan = `${B}-u2`;   // Duncan Campbell  — Area Manager North
      const uLynn   = `${B}-u3`;   // Lynn Henderson   — Coordinator Glasgow
      const uCallum = `${B}-u4`;   // Callum Fraser    — Coordinator Aberdeen
      const uFiona  = `${B}-u5`;   // Fiona Stewart    — Coordinator Edinburgh HQ
      const uAileen = `${B}-u6`;   // Aileen McPherson — Coordinator Stirling
      const uBruce  = `${B}-u7`;   // Bruce Thomson    — Coordinator Inverness

      // ── Contractor IDs ───────────────────────────────────────────────────────
      const coCal  = `${B}-c1`;  // Caledonian Building Services Ltd
      const coHigh = `${B}-c2`;  // Highland Facilities Management
      const coClyd = `${B}-c3`;  // Clyde Electrical Contractors
      const coScot = `${B}-c4`;  // Scotia Mechanical Services
      const coBord = `${B}-c5`;  // Borders Fire & Security

      // ── Cert type IDs ────────────────────────────────────────────────────────
      const ctFire  = `${B}-ct1`;  // Fire Safety Certificate
      const ctAsb   = `${B}-ct2`;  // Asbestos Management Survey
      const ctL8    = `${B}-ct3`;  // L8 Legionella Risk Assessment
      const ctEicr  = `${B}-ct4`;  // EICR
      const ctGas   = `${B}-ct5`;  // Gas Safety Certificate
      const ctEmLt  = `${B}-ct6`;  // Emergency Lighting Certificate

      // ══ 1. AREAS ═════════════════════════════════════════════════════════════
      _step = 'areas';
      await pool.query(`
        INSERT INTO "${sn}".areas (id, name, description, is_demo) VALUES
          ($1,'Central Scotland','Glasgow, Stirling, and Falkirk sites',true),
          ($2,'East Scotland','Edinburgh and Dundee sites',true),
          ($3,'North Scotland','Aberdeen, Inverness, and Perth sites',true),
          ($4,'South Scotland','Ayr and Dumfries sites',true)
      `, [aC, aE, aN, aS]);

      // ══ 2. SITES ═════════════════════════════════════════════════════════════
      _step = 'sites';
      await pool.query(`
        INSERT INTO "${sn}".sites
          (id, name, reference, address, postcode, region, area_id, status, is_default, is_demo) VALUES
          ($1,'Glasgow Royal Infirmary','GRI-001','84 Castle Street, Glasgow','G4 0SF','Central Scotland',$11,'active',false,true),
          ($2,'Aberdeen Retail Park','ARP-002','Garthdee Road, Aberdeen','AB10 7PQ','North Scotland',$13,'active',false,true),
          ($3,'Edinburgh HQ','EDH-003','1 Charlotte Square, Edinburgh','EH2 4AN','East Scotland',$12,'active',false,true),
          ($4,'Stirling Office Park','SOP-004','Easter Livilands, Stirling','FK7 7RP','Central Scotland',$11,'active',false,true),
          ($5,'Perth Retail Centre','PRC-005','Dunkeld Road, Perth','PH1 5RJ','North Scotland',$13,'active',false,true),
          ($6,'Dundee Waterfront','DWF-006','3 Dock Street, Dundee','DD1 3JA','East Scotland',$12,'active',false,true),
          ($7,'Inverness Business Park','IBP-007','Cradlehall Business Park, Inverness','IV2 5GH','North Scotland',$13,'active',false,true),
          ($8,'Falkirk Distribution Hub','FDH-008','Denny Road, Falkirk','FK6 6BG','Central Scotland',$11,'active',false,true),
          ($9,'Edinburgh Retail Centre','ERC-009','Ocean Drive, Edinburgh','EH6 6JJ','East Scotland',$12,'active',false,true),
          ($10,'Ayr Seafront Offices','ASO-010','2 Wellington Square, Ayr','KA7 1EN','South Scotland',$14,'active',false,true)
      `, [sGla, sAbd, sEdH, sSti, sPer, sDun, sInv, sFal, sEdR, sAyr, aC, aE, aN, aS]);

      // Geocode demo sites so they appear on the Estate Map immediately (best-effort)
      try {
        const demoSites = [
          { id: sGla, postcode: 'G4 0SF' },
          { id: sAbd, postcode: 'AB10 7PQ' },
          { id: sEdH, postcode: 'EH2 4AN' },
          { id: sSti, postcode: 'FK7 7RP' },
          { id: sPer, postcode: 'PH1 5RJ' },
          { id: sDun, postcode: 'DD1 3JA' },
          { id: sInv, postcode: 'IV2 5GH' },
          { id: sFal, postcode: 'FK6 6BG' },
          { id: sEdR, postcode: 'EH6 6JJ' },
          { id: sAyr, postcode: 'KA7 1EN' },
        ];
        const coords = await geocodePostcodesBulk(demoSites.map(s => s.postcode));
        for (const site of demoSites) {
          const c = coords.get(site.postcode);
          if (c) {
            await pool.query(
              `UPDATE "${sn}".sites SET latitude = $1, longitude = $2 WHERE id = $3`,
              [c.lat, c.lng, site.id]
            );
          }
        }
        logger.info(`[enterprise-demo] geocoded ${demoSites.length} demo sites`);
      } catch (geoErr: any) {
        logger.warn('[enterprise-demo] geocoding failed (non-fatal):', geoErr?.message ?? geoErr);
      }

      // ══ 3. DEMO USERS (area managers + coordinators in isolated users table) ═
      _step = 'users';
      await pool.query(`
        INSERT INTO "${sn}".users
          (id, username, email, role, first_name, last_name, is_active, is_demo) VALUES
          ($1,'sarah.macdonald@entdemo.local','sarah.macdonald@entdemo.local','user','Sarah','MacDonald',true,true),
          ($2,'duncan.campbell@entdemo.local','duncan.campbell@entdemo.local','user','Duncan','Campbell',true,true),
          ($3,'lynn.henderson@entdemo.local','lynn.henderson@entdemo.local','user','Lynn','Henderson',true,true),
          ($4,'callum.fraser@entdemo.local','callum.fraser@entdemo.local','user','Callum','Fraser',true,true),
          ($5,'fiona.stewart@entdemo.local','fiona.stewart@entdemo.local','user','Fiona','Stewart',true,true),
          ($6,'aileen.mcpherson@entdemo.local','aileen.mcpherson@entdemo.local','user','Aileen','McPherson',true,true),
          ($7,'bruce.thomson@entdemo.local','bruce.thomson@entdemo.local','user','Bruce','Thomson',true,true)
      `, [uSarah, uDuncan, uLynn, uCallum, uFiona, uAileen, uBruce]);

      // ══ 4. SITE USER ROLES ══════════════════════════════════════════════════
      _step = 'site_user_roles';
      await pool.query(`
        INSERT INTO "${sn}".site_user_roles
          (id, user_id, role, area_id, site_id, is_demo) VALUES
          (gen_random_uuid(),$1,'area_manager',$8,NULL,true),
          (gen_random_uuid(),$2,'area_manager',$9,NULL,true),
          (gen_random_uuid(),$3,'site_coordinator',NULL,$10,true),
          (gen_random_uuid(),$4,'site_coordinator',NULL,$11,true),
          (gen_random_uuid(),$5,'site_coordinator',NULL,$12,true),
          (gen_random_uuid(),$6,'site_coordinator',NULL,$13,true),
          (gen_random_uuid(),$7,'site_coordinator',NULL,$14,true)
      `, [uSarah, uDuncan, uLynn, uCallum, uFiona, uAileen, uBruce, aC, aN, sGla, sAbd, sEdH, sSti, sInv]);

      // ══ 5. COMPLIANCE CERTIFICATE TYPES (demo-specific, self-contained) ═════
      _step = 'cert_types';
      await pool.query(`
        INSERT INTO "${sn}".compliance_certificate_types
          (id, certificate_type, display_name, legal_basis, frequency, is_active, reminder_days_before, is_demo) VALUES
          ($1,'fire_safety','Fire Safety Certificate','Regulatory Reform (Fire Safety) Order 2005','annual',true,60,true),
          ($2,'asbestos_management','Asbestos Management Survey','Control of Asbestos Regulations 2012','three_yearly',true,90,true),
          ($3,'legionella_l8','L8 Legionella Risk Assessment','HSE ACOP L8','two_yearly',true,60,true),
          ($4,'eicr','EICR (Electrical Inspection)','BS 7671 / Electricity at Work Regs 1989','five_yearly',true,90,true),
          ($5,'gas_safety','Gas Safety Certificate','Gas Safety (Installation and Use) Regs 1998','annual',true,60,true),
          ($6,'emergency_lighting','Emergency Lighting Certificate','BS 5266 / Fire Safety Order 2005','annual',true,30,true)
      `, [ctFire, ctAsb, ctL8, ctEicr, ctGas, ctEmLt]);

      // ══ 6. COMPLIANCE CERTIFICATES ══════════════════════════════════════════
      _step = 'compliance_certs';
      // Dates relative to today (2026-06-27)
      // Glasgow — Fire cert EXPIRED 3 months ago
      await pool.query(`
        INSERT INTO "${sn}".compliance_certificates
          (id, certificate_type_id, certificate_type, issue_date, expiry_date, reference_number,
           issued_by, issuing_company, status, is_current, site_id, is_demo) VALUES
          (gen_random_uuid(),$1,'fire_safety','2025-03-15','2026-03-27','FSC-GLG-2025',
           'Scottish Fire & Rescue','Caledonian Safety Consultants','expired',true,$7,true),
          (gen_random_uuid(),$2,'emergency_lighting','2025-06-01','2026-05-31','EL-GLG-2025',
           'Clyde Electrical Ltd','Clyde Electrical Contractors','expired',true,$7,true),

          -- Aberdeen — Asbestos cert EXPIRED 2 months ago
          (gen_random_uuid(),$1,'fire_safety','2025-09-01','2026-12-01','FSC-ABD-2025',
           'Grampian Fire Safety','Highland Facilities Management','current',true,$8,true),
          (gen_random_uuid(),$3,'asbestos_management','2023-04-01','2026-04-27','ASB-ABD-2023',
           'North Survey Ltd','North Survey Ltd','expired',true,$8,true),

          -- Edinburgh HQ — Asbestos cert expiring in 15 days (2026-07-12)
          (gen_random_uuid(),$1,'fire_safety','2025-06-01','2027-06-01','FSC-EDH-2025',
           'Lothian Fire Services','Scotia Safety Ltd','current',true,$9,true),
          (gen_random_uuid(),$3,'asbestos_management','2023-07-01','2026-07-12','ASB-EDH-2023',
           'Edinburgh Survey Co','Edinburgh Survey Co','current',true,$9,true),

          -- Stirling — Fire cert expiring in 22 days (2026-07-19)
          (gen_random_uuid(),$1,'fire_safety','2025-07-01','2026-07-19','FSC-STI-2025',
           'Central Fire Safety','Central Fire Safety','current',true,$10,true),
          (gen_random_uuid(),$4,'legionella_l8','2024-06-01','2027-06-01','L8-STI-2024',
           'Stirling Water Services','Stirling Water Services','current',true,$10,true),

          -- Perth — L8 expiring in 28 days (2026-07-25) + EICR expiring in 25 days (2026-07-22)
          (gen_random_uuid(),$4,'legionella_l8','2024-07-01','2026-07-25','L8-PER-2024',
           'Tayside Water Services','Tayside Water Services','current',true,$11,true),
          (gen_random_uuid(),$5,'eicr','2021-07-01','2026-07-22','EICR-PER-2021',
           'Perth Electrical Ltd','Perth Electrical Ltd','current',true,$11,true),

          -- Dundee — all valid (1+ year remaining)
          (gen_random_uuid(),$1,'fire_safety','2025-05-01','2027-05-01','FSC-DUN-2025',
           'Tayside Fire Safety','Tayside Fire Safety','current',true,$12,true),
          (gen_random_uuid(),$5,'eicr','2022-01-01','2027-01-01','EICR-DUN-2022',
           'Dundee Electrical','Dundee Electrical','current',true,$12,true),

          -- Inverness — all valid
          (gen_random_uuid(),$1,'fire_safety','2025-04-01','2027-04-01','FSC-INV-2025',
           'Highland Fire Safety','Highland Fire Safety','current',true,$13,true),
          (gen_random_uuid(),$4,'legionella_l8','2025-01-01','2027-01-01','L8-INV-2025',
           'Highland Water Services','Highland Water Services','current',true,$13,true),

          -- Falkirk — all valid
          (gen_random_uuid(),$1,'fire_safety','2025-03-01','2027-03-01','FSC-FAL-2025',
           'Forth Fire Safety','Forth Fire Safety','current',true,$14,true),
          (gen_random_uuid(),$6,'gas_safety','2025-11-01','2026-11-01','GAS-FAL-2025',
           'Scotia Gas Services','Scotia Gas Services','current',true,$14,true),

          -- Edinburgh Retail — all valid
          (gen_random_uuid(),$1,'fire_safety','2025-08-01','2027-08-01','FSC-ERC-2025',
           'Lothian Fire Services','Lothian Fire Services','current',true,$15,true),
          (gen_random_uuid(),$5,'eicr','2024-01-01','2029-01-01','EICR-ERC-2024',
           'Capital Electrical','Capital Electrical','current',true,$15,true),

          -- Ayr — all valid (perfect score)
          (gen_random_uuid(),$1,'fire_safety','2025-10-01','2027-10-01','FSC-AYR-2025',
           'Ayrshire Fire Safety','Ayrshire Fire Safety','current',true,$16,true),
          (gen_random_uuid(),$4,'legionella_l8','2025-05-01','2027-05-01','L8-AYR-2025',
           'Ayrshire Water Services','Ayrshire Water Services','current',true,$16,true),
          (gen_random_uuid(),$6,'gas_safety','2026-01-01','2027-01-01','GAS-AYR-2026',
           'Ayrshire Gas Services','Ayrshire Gas Services','current',true,$16,true)
      `, [ctFire, ctEmLt, ctAsb, ctL8, ctEicr, ctGas,
          sGla, sAbd, sEdH, sSti, sPer, sDun, sInv, sFal, sEdR, sAyr]);

      // ══ 7. FIRE RISK ASSESSMENTS ═════════════════════════════════════════════
      _step = 'fire_risk_assessments';
      // Glasgow — OVERDUE (next_review_date 5 months ago)
      // Aberdeen — OVERDUE (next_review_date 26 days ago)
      // All others — current
      await pool.query(`
        INSERT INTO "${sn}".fire_risk_assessments
          (id, title, assessor_name, assessor_company, assessment_date, next_review_date,
           status, findings_summary, site_id, is_demo) VALUES
          (gen_random_uuid(),'Fire Risk Assessment — Glasgow Royal Infirmary',
           'Robert Burns','Caledonian Safety Consultants','2025-01-15','2026-01-15',
           'overdue','FRA overdue. 3 outstanding action items including emergency exit signage and fire door defects.',$1,true),

          (gen_random_uuid(),'Fire Risk Assessment — Aberdeen Retail Park',
           'Moira Henderson','Highland Safety Services','2025-09-01','2026-06-01',
           'overdue','FRA overdue by 26 days. Sprinkler system service outstanding.',$2,true),

          (gen_random_uuid(),'Fire Risk Assessment — Edinburgh HQ',
           'James Cameron','Lothian Fire Consultancy','2025-10-01','2027-04-01',
           'current','All fire safety measures in place. No outstanding actions.',$3,true),

          (gen_random_uuid(),'Fire Risk Assessment — Stirling Office Park',
           'Angus MacKay','Central Safety Ltd','2026-01-15','2027-07-15',
           'current','Minor recommendations — door-closer replacement on Level 3.',$4,true),

          (gen_random_uuid(),'Fire Risk Assessment — Perth Retail Centre',
           'Karen Stewart','Tayside Safety Services','2025-08-01','2027-02-01',
           'current','Good standard throughout. All action items completed.',$5,true),

          (gen_random_uuid(),'Fire Risk Assessment — Dundee Waterfront',
           'Neil Mackintosh','Tayside Fire Consultancy','2025-11-01','2027-05-01',
           'current','Satisfactory. Annual training records up to date.',$6,true),

          (gen_random_uuid(),'Fire Risk Assessment — Inverness Business Park',
           'Flora Cameron','Highland Safety Consultancy','2026-02-01','2027-08-01',
           'current','All measures current. No outstanding actions.',$7,true),

          (gen_random_uuid(),'Fire Risk Assessment — Falkirk Distribution Hub',
           'Stuart Wilson','Forth Valley Safety','2025-12-01','2027-06-01',
           'current','Good compliance. Fire warden training due in September.',$8,true),

          (gen_random_uuid(),'Fire Risk Assessment — Edinburgh Retail Centre',
           'Linda Forbes','Capital Fire Safety','2026-03-01','2027-09-01',
           'current','All measures in excellent order.',$9,true),

          (gen_random_uuid(),'Fire Risk Assessment — Ayr Seafront Offices',
           'Ian MacAlister','Ayrshire Safety Consultants','2026-04-01','2027-10-01',
           'current','Exemplary compliance. No outstanding actions.',$10,true)
      `, [sGla, sAbd, sEdH, sSti, sPer, sDun, sInv, sFal, sEdR, sAyr]);

      // ══ 8. H&S INCIDENTS ════════════════════════════════════════════════════
      _step = 'hs_incidents';
      await pool.query(`
        INSERT INTO "${sn}".hs_incidents
          (id, title, description, incident_date, location, reported_by,
           record_type, investigation_status, site_id, is_demo) VALUES
          (gen_random_uuid(),
           'Slip on wet floor — visitor reception',
           'Visitor slipped on recently mopped floor in main reception. Minor bruising to right knee. Incident reported immediately.',
           '2026-05-12 10:35:00','Main Reception','John Muir',
           'incident','investigating',$1,true),

          (gen_random_uuid(),
           'Near miss — forklift pedestrian area (loading bay)',
           'Forklift truck entered pedestrian zone during delivery. No injuries but pedestrian had to step aside urgently.',
           '2026-04-22 14:10:00','Loading Bay','Alice Park',
           'near_miss','closed',$2,true),

          (gen_random_uuid(),
           'Manual handling — server rack installation',
           'IT engineer reported lower back strain following server rack lift without adequate assistance.',
           '2026-06-03 09:00:00','Server Room, Floor 2','Craig Taylor',
           'incident','open',$3,true)
      `, [sGla, sAbd, sEdH]);

      // ══ 9. CONTRACTOR COMPANIES ═════════════════════════════════════════════
      _step = 'contractor_companies';
      // $6 = Caledonian PL expiry (expired May 2026)
      // $7 = Highland PL expiry (expired Jun 2026 → pending at Aberdeen)
      // $8 = validDate shared by all valid EL/PL entries (Jun 2027)
      const expiredCalPl = '2026-05-01';
      const expiredHigPl = '2026-06-05';
      const validDate    = '2027-06-01';

      await pool.query(`
        INSERT INTO "${sn}".contractor_companies
          (id, company_name, contact_email, contact_first_name, contact_last_name,
           contact_phone, address, postcode, industry,
           public_liability_insurer, public_liability_amount, public_liability_expiry_date,
           employers_liability_insurer, employers_liability_amount, employers_liability_expiry_date,
           status, is_demo) VALUES
          ($1,'Caledonian Building Services Ltd','info@calbuild.entdemo.local',
           'Gordon','Macfarlane','+44 141 555 0101','12 Sauchiehall Lane, Glasgow','G2 3EH','Construction',
           'Aviva PLC','£5,000,000',$6,'NFU Mutual','£10,000,000',$8,'active',true),

          ($2,'Highland Facilities Management','ops@highlandfm.entdemo.local',
           'Sheila','Mackenzie','+44 1463 555 0202','Longman Road, Inverness','IV1 1SU','Facilities Management',
           'Zurich Insurance','£5,000,000',$7,'Allianz','£10,000,000',$8,'active',true),

          ($3,'Clyde Electrical Contractors','enquiries@clydeelec.entdemo.local',
           'Derek','Reid','+44 141 555 0303','45 Dalmarnock Road, Glasgow','G40 4LA','Electrical',
           'RSA Insurance','£2,000,000',$8,'Aviva PLC','£5,000,000',$8,'active',true),

          ($4,'Scotia Mechanical Services','contact@scotiamech.entdemo.local',
           'Patricia','Hamilton','+44 131 555 0404','14 Salamander Street, Edinburgh','EH6 7JT','Mechanical',
           'AXA Insurance','£5,000,000',$8,'Allianz','£10,000,000',$8,'active',true),

          ($5,'Borders Fire & Security','hello@bordersfs.entdemo.local',
           'Andrew','Turnbull','+44 1896 555 0505','Market Square, Galashiels','TD1 3AF','Fire & Security',
           NULL,NULL,NULL,NULL,NULL,NULL,'pending',true)
      `, [coCal, coHigh, coClyd, coScot, coBord,
          expiredCalPl, expiredHigPl, validDate]);

      // ══ 10. CONTRACTOR WORKERS ═══════════════════════════════════════════════
      _step = 'contractor_workers';
      const wCal1 = `${B}-w01`; const wCal2 = `${B}-w02`;
      const wHig1 = `${B}-w03`; const wHig2 = `${B}-w04`;
      const wCly1 = `${B}-w05`; const wCly2 = `${B}-w06`;
      const wSco1 = `${B}-w07`; const wSco2 = `${B}-w08`;
      const wBor1 = `${B}-w09`;

      await pool.query(`
        INSERT INTO "${sn}".contractor_workers
          (id, company_id, first_name, last_name, email, job_title, is_demo) VALUES
          ($1,$10,'Ewan','Galbraith','ewan.galbraith@calbuild.entdemo.local','Site Manager',true),
          ($2,$10,'Morag','Sinclair','morag.sinclair@calbuild.entdemo.local','Health & Safety Officer',true),
          ($3,$11,'Hamish','Dunbar','hamish.dunbar@highlandfm.entdemo.local','Facilities Manager',true),
          ($4,$11,'Janet','Cruickshank','janet.cruickshank@highlandfm.entdemo.local','Site Supervisor',true),
          ($5,$12,'Gregor','Aitken','gregor.aitken@clydeelec.entdemo.local','Electrical Engineer',true),
          ($6,$12,'Eilidh','Paterson','eilidh.paterson@clydeelec.entdemo.local','Electrical Engineer',true),
          ($7,$13,'Ruari','McInnes','ruari.mcinnes@scotiamech.entdemo.local','Mechanical Engineer',true),
          ($8,$13,'Carol','Drummond','carol.drummond@scotiamech.entdemo.local','Site Supervisor',true),
          ($9,$14,'Fraser','Gillies','fraser.gillies@bordersfs.entdemo.local','Fire Safety Technician',true)
      `, [wCal1, wCal2, wHig1, wHig2, wCly1, wCly2, wSco1, wSco2, wBor1,
          coCal, coHigh, coClyd, coScot, coBord]);

      // ══ 11. CONTRACTOR SITE CLEARANCES ══════════════════════════════════════
      _step = 'contractor_site_clearances';
      // Caledonian: cleared at Edinburgh HQ + Perth; NOT cleared at Glasgow (missing docs)
      // Highland: cleared at Inverness; pending at Aberdeen (expired public liability)
      // Clyde: cleared at Edinburgh HQ, Glasgow, Dundee
      // Scotia: cleared at Edinburgh HQ + Edinburgh Retail
      // Borders: no clearances yet (new company)
      const inductedTs = '2025-09-01';
      await pool.query(`
        INSERT INTO "${sn}".contractor_site_clearances
          (id, worker_id, company_id, site_id, status, inducted_at, is_demo) VALUES
          -- Caledonian (${coCal}) cleared at Edinburgh HQ (${sEdH}) and Perth (${sPer})
          (gen_random_uuid(),'${wCal1}','${coCal}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCal2}','${coCal}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCal1}','${coCal}','${sPer}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCal2}','${coCal}','${sPer}','inducted','${inductedTs}',true),
          -- Caledonian pending at Glasgow (${sGla}) — missing docs
          (gen_random_uuid(),'${wCal1}','${coCal}','${sGla}','pending',NULL,true),

          -- Highland (${coHigh}) cleared at Inverness (${sInv})
          (gen_random_uuid(),'${wHig1}','${coHigh}','${sInv}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wHig2}','${coHigh}','${sInv}','inducted','${inductedTs}',true),
          -- Highland pending at Aberdeen (${sAbd}) — expired public liability
          (gen_random_uuid(),'${wHig1}','${coHigh}','${sAbd}','pending',NULL,true),

          -- Clyde (${coClyd}) cleared at Edinburgh HQ (${sEdH}), Glasgow (${sGla}), Dundee (${sDun})
          (gen_random_uuid(),'${wCly1}','${coClyd}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCly2}','${coClyd}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCly1}','${coClyd}','${sGla}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wCly1}','${coClyd}','${sDun}','inducted','${inductedTs}',true),

          -- Scotia (${coScot}) cleared at Edinburgh HQ (${sEdH}) and Edinburgh Retail (${sEdR})
          (gen_random_uuid(),'${wSco1}','${coScot}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wSco2}','${coScot}','${sEdH}','inducted','${inductedTs}',true),
          (gen_random_uuid(),'${wSco1}','${coScot}','${sEdR}','inducted','${inductedTs}',true)
      `);

      // ══ 12. PPM — ASSET GROUPS, ASSETS, SCHEDULES, WORK ORDERS ═════════════
      _step = 'ppm_asset_groups';
      // Glasgow: 3 overdue work orders (boiler, emergency lighting, lift)
      // Aberdeen: 1 overdue (electrical inspection)
      // Edinburgh HQ: 1 scheduled/due soon (HVAC)
      const agGla = `${B}-ag1`;
      const agAbd = `${B}-ag2`;
      const agEdH = `${B}-ag3`;

      const paGlaBo = `${B}-pa1`; const paGlaEl = `${B}-pa2`; const paGlaLi = `${B}-pa3`;
      const paAbdEl = `${B}-pa4`;
      const paEdHvac = `${B}-pa5`;

      await pool.query(`
        INSERT INTO "${sn}".ppm_asset_groups
          (id, name, description, site_id, is_demo) VALUES
          ($1,'Glasgow Royal Infirmary — Building Services',
           'Mechanical, electrical and lift assets','${ sGla }',true),
          ($2,'Aberdeen Retail Park — Electrical','Electrical distribution assets','${ sAbd }',true),
          ($3,'Edinburgh HQ — HVAC & Mechanical','Air handling and mechanical assets','${ sEdH }',true)
      `.replace(/\$\{ sGla \}/g, sGla).replace(/\$\{ sAbd \}/g, sAbd).replace(/\$\{ sEdH \}/g, sEdH),
      [agGla, agAbd, agEdH]);

      // params: $1-$5 = asset IDs, $6-$8 = group IDs, $9-$11 = site IDs
      _step = 'ppm_assets';
      await pool.query(`
        INSERT INTO "${sn}".ppm_assets
          (id, group_id, name, asset_ref, category, location, status, site_id, is_demo) VALUES
          ($1,$6,'Commercial Boiler','BOIL-GLG-001','Mechanical','Plant Room, Basement','active',$9,true),
          ($2,$6,'Emergency Lighting Panel','ELP-GLG-001','Electrical','Main Distribution Board, G Floor','active',$9,true),
          ($3,$6,'Passenger Lift — Block A','LIFT-GLG-001','Lifting Equipment','East Wing Lobby','active',$9,true),
          ($4,$7,'Main LV Switchboard','LVSB-ABD-001','Electrical','Substation Room','active',$10,true),
          ($5,$8,'AHU 01 — Main Office Wing','AHU-EDH-001','HVAC','Plant Room, Roof Level','active',$11,true)
      `, [paGlaBo, paGlaEl, paGlaLi, paAbdEl, paEdHvac,
          agGla, agAbd, agEdH, sGla, sAbd, sEdH]);

      const schedGlaBo = `${B}-sc1`; const schedGlaEl = `${B}-sc2`; const schedGlaLi = `${B}-sc3`;
      const schedAbdEl = `${B}-sc4`;
      const schedEdHvac = `${B}-sc5`;

      _step = 'ppm_schedules';
      await pool.query(`
        INSERT INTO "${sn}".ppm_schedules
          (id, asset_id, title, frequency, start_date, next_due_date, status, site_id, is_demo) VALUES
          ($1,$6,'Annual Boiler Service & Gas Safety Check','annual',
           '2024-04-01','2026-04-01','overdue',$11,true),
          ($2,$7,'Emergency Lighting Annual Test','annual',
           '2024-04-01','2026-03-15','overdue',$11,true),
          ($3,$8,'Passenger Lift Thorough Examination (LOLER)','six_monthly',
           '2025-09-01','2026-04-01','overdue',$11,true),
          ($4,$9,'LV Switchboard Inspection & Testing','annual',
           '2025-05-01','2026-05-15','overdue',$12,true),
          ($5,$10,'AHU Annual Service & Coil Clean','annual',
           '2025-07-01','2026-07-07','scheduled',$13,true)
      `, [schedGlaBo, schedGlaEl, schedGlaLi, schedAbdEl, schedEdHvac,
          paGlaBo, paGlaEl, paGlaLi, paAbdEl, paEdHvac,
          sGla, sAbd, sEdH]);

      // params: $1-$5 = schedule IDs, $6-$10 = asset IDs, $11-$13 = group IDs, $14-$16 = site IDs
      _step = 'ppm_work_orders';
      await pool.query(`
        INSERT INTO "${sn}".ppm_work_orders
          (id, schedule_id, asset_id, group_id, title, description, status,
           due_date, contractor_company_name, site_id, is_demo) VALUES
          (gen_random_uuid(),$1,$6,$11,
           'Annual Boiler Service — Glasgow Royal Infirmary',
           'Annual gas-safe boiler service including combustion analysis, flue inspection, and gas safety certificate.','overdue',
           '2026-04-01','Caledonian Building Services Ltd',$14,true),

          (gen_random_uuid(),$2,$7,$11,
           'Emergency Lighting Annual Test — Glasgow Royal Infirmary',
           'Full annual duration test of all emergency lighting units. Certificate required.','overdue',
           '2026-03-15','Clyde Electrical Contractors',$14,true),

          (gen_random_uuid(),$3,$8,$11,
           'Passenger Lift LOLER Examination — Glasgow Royal Infirmary',
           'Six-monthly thorough examination of passenger lift by competent person under LOLER 1998.','overdue',
           '2026-04-01','Caledonian Building Services Ltd',$14,true),

          (gen_random_uuid(),$4,$9,$12,
           'LV Switchboard Inspection — Aberdeen Retail Park',
           'Annual visual and thermographic inspection of main LV switchboard.','overdue',
           '2026-05-15','Clyde Electrical Contractors',$15,true),

          (gen_random_uuid(),$5,$10,$13,
           'AHU Annual Service — Edinburgh HQ',
           'Annual service of air handling unit including filter change, belt inspection and coil clean.','scheduled',
           '2026-07-07','Scotia Mechanical Services',$16,true)
      `, [schedGlaBo, schedGlaEl, schedGlaLi, schedAbdEl, schedEdHvac,
          paGlaBo, paGlaEl, paGlaLi, paAbdEl, paEdHvac,
          agGla, agAbd, agEdH, sGla, sAbd, sEdH]);

      // ══ 13. VISIT REASONS (group / enterprise scope) ═════════════════════════
      _step = 'visit_reasons';
      await pool.query(`
        INSERT INTO "${sn}".visit_reasons
          (id, label, instructions, require_hs_acceptance, is_active, sort_order,
           applies_to, scope, site_id, is_demo) VALUES
          (gen_random_uuid(),'Site Survey & Inspection',
           'Please report to the site coordinator before commencing any survey work.',
           true,true,1,'both','enterprise',NULL,true),
          (gen_random_uuid(),'Maintenance & Repairs',
           'A permit to work may be required. Check with the site coordinator on arrival.',
           true,true,2,'both','enterprise',NULL,true),
          (gen_random_uuid(),'Contractor Works',
           'Ensure RAMS documentation has been submitted and approved prior to works commencing.',
           true,true,3,'visitor','enterprise',NULL,true),
          (gen_random_uuid(),'Business Meeting',
           'Please proceed to reception and sign in. Host will meet you in the lobby.',
           false,true,4,'both','enterprise',NULL,true),
          (gen_random_uuid(),'Delivery & Logistics',
           'Deliveries to loading bay only. Do not enter office areas unaccompanied.',
           false,true,5,'visitor','enterprise',NULL,true)
      `);

      // ══ 14. INDUCTION SETTINGS (enterprise scope defaults) ═══════════════════
      _step = 'induction_settings';
      await pool.query(`
        INSERT INTO "${sn}".induction_settings
          (id, role_type, video_title, video_url, video_format, pass_percentage,
           is_active, kiosk_enabled, scope, site_id, is_demo) VALUES
          (gen_random_uuid(),'visitor',
           'Estate Visitor Induction — Health, Safety & Site Rules',
           '','interactive_slides',80,true,true,'enterprise',NULL,true),
          (gen_random_uuid(),'contractor',
           'Estate Contractor Induction — Safe Working & Permit Procedures',
           '','interactive_slides',80,true,false,'enterprise',NULL,true)
      `);

      logger.info(`[enterprise-demo/load] Seeded full 10-site estate for customer ${cid}`);

      return res.json({
        success: true,
        message: 'Enterprise demo estate loaded successfully — 10 Scottish sites across 4 regions with realistic compliance spread.',
        summary: {
          areas: 4,
          sites: 10,
          demoUsers: 7,
          contractorCompanies: 5,
          contractorWorkers: 9,
          certTypes: 6,
          certificates: 21,
          fireRiskAssessments: 10,
          incidents: 3,
          ppmWorkOrders: 5,
          visitReasons: 5,
          inductionSettings: 2,
        },
      });
    } catch (e: any) {
      logger.error(`[enterprise-demo/load] error at step ${_step}:`, e);
      return res.status(500).json({ error: 'Failed to load enterprise demo data', details: `[${_step}] ${e.message}` });
    }
  });

  // ── Reset — Remove All Demo Data ────────────────────────────────────────────
  app.post('/api/enterprise-demo/reset', requireAuth, async (req, res) => {
    try {
      const cid = req.customerId!;

      const [cust] = await db.select({ isEnterprise: customers.isEnterprise })
        .from(customers).where(eq(customers.id, cid)).limit(1);
      if (!cust?.isEnterprise) {
        return res.status(403).json({ error: 'Enterprise demo reset is only available for enterprise customers.' });
      }

      const { pool, sn } = await getPool(cid);
      await ensureDemoColumns(pool, sn);
      await ensurePpmForDemo(pool, sn);

      // Delete all is_demo=true rows in FK-safe order
      const deleted = await deleteAllDemoRows(pool, sn);
      logger.info('[enterprise-demo/reset] Deleted counts:', deleted);

      // ── Verification pass ────────────────────────────────────────────────────
      const verifyTables = [
        'areas', 'sites', 'site_user_roles', 'users',
        'compliance_certificate_types', 'compliance_certificates',
        'fire_risk_assessments', 'hs_incidents',
        'contractor_companies', 'contractor_workers', 'contractor_site_clearances',
        'ppm_asset_groups', 'ppm_assets', 'ppm_schedules', 'ppm_work_orders',
        'visit_reasons', 'induction_settings',
      ];

      const remaining: Record<string, number> = {};
      let anyRemaining = false;

      for (const t of verifyTables) {
        try {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM "${sn}"."${t}" WHERE is_demo = true`
          );
          const n = r.rows[0].n as number;
          remaining[t] = n;
          if (n > 0) anyRemaining = true;
        } catch {
          remaining[t] = 0; // table doesn't exist or no column — treat as zero
        }
      }

      if (anyRemaining) {
        logger.error('[enterprise-demo/reset] Verification FAILED — rows remain:', remaining);
        return res.status(500).json({
          cleared: false,
          error: 'Reset completed but verification found remaining demo rows.',
          remaining,
          deleted,
        });
      }

      logger.info(`[enterprise-demo/reset] Verified clean for customer ${cid}`);
      return res.json({
        cleared: true,
        message: 'All enterprise demo data removed. Account is now pristine for real use.',
        deleted,
        remaining,
      });
    } catch (e: any) {
      logger.error('[enterprise-demo/reset] error:', e);
      return res.status(500).json({ error: 'Failed to reset enterprise demo data', details: e.message });
    }
  });
}
