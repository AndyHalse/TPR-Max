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
import { registerLoneWorkerRoutes } from './loneWorker';
import { registerSettingsRoutes } from './settings';
import { registerContractorRoutes } from './contractors';
import { registerEmergencyRoutes } from './emergency';
import { registerInductionRoutes } from './induction';
import { registerPPMRoutes } from './ppm';
import { registerRemainingRoutes } from './remaining';

export async function registerSplitRoutes(
  app: Express,
  server: Server,
  setupAutomaticDailyReset?: (customerId?: string) => Promise<void>
): Promise<void> {
  registerAuthRoutes(app);
  registerPlatformAdminRoutes(app);
  registerOnboardingRoutes(app);
  registerVisitorRoutes(app);
  registerStaffRoutes(app);
  registerMeetingRoomRoutes(app);
  registerReportRoutes(app);
  registerRamsRoutes(app);
  registerLoneWorkerRoutes(app, server);
  registerSettingsRoutes(app, { setupAutomaticDailyReset });
  registerContractorRoutes(app);
  registerEmergencyRoutes(app);
  registerInductionRoutes(app);
  registerPPMRoutes(app);
  await registerRemainingRoutes(app, server);
}
