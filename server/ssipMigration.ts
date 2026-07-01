import type { Migration } from './migrationRunner';
import { logger } from './utils/logger';

export const ssipMigrations: Migration[] = [
  {
    version: '20260701_103_ssip_accreditation_tables',
    description: 'Create company_accreditation_types catalogue and contractor_company_accreditations table; migrate CHAS/SafeContractor/Constructionline/SMAS/other data',
    up: async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS company_accreditation_types (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_ssip_member BOOLEAN NOT NULL DEFAULT false,
          has_grade BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          display_order INTEGER NOT NULL DEFAULT 99
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS contractor_company_accreditations (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id VARCHAR NOT NULL REFERENCES contractor_companies(id) ON DELETE CASCADE,
          type_key TEXT NOT NULL REFERENCES company_accreditation_types(key),
          custom_name TEXT,
          certificate_number TEXT,
          grade TEXT,
          expiry_date TEXT,
          notes TEXT,
          is_demo BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.execute(`
        INSERT INTO company_accreditation_types (key, name, is_ssip_member, has_grade, display_order)
        VALUES
          ('chas',             'CHAS',                                   true,  false, 1),
          ('safe_contractor',  'SafeContractor (Alcumus)',                true,  false, 2),
          ('constructionline', 'Constructionline',                       true,  true,  3),
          ('smas',             'SMAS Worksafe',                          true,  false, 4),
          ('achilles',         'Achilles (Building Confidence / UVDB)',  true,  false, 5),
          ('altius',           'Altius (RISQS)',                         true,  false, 6),
          ('avetta',           'Avetta',                                 true,  false, 7),
          ('acclaim',          'Acclaim Accreditation',                  true,  false, 8),
          ('bureau_veritas',   'Bureau Veritas Certification',           true,  false, 9),
          ('cqms',             'CQMS',                                   true,  false, 10),
          ('other',            'Other',                                  false, false, 99)
        ON CONFLICT (key) DO NOTHING
      `);

      // Ensure legacy columns exist before migrating data (idempotent)
      await db.execute(`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS chas_certificate_number TEXT`);
      await db.execute(`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS safe_contractor_number TEXT`);
      await db.execute(`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS safe_contractor_expiry_date TIMESTAMP`);
      await db.execute(`ALTER TABLE contractor_companies ADD COLUMN IF NOT EXISTS chas_expiry_date TIMESTAMP`);

      // Migrate CHAS
      await db.execute(`
        INSERT INTO contractor_company_accreditations (company_id, type_key, certificate_number, expiry_date)
        SELECT id, 'chas',
          chas_certificate_number,
          CASE WHEN chas_expiry_date IS NOT NULL THEN (chas_expiry_date::date)::text ELSE NULL END
        FROM contractor_companies
        WHERE chas_certified = true
      `);

      // Migrate SafeContractor
      await db.execute(`
        INSERT INTO contractor_company_accreditations (company_id, type_key, certificate_number, expiry_date)
        SELECT id, 'safe_contractor',
          safe_contractor_number,
          CASE WHEN safe_contractor_expiry_date IS NOT NULL THEN (safe_contractor_expiry_date::date)::text ELSE NULL END
        FROM contractor_companies
        WHERE safe_contractor_certified = true
      `);

      // Migrate Constructionline
      await db.execute(`
        INSERT INTO contractor_company_accreditations (company_id, type_key, grade)
        SELECT id, 'constructionline', constructionline_grade
        FROM contractor_companies
        WHERE constructionline_grade IS NOT NULL
          AND trim(constructionline_grade) != ''
          AND constructionline_grade != 'not_registered'
      `);

      // Migrate SMAS
      await db.execute(`
        INSERT INTO contractor_company_accreditations (company_id, type_key)
        SELECT id, 'smas'
        FROM contractor_companies
        WHERE smas_accredited = true
      `);

      // Migrate other accreditations
      await db.execute(`
        INSERT INTO contractor_company_accreditations (company_id, type_key, custom_name)
        SELECT id, 'other', trim(other_accreditations)
        FROM contractor_companies
        WHERE other_accreditations IS NOT NULL AND trim(other_accreditations) != ''
      `);

      logger.info('✅ [103] SSIP accreditation tables created and legacy data migrated');
    },
  },
];
