import type { Express } from 'express';
import type { Server as HttpServer } from 'http';
import crypto from 'crypto';
import { randomBytes } from 'crypto';
import { requireAuth, requireAuthOrFireMarshal } from '../auth';
import { databaseService } from '../databaseService';
import { simpleDatabaseService } from '../simpleDatabaseService';
import { customerDbService } from '../customerDatabase';
import { EmailService, emailService } from '../emailService';
import { EmergencyEmailService } from '../emergencyEmailService';
import { websocketService } from '../websocketService';
import { ObjectStorageService } from '../objectStorage';
import * as isolatedSchema from '../isolatedSchema';
import * as sharedSchema from '@shared/schema';
import {
  evacuations,
  evacuationAccountability,
} from '@shared/schema';
import { z } from 'zod';
import { eq, and, sql, desc, gte, lt, or, not } from 'drizzle-orm';
import { db, pool } from '../db';
import { sendTeamsNotification } from '../utils/teamsNotifier';
import { logger } from '../utils/logger';

// ─── Module-scope helper ────────────────────────────────────────────────────

// Helper function to generate and store safety token
async function generateSafetyToken(
  db: any,
  customerId: string,
  evacuationId: string,
  personId: string,
  personType: 'staff' | 'visitor' | 'contractor',
  personName: string,
  personEmail: string
): Promise<string> {
  // Generate URL-safe random token
  const randomToken = randomBytes(32).toString('base64url');
  
  // Create composite token with customerId for routing (format: customerId.randomToken)
  const token = `${customerId}.${randomToken}`;
  
  // Token expires in 24 hours
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  // Store token in customer's isolated database
  await db.insert(isolatedSchema.safetyTokens).values({
    token,
    evacuationId,
    personId,
    personType,
    personName,
    personEmail,
    isUsed: false,
    expiresAt
  });
  
  return token;
}
// ─────────────────────────────────────────────────────────────────────────────

export function registerEmergencyRoutes(app: Express): void {

  // ── Muster Settings (admin) ─────────────────────────────────────────────────

  app.get("/api/muster/settings", requireAuth, async (req, res) => {
    const defaults = { statusOptionsEnabled: false, statusOptions: ['Location unknown', 'Working remotely / offsite', 'Sent to another location'] };
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      try {
        const [row] = await custDb
          .select()
          .from(isolatedSchema.musterSettings)
          .where(eq(isolatedSchema.musterSettings.customerId, customerId))
          .limit(1);
        if (!row) return res.json(defaults);
        return res.json({
          statusOptionsEnabled: row.statusOptionsEnabled,
          statusOptions: row.statusOptions || defaults.statusOptions,
        });
      } catch {
        // Table doesn't exist yet — return defaults silently
        return res.json(defaults);
      }
    } catch (err) {
      logger.error('GET /api/muster/settings error:', err);
      return res.json(defaults);
    }
  });

  app.put("/api/muster/settings", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });
      const { statusOptionsEnabled, statusOptions } = req.body as { statusOptionsEnabled?: boolean; statusOptions?: string[] };
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const [existing] = await custDb
        .select()
        .from(isolatedSchema.musterSettings)
        .where(eq(isolatedSchema.musterSettings.customerId, customerId))
        .limit(1);
      if (existing) {
        await custDb
          .update(isolatedSchema.musterSettings)
          .set({
            ...(statusOptionsEnabled !== undefined ? { statusOptionsEnabled } : {}),
            ...(statusOptions !== undefined ? { statusOptions } : {}),
            updatedAt: new Date(),
          })
          .where(eq(isolatedSchema.musterSettings.customerId, customerId));
      } else {
        await custDb.insert(isolatedSchema.musterSettings).values({
          customerId,
          statusOptionsEnabled: statusOptionsEnabled ?? false,
          statusOptions: statusOptions ?? ['Location unknown', 'Working remotely / offsite', 'Sent to another location'],
        });
      }
      return res.json({ success: true });
    } catch (err) {
      logger.error('PUT /api/muster/settings error:', err);
      res.status(500).json({ error: 'Failed to save muster settings' });
    }
  });

  // Muster endpoint for emergency situations (includes staff, visitors, and contractors)
  app.get("/api/muster", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all checked-in staff using customer-isolated database service
      const checkedInStaff = await databaseService.getCheckedInStaff(context);
      
      // Get all current visitors using customer-isolated database service
      const currentVisitors = await databaseService.getCurrentVisitors(context);
      
      // Get all checked-in contractors using customer-isolated database service
      const checkedInContractors = await databaseService.getCheckedInContractors(context);
      
      let checkedInMembers: any[] = [];
      try {
        const custDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [settings] = await custDb
          .select()
          .from(isolatedSchema.companySettings)
          .limit(1);
        if (settings?.featureMembers === true) {
          checkedInMembers = await custDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.isCheckedIn, true));
        }
      } catch (e) {
      }
      
      const customerId = req.customerId;
      let accountabilityMap = new Map<string, boolean>();
      
      logger.info(`MUSTER: Building accountability map for customer: ${customerId}`);
      
      if (customerId) {
        const activeEvacs = await db
          .select()
          .from(evacuations)
          .where(and(
            eq(evacuations.customerId, customerId),
            eq(evacuations.status, 'active')
          ))
          .orderBy(desc(evacuations.createdAt))
          .limit(1);
        
        logger.info(`MUSTER: Found ${activeEvacs.length} active evacuations for customer ${customerId}`);
        
        if (activeEvacs.length > 0) {
          logger.info(`MUSTER: Active evacuation ID: ${activeEvacs[0].evacuationId}`);
          const accountabilityRecords = await db
            .select()
            .from(evacuationAccountability)
            .where(and(
              eq(evacuationAccountability.evacuationId, activeEvacs[0].evacuationId),
              eq(evacuationAccountability.customerId, customerId)
            ));
          
          logger.info(`MUSTER: Found ${accountabilityRecords.length} accountability records, ${accountabilityRecords.filter(r => r.isAccountedFor).length} marked safe`);
          
          accountabilityRecords.forEach(record => {
            accountabilityMap.set(record.personId, record.isAccountedFor);
          });
        }
      } else {
        logger.info(`MUSTER: No customerId available - accountability data will be empty`);
      }
      
      // Build zone name lookup map for last-known-location display
      let zoneNameMap = new Map<string, string>();
      try {
        const custDb = await customerDbService.getCustomerDatabase(customerId || context.customerId);
        const zones = await custDb.select().from(isolatedSchema.evacuationZones);
        zones.forEach((z: any) => zoneNameMap.set(z.id, z.name));
      } catch (e) { /* no zones configured */ }

      const resolveLocation = (zoneId: string | null | undefined): string => {
        if (zoneId && zoneNameMap.has(zoneId)) return zoneNameMap.get(zoneId)!;
        return zoneId ? `Zone ${zoneId}` : 'Not specified';
      };

      const musterList = [
        ...checkedInStaff.map(staff => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          type: 'staff' as const,
          department: staff.department,
          checkedInAt: staff.checkedInAt || staff.createdAt,
          location: resolveLocation((staff as any).zoneId),
          accounted: accountabilityMap.get(staff.id) ?? false,
          zoneId: (staff as any).zoneId || null,
          needsEvacuationAssistance: (staff as any).needsEvacuationAssistance ?? false,
          hasEmail: !!staff.email,
        })),
        ...currentVisitors.map(visitor => ({
          id: visitor.id,
          name: `${visitor.firstName} ${visitor.lastName}`,
          type: 'visitor' as const,
          company: visitor.company,
          checkedInAt: visitor.checkedInAt,
          location: resolveLocation((visitor as any).zoneId),
          accounted: accountabilityMap.get(visitor.id) ?? false,
          zoneId: (visitor as any).zoneId || null,
          needsEvacuationAssistance: (visitor as any).needsEvacuationAssistance ?? false,
          hasEmail: !!visitor.email,
        })),
        ...checkedInContractors.map(contractor => ({
          id: contractor.id,
          name: `${contractor.firstName} ${contractor.lastName}`,
          type: 'contractor' as const,
          company: contractor.companyName || contractor.company,
          checkedInAt: contractor.checkedInAt || contractor.createdAt,
          location: resolveLocation((contractor as any).zoneId),
          accounted: accountabilityMap.get(contractor.id) ?? false,
          zoneId: (contractor as any).zoneId || null,
          needsEvacuationAssistance: (contractor as any).needsEvacuationAssistance ?? false,
          hasEmail: !!(contractor as any).email,
        })),
        ...checkedInMembers.map(member => ({
          id: member.id,
          name: `${member.firstName} ${member.lastName}`,
          type: 'member' as const,
          company: null,
          department: member.membershipType || 'Member',
          checkedInAt: member.checkedInAt || member.createdAt,
          location: resolveLocation((member as any).zoneId),
          accounted: accountabilityMap.get(member.id) ?? false,
          zoneId: (member as any).zoneId || null,
          needsEvacuationAssistance: false,
          hasEmail: !!(member as any).email,
        }))
      ];
      
      // Prevent browser caching for real-time updates
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(musterList);
    } catch (error) {
      logger.error("Failed to fetch muster list:", error);
      res.status(500).json({ error: "Failed to fetch muster list" });
    }
  });

  // Emergency Evacuation - Send evacuation alert to all people on site
  app.post("/api/emergency/evacuate", requireAuth, async (req, res) => {
    try {
      const { musterPoints, message, sendEmail, sendSMS } = req.body;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all people currently on site
      const checkedInStaff = await databaseService.getCheckedInStaff(context);
      const currentVisitors = await databaseService.getCurrentVisitors(context);
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      // Prepare evacuation data
      const evacuationData = {
        timestamp: new Date().toISOString(),
        totalPeople: checkedInStaff.length + currentVisitors.length,
        staff: checkedInStaff.length,
        visitors: currentVisitors.length,
        message: message || 'Emergency evacuation in progress. Please proceed to a safe location immediately.',
        notificationsSent: 0
      };
      
      // Send email notifications if requested
      if (sendEmail) {
        const emailService = new EmailService(req.customerId);
        
        // Send to all staff
        for (const staff of checkedInStaff) {
          if (staff.email) {
            await emailService.sendEvacuationAlert(
              staff.email,
              `${staff.firstName} ${staff.lastName}`,
              evacuationData.message,
              companySettings!
            );
            evacuationData.notificationsSent++;
          }
        }
        
        // Send to all visitors
        for (const visitor of currentVisitors) {
          if (visitor.email) {
            await emailService.sendEvacuationAlert(
              visitor.email,
              `${visitor.firstName} ${visitor.lastName}`,
              evacuationData.message,
              companySettings!
            );
            evacuationData.notificationsSent++;
          }
        }
        
        // Send to Fire Marshal if configured
        const fireMarshal = checkedInStaff.find(s => s.isFireMarshal);
        if (fireMarshal && fireMarshal.email) {
          await emailService.sendFireMarshalAlert(
            fireMarshal.email,
            `${fireMarshal.firstName} ${fireMarshal.lastName}`,
            evacuationData,
            [...checkedInStaff, ...currentVisitors],
            companySettings!
          );
        }
      }
      
      res.json({
        success: true,
        evacuationData,
        message: `Emergency evacuation initiated. ${evacuationData.notificationsSent} notifications sent.`
      });
    } catch (error) {
      logger.error("Failed to initiate emergency evacuation:", error);
      res.status(500).json({ error: "Failed to initiate emergency evacuation" });
    }
  });

  // Fire Marshal Emergency System Endpoints
  
  
  // Emergency activation - Notify all people on site and Fire Marshals
  app.post("/api/emergency/activate", requireAuth, async (req, res) => {
    try {
      const activatedBy = req.user?.username || 'System Administrator';
      const { selectedZones, isDrill } = req.body || {};
      const drillMode = isDrill === true;
      const zoneFilter = Array.isArray(selectedZones) && selectedZones.length > 0 ? new Set(selectedZones) : null;
      
      // Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      logger.info(`\n EMERGENCY ACTIVATION - PRE-FLIGHT VALIDATION`);
      logger.info(`============================================`);
      logger.info(`Customer ID: ${context.customerId}`);
      logger.info(`Activated by: ${activatedBy}`);
      
      // PRE-FLIGHT CHECK 1: Verify customer database exists and is accessible
      try {
        await customerDbService.getCustomerDatabase(context.customerId);
        logger.info(`Customer database accessible`);
      } catch (error) {
        logger.error(`CRITICAL ERROR: Customer database not accessible for ${context.customerId}`);
        return res.status(500).json({
          error: "System not ready",
          message: "Emergency system database is not accessible. Please contact support immediately."
        });
      }
      
      // PRE-FLIGHT CHECK 2: Load company settings
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      if (!companySettings) {
        logger.error(`CRITICAL ERROR: Company settings not found for customer ${context.customerId}`);
        return res.status(500).json({
          error: "Configuration error",
          message: "Company settings could not be loaded. Please contact support."
        });
      }
      logger.info(`Company settings loaded`);
      
      // Get all people currently on site
      const checkedInStaff = await databaseService.getCheckedInStaff(context);
      const currentVisitors = await databaseService.getCurrentVisitors(context);
      const checkedInContractors = await databaseService.getCheckedInContractors(context);
      
      // Get checked-in members if feature is enabled
      let checkedInMembers: any[] = [];
      try {
        if (companySettings?.featureMembers === true) {
          const custDb = await customerDbService.getCustomerDatabase(context.customerId);
          checkedInMembers = await custDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.isCheckedIn, true));
        }
      } catch (e) {
        logger.info(`Members query failed during evacuation: ${e}`);
      }
      
      // PRE-FLIGHT CHECK 3: Validate Fire Marshals have emergency URLs
      const allFireMarshals = checkedInStaff.filter(s => 
        s.department?.toLowerCase().includes('safety') || 
        s.department?.toLowerCase().includes('security') ||
        s.isFireMarshal === true
      );
      
      const fireMarshalsMissingUrls = allFireMarshals.filter(fm => !fm.fireMarshalUrlId);
      if (fireMarshalsMissingUrls.length > 0) {
        const names = fireMarshalsMissingUrls.map(fm => `${fm.firstName} ${fm.lastName}`).join(', ');
        logger.info(`Auto-generating emergency URLs for ${fireMarshalsMissingUrls.length} Fire Marshal(s): ${names}`);
        // Auto-fix: generate missing URLs rather than blocking the emergency
        const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
        for (const fm of fireMarshalsMissingUrls) {
          const newUrlId = Math.random().toString(36).substring(2, 14);
          await customerDb
            .update(isolatedSchema.staff)
            .set({ fireMarshalUrlId: newUrlId })
            .where(eq(isolatedSchema.staff.id, fm.id));
          fm.fireMarshalUrlId = newUrlId;
          logger.info(`AUTO-GENERATED Fire Marshal URL for ID ${fm.id}: ${newUrlId}`);
        }
      }
      logger.info(`All ${allFireMarshals.length} Fire Marshals have emergency URLs`);
      
      logger.info(`PRE-FLIGHT CHECKS PASSED - Emergency activation proceeding`);
      if (zoneFilter) {
        logger.info(`Zone-based evacuation: filtering to ${zoneFilter.size} selected zones`);
      }
      logger.info(`============================================\n`);
      
      // Apply zone filter ONLY to staff - visitors, contractors, and members always get notified
      const filteredStaff = zoneFilter ? checkedInStaff.filter((s: any) => s.zoneId && zoneFilter.has(s.zoneId)) : checkedInStaff;
      const filteredVisitors = currentVisitors;
      const filteredContractors = checkedInContractors;
      const filteredMembers = checkedInMembers;
      
      if (zoneFilter) {
        logger.info(`Zone filter applied to STAFF ONLY: ${filteredStaff.length} staff in zones, ${filteredVisitors.length} visitors (all), ${filteredContractors.length} contractors (all), ${filteredMembers.length} members (all)`);
      }
      
      if (filteredStaff.length === 0 && filteredVisitors.length === 0 && filteredContractors.length === 0 && filteredMembers.length === 0) {
        return res.status(400).json({
          error: "No people on site",
          message: "There are no staff, visitors, contractors, or members currently on site."
        });
      }
      
      // Generate unique evacuation ID
      const evacuationId = `evac-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const musterPoints = ['Main Car Park', 'Side Entrance', 'Rear Assembly'];
      
      // Create evacuation record
      await db.insert(evacuations).values({
        customerId: context.customerId,
        evacuationId,
        status: 'active',
        activatedBy,
        isDrill: drillMode,
        totalPeopleOnSite: checkedInStaff.length + currentVisitors.length + checkedInContractors.length + checkedInMembers.length,
        totalAccountedFor: 0,
        musterPoints
      });
      
      // Load zone name map from customer isolated DB for accurate zone reporting
      const zoneNameMapForReport = new Map<string, string>();
      try {
        const custDbForZones = await customerDbService.getCustomerDatabase(context.customerId);
        const zones = await custDbForZones.select({ id: isolatedSchema.evacuationZones.id, name: isolatedSchema.evacuationZones.name })
          .from(isolatedSchema.evacuationZones);
        for (const zone of zones) {
          zoneNameMapForReport.set(zone.id, zone.name);
        }
      } catch (e) {
        logger.info(`Could not load zones for report: ${e}`);
      }

      const resolveZoneLocation = (zoneId: string | null | undefined): string => {
        if (zoneId && zoneNameMapForReport.has(zoneId)) return zoneNameMapForReport.get(zoneId)!;
        return 'No Zone Assigned';
      };

      // Create evacuationAccountability records for filtered people (zone-based if applicable)
      const accountabilityRecords = [
        ...filteredStaff.map((s: any) => ({
          customerId: context.customerId,
          evacuationId,
          personId: s.id,
          personType: 'staff',
          personName: `${s.firstName} ${s.lastName}`,
          department: s.department || '',
          company: '',
          lastKnownLocation: resolveZoneLocation(s.zoneId),
          isAccountedFor: false
        })),
        ...filteredVisitors.map((v: any) => ({
          customerId: context.customerId,
          evacuationId,
          personId: v.id,
          personType: 'visitor',
          personName: `${v.firstName} ${v.lastName}`,
          department: '',
          company: v.company || '',
          lastKnownLocation: resolveZoneLocation((v as any).zoneId),
          isAccountedFor: false
        })),
        ...filteredContractors.map((c: any) => ({
          customerId: context.customerId,
          evacuationId,
          personId: c.id,
          personType: 'contractor',
          personName: `${c.firstName} ${c.lastName}`,
          department: '',
          company: c.company || '',
          lastKnownLocation: resolveZoneLocation((c as any).zoneId),
          isAccountedFor: false
        })),
        ...filteredMembers.map((m: any) => ({
          customerId: context.customerId,
          evacuationId,
          personId: m.id,
          personType: 'member',
          personName: `${m.firstName} ${m.lastName}`,
          department: m.department || '',
          company: m.company || '',
          lastKnownLocation: resolveZoneLocation((m as any).zoneId),
          isAccountedFor: false
        }))
      ];
      
      await db.insert(evacuationAccountability).values(accountabilityRecords);
      
      // Get customer database for isolated tables (safetyTokens)
      const customerDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      // Prepare evacuation data
      const evacuationData = {
        evacuationId,
        timestamp: new Date().toISOString(),
        totalPeople: filteredStaff.length + filteredVisitors.length + filteredContractors.length + filteredMembers.length,
        staff: filteredStaff.length,
        visitors: filteredVisitors.length,
        contractors: filteredContractors.length,
        members: filteredMembers.length,
        musterPoints,
        isDrill: drillMode,
        message: drillMode
          ? '🔶 [FIRE DRILL] This is a scheduled fire drill. Please proceed to your nearest muster point as you would in a real emergency.'
          : zoneFilter 
            ? '🚨 ZONE EVACUATION IN PROGRESS. Personnel in affected zones must proceed to the nearest muster point immediately.'
            : '🚨 EMERGENCY EVACUATION IN PROGRESS. Please proceed to your nearest muster point immediately.',
        notificationsSent: 0,
        activatedBy
      };
      
      const customEmailService = new EmailService(req.customerId);
      const errors = [];
      
      // Identify Fire Marshals FIRST (before sending any emails) - always notify ALL fire marshals regardless of zone filter
      const fireMarshals = checkedInStaff.filter(s => 
        s.department?.toLowerCase().includes('safety') || 
        s.department?.toLowerCase().includes('security') ||
        s.isFireMarshal === true
      );
      const fireMarshalIds = new Set(fireMarshals.map(fm => fm.id));
      
      // Only send regular evacuation emails to non-Fire Marshal staff (filtered by zone if applicable)
      const regularStaff = filteredStaff.filter(s => !fireMarshalIds.has(s.id));
      
      logger.info(`\n SENDING EVACUATION ALERTS TO ALL PERSONNEL`);
      logger.info(`============================================`);
      logger.info(`Regular staff to notify: ${regularStaff.length}`);
      logger.info(`Fire Marshals (separate alert): ${fireMarshals.length}`);
      logger.info(`Visitors to notify: ${currentVisitors.length}`);
      logger.info(`Contractors to notify: ${checkedInContractors.length}`);
      logger.info(`============================================\n`);
      
      // Send to all regular staff (excluding Fire Marshals)
      for (const staff of regularStaff) {
        if (staff.email) {
          try {
            // Generate safety token for this staff member
            const safetyToken = await generateSafetyToken(
              customerDb,
              context.customerId,
              evacuationId,
              staff.id,
              'staff',
              `${staff.firstName} ${staff.lastName}`,
              staff.email
            );
            
            logger.info(`Sending evacuation alert to staff: ID ${staff.id} ([email])`);
            const sent = await customEmailService.sendEvacuationAlert(
              staff.email,
              `${staff.firstName} ${staff.lastName}`,
              evacuationData.message,
              companySettings!,
              safetyToken,
              drillMode
            );
            if (sent) {
              logger.info(`Successfully sent to ID ${staff.id}`);
              evacuationData.notificationsSent++;
            } else {
              logger.info(`Failed to send to ID ${staff.id}`);
            }
          } catch (error) {
            logger.error(`ERROR sending to staff ID ${staff.id}:`, error);
            errors.push(`Failed to notify ${staff.firstName} ${staff.lastName}: ${error}`);
          }
        }
      }
      
      // Send to all visitors (filtered by zone if applicable)
      for (const visitor of filteredVisitors) {
        if (visitor.email) {
          try {
            logger.info(`Sending evacuation alert to VISITOR: ID ${visitor.id} ([email])`);
            
            // Generate safety token for this visitor
            const safetyToken = await generateSafetyToken(
              customerDb,
              context.customerId,
              evacuationId,
              visitor.id,
              'visitor',
              `${visitor.firstName} ${visitor.lastName}`,
              visitor.email
            );
            
            const sent = await customEmailService.sendEvacuationAlert(
              visitor.email,
              `${visitor.firstName} ${visitor.lastName}`,
              evacuationData.message,
              companySettings!,
              safetyToken,
              drillMode
            );
            
            if (sent) {
              logger.info(`Successfully sent to visitor ID ${visitor.id}`);
              evacuationData.notificationsSent++;
            } else {
              logger.info(`Failed to send to visitor ID ${visitor.id}`);
              errors.push(`Failed to notify visitor ${visitor.firstName} ${visitor.lastName}: Email send returned false`);
            }
          } catch (error) {
            logger.error(`ERROR sending to visitor ID ${visitor.id}:`, error);
            errors.push(`Failed to notify visitor ${visitor.firstName} ${visitor.lastName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          logger.warn(`Visitor ID ${visitor.id} has no email address`);
        }
      }
      
      // Send to all contractors (filtered by zone if applicable)
      for (const contractor of filteredContractors) {
        if (contractor.email) {
          try {
            logger.info(`Sending evacuation alert to CONTRACTOR: ID ${contractor.id} ([email])`);
            
            // Generate safety token for this contractor
            const safetyToken = await generateSafetyToken(
              customerDb,
              context.customerId,
              evacuationId,
              contractor.id,
              'contractor',
              `${contractor.firstName} ${contractor.lastName}`,
              contractor.email
            );
            
            const sent = await customEmailService.sendEvacuationAlert(
              contractor.email,
              `${contractor.firstName} ${contractor.lastName}`,
              evacuationData.message,
              companySettings!,
              safetyToken,
              drillMode
            );
            
            if (sent) {
              logger.info(`Successfully sent to contractor ID ${contractor.id}`);
              evacuationData.notificationsSent++;
            } else {
              logger.info(`Failed to send to contractor ID ${contractor.id}`);
              errors.push(`Failed to notify contractor ${contractor.firstName} ${contractor.lastName}: Email send returned false`);
            }
          } catch (error) {
            logger.error(`ERROR sending to contractor ID ${contractor.id}:`, error);
            errors.push(`Failed to notify contractor ${contractor.firstName} ${contractor.lastName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          logger.warn(`Contractor ID ${contractor.id} has no email address`);
        }
      }
      
      // Log summary of regular evacuation emails sent
      logger.info(`\n EVACUATION EMAIL SUMMARY (Regular Personnel)`);
      logger.info(`============================================`);
      logger.info(`Successfully sent: ${evacuationData.notificationsSent} emails`);
      logger.info(`Failed: ${errors.length} errors`);
      if (errors.length > 0) {
        logger.info(`\nErrors:`);
        errors.forEach(err => logger.info(`- ${err}`));
      }
      logger.info(`============================================\n`);
      
      // Track Fire Marshal emails separately
      let fireMarshalEmailsSent = 0;
      
      // Now send Fire Marshal-specific alerts (fireMarshals already identified above)
      logger.info(`\n EMERGENCY ACTIVATION - FIRE MARSHAL NOTIFICATION`);
      logger.info(`============================================`);
      logger.info(`Found ${fireMarshals.length} Fire Marshals:`, fireMarshals.map(m => `ID ${m.id}`));
      logger.info(`Base URL: ${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000'}`);
      logger.info(`============================================\n`);
      
      for (const marshal of fireMarshals) {
        if (marshal.email) {
          try {
            // NEW: Use static Fire Marshal URL ID instead of temporary tokens
            if (!marshal.fireMarshalUrlId) {
              logger.warn(`Fire Marshal ID ${marshal.id} has no URL ID, skipping email`);
              errors.push(`Fire Marshal ${marshal.firstName} ${marshal.lastName} cannot be notified - no emergency access URL configured`);
              continue;
            }
            
            // Build the permanent Fire Marshal URL (no expiration!)
            const baseUrl = process.env.REPLIT_DOMAINS 
              ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
              : 'http://localhost:5000';
            const marshalUrl = `${baseUrl}/fire-marshal/${marshal.fireMarshalUrlId}`;
            
            logger.info(`\n FIRE MARSHAL STATIC URL:`);
            logger.info(`Name: ID ${marshal.id}`);
            logger.info(`Email: [email]`);
            logger.info(`URL ID: ${marshal.fireMarshalUrlId}`);
            logger.info(`PERMANENT URL: ${marshalUrl}`);
            logger.info(`No expiration - can be saved as favorite!\n`);
            
            // Send Fire Marshal alert with static URL (updated email template will use this)
            await EmergencyEmailService.sendFireMarshalAlert({
              marshalName: `${marshal.firstName} ${marshal.lastName}`,
              marshalEmail: marshal.email,
              marshalDepartment: marshal.department || 'Fire Marshal',
              emergencyToken: marshal.fireMarshalUrlId,  // Reusing field for URL ID
              activatedBy: evacuationData.activatedBy,
              activatedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              totalPersonnel: evacuationData.totalPeople,
              staffCount: evacuationData.staff,
              visitorCount: evacuationData.visitors,
              contractorCount: evacuationData.contractors,
              accountedFor: 0,
              siteLocation: companySettings?.siteName || 'Site',
              musterPoints: evacuationData.musterPoints
            }, req.customerId);
            
            fireMarshalEmailsSent++;
            logger.info(`EMAIL SENT to [email] with static URL: ${marshalUrl}`);
          } catch (error) {
            logger.error(`Failed to send Fire Marshal alert to [name]:`, error);
            errors.push(`Failed to notify Fire Marshal ${marshal.firstName} ${marshal.lastName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // CRITICAL: Final summary showing TOTAL emails sent (life-safety requirement)
      const totalEmailsSent = evacuationData.notificationsSent + fireMarshalEmailsSent;
      logger.info(`\n FINAL EMERGENCY EMAIL SUMMARY (LIFE-SAFETY CRITICAL)`);
      logger.info(`============================================`);
      logger.info(`Regular evacuation emails: ${evacuationData.notificationsSent}`);
      logger.info(`Fire Marshal alerts: ${fireMarshalEmailsSent}`);
      logger.info(`TOTAL EMAILS SENT: ${totalEmailsSent}`);
      logger.info(`Total failures: ${errors.length}`);
      if (errors.length > 0) {
        logger.info(`\nAll Errors:`);
        errors.forEach(err => logger.info(`- ${err}`));
      }
      logger.info(`============================================\n`);

      // Teams notification — fire and forget, never blocks emergency activation
      const _teamsSchemaEvac = customerDbService.generateSchemaName(context.customerId);
      const _onSiteCount = (checkedInStaff?.length || 0) + (currentVisitors?.length || 0) + (checkedInContractors?.length || 0) + (checkedInMembers?.length || 0);
      sendTeamsNotification(_teamsSchemaEvac, 'evacuation_started', {
        eventType: 'evacuation_started',
        title: drillMode ? '🔔 EVACUATION DRILL IN PROGRESS' : '🚨 EVACUATION IN PROGRESS',
        summary: `An evacuation${drillMode ? ' drill' : ''} has been activated at ${companySettings?.companyName || 'site'}. Check TPR for the live roll-call.`,
        facts: [
          { name: 'Site', value: companySettings?.companyName || 'Site' },
          { name: 'Activated by', value: activatedBy },
          { name: 'Time', value: new Date().toLocaleTimeString('en-GB') },
          { name: 'Personnel on site', value: String(_onSiteCount) },
          ...(drillMode ? [{ name: 'Mode', value: 'DRILL — not a real emergency' }] : []),
        ],
        urgency: drillMode ? 'normal' : 'high',
      }).catch(() => {});

      res.json({
        success: true,
        message: `Emergency activated! Sent ${totalEmailsSent} total alerts (${evacuationData.notificationsSent} regular + ${fireMarshalEmailsSent} Fire Marshal).`,
        evacuationId,
        evacuationData,
        fireMarshals: fireMarshals.length,
        fireMarshalEmailsSent,
        totalEmailsSent,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error("Error activating emergency:", error);
      res.status(500).json({ 
        error: "Failed to activate emergency",
        message: "An unexpected error occurred while activating the emergency system." 
      });
    }
  });

  // Get active evacuation status for regular authenticated users
  app.get("/api/evacuation/status", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      logger.info(`Checking evacuation status for customer: ${customerId}`);

      // Check for active evacuations for the customer only
      const activeEvacuations = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.status, 'active'),
          eq(evacuations.customerId, customerId)
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      if (activeEvacuations.length > 0) {
        const evacuation = activeEvacuations[0];
        res.json({ 
          active: true,
          evacuationId: evacuation.evacuationId,
          startedAt: evacuation.startedAt.toISOString(),
          isDrill: evacuation.isDrill || false,
          customerId
        });
      } else {
        res.json({ 
          active: false,
          customerId
        });
      }
    } catch (error) {
      logger.error("Error checking active evacuation:", error);
      res.status(500).json({ error: "Failed to check evacuation status" });
    }
  });

  // Get active evacuation status - requires valid emergency token (Fire Marshal use)
  app.get("/api/emergency/active", async (req, res) => {
    try {
      // Validate emergency token
      const emergencyToken = req.emergencyToken;
      
      if (!emergencyToken) {
        return res.status(401).json({ error: "Emergency token required", code: "TOKEN_REQUIRED" });
      }
      
      const emergencyContext = simpleDatabaseService.createDevelopmentContext();
      const validatedStaff = await databaseService.validateEmergencyToken(emergencyContext, emergencyToken);
      logger.info(`EMERGENCY TOKEN VALIDATION: ${validatedStaff ? 'SUCCESS - ' + validatedStaff.firstName + ' (Customer: ' + (validatedStaff as any).customerId + ')' : 'FAILED - No matching staff found'}`);
      
      if (!validatedStaff) {
        return res.status(401).json({ error: "Invalid or expired emergency token", code: "TOKEN_INVALID" });
      }
      
      logger.info(`Fire Marshal ID ${validatedStaff.id} accessed emergency/active for customer: ${(validatedStaff as any).customerId}`);
      
      // Check for active evacuations for the Fire Marshal's customer only
      const activeEvacuations = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.status, 'active'),
          eq(evacuations.customerId, (validatedStaff as any).customerId)
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      if (activeEvacuations.length > 0) {
        const evacuation = activeEvacuations[0];
        res.json({ 
          active: true,
          evacuationId: evacuation.evacuationId,
          startedAt: evacuation.startedAt.toISOString(),
          isDrill: evacuation.isDrill || false
        });
      } else {
        res.json({ 
          active: false 
        });
      }
    } catch (error) {
      logger.error("Error checking active evacuation:", error);
      res.status(500).json({ error: "Failed to check evacuation status" });
    }
  });

  // Get evacuation accountability list - requires valid emergency token or Fire Marshal URL ID
  app.get("/api/emergency/accountability/:evacuationId?", async (req, res) => {
    try {
      let validatedStaff: any;
      let customerId: string;
      
      // Support both authentication methods
      const emergencyToken = req.emergencyToken;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      if (emergencyToken) {
        const emContext = simpleDatabaseService.createDevelopmentContext();
        validatedStaff = await databaseService.validateEmergencyToken(emContext, emergencyToken);
        if (!validatedStaff) {
          return res.status(401).json({ error: "Invalid or expired emergency token", code: "TOKEN_INVALID" });
        }
        customerId = validatedStaff.customerId;
      } else if (fireMarshalId) {
        const marshal = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!marshal) {
          return res.status(401).json({ error: "Invalid Fire Marshal link", code: "INVALID_MARSHAL_ID" });
        }
        validatedStaff = marshal.marshal;
        customerId = marshal.customerId;
      } else {
        return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
      }
      
      logger.info(`Fire Marshal ID ${validatedStaff.id} (Customer: ${customerId}) accessed accountability list`);
      
      const requestedEvacuationId = req.params.evacuationId;
      
      // ALWAYS resolve to the latest active evacuation for this customer
      const latestEvacs = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId),
          eq(evacuations.status, 'active')
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      let evacuation;
      let evacuationId: string;
      
      if (latestEvacs.length > 0) {
        evacuation = latestEvacs;
        evacuationId = latestEvacs[0].evacuationId;
        if (requestedEvacuationId && requestedEvacuationId !== evacuationId) {
          logger.info(`Accountability: Resolved stale evacuationId ${requestedEvacuationId} -> latest: ${evacuationId}`);
        }
      } else if (requestedEvacuationId) {
        const specificEvac = await db
          .select()
          .from(evacuations)
          .where(and(
            eq(evacuations.evacuationId, requestedEvacuationId),
            eq(evacuations.customerId, customerId)
          ))
          .limit(1);
        if (specificEvac.length > 0) {
          evacuation = specificEvac;
          evacuationId = requestedEvacuationId;
        } else {
          return res.status(404).json({ error: "Evacuation not found" });
        }
      } else {
        return res.status(404).json({ error: "No active evacuation found" });
      }
      
      // Get all accountability records for this evacuation
      const accountabilityRecords = await db
        .select()
        .from(evacuationAccountability)
        .where(eq(evacuationAccountability.evacuationId, evacuationId));
      
      // Format for Fire Marshal mobile view
      const people = accountabilityRecords.map(record => ({
        id: record.personId,
        name: record.personName,
        type: record.personType as 'staff' | 'visitor' | 'contractor' | 'member',
        department: record.department || '',
        company: record.company || '',
        location: record.lastKnownLocation || 'Unknown',
        isAccountedFor: record.isAccountedFor,
        accountedBy: record.accountedBy || undefined,
        accountedAt: record.accountedAt?.toISOString() || undefined,
        musterPoint: record.musterPoint || undefined
      }));
      
      const evacuationRecord = evacuation[0];
      
      // Prevent browser caching for real-time updates
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({ 
        evacuationId,
        people,
        totalOnSite: people.length,
        accountedFor: people.filter(p => p.isAccountedFor).length,
        unaccounted: people.filter(p => !p.isAccountedFor).length,
        musterPoints: evacuationRecord.musterPoints || ['Main Car Park', 'Side Entrance', 'Rear Assembly']
      });
    } catch (error) {
      logger.error("Error fetching accountability list:", error);
      res.status(500).json({ error: "Failed to fetch accountability list" });
    }
  });

  // Mark person as safe/accounted for - supports both emergency token and Fire Marshal URL ID
  app.post("/api/emergency/mark-safe/:personId", async (req, res) => {
    try {
      let validatedStaff: any = null;
      let customerId: string | null = null;
      
      // Support both authentication methods
      const emergencyToken = req.emergencyToken;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      if (emergencyToken) {
        const emContext2 = simpleDatabaseService.createDevelopmentContext();
        validatedStaff = await databaseService.validateEmergencyToken(emContext2, emergencyToken);
        if (!validatedStaff) {
          return res.status(401).json({ error: "Invalid or expired emergency token", code: "TOKEN_INVALID" });
        }
        customerId = validatedStaff.customerId;
      } else if (fireMarshalId) {
        const marshal = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!marshal) {
          return res.status(401).json({ error: "Invalid Fire Marshal link", code: "INVALID_MARSHAL_ID" });
        }
        validatedStaff = marshal.marshal;
        customerId = marshal.customerId;
        logger.info(`Fire Marshal URL authenticated: ID ${validatedStaff.id} (${customerId})`);
      } else {
        return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
      }
      
      const { personId } = req.params;
      const { musterPoint, evacuationId: requestedEvacuationId, marshalName: providedMarshal, statusOption, markedAt } = req.body;
      const marshalName = providedMarshal || `${validatedStaff.firstName} ${validatedStaff.lastName}`;
      const accountedAtValue = markedAt ? new Date(markedAt) : new Date();
      
      logger.info(`MARK SAFE REQUEST - PersonID: ${personId}, EvacID: ${requestedEvacuationId}, Fire Marshal: ${marshalName} (Customer: ${customerId}), MusterPoint: ${musterPoint}`);
      logger.info(`Validated Fire Marshal: ID ${validatedStaff.id} ([email])`);
      
      let evacuation;
      let evacuationId = requestedEvacuationId;
      
      // ALWAYS resolve to the LATEST active evacuation for this customer
      // This prevents stale evacuationId from client causing mismatches
      const latestActiveEvac = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId as any),
          eq(evacuations.status, 'active')
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      if (latestActiveEvac.length > 0) {
        evacuationId = latestActiveEvac[0].evacuationId;
        evacuation = latestActiveEvac;
        if (evacuationId !== requestedEvacuationId) {
          logger.info(`Resolved stale evacuationId ${requestedEvacuationId} -> latest active: ${evacuationId}`);
        }
      }
      
      // Handle 'standalone' mode or no active evacuation - auto-create one
      if (!evacuation || evacuation.length === 0) {
        logger.info(`STANDALONE MODE: Fire Marshal ${marshalName} marking person safe without active evacuation - auto-creating emergency evacuation`);
        
        // Auto-create an emergency evacuation on-demand
        const newEvacuationId = `fire-marshal-${Date.now()}`;
        const customerDbConnection = customerId;
        
        evacuation = [{
          evacuationId: newEvacuationId,
          customerId: customerDbConnection || '',
          activatedBy: marshalName,
          startedAt: new Date(),
          status: 'active',
          musterPoints: ['Safe Location'],
          totalPeopleOnSite: 0,
          totalAccountedFor: 0
        }];
        
        // Insert the emergency evacuation record
        await db.insert(evacuations).values(evacuation[0] as any);
        
        // Create accountability records for all on-site personnel
        const customerDb = await customerDbService.getCustomerDatabase(customerDbConnection);
        
        // Get checked-in staff
        const checkedInStaff = await customerDb
          .select()
          .from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.isCheckedIn, true));
        
        // Get current visitors
        const currentVisitors = await customerDb
          .select()
          .from(isolatedSchema.visitors)
          .where(eq(isolatedSchema.visitors.isCheckedIn, true));
        
        // Get checked-in contractors
        const checkedInContractors = await customerDb
          .select()
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.isCheckedIn, true));
        
        // Create accountability records for all personnel
        const accountabilityRecords = [
          ...checkedInStaff.map(s => ({
            evacuationId: newEvacuationId,
            customerId: customerDbConnection || '',
            personId: s.id,
            personType: 'staff' as any,
            personName: `${s.firstName} ${s.lastName}`,
            department: s.department,
            lastKnownLocation: 'Building A',
            isAccountedFor: false
          })),
          ...currentVisitors.map(v => ({
            evacuationId: newEvacuationId,
            customerId: customerDbConnection || '',
            personId: v.id,
            personType: 'visitor' as any,
            personName: `${v.firstName} ${v.lastName}`,
            company: v.company,
            lastKnownLocation: 'Reception',
            isAccountedFor: false
          })),
          ...checkedInContractors.map(c => ({
            evacuationId: newEvacuationId,
            customerId: customerDbConnection || '',
            personId: c.id,
            personType: 'contractor' as any,
            personName: `${c.firstName} ${c.lastName}`,
            department: c.department,
            lastKnownLocation: 'Site',
            isAccountedFor: false
          }))
        ];
        
        if (accountabilityRecords.length > 0) {
          await db.insert(evacuationAccountability).values(accountabilityRecords as any);
        }
        
        // Update total people count
        await db
          .update(evacuations)
          .set({ totalPeopleOnSite: accountabilityRecords.length })
          .where(eq(evacuations.evacuationId, newEvacuationId));
        
        logger.info(`Auto-created emergency evacuation: ${newEvacuationId} with ${accountabilityRecords.length} people`);
        
        // Use the newly created evacuation ID for the rest of the function
        evacuationId = newEvacuationId;
      }
      
      const customerIdFinal = evacuation[0].customerId;
      logger.info(`Found evacuation for customer: ${customerIdFinal}`);
      
      // Update evacuationAccountability record with customer context
      const result = await db
        .update(evacuationAccountability)
        .set({
          isAccountedFor: true,
          accountedBy: marshalName,
          accountedAt: accountedAtValue,
          musterPoint,
          statusOption: statusOption ?? null,
          updatedAt: new Date()
        } as any)
        .where(
          and(
            eq(evacuationAccountability.evacuationId, evacuationId),
            eq(evacuationAccountability.personId, personId),
            eq(evacuationAccountability.customerId, customerIdFinal as any)
          )
        )
        .returning();

      logger.info(`Update result: ${result.length} rows updated`);

      if (result.length === 0) {
        logger.info(`Person not in accountability table - creating record (late check-in). PersonID: ${personId}, EvacID: ${evacuationId}`);
        
        let personName = 'Unknown';
        let personType = 'staff';
        let department: string | null = null;
        let company: string | null = null;
        
        const customerDb = await customerDbService.getCustomerDatabase(customerIdFinal);
        
        const [staffMatch] = await customerDb.select().from(isolatedSchema.staff).where(eq(isolatedSchema.staff.id, personId)).limit(1);
        if (staffMatch) {
          personName = `${staffMatch.firstName} ${staffMatch.lastName}`;
          personType = 'staff';
          department = staffMatch.department;
        } else {
          const [visitorMatch] = await customerDb.select().from(isolatedSchema.visitors).where(eq(isolatedSchema.visitors.id, personId)).limit(1);
          if (visitorMatch) {
            personName = `${visitorMatch.firstName} ${visitorMatch.lastName}`;
            personType = 'visitor';
            company = visitorMatch.company;
          } else {
            const [contractorMatch] = await customerDb.select().from(isolatedSchema.contractorWorkers).where(eq(isolatedSchema.contractorWorkers.id, personId)).limit(1);
            if (contractorMatch) {
              personName = `${contractorMatch.firstName} ${contractorMatch.lastName}`;
              personType = 'contractor';
              department = contractorMatch.department;
            } else {
              try {
                const [memberMatch] = await customerDb.select().from(isolatedSchema.members).where(eq(isolatedSchema.members.id, personId)).limit(1);
                if (memberMatch) {
                  personName = `${memberMatch.firstName} ${memberMatch.lastName}`;
                  personType = 'member';
                  company = (memberMatch as any).company;
                }
              } catch (e) {}
            }
          }
        }
        
        // Guard against concurrent late-check-in duplicates
        const existingRecord = await db
          .select()
          .from(evacuationAccountability)
          .where(
            and(
              eq(evacuationAccountability.evacuationId, evacuationId),
              eq(evacuationAccountability.personId, personId),
              eq(evacuationAccountability.customerId, customerIdFinal as any)
            )
          )
          .limit(1);
        
        let insertResult;
        if (existingRecord.length > 0) {
          insertResult = await db
            .update(evacuationAccountability)
            .set({ isAccountedFor: true, accountedBy: marshalName, accountedAt: accountedAtValue, musterPoint, statusOption: statusOption ?? null, updatedAt: new Date() } as any)
            .where(
              and(
                eq(evacuationAccountability.evacuationId, evacuationId),
                eq(evacuationAccountability.personId, personId),
                eq(evacuationAccountability.customerId, customerIdFinal as any)
              )
            )
            .returning();
        } else {
          insertResult = await db.insert(evacuationAccountability).values({
            evacuationId,
            customerId: customerIdFinal || '',
            personId,
            personType: personType as any,
            personName,
            department,
            company,
            lastKnownLocation: musterPoint || 'Safe Location',
            isAccountedFor: true,
            accountedBy: marshalName,
            accountedAt: accountedAtValue,
            musterPoint
          }).returning();
        };
        
        if (insertResult.length > 0) {
          logger.info(`Created accountability record and marked safe: ${personName}`);
          result.push(insertResult[0]);
        } else {
          logger.error(`Failed to create accountability record for PersonID: ${personId}`);
          return res.status(500).json({ error: "Failed to create accountability record" });
        }
      }
      
      // Update the evacuation's total accounted count
      const accountedCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(evacuationAccountability)
        .where(
          and(
            eq(evacuationAccountability.evacuationId, evacuationId),
            eq(evacuationAccountability.isAccountedFor, true)
          )
        );
      
      await db
        .update(evacuations)
        .set({
          totalAccountedFor: accountedCount[0].count,
          updatedAt: new Date()
        })
        .where(eq(evacuations.evacuationId, evacuationId));
      
      logger.info(`Person marked safe successfully - ${result[0].personName} at ${musterPoint}`);
      
      // CRITICAL: Broadcast WebSocket update to all connected Fire Marshals for real-time sync
      if (customerId && evacuationId) {
        websocketService.broadcastMusterUpdate(customerId, evacuationId, {
          personId: result[0].personId,
          personName: result[0].personName,
          personType: result[0].personType as any,
          isAccountedFor: result[0].isAccountedFor,
          musterPoint: result[0].musterPoint
        });
        logger.info(`WebSocket broadcast sent for ${result[0].personName} (Customer: ${customerId}, Evacuation: ${evacuationId})`);
      }
      
      res.json({ 
        success: true,
        message: `Person marked as safe at ${musterPoint}`,
        personId,
        personName: result[0].personName,  // Include person name for UI feedback
        marshalName,
        evacuationId  // Include evacuation ID for frontend to track
      });
    } catch (error) {
      logger.error("Error marking person safe:", error);
      logger.error("Error details:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to update accountability status" });
    }
  });

  // QR-code muster mark-safe — Fire Marshal scans any staff/visitor/contractor badge
  // POST /api/emergency/qr-mark-safe
  // Auth: X-Fire-Marshal-Id header (same as mark-safe)
  app.post("/api/emergency/qr-mark-safe", async (req, res) => {
    try {
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      if (!fireMarshalId) {
        return res.status(401).json({ success: false, message: "Fire Marshal authentication required" });
      }
      const marshal = await databaseService.findFireMarshalByUrlId(fireMarshalId);
      if (!marshal) {
        return res.status(401).json({ success: false, message: "Invalid Fire Marshal link" });
      }

      const { qrData, marshalName: providedMarshalName } = req.body;
      if (!qrData) {
        return res.status(400).json({ success: false, message: "QR code data is required" });
      }

      const customerId = marshal.customerId;
      const marshalName = providedMarshalName || `${marshal.marshal.firstName} ${marshal.marshal.lastName}`;
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      const context = simpleDatabaseService.createCustomerContext(marshal.marshal.firstName, customerId);

      // Identify the person from the QR code
      let personId: string | null = null;
      let personName: string | null = null;
      let personType: string | null = null;

      // 1. Try staff
      const staffMatch = await databaseService.getStaffByQrCode(context, qrData);
      if (staffMatch) {
        personId = staffMatch.id;
        personName = `${staffMatch.firstName} ${staffMatch.lastName}`;
        personType = 'staff';
      }

      // 2. Try visitors
      if (!personId) {
        const visitorMatch = await databaseService.getVisitorByQrCode(context, qrData);
        if (visitorMatch) {
          personId = visitorMatch.id;
          personName = `${visitorMatch.firstName} ${visitorMatch.lastName}`;
          personType = 'visitor';
        }
      }

      // 3. Try contractor workers (by qrCode field)
      if (!personId) {
        const [workerMatch] = await customerDb
          .select()
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.qrCode, qrData))
          .limit(1);
        if (workerMatch) {
          personId = workerMatch.id;
          personName = `${workerMatch.firstName} ${workerMatch.lastName}`;
          personType = 'contractor';
        }
      }

      // 4. Try pre-booking QR (visitors arriving via pre-booked QR)
      if (!personId) {
        const lookupCode = qrData.startsWith('PRE-') ? qrData.replace('PRE-', '') : qrData;
        const [pb] = await customerDb
          .select()
          .from(isolatedSchema.preBookings)
          .where(eq(isolatedSchema.preBookings.qrCode, lookupCode))
          .limit(1);
        if (pb && pb.visitorId) {
          personId = pb.visitorId;
          personName = `${pb.visitorFirstName} ${pb.visitorLastName}`;
          personType = 'visitor';
        }
      }

      if (!personId || !personName) {
        return res.json({ success: false, message: "QR code not recognised. This badge is not in the system." });
      }

      // Find the active evacuation for this customer
      const [activeEvac] = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId as any),
          eq(evacuations.status, 'active')
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      if (!activeEvac) {
        return res.json({
          success: false,
          personName,
          personType,
          message: "No active evacuation. Start an evacuation first."
        });
      }

      const evacuationId = activeEvac.evacuationId;
      const customerIdFinal = activeEvac.customerId;

      // Check if already accounted for
      const [existing] = await db
        .select()
        .from(evacuationAccountability)
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.personId, personId),
          eq(evacuationAccountability.customerId, customerIdFinal as any)
        ))
        .limit(1);

      if (existing?.isAccountedFor) {
        return res.json({
          success: true,
          alreadySafe: true,
          personName,
          personType,
          personId,
          message: `${personName} is already marked safe.`
        });
      }

      // Mark safe — update existing record or insert if not yet in the accountability table
      const updateResult = await db
        .update(evacuationAccountability)
        .set({ isAccountedFor: true, accountedBy: marshalName, accountedAt: new Date(), musterPoint: 'QR Scan', updatedAt: new Date() })
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.personId, personId),
          eq(evacuationAccountability.customerId, customerIdFinal as any)
        ))
        .returning();

      if (updateResult.length === 0) {
        // Late arrival — create accountability record on the spot
        await db.insert(evacuationAccountability).values({
          evacuationId,
          customerId: customerIdFinal || '',
          personId,
          personType: personType as any,
          personName,
          isAccountedFor: true,
          accountedBy: marshalName,
          accountedAt: new Date(),
          musterPoint: 'QR Scan',
        } as any);
      }

      // Refresh the accounted-for count on the evacuation
      const [{ count: accountedCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(evacuationAccountability)
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.isAccountedFor, true)
        ));
      await db.update(evacuations)
        .set({ totalAccountedFor: accountedCount, updatedAt: new Date() })
        .where(eq(evacuations.evacuationId, evacuationId));

      // Broadcast WS update so all Fire Marshal screens refresh instantly
      websocketService.broadcastMusterUpdate(customerId, evacuationId, {
        personId,
        personName,
        personType: personType as any,
        isAccountedFor: true,
        musterPoint: 'QR Scan'
      });

      logger.info(`QR mark-safe: ${personName} (${personType}) by ${marshalName}`);
      return res.json({ success: true, personName, personType, personId, evacuationId, message: `${personName} marked safe.` });
    } catch (error) {
      logger.error("QR mark-safe error:", error);
      res.status(500).json({ success: false, message: "Failed to process QR scan." });
    }
  });

  // Unmark a person as safe (Fire Marshal URL auth — mirrors mark-safe pattern)
  app.post("/api/emergency/unmark-safe/:personId", async (req, res) => {
    try {
      let customerId: string | null = null;
      let marshalName = 'Fire Marshal';

      const emergencyToken = req.emergencyToken;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;

      if (emergencyToken) {
        const emCtx = simpleDatabaseService.createDevelopmentContext();
        const validatedStaff = await databaseService.validateEmergencyToken(emCtx, emergencyToken);
        if (!validatedStaff) return res.status(401).json({ error: "Invalid or expired emergency token" });
        customerId = validatedStaff.customerId;
        marshalName = `${validatedStaff.firstName} ${validatedStaff.lastName}`;
      } else if (fireMarshalId) {
        const marshal = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!marshal) return res.status(401).json({ error: "Invalid Fire Marshal link" });
        customerId = marshal.customerId;
        marshalName = `${marshal.marshal.firstName} ${marshal.marshal.lastName}`;
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { personId } = req.params;

      // Find the active evacuation for this customer
      const [activeEvac] = await db
        .select()
        .from(evacuations)
        .where(and(eq(evacuations.customerId, customerId as any), eq(evacuations.status, 'active')))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      if (!activeEvac) return res.status(404).json({ error: "No active evacuation found" });

      const result = await db
        .update(evacuationAccountability)
        .set({ isAccountedFor: false, updatedAt: new Date() })
        .where(and(
          eq(evacuationAccountability.evacuationId, activeEvac.evacuationId),
          eq(evacuationAccountability.personId, personId),
          eq(evacuationAccountability.customerId, customerId as any)
        ))
        .returning();

      if (result.length === 0) return res.status(404).json({ error: "Person not found in accountability list" });

      // Update evacuation accounted count
      const accountedCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(evacuationAccountability)
        .where(and(eq(evacuationAccountability.evacuationId, activeEvac.evacuationId), eq(evacuationAccountability.isAccountedFor, true)));
      await db.update(evacuations).set({ totalAccountedFor: accountedCount[0].count, updatedAt: new Date() }).where(eq(evacuations.evacuationId, activeEvac.evacuationId));

      // Broadcast WebSocket update
      websocketService.broadcastMusterUpdate(customerId, activeEvac.evacuationId, {
        personId: result[0].personId,
        personName: result[0].personName,
        personType: result[0].personType as any,
        isAccountedFor: false,
      });

      res.json({ success: true, personId, personName: result[0].personName, isAccountedFor: false });
    } catch (error) {
      logger.error("Error unmarking person safe:", error);
      res.status(500).json({ error: "Failed to unmark person" });
    }
  });

  // Send update to all Fire Marshals
  app.post("/api/emergency/send-update", requireAuth, async (req, res) => {
    try {
      const { evacuationId } = req.body;
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all Fire Marshals
      const checkedInStaff = await databaseService.getCheckedInStaff(context);
      const fireMarshals = checkedInStaff.filter(s => 
        s.department?.toLowerCase().includes('safety') || 
        s.department?.toLowerCase().includes('security') ||
        s.isFireMarshal === true
      );

      // Get updated accountability data
      const currentVisitors = await databaseService.getCurrentVisitors(context);
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      const customEmailService = new EmailService(req.customerId);

      const evacuationData = {
        timestamp: new Date().toISOString(),
        totalPeople: checkedInStaff.length + currentVisitors.length,
        staff: checkedInStaff.length,
        visitors: currentVisitors.length,
        accountedFor: [...checkedInStaff, ...currentVisitors].filter(p => p.isAccountedFor).length
      };

      // Send update emails to all Fire Marshals
      let sent = 0;
      for (const marshal of fireMarshals) {
        if (marshal.email) {
          try {
            await customEmailService.sendFireMarshalAlert(
              marshal.email,
              `${marshal.firstName} ${marshal.lastName}`,
              evacuationData,
              [...checkedInStaff, ...currentVisitors],
              companySettings!
            );
            sent++;
          } catch (error) {
            logger.error(`Failed to send update to [name]:`, error);
          }
        }
      }

      res.json({ 
        success: true,
        message: `Update sent to ${sent} Fire Marshals`,
        sent,
        total: fireMarshals.length
      });
    } catch (error) {
      logger.error("Error sending Fire Marshal update:", error);
      res.status(500).json({ error: "Failed to send update" });
    }
  });

  // Send nudge emails to unaccounted personnel during an active emergency
  app.post("/api/emergency/nudge-unaccounted", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const context = simpleDatabaseService.createCustomerContext(req.user!.username, customerId);
      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Get active evacuation
      const activeEvacs = await db
        .select()
        .from(evacuations)
        .where(and(eq(evacuations.status, 'active'), eq(evacuations.customerId, customerId)))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      if (!activeEvacs.length) {
        return res.status(400).json({ error: "No active evacuation" });
      }

      const evac = activeEvacs[0];
      const evacuationId = evac.evacuationId;
      const isDrill = (evac as any).isDrill || false;

      const companySettings = await databaseService.getCompanySettings(context);
      const customEmailService = new EmailService(companySettings);

      // Build accountability map from DB
      const accountabilityRecords = await db
        .select()
        .from(evacuationAccountability)
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.customerId, customerId)
        ));
      const accountabilityMap = new Map<string, boolean>();
      accountabilityRecords.forEach((r: any) => accountabilityMap.set(r.personId, r.isAccountedFor));

      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getCheckedInContractors(context),
      ]);

      const nudgeMsg = isDrill
        ? 'FIRE DRILL: You have not yet been accounted for. Please proceed to the muster point and confirm you are safe.'
        : 'You have not yet been accounted for at the muster point. Please proceed there immediately and confirm you are safe.';

      let nudgesSent = 0;
      let nudgesSkipped = 0;
      const errors: string[] = [];

      // Helper to nudge one person
      const nudgePerson = async (
        id: string,
        firstName: string,
        lastName: string,
        email: string | null | undefined,
        personType: 'staff' | 'visitor' | 'contractor'
      ) => {
        const accounted = accountabilityMap.get(id) ?? false;
        if (accounted || !email) {
          nudgesSkipped++;
          return;
        }
        try {
          const safetyToken = await generateSafetyToken(custDb, customerId, evacuationId, id, personType, `${firstName} ${lastName}`, email);
          await customEmailService.sendEvacuationAlert(email, `${firstName} ${lastName}`, nudgeMsg, companySettings!, safetyToken, isDrill);
          nudgesSent++;
        } catch (e: any) {
          errors.push(`${personType} ${firstName} ${lastName}: ${e.message}`);
        }
      };

      for (const s of checkedInStaff) {
        await nudgePerson(s.id, s.firstName, s.lastName, (s as any).email, 'staff');
      }
      for (const v of currentVisitors) {
        await nudgePerson(v.id, v.firstName, v.lastName, v.email, 'visitor');
      }
      for (const c of checkedInContractors) {
        await nudgePerson(c.id, c.firstName, c.lastName, (c as any).email, 'contractor');
      }

      logger.info(`NUDGE UNACCOUNTED: Sent ${nudgesSent} nudge emails, ${nudgesSkipped} already safe or no email`);
      res.json({ sent: nudgesSent, skipped: nudgesSkipped, errors });
    } catch (error) {
      logger.error("Error sending nudge emails:", error);
      res.status(500).json({ error: "Failed to send nudge emails" });
    }
  });

  // In-memory rate limit for individual person email reminders: key = `customerId:personId`, value = timestamp
  const emailPersonRateLimit = new globalThis.Map<string, number>();

  // Send individual email reminder to one unaccounted person during an active emergency
  app.post("/api/emergency/email-person/:personType/:personId", async (req, res) => {
    try {
      let customerId: string | null = null;

      // Support both session auth (admin) and fire marshal token
      const { token } = req.body || {};

      if (req.session?.customerId) {
        customerId = req.customerId;
      } else if (token) {
        // Use development/cross-schema context to validate token, then derive customer from the marshal record
        const devContext = simpleDatabaseService.createDevelopmentContext();
        const marshal = await databaseService.validateEmergencyToken(devContext, token);
        if (!marshal) {
          return res.status(401).json({ error: "Invalid or expired emergency token" });
        }
        customerId = (marshal as any).customerId;
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { personType, personId } = req.params;

      if (!['staff', 'visitor', 'contractor'].includes(personType)) {
        return res.status(400).json({ error: "Invalid person type" });
      }

      // Rate limit: once per person per 5 minutes
      const rateLimitKey = `${customerId}:${personId}`;
      const now = Date.now();
      const lastSent = emailPersonRateLimit.get(rateLimitKey);
      if (lastSent && now - lastSent < 5 * 60 * 1000) {
        const remainingSeconds = Math.ceil((5 * 60 * 1000 - (now - lastSent)) / 1000);
        return res.status(429).json({
          error: `Please wait ${remainingSeconds} seconds before sending another reminder to this person`,
          remainingSeconds,
        });
      }

      // Validate active evacuation
      const activeEvacs = await db
        .select()
        .from(evacuations)
        .where(and(eq(evacuations.status, 'active'), eq(evacuations.customerId, customerId)))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      if (!activeEvacs.length) {
        return res.status(400).json({ error: "No active evacuation" });
      }

      const evac = activeEvacs[0];
      const evacuationId = evac.evacuationId;
      const isDrill = (evac as any).isDrill || false;

      // Server-side unaccounted guard: do not send if already marked safe
      const [accountabilityRecord] = await db
        .select()
        .from(evacuationAccountability)
        .where(
          and(
            eq(evacuationAccountability.evacuationId, evacuationId),
            eq(evacuationAccountability.customerId, customerId),
            eq(evacuationAccountability.personId, personId)
          )
        )
        .limit(1);

      if (accountabilityRecord?.isAccountedFor) {
        return res.status(409).json({ error: "This person has already been marked as accounted for" });
      }

      const context = simpleDatabaseService.createCustomerContext('system', customerId);
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const companySettings = await databaseService.getCompanySettings(context);
      const customEmailService = new EmailService(companySettings);

      // Look up person email by type
      let personEmail: string | null = null;
      let personName = '';

      if (personType === 'staff') {
        const staffMember = await databaseService.getStaffById(context, personId);
        if (!staffMember) return res.status(404).json({ error: "Person not found" });
        personEmail = staffMember.email || null;
        personName = `${staffMember.firstName} ${staffMember.lastName}`;
      } else if (personType === 'visitor') {
        const visitor = await databaseService.getVisitorById(context, personId);
        if (!visitor) return res.status(404).json({ error: "Person not found" });
        personEmail = visitor.email || null;
        personName = `${visitor.firstName} ${visitor.lastName}`;
      } else if (personType === 'contractor') {
        const [worker] = await custDb
          .select()
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.id, personId))
          .limit(1);
        if (!worker) return res.status(404).json({ error: "Person not found" });
        personEmail = (worker as any).email || null;
        personName = `${worker.firstName} ${worker.lastName}`;
      }

      if (!personEmail) {
        return res.status(400).json({ error: "This person has no email address on file" });
      }

      // Reuse an existing unexpired, unused safety token if available; otherwise generate a new one
      const now2 = new Date();
      const existingTokenRows = await custDb
        .select()
        .from(isolatedSchema.safetyTokens)
        .where(
          and(
            eq(isolatedSchema.safetyTokens.evacuationId, evacuationId),
            eq(isolatedSchema.safetyTokens.personId, personId),
            eq(isolatedSchema.safetyTokens.isUsed, false)
          )
        )
        .limit(1);
      const existingToken = existingTokenRows[0];
      const safetyToken = existingToken && existingToken.expiresAt > now2
        ? existingToken.token
        : await generateSafetyToken(custDb, customerId, evacuationId, personId, personType as 'staff' | 'visitor' | 'contractor', personName, personEmail);

      // Build contextual emergency message using evacuation details
      const evacStartTime = evac.startedAt
        ? new Date(evac.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : 'earlier today';
      const nudgeMsg = isDrill
        ? `FIRE DRILL REMINDER: A fire drill was initiated at ${evacStartTime}. We cannot account for you at the muster point. Please proceed there now and confirm you are safe.`
        : `URGENT EVACUATION REMINDER: An emergency evacuation was initiated at ${evacStartTime}. We cannot account for you at the muster point. Please proceed to safety immediately and confirm you are safe using the link below.`;

      await customEmailService.sendEvacuationAlert(personEmail, personName, nudgeMsg, companySettings!, safetyToken, isDrill);

      // Update rate limit map
      emailPersonRateLimit.set(rateLimitKey, now);

      logger.info(`INDIVIDUAL NUDGE: Sent reminder to ${personName} (${personEmail}) during evacuation ${evacuationId}`);

      res.json({ success: true, message: `Reminder sent to ${personName}` });
    } catch (error) {
      logger.error("Error sending individual reminder:", error);
      res.status(500).json({ error: "Failed to send reminder email" });
    }
  });

  app.post("/api/emergency/complete-evacuation", async (req, res) => {
    try {
      let validatedStaff: any = null;
      
      // Support all three authentication methods.
      // Note: req.emergencyToken is set by CSRF middleware for other emergency endpoints;
      // for complete-evacuation we also read the header directly since it bypasses that block.
      const emergencyToken = req.emergencyToken
        || (req.headers['x-emergency-token'] as string)
        || (req.query.token as string);
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      let customerId: string;
      
      if (emergencyToken) {
        const emContext3 = simpleDatabaseService.createDevelopmentContext();
        validatedStaff = await databaseService.validateEmergencyToken(emContext3, emergencyToken);
        if (!validatedStaff) {
          return res.status(401).json({ error: "Invalid or expired emergency token", code: "TOKEN_INVALID" });
        }
        customerId = validatedStaff.customerId;
      } else if (fireMarshalId) {
        const marshal = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!marshal) {
          return res.status(401).json({ error: "Invalid Fire Marshal link", code: "INVALID_MARSHAL_ID" });
        }
        validatedStaff = marshal.marshal;
        customerId = marshal.customerId;
        validatedStaff.customerId = customerId;
        logger.info(`Fire Marshal URL authenticated: ID ${validatedStaff.id} (${customerId})`);
      } else if ((req.session as any)?.userId && (req.session as any)?.customerId) {
        // Admin session auth — allows admins on the Muster page to end an evacuation
        customerId = (req.session as any).customerId;
        validatedStaff = { firstName: 'Admin', lastName: '(session)', customerId };
        logger.info(`Session-authenticated admin ending evacuation for customer: ${customerId}`);
      } else {
        return res.status(401).json({ error: "Authentication required", code: "AUTH_REQUIRED" });
      }

      const { evacuationId: requestedEvacuationId, checkOutMode } = req.body;

      if (!checkOutMode || !['keep_checked_in', 'check_out_all'].includes(checkOutMode)) {
        return res.status(400).json({ error: "Valid checkOutMode required: 'keep_checked_in' or 'check_out_all'" });
      }

      // Resolve to latest active evacuation for this customer
      const latestEvacs = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId),
          eq(evacuations.status, 'active')
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      let evacuationId: string;
      
      if (latestEvacs.length > 0) {
        evacuationId = latestEvacs[0].evacuationId;
        if (requestedEvacuationId && requestedEvacuationId !== evacuationId) {
          logger.info(`Complete Evacuation: Resolved stale evacuationId ${requestedEvacuationId} -> latest: ${evacuationId}`);
        }
      } else if (requestedEvacuationId) {
        const specificEvac = await db
          .select()
          .from(evacuations)
          .where(and(
            eq(evacuations.evacuationId, requestedEvacuationId),
            eq(evacuations.customerId, customerId)
          ))
          .limit(1);
        if (specificEvac.length > 0) {
          evacuationId = specificEvac[0].evacuationId;
        } else {
          return res.status(404).json({ error: "Evacuation not found" });
        }
      } else {
        return res.status(404).json({ error: "No active evacuation found" });
      }

      logger.info(`COMPLETE EVACUATION - EvacID: ${evacuationId}, Mode: ${checkOutMode}, By: ID ${validatedStaff.id} (Customer: ${customerId})`);
      
      const context = { customerId };

      // Mark evacuation as completed
      await db
        .update(evacuations)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(evacuations.evacuationId, evacuationId));

      let checkedOutCount = 0;
      let staffCheckedOut = 0;
      let visitorsCheckedOut = 0;
      let contractorsCheckedOut = 0;

      // If check_out_all mode, check out ALL currently on-site personnel
      if (checkOutMode === 'check_out_all') {
        const custDb = await customerDbService.getCustomerDatabase(customerId);

        // Fetch all currently checked-in people from the isolated customer DB
        const [onSiteStaff, onSiteVisitors, onSiteContractors] = await Promise.all([
          custDb.select({ id: isolatedSchema.staff.id }).from(isolatedSchema.staff).where(eq(isolatedSchema.staff.isCheckedIn, true)),
          custDb.select({ id: isolatedSchema.visitors.id }).from(isolatedSchema.visitors).where(eq(isolatedSchema.visitors.isCheckedIn, true)),
          custDb.select({ id: isolatedSchema.contractorWorkers.id }).from(isolatedSchema.contractorWorkers).where(eq(isolatedSchema.contractorWorkers.isCheckedIn, true)),
        ]);

        logger.info(`Checking out all on-site: ${onSiteStaff.length} staff, ${onSiteVisitors.length} visitors, ${onSiteContractors.length} contractors`);

        for (const s of onSiteStaff) {
          try { await databaseService.checkOutStaff(context, s.id); staffCheckedOut++; checkedOutCount++; }
          catch (e: any) { logger.error(`Failed to check out staff ${s.id}:`, e.message); }
        }
        for (const v of onSiteVisitors) {
          try { await databaseService.checkOutVisitor(context, v.id); visitorsCheckedOut++; checkedOutCount++; }
          catch (e: any) { logger.error(`Failed to check out visitor ${v.id}:`, e.message); }
        }
        for (const c of onSiteContractors) {
          try { await databaseService.checkOutContractorWorker(context, c.id); contractorsCheckedOut++; checkedOutCount++; }
          catch (e: any) { logger.error(`Failed to check out contractor ${c.id}:`, e.message); }
        }
      }

      logger.info(`Evacuation completed - Mode: ${checkOutMode}, Checked out: ${checkedOutCount} people`);

      // Auto-save incident report record for this completed evacuation
      try {
        const completedEvacs = await db
          .select()
          .from(evacuations)
          .where(eq(evacuations.evacuationId, evacuationId))
          .limit(1);
        const completedEvac = completedEvacs[0];
        const allAccountability = await db
          .select()
          .from(evacuationAccountability)
          .where(and(
            eq(evacuationAccountability.evacuationId, evacuationId),
            eq(evacuationAccountability.customerId, customerId)
          ));
        const accountedCt = allAccountability.filter(p => p.isAccountedFor).length;
        const totalCt = allAccountability.length;
        const unaccountedCt = totalCt - accountedCt;
        const pct = totalCt > 0 ? Math.round((accountedCt / totalCt) * 100) : 0;
        const startMs = completedEvac?.startedAt ? new Date(completedEvac.startedAt).getTime() : 0;
        const endMs = new Date().getTime();
        const durSec = startMs ? Math.round((endMs - startMs) / 1000) : null;

        // Teams notification — evacuation ended, fire and forget
        const _teamsSchemaEnd = customerDbService.generateSchemaName(customerId);
        const _durStr = durSec ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : 'Unknown';
        sendTeamsNotification(_teamsSchemaEnd, 'evacuation_ended', {
          eventType: 'evacuation_ended',
          title: completedEvac?.isDrill ? '✅ Evacuation drill complete' : '✅ Evacuation complete',
          summary: `The evacuation at site has been marked as complete.`,
          facts: [
            { name: 'Duration', value: _durStr },
            { name: 'Accounted for', value: `${accountedCt} of ${totalCt}` },
            { name: 'Unaccounted', value: String(totalCt - accountedCt) },
            { name: 'Completion', value: `${pct}%` },
          ],
        }).catch(() => {});
        const custDb = await customerDbService.getCustomerDatabase(customerId);
        const reportUrl = `/api/emergency/incident-report/${evacuationId}`;
        const existing = await custDb.select({ id: isolatedSchema.incidentReports.id })
          .from(isolatedSchema.incidentReports)
          .where(eq(isolatedSchema.incidentReports.evacuationId, evacuationId))
          .limit(1);
        if (existing.length === 0) {
          await custDb.insert(isolatedSchema.incidentReports).values({
            evacuationId,
            customerId,
            isDrill: completedEvac?.isDrill || false,
            activatedBy: completedEvac?.activatedBy || null,
            startedAt: completedEvac?.startedAt ? new Date(completedEvac.startedAt) : null,
            completedAt: new Date(),
            durationSeconds: durSec,
            totalOnSite: totalCt,
            accountedFor: accountedCt,
            unaccounted: unaccountedCt,
            completionPct: pct,
            generatedAt: new Date(),
            reportUrl,
          });
          logger.info(`Incident report record saved for evacuation ${evacuationId}`);

          // ── Email incident report summary to all designated Fire Marshals ──
          try {
            // Fetch all active fire marshal staff who have an email
            const fmStaff = await custDb
              .select({
                id: isolatedSchema.staff.id,
                firstName: isolatedSchema.staff.firstName,
                lastName: isolatedSchema.staff.lastName,
                email: isolatedSchema.staff.email,
              })
              .from(isolatedSchema.staff)
              .where(and(
                eq(isolatedSchema.staff.isFireMarshal, true),
                eq(isolatedSchema.staff.isActive, true),
              ));

            const fmWithEmail = fmStaff.filter(fm => fm.email?.trim());

            if (fmWithEmail.length > 0) {
              // Get company name from settings for the email
              let companyName = 'Your Organisation';
              try {
                const settingsRows = await custDb
                  .select({ companyName: isolatedSchema.companySettings.companyName })
                  .from(isolatedSchema.companySettings)
                  .limit(1);
                if (settingsRows[0]?.companyName) companyName = settingsRows[0].companyName;
              } catch { /* ignore — use fallback */ }

              const isDrillLabel = completedEvac?.isDrill ? '[FIRE DRILL] ' : '';
              const eventLabel = completedEvac?.isDrill ? 'Fire Drill' : 'Emergency Evacuation';
              const durLabel = durSec !== null
                ? durSec >= 60
                  ? `${Math.floor(durSec / 60)} min ${durSec % 60} sec`
                  : `${durSec} sec`
                : 'Unknown';
              const pctColour = pct >= 100 ? '#16a34a' : pct >= 75 ? '#d97706' : '#dc2626';
              const subject = `${isDrillLabel}Incident Report — ${eventLabel} completed`;
              const headerBg = completedEvac?.isDrill ? '#d97706' : '#dc2626';
              const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

              // ── Build the full report HTML for the PDF attachment ──────────────────
              const escPdf = (s: string | null | undefined): string => {
                if (!s) return '—';
                return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
              };
              const startedAt = completedEvac?.startedAt ? new Date(completedEvac.startedAt) : new Date();
              const completedAt = completedEvac?.completedAt ? new Date(completedEvac.completedAt) : new Date();
              const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

              // Fetch notes + photos for the attachment
              let fmNotes: any[] = [];
              let fmPhotos: any[] = [];
              try {
                fmNotes = await custDb.select().from(isolatedSchema.evacuationNotes)
                  .where(eq(isolatedSchema.evacuationNotes.evacuationId, evacuationId))
                  .orderBy(isolatedSchema.evacuationNotes.createdAt);
              } catch { /* table may not exist */ }
              try {
                fmPhotos = await custDb.select().from(isolatedSchema.evacuationPhotos)
                  .where(eq(isolatedSchema.evacuationPhotos.evacuationId, evacuationId))
                  .orderBy(isolatedSchema.evacuationPhotos.createdAt);
              } catch { /* table may not exist */ }

              const accounted = allAccountability.filter((p: any) => p.isAccountedFor);
              const unaccountedPeople = allAccountability.filter((p: any) => !p.isAccountedFor);

              const personRows = (people: any[]) => people.map(p => `
                <tr style="border-bottom:1px solid #e5e7eb;">
                  <td style="padding:5px 8px;">${escPdf(p.personName)}</td>
                  <td style="padding:5px 8px;text-transform:capitalize;">${escPdf(p.personType)}</td>
                  <td style="padding:5px 8px;">${escPdf(p.department || p.company)}</td>
                  <td style="padding:5px 8px;">${escPdf(p.lastKnownLocation)}</td>
                  <td style="padding:5px 8px;text-align:center;">${p.isAccountedFor
                    ? `<span style="color:#16a34a;font-weight:bold;">&#10003; Accounted</span>`
                    : `<span style="color:#dc2626;font-weight:bold;">&#10007; Missing</span>`}
                  </td>
                  <td style="padding:5px 8px;">${p.accountedAt ? fmtTime(new Date(p.accountedAt)) : '—'}</td>
                </tr>`).join('');

              const reportHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${escPdf(eventLabel)} — Incident Report</title>
<style>
  body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px;font-size:13px}
  h1{color:${headerBg};margin:0 0 4px}
  h2{color:#1a2e4a;margin:20px 0 6px;font-size:14px;border-bottom:2px solid #1a2e4a;padding-bottom:3px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#1a2e4a;color:#fff;padding:7px 8px;text-align:left}
  .stat-box{display:inline-block;background:#f3f4f6;border-radius:6px;padding:10px 18px;margin:4px 6px 4px 0;min-width:90px;text-align:center}
  .stat-num{font-size:24px;font-weight:bold;color:#1a2e4a}
  .stat-lbl{font-size:10px;color:#555}
  .kv{margin:3px 0} .kv strong{display:inline-block;min-width:180px}
  ${completedEvac?.isDrill ? '.drill{background:#fef3c7;border:2px solid #d97706;border-radius:6px;padding:10px 16px;margin-bottom:12px;text-align:center;color:#92400e;font-weight:bold}' : ''}
  @media print{body{padding:0}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${headerBg};padding-bottom:12px;margin-bottom:14px">
  <div><h1>${isDrillLabel}${eventLabel} — Incident Report</h1><p style="margin:2px 0;color:#555;font-size:12px">Ref: ${escPdf(evacuationId)}</p></div>
  <div style="text-align:right;font-size:12px;color:#555"><strong>${escPdf(companyName)}</strong><br>Generated: ${fmtDate(new Date())} ${fmtTime(new Date())}</div>
</div>
${completedEvac?.isDrill ? '<div class="drill">&#128998; FIRE DRILL — This was a scheduled drill, NOT a real emergency.</div>' : ''}
<h2>Event Summary</h2>
<div class="kv"><strong>Event type:</strong> ${escPdf(eventLabel)}</div>
<div class="kv"><strong>Activated by:</strong> ${escPdf(completedEvac?.activatedBy)}</div>
<div class="kv"><strong>Alarm raised:</strong> ${fmtDate(startedAt)} at ${fmtTime(startedAt)}</div>
<div class="kv"><strong>All-clear given:</strong> ${fmtDate(completedAt)} at ${fmtTime(completedAt)}</div>
<div class="kv"><strong>Duration:</strong> ${durLabel}</div>
<h2>Accountability Statistics</h2>
<div>
  <div class="stat-box"><div class="stat-num">${totalCt}</div><div class="stat-lbl">Total On-Site</div></div>
  <div class="stat-box"><div class="stat-num" style="color:#16a34a">${accountedCt}</div><div class="stat-lbl">Accounted For</div></div>
  <div class="stat-box"><div class="stat-num" style="color:#dc2626">${unaccountedCt}</div><div class="stat-lbl">Unaccounted</div></div>
  <div class="stat-box"><div class="stat-num">${pct}%</div><div class="stat-lbl">Completion Rate</div></div>
</div>
${unaccountedPeople.length > 0 ? `
<h2 style="color:#dc2626">&#9888; Unaccounted Personnel (${unaccountedPeople.length})</h2>
<table><tr><th>Name</th><th>Type</th><th>Dept / Company</th><th>Last Known Zone</th><th>Status</th><th>Time</th></tr>
${personRows(unaccountedPeople)}
</table>` : '<h2 style="color:#16a34a">&#10003; All Personnel Accounted For</h2>'}
<h2>Full Personnel Register</h2>
<table><tr><th>Name</th><th>Type</th><th>Dept / Company</th><th>Last Known Zone</th><th>Status</th><th>Accounted At</th></tr>
${personRows(allAccountability)}
</table>
${fmNotes.length > 0 ? `
<h2>&#128221; Event Notes (${fmNotes.length})</h2>
${fmNotes.map((n: any) => {
  const t = new Date(n.createdAt);
  const elMin = Math.max(0, Math.floor((t.getTime() - startedAt.getTime()) / 60000));
  const elSec = Math.max(0, Math.round(((t.getTime() - startedAt.getTime()) % 60000) / 1000));
  return `<div style="border-left:3px solid #1a2e4a;padding:8px 12px;margin:6px 0;background:#f8f8f8;border-radius:4px">
    <div style="font-size:11px;color:#666;margin-bottom:4px">${fmtTime(t)} (+${elMin}m ${elSec}s) &mdash; ${escPdf(n.addedBy)}</div>
    <div>${escPdf(n.noteText)}</div>
  </div>`;
}).join('')}` : ''}
${fmPhotos.length > 0 ? `
<h2>&#128247; Photos (${fmPhotos.length})</h2>
<div style="display:flex;flex-wrap:wrap;gap:12px">
${fmPhotos.map((ph: any) => {
  const t = new Date(ph.createdAt);
  const elMin = Math.max(0, Math.floor((t.getTime() - startedAt.getTime()) / 60000));
  const elSec = Math.max(0, Math.round(((t.getTime() - startedAt.getTime()) % 60000) / 1000));
  return `<div style="max-width:220px;text-align:center">
    <img src="${ph.photoData}" style="width:220px;height:165px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb" alt="Evacuation photo">
    <div style="font-size:10px;color:#666;margin-top:3px">${fmtTime(t)} (+${elMin}m ${elSec}s)</div>
    ${ph.caption ? `<div style="font-size:11px;color:#444;margin-top:2px">${escPdf(ph.caption)}</div>` : ''}
  </div>`;
}).join('')}
</div>` : ''}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#94a3b8;text-align:center">
  This report was auto-generated by TPR Max Visitor Management System
</div>
</body></html>`;

              // Try to generate a PDF attachment (Puppeteer), fall back to HTML
              let pdfAttachment: { filename: string; content: Buffer | string; contentType: string; contentDisposition: string } | null = null;
              try {
                let puppeteer: any;
                try { puppeteer = await import('puppeteer'); } catch (importErr: any) { throw new Error(`puppeteer_import_failed: ${importErr.message}`); }
                const puppeteerLaunch = puppeteer.default?.launch ?? puppeteer.launch;
                if (!puppeteerLaunch) throw new Error('puppeteer_launch_missing');
                const browser = await puppeteerLaunch({
                  headless: true,
                  args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process',
                  ],
                });
                try {
                  const page = await browser.newPage();
                  await page.setContent(reportHtml, { waitUntil: 'domcontentloaded' });
                  const pdfBuf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
                  await browser.close();
                  pdfAttachment = { filename: `incident-report-${evacuationId}.pdf`, content: Buffer.from(pdfBuf), contentType: 'application/pdf', contentDisposition: 'attachment' };
                  logger.info(`Incident report PDF generated (${pdfBuf.byteLength} bytes)`);
                } catch (e: any) { try { await browser.close(); } catch { } throw e; }
              } catch (pdfErr: any) {
                logger.warn(`PDF generation failed for FM email (${pdfErr.message}), attaching HTML instead`);
                pdfAttachment = { filename: `incident-report-${evacuationId}.pdf.html`, content: reportHtml, contentType: 'text/html', contentDisposition: 'attachment' };
              }

              // ── Build the notification email body ──────────────────────────────────
              const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;color:#1a2e4a;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:620px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:${headerBg};color:#fff;padding:24px 28px}
  .header h1{margin:0;font-size:20px}
  .header p{margin:4px 0 0;font-size:13px;opacity:.88}
  .body{padding:28px}
  .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
  .stat{background:#f8f8f8;border-radius:8px;padding:16px;text-align:center}
  .stat .val{font-size:28px;font-weight:700;color:#1a2e4a}
  .stat .lbl{font-size:12px;color:#64748b;margin-top:4px}
  .pct{font-size:36px;font-weight:800;color:${pctColour};text-align:center;margin:8px 0}
  .attach-note{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin-top:20px;font-size:13px;color:#0c4a6e;display:flex;align-items:center;gap:10px}
  .footer{background:#f4f4f4;padding:14px 28px;font-size:11px;color:#94a3b8;text-align:center}
</style></head><body>
<div class="wrap">
  <div class="header">
    <h1>${isDrillLabel}${eventLabel} — Incident Report</h1>
    <p>${companyName} &bull; ${today}</p>
  </div>
  <div class="body">
    <p>The ${eventLabel.toLowerCase()} has been closed. Here is the final accountability summary:</p>
    <div class="pct">${pct}% Accounted For</div>
    <div class="stat-grid">
      <div class="stat"><div class="val">${totalCt}</div><div class="lbl">Total On Site</div></div>
      <div class="stat"><div class="val" style="color:#16a34a">${accountedCt}</div><div class="lbl">Accounted For</div></div>
      <div class="stat"><div class="val" style="color:${unaccountedCt > 0 ? '#dc2626' : '#16a34a'}">${unaccountedCt}</div><div class="lbl">Unaccounted</div></div>
      <div class="stat"><div class="val">${durLabel}</div><div class="lbl">Duration</div></div>
    </div>
    ${completedEvac?.activatedBy ? `<p style="font-size:13px;color:#64748b">Activated by: <strong>${completedEvac.activatedBy}</strong></p>` : ''}
    <div class="attach-note">
      &#128206; The full incident report${fmNotes.length > 0 || fmPhotos.length > 0 ? ` (including ${fmNotes.length} note${fmNotes.length !== 1 ? 's' : ''} and ${fmPhotos.length} photo${fmPhotos.length !== 1 ? 's' : ''} captured by Fire Marshals)` : ''} is attached to this email as a PDF.
    </div>
  </div>
  <div class="footer">This is an automated notification from TPR Max &mdash; Visitor Management System. Do not reply to this email.</div>
</div>
</body></html>`;

              const fmEmailService = emailService.forCustomer(customerId);
              let sent = 0;
              for (const fm of fmWithEmail) {
                const ok = await fmEmailService.sendEmail({
                  to: fm.email!,
                  subject,
                  html: emailHtml,
                  text: `${isDrillLabel}${eventLabel} complete. Accountability: ${accountedCt}/${totalCt} (${pct}%). Duration: ${durLabel}. The full incident report is attached as a PDF.`,
                  companyName,
                  attachments: pdfAttachment ? [pdfAttachment] : [],
                });
                if (ok) sent++;
              }
              logger.info(`Incident report emailed to ${sent}/${fmWithEmail.length} Fire Marshal(s) with PDF attachment`);
            } else {
              logger.info(`No Fire Marshals with email found — skipping incident report email`);
            }
          } catch (fmEmailErr: any) {
            logger.error(`Failed to email incident report to Fire Marshals: ${fmEmailErr.message}`);
          }

        } else {
          logger.info(`Incident report already exists for evacuation ${evacuationId}, skipping duplicate insert`);
        }
      } catch (reportErr: any) {
        logger.error(`Failed to save incident report record: ${reportErr.message}`);
      }

      // Reset isAccountedFor for ALL personnel so the next evacuation starts clean
      try {
        const resetDb = await customerDbService.getCustomerDatabase(customerId);
        await Promise.all([
          resetDb.update(isolatedSchema.staff).set({ isAccountedFor: false }),
          resetDb.update(isolatedSchema.visitors).set({ isAccountedFor: false }),
          resetDb.update(isolatedSchema.contractorWorkers).set({ isAccountedFor: false }),
          resetDb.update(isolatedSchema.members).set({ isAccountedFor: false }),
        ]);
        logger.info(`Accounted status reset for all personnel (customer: ${customerId})`);
      } catch (resetErr: any) {
        logger.error(`Failed to reset accounted status: ${resetErr.message}`);
      }

      res.json({
        success: true,
        message: checkOutMode === 'check_out_all' 
          ? `Evacuation completed. ${checkedOutCount} people checked out.`
          : 'Evacuation completed. All personnel remain checked in.',
        evacuationId,
        checkOutMode,
        checkedOutCount,
        breakdown: {
          staff: staffCheckedOut,
          visitors: visitorsCheckedOut,
          contractors: contractorsCheckedOut
        }
      });
    } catch (error) {
      logger.error("Error completing evacuation:", error);
      res.status(500).json({ error: "Failed to complete evacuation" });
    }
  });

  // ==============================================
  // EMERGENCY INCIDENT REPORT PDF ENDPOINT
  // ==============================================

  // Generate post-event incident report for a completed (or active) evacuation
  app.get("/api/emergency/incident-report/:evacuationId", requireAuth, async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const customerId = req.customerId;
      const format = (req.query.format as string) || 'html';
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Fetch the evacuation record
      const evacRecords = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.evacuationId, evacuationId),
          eq(evacuations.customerId, customerId)
        ))
        .limit(1);

      if (evacRecords.length === 0) {
        return res.status(404).json({ error: "Evacuation not found" });
      }
      const evac = evacRecords[0];

      // Fetch accountability records — query by evacuationId only.
      // We've already verified above that this evacuation belongs to the customer.
      // Some older records were stored without a customerId so filtering by customerId
      // would incorrectly exclude them and produce an empty Personnel Register.
      const accountability = await db
        .select()
        .from(evacuationAccountability)
        .where(eq(evacuationAccountability.evacuationId, evacuationId));

      // Fetch zone sweeps, notes and photos for this evacuation
      let zoneSweepsData: any[] = [];
      let evacuationNotesData: any[] = [];
      let evacuationPhotosData: any[] = [];
      try {
        const custDb = await customerDbService.getCustomerDatabase(customerId);
        zoneSweepsData = await custDb
          .select()
          .from(isolatedSchema.zoneSweeps)
          .where(eq(isolatedSchema.zoneSweeps.evacuationId, evacuationId))
          .orderBy(isolatedSchema.zoneSweeps.sweptAt);
        try {
          evacuationNotesData = await custDb
            .select()
            .from(isolatedSchema.evacuationNotes)
            .where(eq(isolatedSchema.evacuationNotes.evacuationId, evacuationId))
            .orderBy(isolatedSchema.evacuationNotes.createdAt);
        } catch { /* table may not exist for older schemas */ }
        try {
          evacuationPhotosData = await custDb
            .select()
            .from(isolatedSchema.evacuationPhotos)
            .where(eq(isolatedSchema.evacuationPhotos.evacuationId, evacuationId))
            .orderBy(isolatedSchema.evacuationPhotos.createdAt);
        } catch { /* table may not exist for older schemas */ }
      } catch (e) {
        // customer DB unavailable — safe to ignore
      }

      // Fetch company settings for branding
      const context = { customerId };
      const companySettings = await simpleDatabaseService.getCompanySettings(context);

      const accounted = accountability.filter(p => p.isAccountedFor);
      const unaccounted = accountability.filter(p => !p.isAccountedFor);
      const staffPeople = accountability.filter(p => p.personType === 'staff');
      const visitorPeople = accountability.filter(p => p.personType === 'visitor');
      const contractorPeople = accountability.filter(p => p.personType === 'contractor');
      const memberPeople = accountability.filter(p => p.personType === 'member');

      // When no per-person accountability records exist (older events), fall back to snapshot totals
      const hasDetailedData = accountability.length > 0;
      const effectiveTotalOnSite = hasDetailedData ? accountability.length : (evac.totalPeopleOnSite || 0);
      const rawEffectiveAccounted = hasDetailedData ? accounted.length : (evac.totalAccountedFor || 0);
      const effectiveAccountedFor = Math.min(rawEffectiveAccounted, effectiveTotalOnSite);
      const effectiveUnaccounted = Math.max(0, effectiveTotalOnSite - effectiveAccountedFor);
      const effectiveCompletionPct = effectiveTotalOnSite > 0
        ? Math.min(100, Math.round((effectiveAccountedFor / effectiveTotalOnSite) * 100))
        : 0;

      const startedAt = evac.startedAt ? new Date(evac.startedAt) : new Date();
      const completedAt = evac.completedAt ? new Date(evac.completedAt) : null;
      const durationMs = completedAt ? completedAt.getTime() - startedAt.getTime() : null;
      const durationStr = durationMs !== null
        ? `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`
        : 'Ongoing';

      const companyName = companySettings?.companyName || 'Company';
      const drillLabel = evac.isDrill ? ' [FIRE DRILL]' : '';
      const reportTitle = `Evacuation Incident Report${drillLabel}`;
      const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const formatTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // XSS safe HTML escape
      const esc = (s: string | null | undefined): string => {
        if (!s) return '—';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      // Build zone breakdown using lastKnownLocation (the denormalized zone text stored at activation)
      const zoneMap = new Map<string, { name: string; total: number; accounted: number }>();
      for (const p of accountability) {
        const zoneKey = p.lastKnownLocation || '__none__';
        const zoneName = p.lastKnownLocation || 'No Zone Assigned';
        if (!zoneMap.has(zoneKey)) zoneMap.set(zoneKey, { name: zoneName, total: 0, accounted: 0 });
        const z = zoneMap.get(zoneKey)!;
        z.total++;
        if (p.isAccountedFor) z.accounted++;
      }

      // Build accountability timeline (who was marked safe and when, sorted by time)
      const timelineEntries = accountability
        .filter(p => p.isAccountedFor && p.accountedAt)
        .sort((a, b) => new Date(a.accountedAt!).getTime() - new Date(b.accountedAt!).getTime());

      // Time to full accountability (time from start until last person was marked safe)
      const lastAccountedAt = timelineEntries.length > 0 ? new Date(timelineEntries[timelineEntries.length - 1].accountedAt!) : null;
      const timeToFullAccountability = lastAccountedAt && startedAt
        ? (() => {
            const ms = lastAccountedAt.getTime() - startedAt.getTime();
            const m = Math.floor(ms / 60000);
            const s = Math.round((ms % 60000) / 1000);
            return `${m}m ${s}s`;
          })()
        : null;

      // Build HTML report (all user-data escaped via esc())
      const personRows = (people: typeof accountability) =>
        people.map(p => `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:6px 8px;">${esc(p.personName)}</td>
            <td style="padding:6px 8px; text-transform:capitalize;">${esc(p.personType)}</td>
            <td style="padding:6px 8px;">${esc(p.department || p.company)}</td>
            <td style="padding:6px 8px;">${esc(p.lastKnownLocation)}</td>
            <td style="padding:6px 8px; text-align:center;">
              ${p.isAccountedFor
                ? `<span style="color:#16a34a; font-weight:bold;">&#10003; Accounted</span>${p.accountedBy ? `<br><small style="color:#666;">${esc(p.accountedBy)}</small>` : ''}`
                : `<span style="color:#dc2626; font-weight:bold;">&#10007; Missing</span>`
              }
            </td>
            <td style="padding:6px 8px;">
              ${(p as any).statusOption
                ? `<span style="color:#d97706; font-weight:500;">${esc((p as any).statusOption)}</span>`
                : p.isAccountedFor
                ? `<span style="color:#16a34a;">&mdash; Safe</span>`
                : '&mdash;'
              }
            </td>
            <td style="padding:6px 8px;">${p.accountedAt ? formatTime(new Date(p.accountedAt)) : '—'}</td>
          </tr>`).join('');

      const accentColor = /^#[0-9a-fA-F]{3,6}$/.test(companySettings?.accentColor || '') ? companySettings!.accentColor! : '#2460a9';
      const html = `<!DOCTYPE html><html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(reportTitle)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { color: ${accentColor}; margin:0; }
  h2 { color: ${accentColor}; margin: 24px 0 8px; font-size:16px; border-bottom: 2px solid ${accentColor}; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:${accentColor}; color:white; padding:8px; text-align:left; }
  .stat-box { display:inline-block; background:#f3f4f6; border-radius:8px; padding:12px 20px; margin:4px 8px 4px 0; min-width:100px; text-align:center; }
  .stat-num { font-size:28px; font-weight:bold; color:${accentColor}; }
  .stat-label { font-size:11px; color:#555; }
  .drill-banner { background:#fef3c7; border:2px solid #d97706; border-radius:8px; padding:12px 20px; margin-bottom:16px; text-align:center; color:#92400e; font-weight:bold; font-size:16px; }
  .header-row { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${accentColor}; padding-bottom:16px; margin-bottom:16px; }
  .kv { margin:4px 0; font-size:13px; } .kv strong { display:inline-block; min-width:180px; }
  .timeline-row { display:flex; align-items:center; gap:12px; padding:4px 0; font-size:12px; border-bottom:1px solid #f3f4f6; }
  .timeline-time { font-weight:bold; color:${accentColor}; min-width:80px; }
  .timeline-elapsed { color:#888; min-width:70px; }
  .download-btn { display:inline-block; background:${accentColor}; color:white; border:none; padding:10px 24px; border-radius:6px; font-size:14px; cursor:pointer; margin-bottom:16px; text-decoration:none; }
  @media print { body { margin:0; padding:12px; } .download-btn { display:none; } }
</style>
</head>
<body>
<a class="download-btn" href="/api/emergency/incident-report/${esc(evacuationId)}?format=pdf" target="_blank">&#128196; Download PDF</a>
&nbsp;
<button class="download-btn" onclick="window.print()" style="cursor:pointer;">&#128424; Print Report</button>
<div class="header-row">
  <div>
    <h1>${esc(reportTitle)}</h1>
    <p style="margin:4px 0 0; color:#555; font-size:13px;">Reference: ${esc(evacuationId)}</p>
  </div>
  <div style="text-align:right; font-size:13px; color:#555;">
    <strong>${esc(companyName)}</strong><br>
    Generated: ${formatDate(new Date())} ${formatTime(new Date())}
  </div>
</div>

${evac.isDrill ? '<div class="drill-banner">&#128998; FIRE DRILL &mdash; This event was a scheduled drill and was NOT a real emergency.</div>' : ''}

<h2>Event Summary</h2>
<div class="kv"><strong>Event type:</strong> ${evac.isDrill ? 'Fire Drill' : 'Emergency Evacuation'}</div>
<div class="kv"><strong>Activated by:</strong> ${esc(evac.activatedBy)}</div>
<div class="kv"><strong>Alarm raised:</strong> ${formatDate(startedAt)} at ${formatTime(startedAt)}</div>
<div class="kv"><strong>All-clear given:</strong> ${completedAt ? `${formatDate(completedAt)} at ${formatTime(completedAt)}` : 'Event still active'}</div>
<div class="kv"><strong>Total event duration:</strong> ${durationStr}</div>
<div class="kv"><strong>Time to full accountability:</strong> ${timeToFullAccountability || (effectiveUnaccounted > 0 ? 'Not achieved' : '&mdash;')}</div>
<div class="kv"><strong>Status:</strong> ${evac.status === 'completed' ? 'Completed' : 'Active'}</div>
<div class="kv"><strong>Muster points:</strong> ${esc((evac.musterPoints || []).join(', ') || '—')}</div>

<h2>Accountability Statistics</h2>
<div>
  <div class="stat-box"><div class="stat-num">${effectiveTotalOnSite}</div><div class="stat-label">Total On-Site</div></div>
  <div class="stat-box"><div class="stat-num" style="color:#16a34a;">${effectiveAccountedFor}</div><div class="stat-label">Accounted For</div></div>
  <div class="stat-box"><div class="stat-num" style="color:#dc2626;">${effectiveUnaccounted}</div><div class="stat-label">Unaccounted</div></div>
  <div class="stat-box"><div class="stat-num">${effectiveCompletionPct}%</div><div class="stat-label">Completion Rate</div></div>
</div>
<div style="margin-top:12px;">
  <div class="stat-box"><div class="stat-num">${staffPeople.length}</div><div class="stat-label">Staff</div></div>
  <div class="stat-box"><div class="stat-num">${visitorPeople.length}</div><div class="stat-label">Visitors</div></div>
  <div class="stat-box"><div class="stat-num">${contractorPeople.length}</div><div class="stat-label">Contractors</div></div>
  ${memberPeople.length > 0 ? `<div class="stat-box"><div class="stat-num">${memberPeople.length}</div><div class="stat-label">Members</div></div>` : ''}
</div>
${(() => {
  const withStatus = accounted.filter((p: any) => p.statusOption);
  if (withStatus.length === 0) return '';
  const directSafe = accounted.filter((p: any) => !p.statusOption).length;
  const byOption = new Map<string, number>();
  for (const p of withStatus as any[]) {
    byOption.set(p.statusOption, (byOption.get(p.statusOption) || 0) + 1);
  }
  const rows = [
    directSafe > 0 ? `<tr><td style="padding:4px 8px;">Marked Safe (direct)</td><td style="padding:4px 8px; font-weight:bold; color:#16a34a;">${directSafe}</td></tr>` : '',
    ...[...byOption.entries()].map(([opt, cnt]) => `<tr><td style="padding:4px 8px;">${esc(opt)}</td><td style="padding:4px 8px; font-weight:bold; color:#d97706;">${cnt}</td></tr>`),
  ].join('');
  return `<h3 style="margin:16px 0 6px; font-size:14px; color:#555;">Status Breakdown</h3><table style="width:auto; border-collapse:collapse; font-size:13px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;"><thead><tr style="background:#f3f4f6;"><th style="padding:4px 8px; text-align:left; font-weight:600;">Status</th><th style="padding:4px 8px; text-align:left; font-weight:600;">Count</th></tr></thead><tbody>${rows}</tbody></table>`;
})()}

${hasDetailedData ? `
<h2>Zone-by-Zone Breakdown</h2>
<table>
  <tr><th>Zone / Last Known Location</th><th>Total</th><th>Accounted</th><th>Unaccounted</th><th>Progress</th></tr>
  ${Array.from(zoneMap.entries()).map(([, z]) => {
    const pct = z.total > 0 ? Math.round((z.accounted / z.total) * 100) : 0;
    const barWidth = Math.max(0, Math.min(100, pct));
    const missing = z.total - z.accounted;
    return `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:6px 8px;">${z.name === 'No Zone Assigned' ? '<em style="color:#888;">No Zone Assigned</em>' : esc(z.name)}</td>
      <td style="padding:6px 8px; text-align:center;">${z.total}</td>
      <td style="padding:6px 8px; text-align:center; color:#16a34a; font-weight:bold;">${z.accounted}</td>
      <td style="padding:6px 8px; text-align:center; color:${missing > 0 ? '#dc2626' : '#16a34a'}; font-weight:bold;">${missing}</td>
      <td style="padding:6px 8px;"><div style="background:#e5e7eb; border-radius:3px; height:10px; width:120px; display:inline-block; vertical-align:middle;"><div style="width:${barWidth}%; background:#16a34a; border-radius:3px; height:10px;"></div></div> <span style="font-size:11px; color:#555;">${pct}%</span></td>
    </tr>`;
  }).join('')}
</table>` : '<p style="color:#888; font-style:italic; font-size:13px; padding:4px 0;">Zone breakdown not available — no per-person accountability records found for this event.</p>'}

${zoneSweepsData.length > 0 ? `
<h2>Zone Sweep Record</h2>
<table>
  <tr><th>Zone</th><th>Swept By</th><th>Time</th><th>Elapsed</th><th>Unaccounted at Time</th><th>Override Reason</th></tr>
  ${zoneSweepsData.map((s: any) => {
    const sweptAt = new Date(s.sweptAt);
    const elapsedMs = sweptAt.getTime() - startedAt.getTime();
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const elapsedSec = Math.round((elapsedMs % 60000) / 1000);
    return `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:6px 8px; font-weight:bold;">${esc(s.zoneName)}</td>
      <td style="padding:6px 8px;">${esc(s.sweptByName)}</td>
      <td style="padding:6px 8px;">${formatTime(sweptAt)}</td>
      <td style="padding:6px 8px; color:#888;">+${elapsedMin}m ${elapsedSec}s</td>
      <td style="padding:6px 8px; text-align:center;">${s.hasUnaccountedAtTime ? '<span style="color:#d97706; font-weight:bold;">&#9888; Yes (Override)</span>' : '<span style="color:#16a34a;">&#10003; No</span>'}</td>
      <td style="padding:6px 8px; color:#888; font-style:italic;">${esc(s.overrideReason)}</td>
    </tr>`;
  }).join('')}
</table>` : ''}

${timelineEntries.length > 0 ? `
<h2>Accountability Timeline</h2>
<div style="border:1px solid #e5e7eb; border-radius:6px; padding:8px;">
  ${timelineEntries.map(p => {
    const t = new Date(p.accountedAt!);
    const elapsedMs = t.getTime() - startedAt.getTime();
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const elapsedSec = Math.round((elapsedMs % 60000) / 1000);
    return `<div class="timeline-row">
      <span class="timeline-time">${formatTime(t)}</span>
      <span class="timeline-elapsed">+${elapsedMin}m ${elapsedSec}s</span>
      <span style="flex:1;">${esc(p.personName)}</span>
      <span style="text-transform:capitalize; color:#888; font-size:11px;">${esc(p.personType)}</span>
      ${p.accountedBy ? `<span style="color:#555; font-size:11px;">via ${esc(p.accountedBy)}</span>` : ''}
    </div>`;
  }).join('')}
</div>` : ''}

${hasDetailedData
  ? (unaccounted.length > 0
      ? `<h2 style="color:#dc2626;">&#9888; Unaccounted Personnel (${unaccounted.length})</h2>
<table>
  <tr><th>Name</th><th>Type</th><th>Dept / Company</th><th>Last Known Zone</th><th>Status</th><th>Status Detail</th><th>Accounted At</th></tr>
  ${personRows(unaccounted)}
</table>`
      : '<h2 style="color:#16a34a;">&#10003; All Personnel Accounted For</h2>')
  : (effectiveUnaccounted > 0
      ? `<h2 style="color:#dc2626;">&#9888; ${effectiveUnaccounted} Unaccounted (summary only &mdash; per-person records not available)</h2>`
      : effectiveAccountedFor === effectiveTotalOnSite && effectiveTotalOnSite > 0
        ? '<h2 style="color:#16a34a;">&#10003; All Personnel Accounted For (summary data)</h2>'
        : '<h2 style="color:#888;">&#8212; Accountability Status Unknown</h2>')}

<h2>Full Personnel Register</h2>
${hasDetailedData
  ? `<table>
  <tr><th>Name</th><th>Type</th><th>Dept / Company</th><th>Last Known Zone</th><th>Status</th><th>Status Detail</th><th>Accounted At</th></tr>
  ${personRows(accountability)}
</table>`
  : `<p style="color:#888; font-style:italic; font-size:13px; padding:8px 0;">
  Personnel tracking records are not available for this event. This evacuation was recorded before per-person accountability tracking was introduced, or no personnel were on-site at the time.
  The summary statistics above are sourced from the evacuation record snapshot.
</p>`}

${evacuationNotesData.length > 0 ? `
<h2>&#128221; Event Notes</h2>
<div style="display:flex; flex-direction:column; gap:8px;">
  ${evacuationNotesData.map((n: any) => {
    const t = new Date(n.createdAt);
    const elapsedMs = t.getTime() - startedAt.getTime();
    const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
    const elapsedSec = Math.max(0, Math.round((elapsedMs % 60000) / 1000));
    return `<div style="background:#f9fafb; border-left:4px solid ${accentColor}; border-radius:4px; padding:10px 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span style="font-size:12px; font-weight:bold; color:${accentColor};">${esc(n.addedBy)}</span>
        <span style="font-size:11px; color:#888;">${formatTime(t)} &nbsp;(+${elapsedMin}m ${elapsedSec}s)</span>
      </div>
      <p style="margin:0; font-size:13px; color:#111; white-space:pre-wrap;">${esc(n.noteText)}</p>
    </div>`;
  }).join('')}
</div>` : ''}

${evacuationPhotosData.length > 0 ? `
<h2>&#128247; Event Photos (${evacuationPhotosData.length})</h2>
<div style="display:flex; flex-wrap:wrap; gap:12px;">
  ${evacuationPhotosData.map((p: any) => {
    const t = new Date(p.createdAt);
    const elapsedMs = t.getTime() - startedAt.getTime();
    const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000));
    const elapsedSec = Math.max(0, Math.round((elapsedMs % 60000) / 1000));
    return `<div style="border:1px solid #e5e7eb; border-radius:6px; overflow:hidden; width:220px; flex-shrink:0;">
      <img src="${p.photoData}" alt="Evacuation photo" style="width:220px; height:160px; object-fit:cover; display:block;" />
      <div style="padding:6px 8px; background:#f9fafb;">
        ${p.caption ? `<p style="margin:0 0 3px; font-size:12px; color:#111; font-style:italic;">${esc(p.caption)}</p>` : ''}
        <p style="margin:0; font-size:11px; color:#888;">${esc(p.addedBy)} · ${formatTime(t)} (+${elapsedMin}m ${elapsedSec}s)</p>
      </div>
    </div>`;
  }).join('')}
</div>` : ''}

<div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; color:#888; text-align:center;">
  This report was generated by TPR Max Visitor Management System for ${esc(companyName)}.<br>
  Report ID: ${esc(evacuationId)} | Generated: ${new Date().toISOString()}
</div>
</body></html>`;

      if (format === 'pdf') {
        // Server-side PDF generation using Puppeteer with HTML fallback
        try {
          let puppeteer: any;
          try {
            puppeteer = await import('puppeteer');
          } catch {
            throw new Error('puppeteer_unavailable');
          }
          const browser = await puppeteer.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
          });
          try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
            });
            await browser.close();

            // Store the PDF URL reference in the evacuations table
            try {
              await db.update(evacuations)
                .set({ reportPdfUrl: `/api/emergency/incident-report/${evacuationId}?format=pdf` })
                .where(and(
                  eq(evacuations.evacuationId, evacuationId),
                  eq(evacuations.customerId, customerId)
                ));
            } catch (updateErr) {
              logger.warn('[incident-report] Could not persist reportPdfUrl:', updateErr);
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="incident-report-${evacuationId}.pdf"`);
            return res.send(Buffer.from(pdfBuffer));
          } catch (pdfErr) {
            await browser.close();
            throw pdfErr;
          }
        } catch (pdfGenerationErr) {
          // Chrome binary not installed or Puppeteer unavailable — serve as printable HTML
          logger.warn('[incident-report] PDF generation unavailable, falling back to HTML:', (pdfGenerationErr as Error).message);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="incident-report-${evacuationId}.html"`);
          return res.send(html);
        }
      }

      // Default: return HTML (browser can view inline or print-to-PDF)
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="incident-report-${evacuationId}.html"`);
      res.send(html);
    } catch (error) {
      logger.error("Error generating incident report:", error);
      res.status(500).json({ error: "Failed to generate incident report" });
    }
  });

  // List all saved incident reports for the authenticated customer
  app.get("/api/emergency/incident-reports", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      // Fetch all completed evacuations from shared DB for this customer
      const completedEvacs = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId),
          eq(evacuations.status, "completed")
        ))
        .orderBy(desc(evacuations.completedAt));

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Get existing incident report records (keyed by evacuationId)
      const existingReports = await custDb
        .select()
        .from(isolatedSchema.incidentReports)
        .where(eq(isolatedSchema.incidentReports.customerId, customerId));

      // Build map — if duplicates exist for same evacuationId, keep the one with the oldest generatedAt
      const existingByEvacId = new Map<string, typeof existingReports[0]>();
      for (const r of existingReports) {
        const prev = existingByEvacId.get(r.evacuationId);
        if (!prev) {
          existingByEvacId.set(r.evacuationId, r);
        } else {
          // Keep whichever has the older (earlier) generatedAt — that is the original report date
          const prevTime = prev.generatedAt ? new Date(prev.generatedAt).getTime() : Infinity;
          const currTime = r.generatedAt ? new Date(r.generatedAt).getTime() : Infinity;
          if (currTime < prevTime) existingByEvacId.set(r.evacuationId, r);
        }
      }

      // Back-fill incident report records for any completed evacuation that doesn't have one
      for (const evac of completedEvacs) {
        if (!existingByEvacId.has(evac.evacuationId)) {
          try {
            // Pull accountability records to get accurate counts
            const accountability = await db
              .select()
              .from(evacuationAccountability)
              .where(and(
                eq(evacuationAccountability.evacuationId, evac.evacuationId),
                eq(evacuationAccountability.customerId, customerId)
              ));
            const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
            const rawAccountedCt = accountability.length > 0
              ? accountability.filter(p => p.isAccountedFor).length
              : (evac.totalAccountedFor || 0);
            const accountedCt = Math.min(rawAccountedCt, totalCt);
            const unaccountedCt = Math.max(0, totalCt - accountedCt);
            const pct = totalCt > 0 ? Math.min(100, Math.round((accountedCt / totalCt) * 100)) : 0;
            const durSec = (evac.startedAt && evac.completedAt)
              ? Math.round((new Date(evac.completedAt).getTime() - new Date(evac.startedAt).getTime()) / 1000)
              : null;
            const [inserted] = await custDb.insert(isolatedSchema.incidentReports).values({
              evacuationId: evac.evacuationId,
              customerId,
              isDrill: evac.isDrill || false,
              activatedBy: evac.activatedBy || null,
              startedAt: evac.startedAt ? new Date(evac.startedAt) : null,
              completedAt: evac.completedAt ? new Date(evac.completedAt) : null,
              durationSeconds: durSec,
              totalOnSite: totalCt,
              accountedFor: accountedCt,
              unaccounted: unaccountedCt,
              completionPct: pct,
              generatedAt: evac.completedAt ? new Date(evac.completedAt) : new Date(),
              reportUrl: `/api/emergency/incident-report/${evac.evacuationId}`,
            }).returning();
            if (inserted) existingByEvacId.set(evac.evacuationId, inserted);
            logger.info(`Back-filled incident report for evacuation ${evac.evacuationId}`);
          } catch (backfillErr: any) {
            logger.error(`Failed to back-fill incident report for ${evac.evacuationId}: ${backfillErr.message}`);
          }
        }
      }

      // Return all non-deleted reports ordered by most recent first
      const allReports = Array.from(existingByEvacId.values())
        .filter(r => !r.deletedAt)
        .sort((a, b) => {
          const aTime = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
          const bTime = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
          return bTime - aTime;
        });

      res.json(allReports);
    } catch (error) {
      logger.error("Error fetching incident reports:", error);
      res.status(500).json({ error: "Failed to fetch incident reports" });
    }
  });

  // DELETE a single incident report record — soft delete so back-fill doesn't re-create it
  app.delete("/api/emergency/incident-reports/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      const updated = await custDb
        .update(isolatedSchema.incidentReports)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(isolatedSchema.incidentReports.id, id),
          eq(isolatedSchema.incidentReports.customerId, customerId)
        ))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Incident report not found" });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting incident report:", error);
      res.status(500).json({ error: "Failed to delete incident report" });
    }
  });

  // Recalculate and refresh an incident report's stored stats from live evacuationAccountability data
  app.post("/api/emergency/incident-reports/:evacuationId/refresh", requireAuth, async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      // Verify evacuation belongs to this customer
      const [evac] = await db
        .select()
        .from(evacuations)
        .where(and(eq(evacuations.evacuationId, evacuationId), eq(evacuations.customerId, customerId)))
        .limit(1);
      if (!evac) return res.status(404).json({ error: "Evacuation not found" });

      // Re-read live accountability data (scoped to customer, consistent with list endpoint)
      const accountability = await db
        .select()
        .from(evacuationAccountability)
        .where(and(
          eq(evacuationAccountability.evacuationId, evacuationId),
          eq(evacuationAccountability.customerId, customerId)
        ));

      const totalCt = accountability.length || evac.totalPeopleOnSite || 0;
      // Fall back to the evacuation's own summary figure when there are no per-person
      // muster rows — mirrors the list endpoint so Refresh can never zero out a report
      // that was accounted for at summary level.
      const rawAccountedCt = accountability.length > 0
        ? accountability.filter(p => p.isAccountedFor).length
        : (evac.totalAccountedFor || 0);
      const accountedCt = Math.min(rawAccountedCt, totalCt);
      const unaccountedCt = Math.max(0, totalCt - accountedCt);
      const pct = totalCt > 0 ? Math.min(100, Math.round((accountedCt / totalCt) * 100)) : 0;
      const durSec = (evac.startedAt && evac.completedAt)
        ? Math.round((new Date(evac.completedAt).getTime() - new Date(evac.startedAt).getTime()) / 1000)
        : null;

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Upsert the incident report record
      const existing = await custDb
        .select({ id: isolatedSchema.incidentReports.id })
        .from(isolatedSchema.incidentReports)
        .where(eq(isolatedSchema.incidentReports.evacuationId, evacuationId))
        .limit(1);

      if (existing.length > 0) {
        await custDb
          .update(isolatedSchema.incidentReports)
          .set({
            totalOnSite: totalCt,
            accountedFor: accountedCt,
            unaccounted: unaccountedCt,
            completionPct: pct,
            durationSeconds: durSec,
          })
          .where(eq(isolatedSchema.incidentReports.evacuationId, evacuationId));
      } else {
        await custDb.insert(isolatedSchema.incidentReports).values({
          evacuationId,
          customerId,
          isDrill: evac.isDrill || false,
          activatedBy: evac.activatedBy || null,
          startedAt: evac.startedAt ? new Date(evac.startedAt) : null,
          completedAt: evac.completedAt ? new Date(evac.completedAt) : null,
          durationSeconds: durSec,
          totalOnSite: totalCt,
          accountedFor: accountedCt,
          unaccounted: unaccountedCt,
          completionPct: pct,
          generatedAt: evac.completedAt ? new Date(evac.completedAt) : null,
          reportUrl: `/api/emergency/incident-report/${evacuationId}`,
        });
      }

      logger.info(`Incident report refreshed for evacuation ${evacuationId}: ${accountedCt}/${totalCt} accounted (${pct}%)`);
      res.json({ success: true, totalOnSite: totalCt, accountedFor: accountedCt, unaccounted: unaccountedCt, completionPct: pct });
    } catch (error) {
      logger.error("Error refreshing incident report:", error);
      res.status(500).json({ error: "Failed to refresh incident report" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EVACUATION NOTES — save / fetch quick text notes during an evacuation
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/emergency/evacuation-note  (FM auth OR admin session)
  app.post("/api/emergency/evacuation-note", async (req, res) => {
    try {
      const { evacuationId, noteText } = req.body;
      const token = (req.body.token || req.headers['x-emergency-token']) as string | undefined;
      const urlId = (req.body.urlId || req.headers['x-fire-marshal-id']) as string | undefined;

      if (!evacuationId || !noteText?.trim()) {
        return res.status(400).json({ error: "evacuationId and noteText are required" });
      }

      let customerId: string;
      let addedBy = "Admin";
      let addedByType = "admin";

      if (token) {
        const devContext = simpleDatabaseService.createDevelopmentContext();
        const marshal = await databaseService.validateEmergencyToken(devContext, token);
        if (!marshal) return res.status(401).json({ error: "Invalid emergency token" });
        customerId = (marshal as any).customerId || devContext.customerId;
        addedBy = `${marshal.firstName} ${marshal.lastName}`;
        addedByType = "firemarshal";
      } else if (urlId) {
        const marshalResult = await databaseService.findFireMarshalByUrlId(urlId);
        if (!marshalResult) return res.status(401).json({ error: "Invalid Fire Marshal link" });
        customerId = marshalResult.customerId;
        addedBy = `${marshalResult.marshal.firstName} ${marshalResult.marshal.lastName}`;
        addedByType = "firemarshal";
      } else if (req.session?.customerId) {
        customerId = req.customerId;
        addedBy = (req as any).user?.username || (req as any).user?.firstName ? `${(req as any).user.firstName} ${(req as any).user.lastName}` : "Admin";
        addedByType = "admin";
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Auto-create table if it doesn't exist
      try {
        await custDb.execute(sql`CREATE TABLE IF NOT EXISTS evacuation_notes (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          evacuation_id TEXT NOT NULL,
          note_text TEXT NOT NULL,
          added_by TEXT NOT NULL,
          added_by_type TEXT NOT NULL DEFAULT 'firemarshal',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
      } catch { /* already exists */ }

      const [note] = await custDb.insert(isolatedSchema.evacuationNotes).values({
        evacuationId,
        noteText: noteText.trim(),
        addedBy,
        addedByType,
      }).returning();

      logger.info(`[evacuation-note] Saved note for evacuation ${evacuationId} by ${addedBy}`);
      return res.json({ success: true, note });
    } catch (error) {
      logger.error("Error saving evacuation note:", error);
      return res.status(500).json({ error: "Failed to save note" });
    }
  });

  // GET /api/emergency/evacuation-notes/:evacuationId  (admin only)
  app.get("/api/emergency/evacuation-notes/:evacuationId", requireAuth, async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      try {
        const notes = await custDb
          .select()
          .from(isolatedSchema.evacuationNotes)
          .where(eq(isolatedSchema.evacuationNotes.evacuationId, evacuationId))
          .orderBy(isolatedSchema.evacuationNotes.createdAt);
        return res.json(notes);
      } catch {
        return res.json([]);
      }
    } catch (error) {
      logger.error("Error fetching evacuation notes:", error);
      return res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EVACUATION PHOTOS — save / fetch photos taken during an evacuation
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/emergency/evacuation-photo  (FM auth OR admin session)
  app.post("/api/emergency/evacuation-photo", async (req, res) => {
    try {
      const { evacuationId, photoData, caption } = req.body;
      const token = (req.body.token || req.headers['x-emergency-token']) as string | undefined;
      const urlId = (req.body.urlId || req.headers['x-fire-marshal-id']) as string | undefined;

      if (!evacuationId || !photoData) {
        return res.status(400).json({ error: "evacuationId and photoData are required" });
      }

      let customerId: string;
      let addedBy = "Admin";
      let addedByType = "admin";

      if (token) {
        const devContext = simpleDatabaseService.createDevelopmentContext();
        const marshal = await databaseService.validateEmergencyToken(devContext, token);
        if (!marshal) return res.status(401).json({ error: "Invalid emergency token" });
        customerId = (marshal as any).customerId || devContext.customerId;
        addedBy = `${marshal.firstName} ${marshal.lastName}`;
        addedByType = "firemarshal";
      } else if (urlId) {
        const marshalResult = await databaseService.findFireMarshalByUrlId(urlId);
        if (!marshalResult) return res.status(401).json({ error: "Invalid Fire Marshal link" });
        customerId = marshalResult.customerId;
        addedBy = `${marshalResult.marshal.firstName} ${marshalResult.marshal.lastName}`;
        addedByType = "firemarshal";
      } else if (req.session?.customerId) {
        customerId = req.customerId;
        addedBy = (req as any).user?.username || (req as any).user?.firstName ? `${(req as any).user.firstName} ${(req as any).user.lastName}` : "Admin";
        addedByType = "admin";
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Auto-create table if it doesn't exist
      try {
        await custDb.execute(sql`CREATE TABLE IF NOT EXISTS evacuation_photos (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          evacuation_id TEXT NOT NULL,
          photo_data TEXT NOT NULL,
          caption TEXT,
          added_by TEXT NOT NULL,
          added_by_type TEXT NOT NULL DEFAULT 'firemarshal',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )`);
      } catch { /* already exists */ }

      const [photo] = await custDb.insert(isolatedSchema.evacuationPhotos).values({
        evacuationId,
        photoData,
        caption: caption?.trim() || null,
        addedBy,
        addedByType,
      }).returning();

      logger.info(`[evacuation-photo] Saved photo for evacuation ${evacuationId} by ${addedBy}`);
      return res.json({ success: true, photo });
    } catch (error) {
      logger.error("Error saving evacuation photo:", error);
      return res.status(500).json({ error: "Failed to save photo" });
    }
  });

  // GET /api/emergency/evacuation-photos/:evacuationId  (admin only)
  app.get("/api/emergency/evacuation-photos/:evacuationId", requireAuth, async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      try {
        const photos = await custDb
          .select()
          .from(isolatedSchema.evacuationPhotos)
          .where(eq(isolatedSchema.evacuationPhotos.evacuationId, evacuationId))
          .orderBy(isolatedSchema.evacuationPhotos.createdAt);
        return res.json(photos);
      } catch {
        return res.json([]);
      }
    } catch (error) {
      logger.error("Error fetching evacuation photos:", error);
      return res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  // GET zone sweeps for an evacuation (fire marshal token OR session auth)
  app.get("/api/emergency/zone-sweeps/:evacuationId", async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const token = req.query.token as string | undefined;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string | undefined;

      let customerId: string;

      if (token) {
        // Token-based: validate against dev (shared) context, then get the real customerId
        const devContext = simpleDatabaseService.createDevelopmentContext();
        const marshal = await databaseService.validateEmergencyToken(devContext, token);
        if (!marshal) return res.status(401).json({ error: "Invalid emergency token" });
        customerId = (marshal as any).customerId || req.customerId || devContext.customerId;
      } else if (fireMarshalId) {
        // Fire Marshal URL ID auth (permanent URL)
        const marshalResult = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!marshalResult) return res.status(401).json({ error: "Invalid Fire Marshal link" });
        customerId = marshalResult.customerId;
      } else if (req.customerId) {
        customerId = req.customerId;
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const sweeps = await custDb
        .select()
        .from(isolatedSchema.zoneSweeps)
        .where(eq(isolatedSchema.zoneSweeps.evacuationId, evacuationId))
        .orderBy(isolatedSchema.zoneSweeps.sweptAt);

      res.json(sweeps);
    } catch (error) {
      logger.error("Failed to fetch zone sweeps:", error);
      res.status(500).json({ error: "Failed to fetch zone sweeps" });
    }
  });

  // POST sweep a zone clear (fire marshal token, URL ID, OR session auth)
  app.post("/api/emergency/sweep-zone", async (req, res) => {
    try {
      const { token, evacuationId, zoneId, zoneName, overrideReason, urlId } = req.body;
      const fireMarshalIdHeader = req.headers['x-fire-marshal-id'] as string | undefined;

      if (!evacuationId || !zoneId || !zoneName) {
        return res.status(400).json({ error: "evacuationId, zoneId, and zoneName are required" });
      }

      let customerId: string;
      let sweptByName = "Admin";
      let sweptByType = "staff";

      if (token) {
        // Token-based: validate against dev (shared) context to get the real customerId
        const devContext = simpleDatabaseService.createDevelopmentContext();
        const marshal = await databaseService.validateEmergencyToken(devContext, token);
        if (!marshal) return res.status(401).json({ error: "Invalid emergency token" });
        customerId = (marshal as any).customerId || req.customerId || devContext.customerId;
        sweptByName = `${marshal.firstName} ${marshal.lastName}`;
        sweptByType = "staff";
      } else if (urlId || fireMarshalIdHeader) {
        // Fire Marshal URL ID auth (permanent URL) — from body or header
        const resolvedUrlId = urlId || fireMarshalIdHeader!;
        const marshalResult = await databaseService.findFireMarshalByUrlId(resolvedUrlId);
        if (!marshalResult) return res.status(401).json({ error: "Invalid Fire Marshal link" });
        customerId = marshalResult.customerId;
        sweptByName = `${marshalResult.marshal.firstName} ${marshalResult.marshal.lastName}`;
        sweptByType = "staff";
      } else if (req.customerId) {
        customerId = req.customerId;
        sweptByName = (req.user as any)?.username || "Admin";
        sweptByType = "staff";
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }

      const custDb = await customerDbService.getCustomerDatabase(customerId);

      // Determine hasUnaccountedAtTime by querying the live source tables directly.
      // Each person table (staff, visitors, contractorWorkers, members) has:
      //   - zoneId: where they are currently assigned
      //   - isCheckedIn / isAccountedFor: live status
      // The evacuationAccountability table does NOT have zoneId, so we use the source tables.
      const [unaccountedStaff, unaccountedVisitors, unaccountedWorkers, unaccountedMembers] = await Promise.all([
        custDb.select({ id: isolatedSchema.staff.id })
          .from(isolatedSchema.staff)
          .where(and(
            eq(isolatedSchema.staff.zoneId, zoneId),
            eq(isolatedSchema.staff.isCheckedIn, true),
            eq(isolatedSchema.staff.isAccountedFor, false)
          )),
        custDb.select({ id: isolatedSchema.visitors.id })
          .from(isolatedSchema.visitors)
          .where(and(
            eq(isolatedSchema.visitors.zoneId, zoneId),
            eq(isolatedSchema.visitors.isCheckedIn, true),
            eq(isolatedSchema.visitors.isAccountedFor, false)
          )),
        custDb.select({ id: isolatedSchema.contractorWorkers.id })
          .from(isolatedSchema.contractorWorkers)
          .where(and(
            eq(isolatedSchema.contractorWorkers.zoneId, zoneId),
            eq(isolatedSchema.contractorWorkers.isCheckedIn, true),
            eq(isolatedSchema.contractorWorkers.isAccountedFor, false)
          )),
        custDb.select({ id: isolatedSchema.members.id })
          .from(isolatedSchema.members)
          .where(and(
            eq(isolatedSchema.members.zoneId, zoneId),
            eq(isolatedSchema.members.isCheckedIn, true),
            eq(isolatedSchema.members.isAccountedFor, false)
          )),
      ]);
      const hasUnaccountedAtTime = (
        unaccountedStaff.length > 0 ||
        unaccountedVisitors.length > 0 ||
        unaccountedWorkers.length > 0 ||
        unaccountedMembers.length > 0
      );

      // Upsert: remove any previous sweep for this zone in this evacuation, then insert fresh
      await custDb
        .delete(isolatedSchema.zoneSweeps)
        .where(and(
          eq(isolatedSchema.zoneSweeps.evacuationId, evacuationId),
          eq(isolatedSchema.zoneSweeps.zoneId, zoneId)
        ));

      const [sweep] = await custDb
        .insert(isolatedSchema.zoneSweeps)
        .values({
          evacuationId,
          zoneId,
          zoneName,
          sweptByName,
          sweptByType,
          sweptAt: new Date(),
          hasUnaccountedAtTime,
          overrideReason: overrideReason || null,
        })
        .returning();

      logger.info(`Zone swept: ${zoneName} by ${sweptByName} for evacuation ${evacuationId}`);
      res.json({ success: true, sweep });
    } catch (error) {
      logger.error("Failed to record zone sweep:", error);
      res.status(500).json({ error: "Failed to record zone sweep" });
    }
  });

  // Read-only incident monitor endpoint (public, no auth required — evacuationId + customerId act as token)
  app.get("/api/emergency/monitor/:evacuationId", async (req, res) => {
    try {
      const { evacuationId } = req.params;
      const customerId = (req.query.customerId as string) || req.session?.customerId;
      if (!customerId || !evacuationId) {
        return res.status(400).json({ error: "Missing evacuationId or customerId" });
      }

      // Fetch the evacuation from shared DB
      const evacRecords = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.evacuationId, evacuationId),
          eq(evacuations.customerId, customerId)
        ))
        .limit(1);

      if (!evacRecords.length) {
        return res.status(404).json({ error: "Evacuation not found" });
      }
      const evac = evacRecords[0];

      // Get customer context and data
      const context = { customerId, username: 'monitor' } as any;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const settings = await databaseService.getCompanySettings(context);

      const [currentVisitors, checkedInStaff, contractorCompanies, zones] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getAllContractorCompanies(context),
        custDb.select().from(isolatedSchema.evacuationZones).orderBy(isolatedSchema.evacuationZones.displayOrder),
      ]);

      const zoneMap = new Map(zones.map(z => [z.id, { id: z.id, name: z.name, color: z.color }]));

      let checkedInContractors: any[] = [];
      for (const company of contractorCompanies) {
        const workers = await databaseService.getWorkersByCompanyId(context, company.id);
        checkedInContractors.push(
          ...workers.filter(w => w.isCheckedIn).map(w => ({
            id: w.id,
            name: `${w.firstName} ${w.lastName}`,
            type: 'contractor' as const,
            company: company.name,
            location: w.zoneId ? (zoneMap.get(w.zoneId)?.name || 'Unknown') : 'Unassigned',
            zoneId: w.zoneId || null,
            zoneName: w.zoneId ? zoneMap.get(w.zoneId)?.name || null : null,
            zoneColor: w.zoneId ? zoneMap.get(w.zoneId)?.color || null : null,
            accounted: w.isAccountedFor || false,
            needsEvacuationAssistance: (w as any).needsEvacuationAssistance || false,
          }))
        );
      }

      const allPersonnel = [
        ...checkedInStaff.map(s => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          type: 'staff' as const,
          department: s.department,
          location: (s as any).zoneId ? (zoneMap.get((s as any).zoneId)?.name || 'Unknown') : 'Unassigned',
          zoneId: (s as any).zoneId || null,
          zoneName: (s as any).zoneId ? zoneMap.get((s as any).zoneId)?.name || null : null,
          zoneColor: (s as any).zoneId ? zoneMap.get((s as any).zoneId)?.color || null : null,
          accounted: s.isAccountedFor || false,
          needsEvacuationAssistance: (s as any).needsEvacuationAssistance || false,
        })),
        ...currentVisitors.map(v => ({
          id: v.id,
          name: `${v.firstName} ${v.lastName}`,
          type: 'visitor' as const,
          company: v.company,
          location: (v as any).zoneId ? (zoneMap.get((v as any).zoneId)?.name || 'Unknown') : 'Unassigned',
          zoneId: (v as any).zoneId || null,
          zoneName: (v as any).zoneId ? zoneMap.get((v as any).zoneId)?.name || null : null,
          zoneColor: (v as any).zoneId ? zoneMap.get((v as any).zoneId)?.color || null : null,
          accounted: v.isAccountedFor || false,
          needsEvacuationAssistance: (v as any).needsEvacuationAssistance || false,
        })),
        ...checkedInContractors,
      ];

      const accountedFor = allPersonnel.filter(p => p.accounted).length;

      const zoneStats = zones.map(z => {
        const inZone = allPersonnel.filter(p => p.zoneId === z.id);
        return {
          id: z.id,
          name: z.name,
          color: z.color,
          total: inZone.length,
          accounted: inZone.filter(p => p.accounted).length,
        };
      });

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({
        evacuationId,
        customerId,
        companyName: settings?.companyName || 'Unknown Company',
        status: evac.status,
        startedAt: evac.startedAt,
        isDrill: (evac as any).isDrill || false,
        totalPersonnel: allPersonnel.length,
        accountedFor,
        personnel: allPersonnel,
        zones: zoneStats,
      });
    } catch (error) {
      logger.error("Error fetching monitor data:", error);
      res.status(500).json({ error: "Failed to fetch monitor data" });
    }
  });

  // ==============================================
  // INCIDENT MANAGER MONITOR - Permanent per-customer read-only URL
  // ==============================================

  // Validate incident manager URL and return company/evacuation context
  app.get("/api/incident-monitor/:urlId", async (req, res) => {
    try {
      const { urlId } = req.params;
      if (!urlId) return res.status(400).json({ error: "Missing URL ID" });

      // Search all active customer databases for matching incidentManagerUrlId
      const customers = await customerDbService.getAllCustomers();
      let foundCustomerId: string | null = null;
      let foundSettings: any = null;

      for (const customer of customers) {
        if (!customer.isActive) continue;
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const rows = await custDb
            .select()
            .from(isolatedSchema.companySettings)
            .where(eq(isolatedSchema.companySettings.incidentManagerUrlId, urlId))
            .limit(1);
          if (rows.length > 0) {
            foundCustomerId = customer.id;
            foundSettings = rows[0];
            break;
          }
        } catch {
          continue;
        }
      }

      if (!foundCustomerId || !foundSettings) {
        return res.status(404).json({ error: "Monitor link not found or has been revoked" });
      }

      // Find the most recent active evacuation for this customer
      const activeEvacs = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, foundCustomerId),
          eq(evacuations.status, 'active')
        ))
        .orderBy(sql`started_at DESC`)
        .limit(1);

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({
        valid: true,
        customerId: foundCustomerId,
        companyName: foundSettings.companyName || 'Unknown Company',
        accentColor: foundSettings.accentColor || '#2460a9',
        activeEvacuation: activeEvacs.length > 0 ? {
          evacuationId: activeEvacs[0].evacuationId,
          startedAt: activeEvacs[0].startedAt,
          isDrill: (activeEvacs[0] as any).isDrill || false,
        } : null,
      });
    } catch (error) {
      logger.error("Error validating incident monitor URL:", error);
      res.status(500).json({ error: "Failed to validate monitor link" });
    }
  });

  // Get live muster data via permanent incident manager URL
  app.get("/api/incident-monitor/:urlId/muster", async (req, res) => {
    try {
      const { urlId } = req.params;
      if (!urlId) return res.status(400).json({ error: "Missing URL ID" });

      // Find the customer with this incidentManagerUrlId
      const customers = await customerDbService.getAllCustomers();
      let foundCustomerId: string | null = null;

      for (const customer of customers) {
        if (!customer.isActive) continue;
        try {
          const custDb = await customerDbService.getCustomerDatabase(customer.id);
          const rows = await custDb
            .select({ id: isolatedSchema.companySettings.incidentManagerUrlId })
            .from(isolatedSchema.companySettings)
            .where(eq(isolatedSchema.companySettings.incidentManagerUrlId, urlId))
            .limit(1);
          if (rows.length > 0) {
            foundCustomerId = customer.id;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!foundCustomerId) {
        return res.status(404).json({ error: "Monitor link not found or has been revoked" });
      }

      // Find the most recent active evacuation
      const activeEvacs = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, foundCustomerId),
          eq(evacuations.status, 'active')
        ))
        .orderBy(sql`started_at DESC`)
        .limit(1);

      if (activeEvacs.length === 0) {
        return res.json({ active: false, message: "No active emergency at this time" });
      }

      const evac = activeEvacs[0];
      const context = { customerId: foundCustomerId, username: 'incident-monitor' } as any;
      const custDb = await customerDbService.getCustomerDatabase(foundCustomerId);
      const settings = await databaseService.getCompanySettings(context);

      const [currentVisitors, checkedInStaff, contractorCompanies, zones, sweepRecords] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getAllContractorCompanies(context),
        custDb.select().from(isolatedSchema.evacuationZones).orderBy(isolatedSchema.evacuationZones.displayOrder),
        custDb.select().from(isolatedSchema.zoneSweeps)
          .where(eq(isolatedSchema.zoneSweeps.evacuationId, evac.evacuationId))
          .orderBy(desc(isolatedSchema.zoneSweeps.sweptAt)),
      ]);

      const zoneMap = new Map(zones.map(z => [z.id, { id: z.id, name: z.name, color: z.color }]));

      // Build zone sweep map: latest sweep per zone
      const sweepByZone = new Map<string, { sweptAt: Date; sweptByName: string; hasUnaccountedAtTime: boolean }>();
      for (const sweep of sweepRecords) {
        if (!sweepByZone.has(sweep.zoneId)) {
          sweepByZone.set(sweep.zoneId, {
            sweptAt: sweep.sweptAt,
            sweptByName: sweep.sweptByName,
            hasUnaccountedAtTime: sweep.hasUnaccountedAtTime,
          });
        }
      }

      let checkedInContractors: any[] = [];
      for (const company of contractorCompanies) {
        const workers = await databaseService.getWorkersByCompanyId(context, company.id);
        checkedInContractors.push(
          ...workers.filter(w => w.isCheckedIn).map(w => ({
            id: w.id,
            name: `${w.firstName} ${w.lastName}`,
            type: 'contractor' as const,
            company: company.name,
            checkInTime: (w as any).checkedInAt || null,
            location: w.zoneId ? (zoneMap.get(w.zoneId)?.name || 'Unknown') : 'Unassigned',
            zoneId: w.zoneId || null,
            zoneName: w.zoneId ? zoneMap.get(w.zoneId)?.name || null : null,
            zoneColor: w.zoneId ? zoneMap.get(w.zoneId)?.color || null : null,
            accounted: w.isAccountedFor || false,
            needsEvacuationAssistance: (w as any).needsEvacuationAssistance || false,
          }))
        );
      }

      const allPersonnel = [
        ...checkedInStaff.map(s => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          type: 'staff' as const,
          department: s.department,
          checkInTime: (s as any).checkedInAt || null,
          location: (s as any).zoneId ? (zoneMap.get((s as any).zoneId)?.name || 'Unknown') : 'Unassigned',
          zoneId: (s as any).zoneId || null,
          zoneName: (s as any).zoneId ? zoneMap.get((s as any).zoneId)?.name || null : null,
          zoneColor: (s as any).zoneId ? zoneMap.get((s as any).zoneId)?.color || null : null,
          accounted: s.isAccountedFor || false,
          needsEvacuationAssistance: (s as any).needsEvacuationAssistance || false,
        })),
        ...currentVisitors.map(v => ({
          id: v.id,
          name: `${v.firstName} ${v.lastName}`,
          type: 'visitor' as const,
          company: v.company,
          checkInTime: (v as any).checkedInAt || null,
          location: (v as any).zoneId ? (zoneMap.get((v as any).zoneId)?.name || 'Unknown') : 'Unassigned',
          zoneId: (v as any).zoneId || null,
          zoneName: (v as any).zoneId ? zoneMap.get((v as any).zoneId)?.name || null : null,
          zoneColor: (v as any).zoneId ? zoneMap.get((v as any).zoneId)?.color || null : null,
          accounted: v.isAccountedFor || false,
          needsEvacuationAssistance: (v as any).needsEvacuationAssistance || false,
        })),
        ...checkedInContractors,
      ];

      const accountedFor = allPersonnel.filter(p => p.accounted).length;

      const zoneStats = zones.map(z => {
        const inZone = allPersonnel.filter(p => p.zoneId === z.id);
        const sweep = sweepByZone.get(z.id);
        return {
          id: z.id,
          name: z.name,
          color: z.color,
          total: inZone.length,
          accounted: inZone.filter(p => p.accounted).length,
          swept: !!sweep,
          sweptAt: sweep?.sweptAt || null,
          sweptByName: sweep?.sweptByName || null,
          sweptWithUnaccounted: sweep?.hasUnaccountedAtTime || false,
        };
      });

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({
        active: true,
        evacuationId: evac.evacuationId,
        customerId: foundCustomerId,
        companyName: settings?.companyName || 'Unknown Company',
        status: evac.status,
        startedAt: evac.startedAt,
        isDrill: (evac as any).isDrill || false,
        totalPersonnel: allPersonnel.length,
        accountedFor,
        personnel: allPersonnel,
        zones: zoneStats,
      });
    } catch (error) {
      logger.error("Error fetching incident monitor muster data:", error);
      res.status(500).json({ error: "Failed to fetch muster data" });
    }
  });

  // Admin: generate or regenerate the incident manager monitor URL for this customer
  app.post("/api/admin/incident-monitor/generate", requireAuth, async (req, res) => {
    try {
      const customerId = req.session?.customerId;
      const userId = req.session?.userId;
      if (!customerId || !userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Admin-only: verify the requesting user has admin role
      const custDb2 = await customerDbService.getCustomerDatabase(customerId);
      const callerRows = await custDb2
        .select({ role: isolatedSchema.users.role })
        .from(isolatedSchema.users)
        .where(eq(isolatedSchema.users.id, userId))
        .limit(1);
      if (!callerRows.length || callerRows[0].role !== 'admin') {
        return res.status(403).json({ error: "Administrator access required" });
      }

      // Generate a cryptographically secure random URL ID (24 hex chars)
      const newUrlId = crypto.randomBytes(12).toString('hex');

      await custDb2
        .update(isolatedSchema.companySettings)
        .set({ incidentManagerUrlId: newUrlId });

      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const baseUrl = `${proto}://${host}`;
      res.json({
        success: true,
        urlId: newUrlId,
        url: `${baseUrl}/incident-monitor/${newUrlId}`,
      });
    } catch (error) {
      logger.error("Error generating incident monitor URL:", error);
      res.status(500).json({ error: "Failed to generate monitor URL" });
    }
  });

  // ==============================================
  // MUSTER POINTS CRUD API - Isolated per customer
  // ==============================================

  // Get all muster points for a customer
  app.get("/api/muster-points", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      const points = await customerDb
        .select()
        .from(isolatedSchema.musterPoints)
        .where(eq(isolatedSchema.musterPoints.isActive, true))
        .orderBy(isolatedSchema.musterPoints.displayOrder);

      res.json(points);
    } catch (error) {
      logger.error("Error fetching muster points:", error);
      res.status(500).json({ error: "Failed to fetch muster points" });
    }
  });

  // Get muster points with stats (for Fire Marshal dashboard)
  app.get("/api/muster-points/stats", async (req, res) => {
    try {
      // Support both regular auth and Fire Marshal URL ID auth
      let customerId: string | null = null;
      const fireMarshalId = req.headers['x-fire-marshal-id'] as string;
      
      if (fireMarshalId) {
        // Fire Marshal URL ID authentication
        const result = await databaseService.findFireMarshalByUrlId(fireMarshalId);
        if (!result) {
          return res.status(401).json({ error: "Invalid Fire Marshal link" });
        }
        customerId = result.customerId;
      } else if (req.customerId) {
        // Regular session authentication
        customerId = req.customerId;
      } else {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      // Get all active muster points
      const points = await customerDb
        .select()
        .from(isolatedSchema.musterPoints)
        .where(eq(isolatedSchema.musterPoints.isActive, true))
        .orderBy(isolatedSchema.musterPoints.displayOrder);

      // Get active evacuation if any
      const activeEvacuations = await db.select()
        .from(sharedSchema.evacuations)
        .where(and(
          eq(sharedSchema.evacuations.customerId, customerId),
          eq(sharedSchema.evacuations.status, 'active')
        ))
        .limit(1);

      const activeEvacuation = activeEvacuations[0];

      // If there's an active evacuation, calculate stats for each muster point
      let stats: Record<string, any> = {};
      if (activeEvacuation) {
        for (const point of points) {
          const accountedAt = await db
            .select()
            .from(evacuationAccountability)
            .where(and(
              eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
              eq(evacuationAccountability.customerId, customerId),
              eq(evacuationAccountability.musterPoint, point.name),
              eq(evacuationAccountability.isAccountedFor, true)
            ));
          
          stats[point.name] = accountedAt.length;
        }
      }

      res.json({
        musterPoints: points,
        stats: stats,
        evacuationActive: !!activeEvacuation
      });
    } catch (error) {
      logger.error("Error fetching muster points with stats:", error);
      res.status(500).json({ error: "Failed to fetch muster points stats" });
    }
  });

  // Create muster point
  app.post("/api/muster-points", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { name, displayOrder } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Muster point name is required" });
      }

      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const [newPoint] = await customerDb
        .insert(isolatedSchema.musterPoints)
        .values({
          name,
          displayOrder: displayOrder || 0,
          isActive: true
        })
        .returning();

      res.json(newPoint);
    } catch (error) {
      logger.error("Error creating muster point:", error);
      res.status(500).json({ error: "Failed to create muster point" });
    }
  });

  // Update muster point
  app.put("/api/muster-points/:id", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const { name, displayOrder, isActive } = req.body;

      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const [updatedPoint] = await customerDb
        .update(isolatedSchema.musterPoints)
        .set({
          name,
          displayOrder,
          isActive,
          updatedAt: new Date()
        })
        .where(eq(isolatedSchema.musterPoints.id, id))
        .returning();

      if (!updatedPoint) {
        return res.status(404).json({ error: "Muster point not found" });
      }

      res.json(updatedPoint);
    } catch (error) {
      logger.error("Error updating muster point:", error);
      res.status(500).json({ error: "Failed to update muster point" });
    }
  });

  // Delete muster point
  app.delete("/api/muster-points/:id", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      await customerDb
        .delete(isolatedSchema.musterPoints)
        .where(eq(isolatedSchema.musterPoints.id, id));

      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting muster point:", error);
      res.status(500).json({ error: "Failed to delete muster point" });
    }
  });

  // Initialize default muster points for current customer (one-time setup for existing customers)
  app.post("/api/muster-points/init-defaults", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      // Check if muster points already exist
      const existing = await customerDb
        .select()
        .from(isolatedSchema.musterPoints)
        .limit(1);
      
      if (existing.length > 0) {
        return res.json({ 
          success: true, 
          message: "Muster points already initialized",
          count: existing.length 
        });
      }

      // Create default muster points
      const defaultMusterPoints = [
        { name: 'Main Car Park', displayOrder: 1, isActive: true },
        { name: 'Rear Assembly Area', displayOrder: 2, isActive: true },
        { name: 'Side Entrance', displayOrder: 3, isActive: true },
      ];
      
      for (const point of defaultMusterPoints) {
        await customerDb
          .insert(isolatedSchema.musterPoints)
          .values(point);
      }

      res.json({ 
        success: true, 
        message: "Default muster points initialized",
        count: defaultMusterPoints.length 
      });
    } catch (error) {
      logger.error("Error initializing default muster points:", error);
      res.status(500).json({ error: "Failed to initialize default muster points" });
    }
  });
  
  // Validate Fire Marshal emergency token
  app.get("/api/emergency/validate-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      const marshal = await databaseService.validateEmergencyToken(context, token);
      
      if (!marshal) {
        return res.status(401).json({
          error: "Invalid or expired token",
          message: "The emergency access token is invalid or has expired."
        });
      }
      
      // Get active evacuation for WebSocket registration
      const activeEvacuations = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.status, 'active'),
          eq(evacuations.customerId, context.customerId)
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      res.json({
        valid: true,
        marshal: {
          name: `${marshal.firstName} ${marshal.lastName}`,
          department: marshal.department,
          email: marshal.email
        },
        customerId: context.customerId,
        evacuationId: activeEvacuations[0]?.evacuationId
      });
    } catch (error) {
      logger.error("Error validating token:", error);
      res.status(500).json({ 
        error: "Token validation failed",
        message: "Unable to validate emergency access token." 
      });
    }
  });

  // Validate Fire Marshal by static URL ID - NEW STATIC URL SYSTEM
  app.get("/api/emergency/fire-marshal/:urlId", async (req, res) => {
    try {
      const { urlId } = req.params;
      
      logger.info(`Fire Marshal URL ID authentication attempt: ${urlId}`);
      
      // Find Fire Marshal by URL ID across all customers using DatabaseService
      const result = await databaseService.findFireMarshalByUrlId(urlId);
      
      if (!result) {
        logger.info(`No Fire Marshal found with URL ID: ${urlId}`);
        return res.status(401).json({
          error: "Invalid Fire Marshal link",
          message: "This Fire Marshal access link is not valid."
        });
      }
      
      const { marshal, customerId } = result;
      
      // Verify they are an active Fire Marshal
      if (!marshal.isFireMarshal || !marshal.isActive) {
        logger.info(`Staff member found but not an active Fire Marshal: ID ${marshal.id}`);
        return res.status(403).json({
          error: "Access denied",
          message: "You are not authorized as an active Fire Marshal."
        });
      }
      
      // Check if there's an active evacuation for their customer (using main database)
      const activeEvacuations = await db.select()
        .from(sharedSchema.evacuations)
        .where(and(
          eq(sharedSchema.evacuations.customerId, customerId),
          eq(sharedSchema.evacuations.status, 'active')
        ))
        .orderBy(desc(sharedSchema.evacuations.startedAt))
        .limit(1);
      
      const activeEvacuation = activeEvacuations[0];
      
      const customerRecord = await db.select().from(sharedSchema.customers).where(eq(sharedSchema.customers.id, customerId)).limit(1);
      const companyName = customerRecord[0]?.companyName || 'Unknown Company';
      
      logger.info(`Fire Marshal authenticated: ID ${marshal.id}`);
      logger.info(`Customer: ${customerId} (${companyName})`);
      logger.info(`Active Evacuation: ${activeEvacuation ? activeEvacuation.evacuationId : 'None'}`);
      
      res.json({
        valid: true,
        marshal: {
          id: marshal.id,
          name: `${marshal.firstName} ${marshal.lastName}`,
          department: marshal.department,
          email: marshal.email,
          customerId: customerId,
          companyName: companyName
        },
        evacuation: activeEvacuation ? {
          evacuationId: activeEvacuation.evacuationId,
          status: activeEvacuation.status,
          startedAt: activeEvacuation.startedAt,
          activatedBy: activeEvacuation.activatedBy,
          musterPoints: activeEvacuation.musterPoints
        } : null
      });
    } catch (error) {
      logger.error("Error validating Fire Marshal URL:", error);
      res.status(500).json({ 
        error: "Authentication failed",
        message: "Unable to validate Fire Marshal access." 
      });
    }
  });

  // Get current on-site personnel for Fire Marshal (by URL ID)
  app.get("/api/emergency/fire-marshal/:urlId/personnel", async (req, res) => {
    try {
      const { urlId } = req.params;
      
      // Validate Fire Marshal by URL ID
      const result = await databaseService.findFireMarshalByUrlId(urlId);
      
      if (!result) {
        return res.status(401).json({
          error: "Invalid Fire Marshal link",
          message: "This Fire Marshal access link is not valid."
        });
      }
      
      const { marshal, customerId } = result;
      
      // Verify they are an active Fire Marshal
      if (!marshal.isFireMarshal || !marshal.isActive) {
        return res.status(403).json({
          error: "Access denied",
          message: "You are not authorized as an active Fire Marshal."
        });
      }
      
      // Get customer database connection
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      // Get all checked-in staff directly from customer database
      const checkedInStaff = await customerDb
        .select()
        .from(isolatedSchema.staff)
        .where(eq(isolatedSchema.staff.isCheckedIn, true));
      
      // Get all current visitors
      const currentVisitors = await customerDb
        .select()
        .from(isolatedSchema.visitors)
        .where(eq(isolatedSchema.visitors.isCheckedIn, true))
        .orderBy(desc(isolatedSchema.visitors.checkedInAt));
      
      // Get all checked-in contractors
      const checkedInContractors = await customerDb
        .select()
        .from(isolatedSchema.contractorWorkers)
        .where(eq(isolatedSchema.contractorWorkers.isCheckedIn, true))
        .orderBy(desc(isolatedSchema.contractorWorkers.checkedInAt));
      
      logger.info(`CHECKED-IN CONTRACTORS: Found ${checkedInContractors.length} workers currently checked in`);
      
      let checkedInMembers: any[] = [];
      try {
        const [custSettings] = await customerDb
          .select()
          .from(isolatedSchema.companySettings)
          .limit(1);
        if (custSettings?.featureMembers === true) {
          checkedInMembers = await customerDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.isCheckedIn, true));
        }
      } catch (e) {
      }
      
      // CRITICAL FIX: Get active evacuation from public schema (filtered by customerId)
      // ORDER BY createdAt DESC to get the MOST RECENT active evacuation
      const activeEvacuation = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.customerId, customerId),
          eq(evacuations.status, 'active')
        ))
        .orderBy(desc(evacuations.createdAt))
        .limit(1);
      
      logger.info(`Active evacuation query result: ${activeEvacuation.length} evacuations found for customer ${customerId}`);
      
      let accountabilityMap = new Map<string, any>();
      
      if (activeEvacuation.length > 0) {
        const accountabilityRecords = await db
          .select()
          .from(evacuationAccountability)
          .where(
            and(
              eq(evacuationAccountability.evacuationId, activeEvacuation[0].evacuationId),
              eq(evacuationAccountability.customerId, customerId)
            )
          );
        
        accountabilityRecords.forEach(record => {
          accountabilityMap.set(record.personId, record);
        });
        
        logger.info(`Loaded ${accountabilityRecords.length} accountability records from PUBLIC SCHEMA for evacuation ${activeEvacuation[0].evacuationId}`);
      } else {
        logger.info(`No active evacuation found for customer ${customerId} - accountability status will default to false`);
      }
      
      // Fetch muster settings for this customer (gracefully handle missing table)
      let musterSettingsForMarshal = { statusOptionsEnabled: false, statusOptions: ['Location unknown', 'Working remotely / offsite', 'Sent to another location'] };
      try {
        const [msRow] = await customerDb
          .select()
          .from(isolatedSchema.musterSettings)
          .where(eq(isolatedSchema.musterSettings.customerId, customerId))
          .limit(1);
        if (msRow) {
          musterSettingsForMarshal = {
            statusOptionsEnabled: msRow.statusOptionsEnabled,
            statusOptions: msRow.statusOptions || musterSettingsForMarshal.statusOptions,
          };
        }
      } catch { /* table may not exist yet */ }

      // Combine all personnel for Fire Marshal view with REAL accountability status
      const personnelList = [
        ...checkedInStaff.map(staff => {
          const accountabilityRecord = accountabilityMap.get(staff.id);
          return {
            id: staff.id,
            name: `${staff.firstName} ${staff.lastName}`,
            type: 'staff' as const,
            department: staff.department,
            checkedInAt: staff.checkedInAt || staff.createdAt,
            location: accountabilityRecord?.lastKnownLocation || (staff as any).zoneName || 'Building A',
            zoneId: accountabilityRecord?.zoneId || (staff as any).zoneId || null,
            isAccountedFor: accountabilityRecord?.isAccountedFor || false,
            accountedBy: accountabilityRecord?.accountedBy,
            accountedAt: accountabilityRecord?.accountedAt?.toISOString(),
            musterPoint: accountabilityRecord?.musterPoint,
            statusOption: (accountabilityRecord as any)?.statusOption ?? null,
            needsEvacuationAssistance: (staff as any).needsEvacuationAssistance ?? false
          };
        }),
        ...currentVisitors.map(visitor => {
          const accountabilityRecord = accountabilityMap.get(visitor.id);
          return {
            id: visitor.id,
            name: `${visitor.firstName} ${visitor.lastName}`,
            type: 'visitor' as const,
            company: visitor.company,
            checkedInAt: visitor.checkedInAt,
            location: accountabilityRecord?.lastKnownLocation || (visitor as any).zoneName || 'Reception',
            zoneId: accountabilityRecord?.zoneId || (visitor as any).zoneId || null,
            isAccountedFor: accountabilityRecord?.isAccountedFor || false,
            accountedBy: accountabilityRecord?.accountedBy,
            accountedAt: accountabilityRecord?.accountedAt?.toISOString(),
            musterPoint: accountabilityRecord?.musterPoint,
            statusOption: (accountabilityRecord as any)?.statusOption ?? null,
            needsEvacuationAssistance: (visitor as any).needsEvacuationAssistance ?? false
          };
        }),
        ...checkedInContractors.map(contractor => {
          const accountabilityRecord = accountabilityMap.get(contractor.id);
          return {
            id: contractor.id,
            name: `${contractor.firstName} ${contractor.lastName}`,
            type: 'contractor' as const,
            department: contractor.department,
            checkedInAt: contractor.checkedInAt,
            location: accountabilityRecord?.lastKnownLocation || (contractor as any).zoneName || 'Site',
            zoneId: accountabilityRecord?.zoneId || (contractor as any).zoneId || null,
            isAccountedFor: accountabilityRecord?.isAccountedFor || false,
            accountedBy: accountabilityRecord?.accountedBy,
            accountedAt: accountabilityRecord?.accountedAt?.toISOString(),
            musterPoint: accountabilityRecord?.musterPoint,
            statusOption: (accountabilityRecord as any)?.statusOption ?? null,
            needsEvacuationAssistance: (contractor as any).needsEvacuationAssistance ?? false
          };
        }),
        ...checkedInMembers.map(member => {
          const accountabilityRecord = accountabilityMap.get(member.id);
          return {
            id: member.id,
            name: `${member.firstName} ${member.lastName}`,
            type: 'member' as const,
            company: null,
            department: member.membershipType || 'Member',
            checkedInAt: member.checkedInAt || member.createdAt,
            location: accountabilityRecord?.lastKnownLocation || (member as any).zoneName || 'Building A',
            zoneId: accountabilityRecord?.zoneId || (member as any).zoneId || null,
            isAccountedFor: accountabilityRecord?.isAccountedFor || false,
            accountedBy: accountabilityRecord?.accountedBy,
            accountedAt: accountabilityRecord?.accountedAt?.toISOString(),
            musterPoint: accountabilityRecord?.musterPoint,
            statusOption: (accountabilityRecord as any)?.statusOption ?? null,
            needsEvacuationAssistance: false
          };
        })
      ];
      
      // Prevent browser caching for real-time updates
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({
        people: personnelList,
        totalOnSite: personnelList.length,
        accountedFor: personnelList.filter(p => p.isAccountedFor).length,
        unaccounted: personnelList.filter(p => !p.isAccountedFor).length,
        evacuationId: activeEvacuation.length > 0 ? activeEvacuation[0].evacuationId : null,
        musterSettings: musterSettingsForMarshal,
      });
    } catch (error) {
      logger.error("Error fetching Fire Marshal personnel:", error);
      res.status(500).json({ 
        error: "Failed to fetch personnel",
        message: "Unable to retrieve on-site personnel data." 
      });
    }
  });

  // PUBLIC ROUTE: Mark person safe via email token (no authentication required)
  app.get("/mark-safe/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Parse token to extract customerId (format: customerId.randomToken)
      const tokenParts = token.split('.');
      if (tokenParts.length < 2) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Invalid Link</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="error">❌ Invalid Safety Link</div>
            <div class="message">This safety confirmation link is not valid. Please contact your emergency coordinator.</div>
          </body>
          </html>
        `);
      }
      
      const customerId = tokenParts[0];
      
      // Get customer database
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      // Find token in database
      const tokenRecords = await customerDb
        .select()
        .from(isolatedSchema.safetyTokens)
        .where(eq(isolatedSchema.safetyTokens.token, token))
        .limit(1);
      
      if (tokenRecords.length === 0) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Link Not Found</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="error">❌ Link Not Found</div>
            <div class="message">This safety confirmation link was not found or may have been deleted.</div>
          </body>
          </html>
        `);
      }
      
      const tokenRecord = tokenRecords[0];
      
      // Check if token is already used
      if (tokenRecord.isUsed) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Already Marked Safe</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; background: #f0fdf4; }
              .success { color: #16a34a; font-size: 28px; margin-bottom: 20px; }
              .message { color: #166534; font-size: 16px; line-height: 1.6; background: white; padding: 20px; border-radius: 8px; border: 2px solid #16a34a; }
              .person-name { font-weight: bold; color: #15803d; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="success">✅ Already Safe</div>
            <div class="message">
              <div class="person-name">${tokenRecord.personName}</div>
              <p>You have already been marked safe in this evacuation.</p>
              <p>This confirmation was recorded at: ${tokenRecord.usedAt?.toLocaleString() || 'Unknown'}</p>
            </div>
          </body>
          </html>
        `);
      }
      
      // Check if token is expired
      if (new Date() > new Date(tokenRecord.expiresAt)) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Link Expired</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="error">⏰ Link Expired</div>
            <div class="message">This safety confirmation link has expired. Please contact your emergency coordinator for assistance.</div>
          </body>
          </html>
        `);
      }
      
      // Mark person as accounted for in evacuationAccountability (shared database)
      const accountabilityRecords = await db
        .select()
        .from(sharedSchema.evacuationAccountability)
        .where(and(
          eq(sharedSchema.evacuationAccountability.evacuationId, tokenRecord.evacuationId),
          eq(sharedSchema.evacuationAccountability.personId, tokenRecord.personId),
          eq(sharedSchema.evacuationAccountability.customerId, customerId)
        ))
        .limit(1);
      
      if (accountabilityRecords.length > 0) {
        await db
          .update(sharedSchema.evacuationAccountability)
          .set({
            isAccountedFor: true,
            accountedBy: 'Self (Email)',
            accountedAt: new Date(),
            musterPoint: 'Self-Reported Safe'
          })
          .where(eq(sharedSchema.evacuationAccountability.id, accountabilityRecords[0].id));
      }
      
      // Mark token as used
      await customerDb
        .update(isolatedSchema.safetyTokens)
        .set({
          isUsed: true,
          usedAt: new Date()
        })
        .where(eq(isolatedSchema.safetyTokens.id, tokenRecord.id));
      
      // Return success page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Marked Safe - Evacuation</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
              background: linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.1);
              border: 3px solid #16a34a;
            }
            .success-icon {
              font-size: 72px;
              margin-bottom: 20px;
              animation: bounce 0.6s;
            }
            @keyframes bounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-20px); }
            }
            .title {
              color: #15803d;
              font-size: 32px;
              font-weight: bold;
              margin-bottom: 20px;
            }
            .person-name {
              font-size: 24px;
              color: #166534;
              margin: 20px 0;
              padding: 15px;
              background: #dcfce7;
              border-radius: 8px;
            }
            .message {
              color: #166534;
              font-size: 18px;
              line-height: 1.8;
              margin: 20px 0;
            }
            .info {
              background: #f0fdf4;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
              font-size: 14px;
              color: #15803d;
            }
            .timestamp {
              font-size: 14px;
              color: #16a34a;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✅</div>
            <div class="title">Successfully Marked Safe</div>
            <div class="person-name">${tokenRecord.personName}</div>
            <div class="message">
              You have been successfully marked as safe in the current evacuation.
              <br><br>
              Emergency coordinators have been notified of your safety status.
            </div>
            <div class="info">
              <strong>What happens next:</strong><br>
              • Your status has been updated in the emergency system<br>
              • Fire Marshals can see you are accounted for<br>
              • Follow all instructions from emergency personnel<br>
              • Stay at your designated muster point until given the all-clear
            </div>
            <div class="timestamp">
              Confirmed at: ${new Date().toLocaleString()}
            </div>
          </div>
        </body>
        </html>
      `);
      
      logger.info(`SELF MARK-SAFE: ${tokenRecord.personName} (${tokenRecord.personType}) marked safe via email token`);
      
    } catch (error) {
      logger.error("Error processing mark-safe token:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc2626; font-size: 24px; margin-bottom: 20px; }
            .message { color: #666; font-size: 16px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="error">❌ Error</div>
          <div class="message">An error occurred while processing your safety confirmation. Please contact your emergency coordinator.</div>
        </body>
        </html>
      `);
    }
  });

  // Get current Fire Marshal emergency link (requires authentication)
  app.get("/api/emergency/my-link", requireAuth, async (req, res) => {
    try {
      const customerId = req.user?.customerId;
      const userId = req.user?.id;
      
      if (!customerId || !userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Get the logged-in user's staff record
      const fmContext = simpleDatabaseService.createCustomerContext(req.user!.username, req.customerId);
      const allStaff = await databaseService.getAllStaff(fmContext);
      const staffMember = allStaff.find(s => 
        s.userId === userId && 
        s.isFireMarshal === true && 
        s.isActive === true
      );

      if (!staffMember) {
        return res.status(403).json({ error: "You are not authorized as a Fire Marshal" });
      }

      if (!staffMember.emergencyToken) {
        return res.status(404).json({ 
          error: "No emergency link available",
          message: "Emergency links are generated when an evacuation is activated."
        });
      }

      // Check if token is expired
      if (staffMember.emergencyTokenExpires && staffMember.emergencyTokenExpires < new Date()) {
        return res.status(404).json({ 
          error: "Emergency link expired",
          message: "Your emergency link has expired. A new one will be generated during the next evacuation."
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fireMarshalLink = `${baseUrl}/fire-marshal-mobile?token=${staffMember.emergencyToken}`;

      res.json({
        link: fireMarshalLink,
        token: staffMember.emergencyToken,
        expires: staffMember.emergencyTokenExpires,
        marshal: {
          name: `${staffMember.firstName} ${staffMember.lastName}`,
          department: staffMember.department,
          email: staffMember.email
        }
      });
    } catch (error) {
      logger.error("Error fetching Fire Marshal link:", error);
      res.status(500).json({ error: "Failed to fetch emergency link" });
    }
  });
  
  // Emergency muster list for Fire Marshals (token-based access)
  app.get("/api/emergency/muster/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      // Get customer context for isolation based on logged-in user
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate Fire Marshal token
      const marshal = await databaseService.validateEmergencyToken(context, token);
      if (!marshal) {
        return res.status(401).json({ error: "Invalid or expired emergency token" });
      }
      
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      
      const [currentVisitors, checkedInStaff, contractorCompanies, zones] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getAllContractorCompanies(context),
        custDb.select().from(isolatedSchema.evacuationZones).orderBy(isolatedSchema.evacuationZones.displayOrder),
      ]);

      // Build zone lookup map
      const zoneMap = new Map(zones.map(z => [z.id, { id: z.id, name: z.name, color: z.color }]));

      // Get all checked-in contractors
      let checkedInContractors: any[] = [];
      for (const company of contractorCompanies) {
        const workers = await databaseService.getWorkersByCompanyId(context, company.id);
        checkedInContractors.push(
          ...workers
            .filter(worker => worker.isCheckedIn)
            .map(worker => ({
              id: worker.id,
              name: `${worker.firstName} ${worker.lastName}`,
              type: 'contractor' as const,
              company: company.name,
              checkedInAt: worker.checkedInAt || worker.createdAt,
              location: worker.zoneId ? (zoneMap.get(worker.zoneId)?.name || 'Zone ' + worker.zoneId) : 'Unassigned',
              zoneId: worker.zoneId || null,
              zoneName: worker.zoneId ? (zoneMap.get(worker.zoneId)?.name || null) : null,
              zoneColor: worker.zoneId ? (zoneMap.get(worker.zoneId)?.color || null) : null,
              accounted: worker.isAccountedFor || false,
              needsEvacuationAssistance: (worker as any).needsEvacuationAssistance || false,
              email: (worker as any).email || null,
            }))
        );
      }
      
      // Fetch active evacuation to get statusOption values from evacuationAccountability
      const [activeEvacForStatus] = await db
        .select()
        .from(evacuations)
        .where(and(eq(evacuations.customerId, context.customerId as any), eq(evacuations.status, 'active')))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);

      // Build personId → statusOption map from evacuationAccountability
      const statusOptionMap = new Map<string, string | null>();
      if (activeEvacForStatus) {
        const accountabilityRows = await db
          .select({ personId: evacuationAccountability.personId, statusOption: evacuationAccountability.statusOption })
          .from(evacuationAccountability)
          .where(eq(evacuationAccountability.evacuationId, activeEvacForStatus.evacuationId));
        for (const row of accountabilityRows) {
          statusOptionMap.set(row.personId, (row as any).statusOption ?? null);
        }
      }

      // Fetch musterSettings for this customer
      let musterSettingsData = { statusOptionsEnabled: false, statusOptions: ['Location unknown', 'Working remotely / offsite', 'Sent to another location'] };
      try {
        const [msRow] = await custDb
          .select()
          .from(isolatedSchema.musterSettings)
          .where(eq(isolatedSchema.musterSettings.customerId, context.customerId))
          .limit(1);
        if (msRow) {
          musterSettingsData = {
            statusOptionsEnabled: msRow.statusOptionsEnabled,
            statusOptions: msRow.statusOptions || musterSettingsData.statusOptions,
          };
        }
      } catch { /* muster_settings table may not exist yet on older schemas */ }

      const musterList = [
        ...checkedInStaff.map(staff => ({
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          type: 'staff' as const,
          department: staff.department,
          checkedInAt: staff.checkedInAt || staff.createdAt,
          location: (staff as any).zoneId ? (zoneMap.get((staff as any).zoneId)?.name || 'Zone ' + (staff as any).zoneId) : 'Unassigned',
          zoneId: (staff as any).zoneId || null,
          zoneName: (staff as any).zoneId ? (zoneMap.get((staff as any).zoneId)?.name || null) : null,
          zoneColor: (staff as any).zoneId ? (zoneMap.get((staff as any).zoneId)?.color || null) : null,
          accounted: staff.isAccountedFor || false,
          needsEvacuationAssistance: (staff as any).needsEvacuationAssistance || false,
          hasEmail: !!staff.email,
          statusOption: statusOptionMap.get(staff.id) ?? null,
        })),
        ...currentVisitors.map(visitor => ({
          id: visitor.id,
          name: `${visitor.firstName} ${visitor.lastName}`,
          type: 'visitor' as const,
          company: visitor.company,
          checkedInAt: visitor.checkedInAt,
          location: (visitor as any).zoneId ? (zoneMap.get((visitor as any).zoneId)?.name || 'Zone ' + (visitor as any).zoneId) : 'Unassigned',
          zoneId: (visitor as any).zoneId || null,
          zoneName: (visitor as any).zoneId ? (zoneMap.get((visitor as any).zoneId)?.name || null) : null,
          zoneColor: (visitor as any).zoneId ? (zoneMap.get((visitor as any).zoneId)?.color || null) : null,
          accounted: visitor.isAccountedFor || false,
          needsEvacuationAssistance: (visitor as any).needsEvacuationAssistance || false,
          hasEmail: !!visitor.email,
          statusOption: statusOptionMap.get(visitor.id) ?? null,
        })),
        ...checkedInContractors.map(c => ({ ...c, hasEmail: !!c.email, statusOption: statusOptionMap.get(c.id) ?? null }))
      ];
      
      // Prevent browser caching for real-time updates
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({ people: musterList, musterSettings: musterSettingsData });
    } catch (error) {
      logger.error("Failed to fetch emergency muster list:", error);
      res.status(500).json({ error: "Failed to fetch emergency muster list" });
    }
  });

  // Get zones for fire marshal via permanent URL ID
  app.get("/api/emergency/fire-marshal/:urlId/zones", async (req, res) => {
    try {
      const { urlId } = req.params;
      const marshalResult = await databaseService.findFireMarshalByUrlId(urlId);
      if (!marshalResult) {
        return res.status(401).json({ error: "Invalid Fire Marshal link" });
      }
      const { marshal, customerId } = marshalResult;
      const custDb = await customerDbService.getCustomerDatabase(customerId);
      const zones = await custDb
        .select()
        .from(isolatedSchema.evacuationZones)
        .where(eq(isolatedSchema.evacuationZones.isActive, true))
        .orderBy(isolatedSchema.evacuationZones.displayOrder);
      const marshalZoneId = (marshal as any).zoneId || null;
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ zones, marshalZoneId });
    } catch (error) {
      logger.error("Failed to fetch zones for fire marshal by URL ID:", error);
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  // Get zones for fire marshal (token-based, no auth required)
  app.get("/api/emergency/zones/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      const marshal = await databaseService.validateEmergencyToken(context, token);
      if (!marshal) {
        return res.status(401).json({ error: "Invalid or expired emergency token" });
      }
      const custDb = await customerDbService.getCustomerDatabase(context.customerId);
      const zones = await custDb
        .select()
        .from(isolatedSchema.evacuationZones)
        .where(eq(isolatedSchema.evacuationZones.isActive, true))
        .orderBy(isolatedSchema.evacuationZones.displayOrder);
      // Also return the marshal's assigned zone
      const marshalZoneId = (marshal as any).zoneId || null;
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ zones, marshalZoneId });
    } catch (error) {
      logger.error("Failed to fetch zones for fire marshal:", error);
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });
  
  // Toggle accounted status for Fire Marshals (token-based access)
  app.post("/api/emergency/toggle-accounted/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { personId, type, statusOption } = req.body as { personId: string; type: string; statusOption?: string | null };
      
      // Get customer context for isolation based on logged-in user
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Validate Fire Marshal token
      const marshal = await databaseService.validateEmergencyToken(context, token);
      if (!marshal) {
        return res.status(401).json({ error: "Invalid or expired emergency token" });
      }
      
      // Get active evacuation for WebSocket broadcasting and accountability update
      const activeEvacuations = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.status, 'active'),
          eq(evacuations.customerId, context.customerId)
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      const activeEvacuation = activeEvacuations[0];
      
      let success = false;
      let personName = "Unknown";
      let accounted = false;
      
      if (type === 'staff') {
        success = await databaseService.toggleStaffAccountedStatus(context, personId);
        const staff = await databaseService.getStaffById(context, personId);
        if (staff) {
          personName = `${staff.firstName} ${staff.lastName}`;
          accounted = staff.isAccountedFor || false;
        }
      } else if (type === 'visitor') {
        success = await databaseService.toggleVisitorAccountedStatus(context, personId);
        const visitor = await databaseService.getVisitorById(context, personId);
        if (visitor) {
          personName = `${visitor.firstName} ${visitor.lastName}`;
          accounted = visitor.isAccountedFor || false;
        }
      } else if (type === 'contractor') {
        success = await databaseService.toggleContractorAccountedStatus(context, personId);
      } else if (type === 'member') {
        try {
          const custDb = await customerDbService.getCustomerDatabase(context.customerId);
          const [member] = await custDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.id, personId));
          if (member) {
            const newMemberStatus = !member.isAccountedFor;
            await custDb
              .update(isolatedSchema.members)
              .set({ isAccountedFor: newMemberStatus, updatedAt: new Date() })
              .where(eq(isolatedSchema.members.id, personId));
            personName = `${member.firstName} ${member.lastName}`;
            accounted = member.isAccountedFor || false;
            success = true;
          }
        } catch (e) {
          logger.error('Failed to toggle member accounted status:', e);
        }
      } else {
        return res.status(400).json({ error: "Invalid person type" });
      }
      
      if (!success) {
        return res.status(404).json({ error: "Person not found" });
      }

      const newAccountedStatus = !accounted;
      const marshalName = `${marshal.firstName} ${marshal.lastName}`;

      // Update or insert evacuationAccountability record to persist statusOption and accounted state
      if (activeEvacuation) {
        try {
          const updateResult = await db
            .update(evacuationAccountability)
            .set({
              isAccountedFor: newAccountedStatus,
              statusOption: newAccountedStatus ? (statusOption ?? null) : null,
              accountedBy: newAccountedStatus ? marshalName : null,
              accountedAt: newAccountedStatus ? new Date() : null,
              updatedAt: new Date(),
            } as any)
            .where(and(
              eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
              eq(evacuationAccountability.personId, personId),
              eq(evacuationAccountability.customerId, context.customerId as any)
            ))
            .returning();

          if (updateResult.length === 0) {
            // Person not yet in accountability table (late arrival) — insert
            await db.insert(evacuationAccountability).values({
              evacuationId: activeEvacuation.evacuationId,
              customerId: context.customerId || '',
              personId,
              personType: type as any,
              personName,
              isAccountedFor: newAccountedStatus,
              statusOption: newAccountedStatus ? (statusOption ?? null) : null,
              accountedBy: newAccountedStatus ? marshalName : null,
              accountedAt: newAccountedStatus ? new Date() : null,
            } as any);
          }
        } catch (e) {
          logger.warn('Could not update evacuationAccountability during toggle:', (e as Error)?.message?.substring(0, 80));
        }
      }
      
      // Broadcast update via WebSocket for real-time sync
      if (activeEvacuation) {
        websocketService.broadcastMusterUpdate(
          context.customerId,
          activeEvacuation.evacuationId,
          {
            personId,
            personName,
            personType: type as 'staff' | 'visitor' | 'contractor' | 'member',
            isAccountedFor: newAccountedStatus,
            statusOption: newAccountedStatus ? (statusOption ?? null) : null,
          } as any
        );
      }
      
      res.json({ 
        success: true, 
        name: personName,
        accounted: newAccountedStatus,
        statusOption: newAccountedStatus ? (statusOption ?? null) : null,
      });
    } catch (error) {
      logger.error("Failed to toggle accounted status:", error);
      res.status(500).json({ error: "Failed to toggle accounted status" });
    }
  });

  // Staff endpoints


  // ID Card printing endpoint

  // ID Card template management endpoints

  // Helper function to generate HTML content for ID card printing

  // Get checked-in staff endpoint


  // Time & Attendance report endpoint

  // Company endpoints (for autocomplete)
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get unique companies from visitors with customer isolation
      const visitors = await databaseService.getAllVisitors(context);
      const uniqueCompanies = [...new Set(visitors.map((v: any) => v.company).filter(Boolean))];
      const companies = uniqueCompanies;
      res.json(companies);
    } catch (error) {
      logger.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  // Member endpoints

  // Only these fields may be set by the client when creating/updating a member.
  // Everything else (id, qrCode, isActive, isCheckedIn, isAccountedFor, timestamps)
  // is controlled by the server only.
  const MEMBER_EDITABLE_FIELDS = [
    'firstName', 'lastName', 'email', 'phoneNumber', 'photoUrl',
    'membershipType', 'membershipId', 'membershipNumber',
    'joinDate', 'expiryDate', 'membershipStatus', 'notes',
  ] as const;

  function pickMemberFields(body: any) {
    const out: Record<string, any> = {};
    for (const key of MEMBER_EDITABLE_FIELDS) {
      if (body[key] !== undefined) {
        out[key] = body[key] === '' ? null : body[key];
      }
    }
    return out;
  }

  app.get("/api/members", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const allMembers = await customerDb
        .select()
        .from(isolatedSchema.members)
        .where(eq(isolatedSchema.members.isActive, true))
        .orderBy(desc(isolatedSchema.members.createdAt));
      
      res.json(allMembers);
    } catch (error) {
      logger.error("Failed to fetch members:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.post("/api/members", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const memberData = pickMemberFields(req.body);
      if (!memberData.firstName || !memberData.lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }
      const qrCode = `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const [newMember] = await customerDb
        .insert(isolatedSchema.members)
        .values({
          ...memberData,
          qrCode,
        })
        .returning();
      
      res.status(201).json(newMember);
    } catch (error) {
      logger.error("Failed to create member:", error);
      res.status(500).json({ error: "Failed to create member" });
    }
  });

  app.patch("/api/members/:id", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const { id } = req.params;
      const updates = pickMemberFields(req.body);
      
      const [updated] = await customerDb
        .update(isolatedSchema.members)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      res.json(updated);
    } catch (error) {
      logger.error("Failed to update member:", error);
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  app.delete("/api/members/:id", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const { id } = req.params;
      
      const [deactivated] = await customerDb
        .update(isolatedSchema.members)
        .set({
          isActive: false,
          isCheckedIn: false,
          checkedOutAt: new Date(),
          checkoutType: 'deleted',
          isAccountedFor: false,
          zoneId: null,
          updatedAt: new Date(),
        })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
      
      if (!deactivated) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      res.json({ message: "Member removed successfully" });
    } catch (error) {
      logger.error("Failed to delete member:", error);
      res.status(500).json({ error: "Failed to delete member" });
    }
  });

  app.post("/api/members/:id/check-in", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const { id } = req.params;
      
      const [updated] = await customerDb
        .update(isolatedSchema.members)
        .set({ 
          isCheckedIn: true, 
          checkedInAt: new Date(),
          checkedOutAt: null,
          isAccountedFor: false,
          updatedAt: new Date() 
        })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      websocketService.broadcastPersonnelUpdate(customerId, {
        personId: updated.id,
        personName: `${updated.firstName} ${updated.lastName}`,
        personType: 'member',
        action: 'checkin'
      });
      
      res.json(updated);
    } catch (error) {
      logger.error("Failed to check in member:", error);
      res.status(500).json({ error: "Failed to check in member" });
    }
  });

  app.post("/api/members/:id/check-out", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const { id } = req.params;
      
      const [updated] = await customerDb
        .update(isolatedSchema.members)
        .set({ 
          isCheckedIn: false, 
          checkedOutAt: new Date(),
          checkoutType: 'manual',
          updatedAt: new Date() 
        })
        .where(eq(isolatedSchema.members.id, id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      websocketService.broadcastPersonnelUpdate(customerId, {
        personId: updated.id,
        personName: `${updated.firstName} ${updated.lastName}`,
        personType: 'member',
        action: 'checkout'
      });
      
      res.json(updated);
    } catch (error) {
      logger.error("Failed to check out member:", error);
      res.status(500).json({ error: "Failed to check out member" });
    }
  });

  app.get("/api/members/checked-in", requireAuth, async (req, res) => {
    try {
      const customerId = req.customerId;
      if (!customerId) return res.status(401).json({ error: "No tenant context" });
      const customerDb = await customerDbService.getCustomerDatabase(customerId);
      
      const checkedIn = await customerDb
        .select()
        .from(isolatedSchema.members)
        .where(
          and(
            eq(isolatedSchema.members.isActive, true),
            eq(isolatedSchema.members.isCheckedIn, true)
          )
        )
        .orderBy(desc(isolatedSchema.members.checkedInAt));
      
      res.json(checkedIn);
    } catch (error) {
      logger.error("Failed to fetch checked-in members:", error);
      res.status(500).json({ error: "Failed to fetch checked-in members" });
    }
  });

  // CLUe Cloud Platform Integration Endpoints
  
  // Webhook endpoint for CLUe scan events
  app.post("/api/clue/webhook", async (req, res) => {
    try {
      const signature = req.headers["x-clue-signature"] as string;
      const payload = JSON.stringify(req.body);
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings for CLUe configuration
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!companySettings?.clueEnabled) {
        return res.status(400).json({ error: "CLUe integration not enabled" });
      }
      
      // Import and use CLUe service
      const { ClueService } = await import("../clueService");
      const clueService = new ClueService(companySettings);
      
      // Verify webhook signature for security
      if (signature && !clueService.verifyWebhookSignature(payload, signature)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
      
      // Process the webhook event
      const result = await clueService.processWebhookEvent(req.body);
      
      // Handle specific actions based on event type
      if (result.action === "check_in_out" && req.body.qr_code) {
        // Find visitor by QR code and toggle check-in/out
        const visitor = await databaseService.getVisitorByQrCode(context, req.body.qr_code);
        if (visitor) {
          if (visitor.checkedOutAt) {
            // Visitor is checking back in
            await databaseService.updateVisitor(context, visitor.id, {
              ...visitor,
              checkedOutAt: null,
              checkedInAt: new Date()
            });
          } else {
            // Visitor is checking out
            await databaseService.checkOutVisitor(context, visitor.id);
          }
        }
      }
      
      res.json({ 
        success: true, 
        processed: result.processed,
        message: result.message 
      });
    } catch (error) {
      logger.error("Error processing CLUe webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
  
  // Generate dynamic QR code for visitor
  app.post("/api/clue/generate-qr", requireAuth, async (req, res) => {
    try {
      const { visitorId } = req.body;
      
      if (!visitorId) {
        return res.status(400).json({ error: "Visitor ID is required" });
      }
      
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings and visitor
      const [companySettings, visitor] = await Promise.all([
        simpleDatabaseService.getCompanySettings(context),
        databaseService.getVisitorById(context, visitorId)
      ]);
      
      if (!companySettings?.clueEnabled) {
        return res.status(400).json({ error: "CLUe integration not enabled" });
      }
      
      if (!visitor) {
        return res.status(404).json({ error: "Visitor not found" });
      }
      
      // Import and use CLUe service
      const { ClueService } = await import("../clueService");
      const clueService = new ClueService(companySettings);
      
      // Generate dynamic QR code
      const qrResponse = await clueService.generateDynamicQR({
        user_id: visitor.id,
        user_name: `${visitor.firstName} ${visitor.lastName}`,
        email: visitor.email || undefined,
        validity_minutes: parseInt(companySettings.clueQrValidityMinutes || "60"),
        metadata: {
          company: visitor.company,
          host: visitor.hostStaffId,
          purpose: visitor.purpose
        }
      });
      
      if (!qrResponse) {
        return res.status(500).json({ error: "Failed to generate QR code" });
      }
      
      // Update visitor with QR code
      await databaseService.updateVisitor(context, visitorId, {
        ...visitor,
        qrCode: qrResponse.qr_code,
        ePassUrl: qrResponse.access_url
      });
      
      res.json({
        success: true,
        qrCode: qrResponse.qr_code,
        validUntil: qrResponse.valid_until,
        accessUrl: qrResponse.access_url
      });
    } catch (error) {
      logger.error("Error generating CLUe QR code:", error);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });
  
  // Test CLUe connection
  app.post("/api/clue/test-connection", requireAuth, async (req, res) => {
    try {
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!companySettings?.clueEnabled) {
        return res.status(400).json({ error: "CLUe integration not enabled" });
      }
      
      // Import and use CLUe service
      const { ClueService } = await import("../clueService");
      const clueService = new ClueService(companySettings);
      
      // Test connection
      const testResult = await clueService.testConnection();
      
      res.json(testResult);
    } catch (error) {
      logger.error("Error testing CLUe connection:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to test connection",
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Sync with CLUe platform
  app.post("/api/clue/sync", requireAuth, async (req, res) => {
    try {
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings and current people
      const [companySettings, visitors, staff] = await Promise.all([
        simpleDatabaseService.getCompanySettings(context),
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context)
      ]);
      
      if (!companySettings?.clueEnabled) {
        return res.status(400).json({ error: "CLUe integration not enabled" });
      }
      
      // Import and use CLUe service
      const { ClueService } = await import("../clueService");
      const clueService = new ClueService(companySettings);
      
      // Sync with platform
      const syncResult = await clueService.syncWithPlatform(staff, visitors);
      
      // Update last sync timestamp
      await simpleDatabaseService.updateCompanySettings(context, {
        ...companySettings,
        clueLastSync: new Date()
      });
      
      res.json({
        success: true,
        synced: syncResult.synced,
        failed: syncResult.failed,
        errors: syncResult.errors,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("Error syncing with CLUe:", error);
      res.status(500).json({ error: "Failed to sync with CLUe platform" });
    }
  });
  
  // Get CLUe devices
  app.get("/api/clue/devices", requireAuth, async (req, res) => {
    try {
      // FIXED: Get customer context using authenticated session customerId
      if (!req.session?.customerId) {
        return res.status(401).json({ error: "Customer context not found in session" });
      }
      const context = { customerId: req.customerId };
      
      // Get company settings
      const companySettings = await simpleDatabaseService.getCompanySettings(context);
      
      if (!companySettings?.clueEnabled) {
        return res.status(400).json({ error: "CLUe integration not enabled" });
      }
      
      // Import and use CLUe service
      const { ClueService } = await import("../clueService");
      const clueService = new ClueService(companySettings);
      
      // Get devices
      const devices = await clueService.getDevices();
      
      res.json({
        success: true,
        devices: devices,
        count: devices.length
      });
    } catch (error) {
      logger.error("Error fetching CLUe devices:", error);
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });

  // Muster accounted status toggle endpoint
  app.post("/api/muster/:personId/toggle", async (req, res) => {
    try {
      const { personId } = req.params;
      const { type } = req.body;
      
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);

      // Get customer DB and active evacuation in parallel — one round-trip each
      const [custDb, activeEvacuations] = await Promise.all([
        customerDbService.getCustomerDatabase(context.customerId),
        db.select()
          .from(evacuations)
          .where(and(eq(evacuations.status, 'active'), eq(evacuations.customerId, context.customerId)))
          .orderBy(desc(evacuations.startedAt))
          .limit(1),
      ]);
      
      const activeEvacuation = activeEvacuations[0];
      
      let updated = false;
      let personName = "Unknown";
      let newStatus = false;
      
      if (type === 'staff') {
        // Direct single-row lookup — no full-list fetch
        const [staffMember] = await custDb
          .select({ id: isolatedSchema.staff.id, firstName: isolatedSchema.staff.firstName, lastName: isolatedSchema.staff.lastName, isAccountedFor: isolatedSchema.staff.isAccountedFor })
          .from(isolatedSchema.staff)
          .where(eq(isolatedSchema.staff.id, personId))
          .limit(1);
        if (staffMember) {
          newStatus = !staffMember.isAccountedFor;
          personName = `${staffMember.firstName} ${staffMember.lastName}`;
          await custDb
            .update(isolatedSchema.staff)
            .set({ isAccountedFor: newStatus })
            .where(eq(isolatedSchema.staff.id, personId));
          updated = true;
        }
      } else if (type === 'visitor') {
        // Direct single-row lookup — no full-list fetch
        const [visitor] = await custDb
          .select({ id: isolatedSchema.visitors.id, firstName: isolatedSchema.visitors.firstName, lastName: isolatedSchema.visitors.lastName, isAccountedFor: isolatedSchema.visitors.isAccountedFor })
          .from(isolatedSchema.visitors)
          .where(eq(isolatedSchema.visitors.id, personId))
          .limit(1);
        if (visitor) {
          newStatus = !visitor.isAccountedFor;
          personName = `${visitor.firstName} ${visitor.lastName}`;
          await custDb
            .update(isolatedSchema.visitors)
            .set({ isAccountedFor: newStatus })
            .where(eq(isolatedSchema.visitors.id, personId));
          updated = true;
        }
      } else if (type === 'contractor') {
        // Direct single-row lookup — no full-list fetch
        const [contractor] = await custDb
          .select({ id: isolatedSchema.contractorWorkers.id, firstName: isolatedSchema.contractorWorkers.firstName, lastName: isolatedSchema.contractorWorkers.lastName, isAccountedFor: isolatedSchema.contractorWorkers.isAccountedFor })
          .from(isolatedSchema.contractorWorkers)
          .where(eq(isolatedSchema.contractorWorkers.id, personId))
          .limit(1);
        if (contractor) {
          newStatus = !contractor.isAccountedFor;
          personName = `${contractor.firstName} ${contractor.lastName}`;
          await custDb
            .update(isolatedSchema.contractorWorkers)
            .set({ isAccountedFor: newStatus })
            .where(eq(isolatedSchema.contractorWorkers.id, personId));
          updated = true;
        }
      } else if (type === 'member') {
        const [member] = await custDb
          .select({ id: isolatedSchema.members.id, firstName: isolatedSchema.members.firstName, lastName: isolatedSchema.members.lastName, isAccountedFor: isolatedSchema.members.isAccountedFor })
          .from(isolatedSchema.members)
          .where(eq(isolatedSchema.members.id, personId))
          .limit(1);
        if (member) {
          newStatus = !member.isAccountedFor;
          personName = `${member.firstName} ${member.lastName}`;
          await custDb
            .update(isolatedSchema.members)
            .set({ isAccountedFor: newStatus, updatedAt: new Date() })
            .where(eq(isolatedSchema.members.id, personId));
          updated = true;
        }
      }
      
      if (!updated) {
        logger.info('Person not found - personId:', personId, 'type:', type);
        return res.status(404).json({ error: "Person not found" });
      }
      
      if (activeEvacuation) {
        const existingRecord = await db
          .select()
          .from(evacuationAccountability)
          .where(and(
            eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
            eq(evacuationAccountability.personId, personId),
            eq(evacuationAccountability.customerId, context.customerId)
          ))
          .limit(1);
        
        if (existingRecord.length > 0) {
          await db
            .update(evacuationAccountability)
            .set({
              isAccountedFor: newStatus,
              accountedBy: newStatus ? (req.user?.username || 'System') : null,
              accountedAt: newStatus ? new Date() : null,
              updatedAt: new Date()
            })
            .where(and(
              eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
              eq(evacuationAccountability.personId, personId),
              eq(evacuationAccountability.customerId, context.customerId)
            ));
          logger.info(`Updated evacuationAccountability: ${personName} -> ${newStatus ? 'SAFE' : 'UNSAFE'}`);
        } else {
          await db.insert(evacuationAccountability).values({
            evacuationId: activeEvacuation.evacuationId,
            customerId: context.customerId,
            personId,
            personType: type,
            personName,
            isAccountedFor: newStatus,
            accountedBy: newStatus ? (req.user?.username || 'System') : null,
            accountedAt: newStatus ? new Date() : null,
          });
          logger.info(`Created evacuationAccountability: ${personName} -> ${newStatus ? 'SAFE' : 'UNSAFE'}`);
        }
        
        const accountedCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(evacuationAccountability)
          .where(and(
            eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
            eq(evacuationAccountability.customerId, context.customerId),
            eq(evacuationAccountability.isAccountedFor, true)
          ));
        
        const totalCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(evacuationAccountability)
          .where(and(
            eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
            eq(evacuationAccountability.customerId, context.customerId)
          ));
        
        await db
          .update(evacuations)
          .set({
            totalAccountedFor: accountedCount[0]?.count || 0,
            totalPeopleOnSite: totalCount[0]?.count || 0,
          })
          .where(eq(evacuations.evacuationId, activeEvacuation.evacuationId));
        
        websocketService.broadcastMusterUpdate(
          context.customerId,
          activeEvacuation.evacuationId,
          {
            personId,
            personName,
            personType: type as 'staff' | 'visitor' | 'contractor' | 'member',
            isAccountedFor: newStatus
          }
        );
      }
      
      res.json({ success: true, personId, type, accounted: newStatus });
    } catch (error) {
      logger.error("Failed to toggle accounted status:", error);
      res.status(500).json({ error: "Failed to toggle accounted status" });
    }
  });

  // Mark all personnel as safe endpoint
  app.post("/api/muster/mark-all-safe", requireAuthOrFireMarshal, async (req, res) => {
    try {
      const username = req.user?.username || (req.session as any)?.username || 'system';
      const customerId = req.customerId || (req.session as any)?.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const context = simpleDatabaseService.createCustomerContext(username, customerId);
      // Optional zone filter — when provided, only mark people in those zones safe
      const { zoneIds } = req.body as { zoneIds?: string[] };
      
      const activeEvacuations = await db
        .select()
        .from(evacuations)
        .where(and(
          eq(evacuations.status, 'active'),
          eq(evacuations.customerId, context.customerId)
        ))
        .orderBy(desc(evacuations.startedAt))
        .limit(1);
      
      const activeEvacuation = activeEvacuations[0];

      // Build a set of the selected zone IDs. We filter each person by their own
      // zoneId below — the same key the muster screen and zone counts use.
      // No text matching, no dependency on accountability records existing yet.
      const zoneFilter: Set<string> | null =
        zoneIds && zoneIds.length > 0 ? new Set(zoneIds) : null;

      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getCheckedInContractors(context),
      ]);

      let updatedCount = 0;
      let errors: string[] = [];

      const updateAccountability = async (personId: string, personName: string, personType: string) => {
        if (!activeEvacuation) return;
        try {
          const existing = await db
            .select()
            .from(evacuationAccountability)
            .where(and(
              eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
              eq(evacuationAccountability.personId, personId),
              eq(evacuationAccountability.customerId, context.customerId)
            ))
            .limit(1);
          
          if (existing.length > 0) {
            await db
              .update(evacuationAccountability)
              .set({
                isAccountedFor: true,
                accountedBy: username,
                accountedAt: new Date(),
                updatedAt: new Date()
              })
              .where(and(
                eq(evacuationAccountability.evacuationId, activeEvacuation.evacuationId),
                eq(evacuationAccountability.personId, personId),
                eq(evacuationAccountability.customerId, context.customerId)
              ));
          } else {
            await db.insert(evacuationAccountability).values({
              evacuationId: activeEvacuation.evacuationId,
              customerId: context.customerId,
              personId,
              personType,
              personName,
              isAccountedFor: true,
              accountedBy: username,
              accountedAt: new Date()
            });
          }
        } catch (e) {
          logger.error(`Failed to update accountability for ${personName}:`, e);
        }
      };

      for (const staff of checkedInStaff) {
        if (zoneFilter && !zoneFilter.has((staff as any).zoneId)) continue;
        try {
          if (!staff.isAccountedFor) {
            const result = await databaseService.toggleStaffAccountedStatus(context, staff.id);
            if (result) updatedCount++;
          } else {
            updatedCount++;
          }
          await updateAccountability(staff.id, `${staff.firstName} ${staff.lastName}`, 'staff');
        } catch (error) {
          errors.push(`Staff ${staff.firstName} ${staff.lastName}: ${error}`);
        }
      }

      for (const visitor of currentVisitors) {
        if (zoneFilter && !zoneFilter.has((visitor as any).zoneId)) continue;
        try {
          if (!visitor.isAccountedFor) {
            const result = await databaseService.toggleVisitorAccountedStatus(context, visitor.id);
            if (result) updatedCount++;
          } else {
            updatedCount++;
          }
          await updateAccountability(visitor.id, `${visitor.firstName} ${visitor.lastName}`, 'visitor');
        } catch (error) {
          errors.push(`Visitor ${visitor.firstName} ${visitor.lastName}: ${error}`);
        }
      }

      for (const contractor of checkedInContractors) {
        if (zoneFilter && !zoneFilter.has((contractor as any).zoneId)) continue;
        try {
          if (!contractor.isAccountedFor) {
            const result = await databaseService.toggleContractorAccountedStatus(context, contractor.id);
            if (result) updatedCount++;
          } else {
            updatedCount++;
          }
          await updateAccountability(contractor.id, `${contractor.firstName} ${contractor.lastName}`, 'contractor');
        } catch (error) {
          errors.push(`Contractor ${contractor.firstName} ${contractor.lastName}: ${error}`);
        }
      }

      let memberCount = 0;
      try {
        const custDb = await customerDbService.getCustomerDatabase(context.customerId);
        const [custSettings] = await custDb
          .select()
          .from(isolatedSchema.companySettings)
          .limit(1);
        if (custSettings?.featureMembers === true) {
          const checkedInMembers = await custDb
            .select()
            .from(isolatedSchema.members)
            .where(eq(isolatedSchema.members.isCheckedIn, true));
          
          const filteredMembers = zoneFilter
            ? checkedInMembers.filter(m => zoneFilter.has((m as any).zoneId))
            : checkedInMembers;
          memberCount = filteredMembers.length;
          for (const member of filteredMembers) {
            try {
              await custDb
                .update(isolatedSchema.members)
                .set({ isAccountedFor: true, updatedAt: new Date() })
                .where(eq(isolatedSchema.members.id, member.id));
              updatedCount++;
              await updateAccountability(member.id, `${member.firstName} ${member.lastName}`, 'member');
            } catch (error) {
              errors.push(`Member ${member.firstName} ${member.lastName}: ${error}`);
            }
          }
        }
      } catch (e) {
        // Members table may not exist yet
      }

      const totalPersonnel = checkedInStaff.length + currentVisitors.length + checkedInContractors.length + memberCount;

      logger.info(`Mark-all-safe: Updated ${updatedCount}/${totalPersonnel} personnel + evacuation_accountability for evacuation ${activeEvacuation?.evacuationId}`);

      res.json({
        success: true,
        message: "Mark all safe operation completed",
        updatedCount,
        totalPersonnel,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error("Failed to mark all safe:", error);
      res.status(500).json({ error: "Failed to mark all personnel as safe" });
    }
  });

  // Export muster list endpoint
  app.get("/api/muster/export", requireAuth, async (req, res) => {
    try {
      // Get customer context for isolation based on logged-in user
      const username = req.user!.username;
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // For now return empty until we implement customer-isolated muster export
      res.csv([]);
    } catch (error) {
      logger.error("Failed to export muster list:", error);
      res.status(500).json({ error: "Failed to export muster list" });
    }
  });

  // Emergency alert email endpoint
  app.post("/api/emergency/send-alert", async (req, res) => {
    try {
      const { subject, message } = req.body;
      
      if (!subject || !message) {
        return res.status(400).json({ error: "Subject and message are required" });
      }
      
      // Get customer context for isolation based on logged-in user
      const username = req.user?.username || 'system';
      const context = simpleDatabaseService.createCustomerContext(username, req.customerId);
      
      // Get all on-site personnel
      const [currentVisitors, checkedInStaff, checkedInContractors] = await Promise.all([
        databaseService.getCurrentVisitors(context),
        databaseService.getCheckedInStaff(context),
        databaseService.getCheckedInContractors(context),
      ]);
      
      // Collect all unique email addresses
      const emailAddresses = new Set<string>();
      
      // Add staff emails
      checkedInStaff.forEach(staffMember => {
        if (staffMember.email) {
          emailAddresses.add(staffMember.email);
        }
      });
      
      // Add visitor emails
      currentVisitors.forEach(visitor => {
        if (visitor.email) {
          emailAddresses.add(visitor.email);
        }
      });
      
      // Add contractor emails (using company email if available)
      checkedInContractors.forEach(contractor => {
        // Note: contractors don't have individual emails in current schema
        // This would need to be added to the contractor worker schema
        // For now, we'll skip contractor emails
      });
      
      const emailList = Array.from(emailAddresses);
      
      if (emailList.length === 0) {
        return res.json({
          success: true,
          message: "No email addresses found for on-site personnel",
          sentCount: 0,
          totalPersonnel: currentVisitors.length + checkedInStaff.length + checkedInContractors.length
        });
      }
      
      // Send emergency alert emails
      const { emailService } = await import("../emailService");
      const localEmailService = emailService.forCustomer(req.customerId);
      let sentCount = 0;
      
      for (const email of emailList) {
        try {
          await localEmailService.sendEmergencyAlert(email, subject, message);
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send emergency alert to ${email}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: `Emergency alert sent successfully`,
        sentCount,
        totalEmails: emailList.length,
        totalPersonnel: currentVisitors.length + checkedInStaff.length + checkedInContractors.length
      });
    } catch (error) {
      logger.error("Failed to send emergency alerts:", error);
      res.status(500).json({ error: "Failed to send emergency alerts" });
    }
  });
}
