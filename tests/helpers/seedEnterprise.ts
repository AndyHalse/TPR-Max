/**
 * tests/helpers/seedEnterprise.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct-DB helpers used by the HTTP route isolation test suite.
 *
 * Every function opens its own short-lived pg.Client and closes it on exit so
 * individual tests are independent and don't share a pool.
 *
 * The customer and schema constants are the same as in the existing
 * site-isolation-test-script.ts so that both suites can share the same dev DB.
 */

import { Client as PgClient } from "pg";
import { randomUUID } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────
export const TEST_CUSTOMER_ID    = "dev-customer-001";
export const TEST_CUSTOMER_SCHEMA = "c_dev_cust";
export const TEST_ADMIN_USERNAME  = "Andy";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SeedResult {
  customerId: string;
  customerSchema: string;
  adminUserId: string;
  siteAId: string;
  siteBId: string;
  /** Same as siteAId — convenience alias used in older helpers */
  defaultSiteId: string;
}

export interface InductionTokenResult {
  tokenId: string;
}

// ── Internal helper ───────────────────────────────────────────────────────────
function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — cannot run DB seed helpers");
  return url;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Provision the enterprise test environment:
 * - Enables is_enterprise on TEST_CUSTOMER_ID
 * - Creates two isolated test sites (IsoHTTP_SiteA / SiteB)
 * - Grants the admin user `site_coordinator` at BOTH sites (NOT enterprise_admin)
 *
 * WHY site_coordinator instead of enterprise_admin:
 *   `enterprise_admin` resolves to `allowedSiteIds: 'all'`, which causes
 *   `scopedWhere()` to short-circuit and return undefined (no filter) — the
 *   intended behaviour for a super-user.  For isolation tests we need a user
 *   whose `allowedSiteIds` is an array, so that `scopedWhere()` uses
 *   `activeSiteId` as a real WHERE predicate.
 *
 * Returns the IDs needed by the test to create agents and switch sites.
 */
export async function seedEnterpriseTestCustomer(): Promise<SeedResult> {
  const pg = new PgClient({ connectionString: getDbUrl() });
  await pg.connect();
  try {
    // Enable enterprise mode
    await pg.query(
      `UPDATE customers SET is_enterprise = TRUE WHERE id = $1`,
      [TEST_CUSTOMER_ID]
    );

    // Resolve the admin user ID from the isolated schema
    const userRes = await pg.query<{ id: string }>(
      `SELECT id FROM "${TEST_CUSTOMER_SCHEMA}".users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [TEST_ADMIN_USERNAME]
    );
    const adminUserId = userRes.rows[0]?.id;
    if (!adminUserId) {
      throw new Error(
        `Admin user '${TEST_ADMIN_USERNAME}' not found in schema '${TEST_CUSTOMER_SCHEMA}'`
      );
    }

    // Create two isolated test sites — unique references prevent collisions
    const ts = Date.now();
    const resA = await pg.query<{ id: string }>(
      `INSERT INTO "${TEST_CUSTOMER_SCHEMA}".sites (name, reference, status, is_default)
       VALUES ($1, $2, 'active', FALSE)
       RETURNING id`,
      [`__IsoHTTP_SiteA_${ts}`, `ISO-HTTP-A-${ts}`]
    );
    const resB = await pg.query<{ id: string }>(
      `INSERT INTO "${TEST_CUSTOMER_SCHEMA}".sites (name, reference, status, is_default)
       VALUES ($1, $2, 'active', FALSE)
       RETURNING id`,
      [`__IsoHTTP_SiteB_${ts}`, `ISO-HTTP-B-${ts}`]
    );

    const siteAId = resA.rows[0].id;
    const siteBId = resB.rows[0].id;

    // Grant site_coordinator at both test sites (idempotent — delete first)
    // Using site_coordinator (not enterprise_admin) so allowedSiteIds = [siteAId, siteBId],
    // which makes scopedWhere() filter by activeSiteId rather than returning everything.
    await pg.query(
      `DELETE FROM "${TEST_CUSTOMER_SCHEMA}".site_user_roles
       WHERE user_id = $1 AND site_id = ANY($2::text[])`,
      [adminUserId, [siteAId, siteBId]]
    );
    await pg.query(
      `INSERT INTO "${TEST_CUSTOMER_SCHEMA}".site_user_roles (id, user_id, role, site_id)
       VALUES
         (gen_random_uuid(), $1, 'site_coordinator', $2),
         (gen_random_uuid(), $1, 'site_coordinator', $3)`,
      [adminUserId, siteAId, siteBId]
    );

    return {
      customerId: TEST_CUSTOMER_ID,
      customerSchema: TEST_CUSTOMER_SCHEMA,
      adminUserId,
      siteAId,
      siteBId,
      defaultSiteId: siteAId,
    };
  } finally {
    await pg.end();
  }
}

/**
 * Remove the two test sites created by seedEnterpriseTestCustomer and revoke
 * the temporary site_coordinator grants.  Leaves the customer itself untouched.
 */
export async function cleanupEnterpriseTestCustomer(seed: SeedResult): Promise<void> {
  const pg = new PgClient({ connectionString: getDbUrl() });
  await pg.connect();
  try {
    // Revoke site_coordinator grants for the test sites first (explicit delete —
    // the FK cascade from sites should also cover this, but be explicit).
    await pg.query(
      `DELETE FROM "${seed.customerSchema}".site_user_roles
       WHERE user_id = $1 AND site_id = ANY($2::text[])`,
      [seed.adminUserId, [seed.siteAId, seed.siteBId]]
    );
    // Delete test sites
    await pg.query(
      `DELETE FROM "${seed.customerSchema}".sites WHERE id = ANY($1::text[])`,
      [[seed.siteAId, seed.siteBId]]
    );
    // Restore non-enterprise state
    await pg.query(
      `UPDATE customers SET is_enterprise = FALSE WHERE id = $1`,
      [seed.customerId]
    );
  } finally {
    await pg.end();
  }
}

/**
 * Insert a pending induction token for a visitor in the management DB.
 * The management DB table `induction_tokens` stores tokens for all customers.
 * The route /api/induction/admin/tokens resolves the token's site by looking up
 * the visitorId in the isolated customer schema.
 *
 * Returns the newly created token row id so the caller can clean up.
 */
export async function createTestInductionToken(
  visitorId: string,
  customerId: string,
  visitorName: string = "IsoTest Visitor",
): Promise<InductionTokenResult> {
  const pg = new PgClient({ connectionString: getDbUrl() });
  await pg.connect();
  try {
    const token = randomUUID().replace(/-/g, "");
    const res = await pg.query<{ id: string }>(
      `INSERT INTO induction_tokens
         (id, visitor_id, person_type, person_name, person_email,
          token, status, expires_at, customer_id, created_at)
       VALUES
         (gen_random_uuid(), $1, 'visitor', $2, 'iso-test@example.com',
          $3, 'pending', NOW() + INTERVAL '1 day', $4, NOW())
       RETURNING id`,
      [visitorId, visitorName, token, customerId]
    );
    return { tokenId: res.rows[0].id };
  } finally {
    await pg.end();
  }
}

/**
 * Delete a previously created test induction token by its row id.
 */
export async function deleteTestInductionToken(tokenId: string): Promise<void> {
  const pg = new PgClient({ connectionString: getDbUrl() });
  await pg.connect();
  try {
    await pg.query(`DELETE FROM induction_tokens WHERE id = $1`, [tokenId]);
  } finally {
    await pg.end();
  }
}
