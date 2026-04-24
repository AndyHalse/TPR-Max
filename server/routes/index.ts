import type { Express } from 'express';
import type { Server } from 'http';
import { registerAuthRoutes } from './auth';
import { registerPlatformAdminRoutes } from './platformAdmin';
import { registerOnboardingRoutes } from './onboarding';
import { registerVisitorRoutes } from './visitors';
import { registerStaffRoutes } from './staff';
import { registerMeetingRoomRoutes } from './meetingRooms';
import { registerReportRoutes } from './reports';
import { registerRamsRoutes } from './rams';

// Feature route modules will be registered here as they are migrated.
// Billing routes are already split: see server/billingRoutes.ts

export async function registerSplitRoutes(app: Express, server: Server): Promise<void> {
  registerAuthRoutes(app);
  registerPlatformAdminRoutes(app);
  registerOnboardingRoutes(app);
  registerVisitorRoutes(app);
  registerStaffRoutes(app);
  registerMeetingRoomRoutes(app);
  registerReportRoutes(app);
  registerRamsRoutes(app);
  // Domain route modules will be added here as each phase of the split is completed
}
