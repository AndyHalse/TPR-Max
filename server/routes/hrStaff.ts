import type { Express } from 'express';
import { requireAuth } from '../auth';
import { requireHrFeature } from './hrMiddleware';
import { customerDbService } from '../customerDatabase';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerHrStaffRoutes(app: Express): void {

  // GET /api/staff/org-chart — all active staff structured for org chart
  app.get('/api/staff/org-chart', requireAuth, requireHrFeature, async (req, res) => {
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

  // GET /api/staff/org-chart/validation — issues that prevent a clean tree
  app.get('/api/staff/org-chart/validation', requireAuth, requireHrFeature, async (req, res) => {
    try {
      const custDb = await customerDbService.getCustomerDatabase(req.customerId!);
      const schemaName = customerDbService.generateSchemaName(req.customerId!);

      const rows: any[] = (await custDb.execute(sql.raw(`
        SELECT id, first_name, last_name, line_manager_id, employment_status, is_active
        FROM ${schemaName}.staff
        WHERE is_active = true
          AND (employment_status IS NULL OR employment_status NOT IN ('leaver','archived'))
      `))).rows as any[];

      const byId = new Map<string, any>(rows.map(r => [r.id, r]));

      const noManager: any[] = [];
      const inactiveManager: any[] = [];
      const circularChains: Array<Array<{ id: string; name: string }>> = [];

      // Fetch any referenced manager that's not in active set (could be inactive/leaver)
      const referencedMgrIds = Array.from(new Set(rows.map(r => r.line_manager_id).filter(Boolean)));
      const externalMgrs = new Map<string, any>();
      if (referencedMgrIds.length > 0) {
        const lookupPool = (custDb as any).$client ?? (custDb as any).session?.client;
        const lookup = lookupPool
          ? await lookupPool.query(
              `SELECT id, first_name, last_name, is_active, employment_status
               FROM "${schemaName}".staff
               WHERE id = ANY($1::text[])`,
              [referencedMgrIds]
            )
          : { rows: [] as any[] };
        for (const m of lookup.rows as any[]) externalMgrs.set(m.id, m);
      }

      for (const r of rows) {
        if (!r.line_manager_id) {
          noManager.push({ id: r.id, name: `${r.first_name} ${r.last_name}` });
          continue;
        }
        const mgr = externalMgrs.get(r.line_manager_id);
        const mgrActive = mgr && mgr.is_active && (!mgr.employment_status || !['leaver', 'archived'].includes(mgr.employment_status));
        if (!mgrActive) {
          inactiveManager.push({
            id: r.id,
            name: `${r.first_name} ${r.last_name}`,
            managerId: r.line_manager_id,
            managerName: mgr ? `${mgr.first_name} ${mgr.last_name}` : null,
          });
        }
      }

      // Detect circular references via DFS over active staff only, deduplicating cycles
      const visited = new Set<string>();
      const seenCycles = new Set<string>();
      for (const r of rows) {
        if (visited.has(r.id)) continue;
        const stack: string[] = [];
        const onPath = new Set<string>();
        let cur: any = r;
        while (cur && cur.line_manager_id) {
          if (visited.has(cur.id) && !onPath.has(cur.id)) break;
          if (onPath.has(cur.id)) {
            const cycleStart = stack.indexOf(cur.id);
            const cycleIds = stack.slice(cycleStart);
            const key = [...cycleIds].sort().join('|');
            if (!seenCycles.has(key)) {
              seenCycles.add(key);
              circularChains.push(cycleIds.map(id => {
                const s = byId.get(id);
                return { id, name: s ? `${s.first_name} ${s.last_name}` : id };
              }));
            }
            cycleIds.forEach(id => visited.add(id));
            break;
          }
          stack.push(cur.id);
          onPath.add(cur.id);
          const nextId = cur.line_manager_id;
          if (!byId.has(nextId)) { stack.forEach(id => visited.add(id)); break; }
          cur = byId.get(nextId);
        }
        stack.forEach(id => visited.add(id));
      }

      res.json({
        noManager,
        inactiveManager,
        circular: circularChains,
        totals: {
          noManager: noManager.length,
          inactiveManager: inactiveManager.length,
          circular: circularChains.length,
        },
      });
    } catch (err: any) {
      logger.error('Org chart validation error:', err);
      res.status(500).json({ error: 'Failed to validate org chart' });
    }
  });

  // PATCH /api/staff/:id/hr — update HR-specific fields only
  app.patch('/api/staff/:id/hr', requireAuth, requireHrFeature, async (req, res) => {
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

      // Circular reference guard: walk up the proposed manager chain (works on any DB client)
      if (lineManagerId) {
        const chainPool = (custDb as any).$client ?? (custDb as any).session?.client;
        const seen = new Set<string>([id]);
        let cursor: string | null = lineManagerId;
        let safety = 0;
        while (cursor && safety < 1000) {
          if (seen.has(cursor)) {
            return res.status(400).json({ error: 'That assignment would create a circular reporting line.' });
          }
          seen.add(cursor);
          let nextId: string | null = null;
          if (chainPool) {
            const next: any = await chainPool.query(
              `SELECT line_manager_id FROM "${schemaName}".staff WHERE id = $1`,
              [cursor]
            );
            nextId = next.rows[0]?.line_manager_id ?? null;
          } else {
            const next: any = await custDb.execute(
              sql`SELECT line_manager_id FROM ${sql.raw(`"${schemaName}"`)}.staff WHERE id = ${cursor}`
            );
            nextId = (next.rows[0] as any)?.line_manager_id ?? null;
          }
          cursor = nextId;
          safety++;
        }
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

      // Cascade direct reports up one level if this update marks the staff as a leaver/archived
      // (Runs AFTER all validations have passed so we don't leave reports orphaned by a rejected request.)
      if (employmentStatus && ['leaver', 'archived'].includes(employmentStatus)) {
        const cascadePool = (custDb as any).session?.client ?? (custDb as any).$client;
        if (cascadePool) {
          const current = await cascadePool.query(
            `SELECT employment_status, line_manager_id FROM "${schemaName}".staff WHERE id = $1`,
            [id]
          );
          const prevStatus = current.rows[0]?.employment_status;
          if (prevStatus !== employmentStatus) {
            const upstreamMgr = current.rows[0]?.line_manager_id || null;
            const reassign = await cascadePool.query(
              `UPDATE "${schemaName}".staff
               SET line_manager_id = $1, updated_at = NOW()
               WHERE line_manager_id = $2
               RETURNING id, first_name, last_name`,
              [upstreamMgr, id]
            );
            if (reassign.rowCount && reassign.rowCount > 0) {
              const names = reassign.rows.map((r: any) => `${r.first_name} ${r.last_name}`).join(', ');
              logger.info(
                `[hr-audit] Staff ${id} → ${employmentStatus}: reassigned ${reassign.rowCount} direct report(s) to ${upstreamMgr || 'Unassigned'} — ${names}`
              );
            }
          }
        }
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
