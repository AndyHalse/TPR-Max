import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

// Safe query: returns fallback if the underlying table/column doesn't exist or query fails.
async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    logger.warn(`[hr-dashboard] ${label} failed: ${err.message?.substring(0, 120)}`);
    return fallback;
  }
}

export function registerHrDashboardRoutes(app: Express): void {

  // GET /api/hr/dashboard — single endpoint returning all dashboard counts + "today" lists
  app.get('/api/hr/dashboard', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const s = `"${schemaName}"`;

      const [
        activeStaff,
        onLeaveToday,
        startingThisMonth,
        leaversThisMonth,
        onboardingInProgress,
        trainingExpiring,
        appraisalsDue,
        pendingLeaveApprovals,
        anniversariesToday,
        returningToday,
        birthdaysToday,
      ] = await Promise.all([
        // Active staff
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM ${s}.staff
             WHERE is_active = TRUE
               AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'activeStaff'),

        // On leave today (approved, today between start and end) — include names
        safe(async () => {
          const r = await pool.query(
            `SELECT lr.staff_id, lr.leave_type, lr.start_date, lr.end_date,
                    st.first_name, st.last_name
             FROM ${s}.leave_requests lr
             JOIN ${s}.staff st ON st.id = lr.staff_id
             WHERE lr.status = 'approved'
               AND lr.start_date <= CURRENT_DATE
               AND lr.end_date >= CURRENT_DATE
             ORDER BY st.first_name, st.last_name`
          );
          return r.rows;
        }, [] as any[], 'onLeaveToday'),

        // Starting this month (contract_start_date in current month, active)
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM ${s}.staff
             WHERE is_active = TRUE
               AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))
               AND contract_start_date IS NOT NULL
               AND date_trunc('month', contract_start_date) = date_trunc('month', CURRENT_DATE)`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'startingThisMonth'),

        // Leavers this month (contract_end_date in current month and employment_status = leaver/archived OR inactive)
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM ${s}.staff
             WHERE contract_end_date IS NOT NULL
               AND date_trunc('month', contract_end_date) = date_trunc('month', CURRENT_DATE)
               AND (employment_status IN ('leaver','archived') OR is_active = FALSE)`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'leaversThisMonth'),

        // Onboarding in progress (checklist exists, not all items completed, staff still active)
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM (
               SELECT oc.id
               FROM ${s}.onboarding_checklists oc
               JOIN ${s}.staff st ON st.id = oc.staff_id
               LEFT JOIN ${s}.onboarding_items oi ON oi.checklist_id = oc.id
               WHERE st.is_active = TRUE
                 AND (st.employment_status IS NULL OR st.employment_status NOT IN ('leaver','archived'))
               GROUP BY oc.id
               HAVING COUNT(oi.id) > 0
                  AND COUNT(oi.id) FILTER (WHERE oi.completed = TRUE) < COUNT(oi.id)
             ) x`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'onboardingInProgress'),

        // Training expiring in next 30 days (mandatory only, not yet expired, active staff)
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n
             FROM ${s}.staff_training_records tr
             JOIN ${s}.staff st ON st.id = tr.staff_id
             WHERE tr.deleted_at IS NULL
               AND tr.is_mandatory = TRUE
               AND st.is_active = TRUE
               AND (st.employment_status IS NULL OR st.employment_status NOT IN ('leaver','archived'))
               AND tr.expiry_date IS NOT NULL
               AND tr.expiry_date >= CURRENT_DATE
               AND tr.expiry_date <= CURRENT_DATE + INTERVAL '30 days'`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'trainingExpiring'),

        // Appraisals due in next 30 days — distinct staff (latest appraisal per staff)
        safe(async () => {
          const r = await pool.query(
            `WITH latest AS (
               SELECT DISTINCT ON (a.staff_id)
                      a.staff_id, a.next_review_date
               FROM ${s}.appraisals a
               ORDER BY a.staff_id, a.review_date DESC
             )
             SELECT COUNT(*)::int AS n
             FROM latest l
             JOIN ${s}.staff st ON st.id = l.staff_id
             WHERE st.is_active = TRUE
               AND (st.employment_status IS NULL OR st.employment_status NOT IN ('leaver','archived'))
               AND l.next_review_date IS NOT NULL
               AND l.next_review_date >= CURRENT_DATE
               AND l.next_review_date <= CURRENT_DATE + INTERVAL '30 days'`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'appraisalsDue'),

        // Pending leave approvals
        safe(async () => {
          const r = await pool.query(
            `SELECT COUNT(*)::int AS n FROM ${s}.leave_requests WHERE status = 'pending'`
          );
          return Number(r.rows[0]?.n || 0);
        }, 0, 'pendingLeaveApprovals'),

        // Work anniversaries today (contract_start_date month+day = today, not the same year)
        safe(async () => {
          const r = await pool.query(
            `SELECT id, first_name, last_name, contract_start_date,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, contract_start_date))::int AS years
             FROM ${s}.staff
             WHERE is_active = TRUE
               AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))
               AND contract_start_date IS NOT NULL
               AND EXTRACT(MONTH FROM contract_start_date) = EXTRACT(MONTH FROM CURRENT_DATE)
               AND EXTRACT(DAY FROM contract_start_date) = EXTRACT(DAY FROM CURRENT_DATE)
               AND contract_start_date < CURRENT_DATE
             ORDER BY first_name, last_name`
          );
          return r.rows;
        }, [] as any[], 'anniversariesToday'),

        // Returning from leave today (yesterday was the end of an approved leave)
        safe(async () => {
          const r = await pool.query(
            `SELECT lr.staff_id, st.first_name, st.last_name, lr.leave_type, lr.end_date
             FROM ${s}.leave_requests lr
             JOIN ${s}.staff st ON st.id = lr.staff_id
             WHERE lr.status = 'approved'
               AND lr.end_date = CURRENT_DATE - INTERVAL '1 day'
               AND st.is_active = TRUE
               AND (st.employment_status IS NULL OR st.employment_status NOT IN ('leaver','archived'))
             ORDER BY st.first_name, st.last_name`
          );
          return r.rows;
        }, [] as any[], 'returningToday'),

        // Birthdays today — column may not exist on staff; safe-fallback to []
        safe(async () => {
          const r = await pool.query(
            `SELECT id, first_name, last_name
             FROM ${s}.staff
             WHERE is_active = TRUE
               AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))
               AND date_of_birth IS NOT NULL
               AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
               AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
             ORDER BY first_name, last_name`
          );
          return r.rows;
        }, [] as any[], 'birthdaysToday'),
      ]);

      const todayRow = await safe(
        async () => (await pool.query(`SELECT CURRENT_DATE::text AS d`)).rows[0]?.d as string,
        new Date().toISOString().slice(0, 10),
        'todayDate'
      );

      res.json({
        today_date: todayRow,
        counts: {
          activeStaff,
          onLeaveToday: onLeaveToday.length,
          startingThisMonth,
          leaversThisMonth,
          onboardingInProgress,
          trainingExpiring,
          appraisalsDue,
          pendingLeaveApprovals,
        },
        onLeaveToday: onLeaveToday.map((r: any) => ({
          staffId: r.staff_id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          leaveType: r.leave_type,
          endDate: r.end_date,
        })),
        today: {
          birthdays: birthdaysToday.map((r: any) => ({
            staffId: r.id,
            name: `${r.first_name} ${r.last_name}`.trim(),
          })),
          anniversaries: anniversariesToday.map((r: any) => ({
            staffId: r.id,
            name: `${r.first_name} ${r.last_name}`.trim(),
            years: r.years,
          })),
          returningFromLeave: returningToday.map((r: any) => ({
            staffId: r.staff_id,
            name: `${r.first_name} ${r.last_name}`.trim(),
            leaveType: r.leave_type,
          })),
        },
      });
    } catch (err: any) {
      logger.error('HR dashboard error:', err);
      res.status(500).json({ error: 'Failed to fetch HR dashboard' });
    }
  });
}
