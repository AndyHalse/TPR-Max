import { logger } from './utils/logger';
export async function initializeSampleTenants() {
  // Tenant companies table has been removed - this function is now a no-op
  logger.info('⚠️ initializeSampleTenants is deprecated - tenant_companies table removed');
  return false;
}