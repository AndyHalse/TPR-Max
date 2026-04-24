import type { Express } from 'express';
import type { Server } from 'http';
import { registerAuthRoutes } from './auth';

// Feature route modules will be registered here as they are migrated.
// Billing routes are already split: see server/billingRoutes.ts

export async function registerSplitRoutes(app: Express, server: Server): Promise<void> {
  registerAuthRoutes(app);
  // Modules will be imported and called here as each phase completes
}
