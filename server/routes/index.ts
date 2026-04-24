import type { Express } from 'express';
import type { Server } from 'http';
import { registerAuthRoutes } from './auth';
import { registerPlatformAdminRoutes } from './platformAdmin';

// Feature route modules will be registered here as they are migrated.
// Billing routes are already split: see server/billingRoutes.ts

export async function registerSplitRoutes(app: Express, server: Server): Promise<void> {
  registerAuthRoutes(app);
  registerPlatformAdminRoutes(app);
  // Domain route modules will be added here as each phase of the split is completed
}
