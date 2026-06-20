import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature, requireHrAdmin } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { logger } from '../utils/logger';

async function getPool(customerId: string) {
  const custDb = await customerDbService.getCustomerDatabase(customerId);
  const schemaName = customerDbService.generateSchemaName(customerId);
  const pool = (custDb as any).$client ?? (custDb as any).session?.client;
  return { pool, schemaName };
}

function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

export function registerHrPayrollRoutes(app: Express): void {

  // GET /api/hr/payroll-export
  app.get('/api/hr/payroll-export', requireAuth, requireHrFeature, requireHrAdmin, async (req, res) => {
    try {
      const { pool, schemaName } = await getPool(req.customerId!);
      const { period_start, period_end = new Date().toISOString().slice(0, 10) } = req.query as any;

      if (!period_start) {
        return res.status(400).json({ error: 'period_start is required' });
      }

      // Staff base data
      const staffResult = await pool.query(
        `SELECT id, first_name, last_name, department, employment_type, pay_grade,
                contract_start_date, employment_status
         FROM "${schemaName}".staff
         WHERE is_active = TRUE OR (employment_status = 'leaver' AND contract_end_date BETWEEN $1 AND $2)
         ORDER BY last_name`,
        [period_start, period_end]
      );

      // Actual hours worked from staff_sessions for the period
      const hoursResult = await pool.query(
        `SELECT staff_id,
                ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(check_out_time, NOW()) - check_in_time)) / 3600)::numeric, 2) AS hours_worked
         FROM "${schemaName}".staff_sessions
         WHERE check_in_time <= $2::date + INTERVAL '1 day' - INTERVAL '1 second'
           AND check_in_time >= $1::date
         GROUP BY staff_id`,
        [period_start, period_end]
      );

      // Leave for period
      const leaveResult = await pool.query(
        `SELECT staff_id, leave_type, days_taken, status
         FROM "${schemaName}".leave_requests
         WHERE start_date <= $2 AND end_date >= $1`,
        [period_start, period_end]
      );

      // Absence records (sickness only) for period — separate from leave_requests
      const absenceResult = await pool.query(
        `SELECT staff_id, days_lost, start_date
         FROM "${schemaName}".absence_records
         WHERE (absence_type = 'sickness' OR absence_type IS NULL)
           AND start_date <= $2
           AND (return_date IS NULL OR return_date >= $1)`,
        [period_start, period_end]
      );

      // Leaver info
      const leaverResult = await pool.query(
        `SELECT staff_id, last_day, reason
         FROM "${schemaName}".leaver_checklists
         WHERE last_day BETWEEN $1 AND $2`,
        [period_start, period_end]
      );

      const staffList = staffResult.rows;
      const rows = staffList.map((s: any) => {
        const hoursRow = hoursResult.rows.find((h: any) => h.staff_id === s.id);
        const staffLeave = leaveResult.rows.filter((l: any) => l.staff_id === s.id);
        const annualDays = staffLeave.filter((l: any) => l.leave_type === 'annual' && l.status === 'approved')
          .reduce((sum: number, l: any) => sum + Number(l.days_taken), 0);
        const sickDays = absenceResult.rows
          .filter((a: any) => a.staff_id === s.id)
          .reduce((sum: number, a: any) => sum + Number(a.days_lost || 0), 0);
        const otherDays = staffLeave.filter((l: any) => !['annual', 'sick'].includes(l.leave_type) && l.status === 'approved')
          .reduce((sum: number, l: any) => sum + Number(l.days_taken), 0);
        const pendingDays = staffLeave.filter((l: any) => l.status === 'pending')
          .reduce((sum: number, l: any) => sum + Number(l.days_taken), 0);

        const leaverInfo = leaverResult.rows.find((l: any) => l.staff_id === s.id);
        const contractStartStr = s.contract_start_date
          ? new Date(s.contract_start_date).toISOString().slice(0, 10)
          : null;
        const isNewStarter = contractStartStr
          && contractStartStr >= period_start
          && contractStartStr <= period_end;

        return {
          staff_id: s.id,
          full_name: `${s.first_name} ${s.last_name}`,
          department: s.department || '',
          employment_type: s.employment_type || '',
          pay_grade: s.pay_grade || '',
          contract_start_date: s.contract_start_date || '',
          employment_status: s.employment_status || 'active',
          hours_worked: hoursRow ? Number(hoursRow.hours_worked) : 0,
          annual_leave_days_taken: annualDays,
          sick_days_absent: sickDays,
          other_leave_days_taken: otherDays,
          leave_days_pending_approval: pendingDays,
          is_new_starter: isNewStarter ? 'YES' : 'NO',
          start_date: isNewStarter ? s.contract_start_date : '',
          is_leaver: leaverInfo ? 'YES' : 'NO',
          last_day: leaverInfo?.last_day || '',
          leaving_reason: leaverInfo?.reason || '',
        };
      });

      const format = req.query.format;
      if (format === 'json') {
        return res.json({
          rows,
          summary: {
            activeStaff: staffList.filter((s: any) => s.employment_status !== 'leaver').length,
            starters: rows.filter((r) => r.is_new_starter === 'YES').length,
            leavers: rows.filter((r) => r.is_leaver === 'YES').length,
            periodStart: period_start,
            periodEnd: period_end,
          },
        });
      }

      const csv = toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payroll-export-${period_start}-to-${period_end}.csv"`);
      res.send(csv);
    } catch (err: any) {
      logger.error('Payroll export error:', err);
      res.status(500).json({ error: 'Failed to generate payroll export' });
    }
  });
}
