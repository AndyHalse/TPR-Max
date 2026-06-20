import { simpleDatabaseService } from '../simpleDatabaseService';
import { logger } from '../utils/logger';

export const requireHrFeature = async (req: any, res: any, next: any) => {
  try {
    if (!req.user || !req.customerId) return res.status(401).json({ error: 'Unauthorized' });
    const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureHrModule) {
      return res.status(403).json({
        error: 'The HR module requires a TPR Max subscription.',
        planRequired: 'tpr_max',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireHrAdmin = (req: any, res: any, next: any) => {
  if (!['admin', 'hr_admin'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'This area is restricted to HR administrators.' });
  }
  next();
};

export const isValidIsoDate = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test((v as string).slice(0, 10));

export async function recordHrAudit(
  pool: any,
  schemaName: string,
  entry: {
    entityType: string;
    entityId?: string | null;
    staffId?: string | null;
    action: string;
    actor: string;
    details?: any;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "${schemaName}".hr_audit_log
        (entity_type, entity_id, staff_id, action, actor, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        entry.entityType,
        entry.entityId ?? null,
        entry.staffId ?? null,
        entry.action,
        entry.actor,
        entry.details ? JSON.stringify(entry.details) : null,
      ]
    );
  } catch (err: any) {
    logger.warn(`[hr-audit] failed to record ${entry.entityType}/${entry.action}: ${err.message}`);
  }
}
