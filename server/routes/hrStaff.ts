import type { Express } from 'express';
import { requireAuth } from '../auth';
import { customerDbService } from '../customerDatabase';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerHrStaffRoutes(app: Express): void {

  // GET /api/staff/org-chart — all active staff structured for org chart
  app.get('/api/staff/org-chart', requireAuth, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);

      const rows = await custDb.execute(sql.raw(`
        SELECT id, first_name, last_name, job_title, department, team,
               line_manager_id, employment_status, photo_url
        FROM ${schemaName}.staff
        WHERE is_active = true
          AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))
        ORDER BY department, last_name
      `));

      res.json(rows.rows);
    } catch (err: any) {
      logger.error('Error fetching org chart:', err);
      res.status(500).json({ error: 'Failed to fetch org chart' });
    }
  });

  // PATCH /api/staff/:id/hr — update HR-specific fields only
  app.patch('/api/staff/:id/hr', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);

      const {
        employmentType,
        contractStartDate,
        contractEndDate,
        team,
        lineManagerId,
        payGrade,
        emergencyContactName,
        emergencyContactPhone,
        emergencyContactRelationship,
        employmentStatus,
        annualLeaveEntitlementDays,
        leaveYearStart,
        workingDaysPerWeek,
      } = req.body;

      // Validate
      if (lineManagerId && lineManagerId === id) {
        return res.status(400).json({ error: 'A staff member cannot be their own line manager' });
      }
      if (contractStartDate && contractEndDate && new Date(contractEndDate) <= new Date(contractStartDate)) {
        return res.status(400).json({ error: 'Contract end date must be after contract start date' });
      }
      if (workingDaysPerWeek !== undefined && (Number(workingDaysPerWeek) < 0.5 || Number(workingDaysPerWeek) > 5)) {
        return res.status(400).json({ error: 'Working days per week must be between 0.5 and 5' });
      }
      const validEmploymentTypes = ['full_time', 'part_time', 'casual', 'zero_hours', 'fixed_term', 'apprentice'];
      if (employmentType && !validEmploymentTypes.includes(employmentType)) {
        return res.status(400).json({ error: 'Invalid employment type' });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let i = 1;

      const addField = (col: string, val: any) => {
        if (val !== undefined) {
          updates.push(`${col} = $${i++}`);
          values.push(val === '' ? null : val);
        }
      };

      addField('employment_type', employmentType);
      addField('contract_start_date', contractStartDate);
      addField('contract_end_date', contractEndDate);
      addField('team', team);
      addField('line_manager_id', lineManagerId);
      addField('pay_grade', payGrade);
      addField('emergency_contact_name', emergencyContactName);
      addField('emergency_contact_phone', emergencyContactPhone);
      addField('emergency_contact_relationship', emergencyContactRelationship);
      addField('employment_status', employmentStatus);
      addField('annual_leave_entitlement_days', annualLeaveEntitlementDays);
      addField('leave_year_start', leaveYearStart);
      addField('working_days_per_week', workingDaysPerWeek);

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);

      const pool = (custDb as any).session?.client || (custDb as any).$client;

      if (!pool) {
        const stmt = `UPDATE ${schemaName}.staff SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`;
        values.push(id);
        const result = await custDb.execute(sql.raw(stmt.replace(/\$(\d+)/g, (_, n) => `$${n}`)));
        return res.json(result.rows[0] || {});
      }

      const stmt = `UPDATE "${schemaName}".staff SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`;
      values.push(id);
      const result = await pool.query(stmt, values);
      if (!result.rows[0]) return res.status(404).json({ error: 'Staff member not found' });
      res.json(result.rows[0]);
    } catch (err: any) {
      logger.error('Error updating HR staff fields:', err);
      res.status(500).json({ error: 'Failed to update staff HR fields' });
    }
  });
}
