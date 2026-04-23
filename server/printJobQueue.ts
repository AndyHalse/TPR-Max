/**
 * Print Job Queue Management System
 * Handles queuing, polling, and status tracking for thermal print jobs
 */

import { TCPLGenerator, TCPLElement, TCPLPrintData, TCPLSettings } from './tcplGenerator';
import { db } from "./db";
import { printQueue, printServiceInstances } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export interface PrintJob {
  id: string;
  customerId: string;
  serviceToken: string;
  printerType: 'tec' | 'zebra';
  status: 'pending' | 'polling' | 'printing' | 'completed' | 'failed';
  priority: number; // 1-10, higher is more important
  createdAt: Date;
  polledAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  data: {
    elements: TCPLElement[];
    printData: TCPLPrintData;
    settings: TCPLSettings;
  };
  tcplCommands?: string;
  resultData?: any;
}

export interface PrintService {
  id: string;
  customerId: string;
  apiToken: string;
  serviceName: string;
  location: string;
  printerType: 'tec' | 'zebra';
  printerName: string;
  status: 'online' | 'offline' | 'error';
  lastHeartbeat: Date;
  registeredAt: Date;
  capabilities: {
    supportsTCPL: boolean;
    supportsZPL: boolean;
    supportsDirectUSB: boolean;
    supportsNetwork: boolean;
  };
  statistics: {
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    averagePrintTime: number;
  };
}

export class PrintJobQueue {
  private jobs: Map<string, PrintJob> = new Map();
  private services: Map<string, PrintService> = new Map();
  private tcplGenerator: TCPLGenerator;
  
  constructor() {
    this.tcplGenerator = new TCPLGenerator();
    // Initialize with any persisted jobs/services from database
    this.loadPersistedState();
  }
  
  /**
   * Register a new Windows print service
   */
  registerService(
    customerId: string,
    serviceName: string,
    location: string,
    printerType: 'tec' | 'zebra',
    printerName: string
  ): { apiToken: string; serviceId: string } {
    const apiToken = this.generateApiToken(customerId);
    const serviceId = `svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const service: PrintService = {
      id: serviceId,
      customerId,
      apiToken,
      serviceName,
      location,
      printerType,
      printerName,
      status: 'online',
      lastHeartbeat: new Date(),
      registeredAt: new Date(),
      capabilities: {
        supportsTCPL: printerType === 'tec',
        supportsZPL: printerType === 'zebra',
        supportsDirectUSB: true,
        supportsNetwork: true
      },
      statistics: {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averagePrintTime: 0
      }
    };
    
    this.services.set(apiToken, service);
    this.persistServiceState(service);
    
    console.log(`✅ Registered print service: ${serviceName} at ${location} (${printerType})`);
    
    return { apiToken, serviceId };
  }
  
  /**
   * Update service heartbeat
   */
  updateHeartbeat(apiToken: string): boolean {
    const service = this.services.get(apiToken);
    if (!service) {
      console.error(`❌ Service not found for token: ${apiToken}`);
      return false;
    }
    
    service.lastHeartbeat = new Date();
    service.status = 'online';
    
    // Check for stale services (no heartbeat for 60 seconds)
    this.checkStaleServices();
    
    return true;
  }
  
  /**
   * Add a new print job to the queue
   */
  addJob(
    customerId: string,
    elements: TCPLElement[],
    printData: TCPLPrintData,
    settings: TCPLSettings,
    priority: number = 5
  ): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Find an online service for this customer
    const service = this.findServiceForCustomer(customerId);
    if (!service) {
      throw new Error(`No online print service found for customer ${customerId}`);
    }
    
    // Generate TCPL commands if TEC printer
    let tcplCommands: string | undefined;
    if (service.printerType === 'tec') {
      tcplCommands = this.tcplGenerator.generateTCPL(elements, printData, settings);
    }
    
    const job: PrintJob = {
      id: jobId,
      customerId,
      serviceToken: service.apiToken,
      printerType: service.printerType,
      status: 'pending',
      priority,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      data: {
        elements,
        printData,
        settings
      },
      tcplCommands
    };
    
    this.jobs.set(jobId, job);
    this.persistJobState(job);
    
    console.log(`📋 Added print job ${jobId} to queue for customer ${customerId}`);
    
    return jobId;
  }
  
  /**
   * Poll for pending jobs (called by Windows service)
   */
  pollJobs(apiToken: string, limit: number = 5): PrintJob[] {
    const service = this.services.get(apiToken);
    if (!service) {
      console.error(`❌ Invalid API token for polling: ${apiToken}`);
      return [];
    }
    
    // Update heartbeat
    this.updateHeartbeat(apiToken);
    
    // Find pending jobs for this service's customer
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.customerId === service.customerId &&
        job.status === 'pending' &&
        job.attempts < job.maxAttempts
      )
      .sort((a, b) => {
        // Sort by priority (desc) then by creation time (asc)
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .slice(0, limit);
    
    // Mark jobs as being polled
    pendingJobs.forEach(job => {
      job.status = 'polling';
      job.polledAt = new Date();
      job.attempts++;
    });
    
    if (pendingJobs.length > 0) {
      console.log(`📤 Sending ${pendingJobs.length} jobs to service ${service.serviceName}`);
    }
    
    return pendingJobs;
  }
  
  /**
   * Update job status (called by Windows service after printing)
   */
  updateJobStatus(
    jobId: string,
    status: 'completed' | 'failed',
    resultData?: any,
    errorMessage?: string
  ): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`❌ Job not found: ${jobId}`);
      return false;
    }
    
    job.status = status;
    job.completedAt = new Date();
    job.resultData = resultData;
    job.errorMessage = errorMessage;
    
    // Update service statistics
    const service = this.services.get(job.serviceToken);
    if (service) {
      service.statistics.totalJobs++;
      if (status === 'completed') {
        service.statistics.successfulJobs++;
      } else {
        service.statistics.failedJobs++;
      }
      
      // Calculate average print time
      if (job.polledAt && job.completedAt) {
        const printTime = job.completedAt.getTime() - job.polledAt.getTime();
        service.statistics.averagePrintTime = 
          (service.statistics.averagePrintTime * (service.statistics.totalJobs - 1) + printTime) / 
          service.statistics.totalJobs;
      }
    }
    
    // Retry failed jobs if under max attempts
    if (status === 'failed' && job.attempts < job.maxAttempts) {
      job.status = 'pending'; // Reset to pending for retry
      console.log(`🔄 Retrying job ${jobId} (attempt ${job.attempts}/${job.maxAttempts})`);
    }
    
    this.persistJobState(job);
    
    console.log(`✅ Updated job ${jobId} status to ${status}`);
    
    return true;
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): PrintJob | undefined {
    return this.jobs.get(jobId);
  }
  
  /**
   * Get service statistics
   */
  getServiceStats(apiToken: string): PrintService | undefined {
    return this.services.get(apiToken);
  }
  
  /**
   * Get all services for a customer
   */
  getCustomerServices(customerId: string): PrintService[] {
    return Array.from(this.services.values())
      .filter(service => service.customerId === customerId);
  }
  
  /**
   * Clean up old completed/failed jobs
   */
  cleanupOldJobs(olderThanHours: number = 24): number {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let cleaned = 0;
    
    this.jobs.forEach((job, jobId) => {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.createdAt < cutoffTime
      ) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old print jobs`);
    }
    
    return cleaned;
  }
  
  /**
   * Generate unique API token for service
   */
  private generateApiToken(customerId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 15);
    const customerPrefix = customerId.substr(0, 8).replace(/[^a-zA-Z0-9]/g, '');
    return `vgpt_${customerPrefix}_${timestamp}${random}`;
  }
  
  /**
   * Find an online service for a customer
   */
  private findServiceForCustomer(customerId: string): PrintService | undefined {
    return Array.from(this.services.values())
      .find(service => 
        service.customerId === customerId && 
        service.status === 'online'
      );
  }
  
  /**
   * Check for stale services and mark them offline
   */
  private checkStaleServices(): void {
    const staleThreshold = new Date(Date.now() - 60000); // 60 seconds
    
    this.services.forEach(service => {
      if (service.status === 'online' && service.lastHeartbeat < staleThreshold) {
        service.status = 'offline';
        console.log(`⚠️ Service ${service.serviceName} marked as offline (no heartbeat)`);
      }
    });
  }
  
  /**
   * Load persisted state from database.
   * Reconstructs pending/processing jobs and active services into the in-memory maps
   * so they survive a server restart. Runs asynchronously after construction.
   */
  private loadPersistedState(): void {
    console.log('📂 Loading persisted print queue state...');
    Promise.all([
      db.select().from(printQueue).where(inArray(printQueue.status, ['pending', 'processing'])),
      db.select().from(printServiceInstances).where(eq(printServiceInstances.isActive, true)),
    ]).then(([pendingJobs, activeServices]) => {
      // Rebuild services map first (jobs need serviceToken lookups from it)
      for (const svc of activeServices) {
        const isRecent = svc.lastHeartbeat
          ? Date.now() - svc.lastHeartbeat.getTime() < 2 * 60 * 1000
          : false;
        const service: PrintService = {
          id: svc.id,
          customerId: svc.customerId,
          apiToken: svc.apiToken,
          serviceName: svc.serviceName,
          location: svc.location || '',
          printerType: ((svc.supportedPrinters || [])[0] as 'tec' | 'zebra') || 'tec',
          printerName: svc.computerName || svc.serviceName,
          status: isRecent ? 'online' : 'offline',
          lastHeartbeat: svc.lastHeartbeat || new Date(0),
          registeredAt: svc.createdAt,
          capabilities: {
            supportsTCPL: (svc.supportedPrinters || []).includes('tec'),
            supportsZPL: (svc.supportedPrinters || []).includes('zebra'),
            supportsDirectUSB: true,
            supportsNetwork: true,
          },
          statistics: { totalJobs: 0, successfulJobs: 0, failedJobs: 0, averagePrintTime: 0 },
        };
        this.services.set(svc.apiToken, service);
      }

      // Rebuild jobs map
      const statusMap: Record<string, PrintJob['status']> = {
        pending: 'pending',
        processing: 'polling',
        completed: 'completed',
        failed: 'failed',
        cancelled: 'failed',
      };
      for (const row of pendingJobs) {
        const svcEntry = [...this.services.values()].find(s => s.id === row.serviceInstanceId);
        const job: PrintJob = {
          id: row.id,
          customerId: row.customerId,
          serviceToken: svcEntry?.apiToken || '',
          printerType: row.printerType as 'tec' | 'zebra',
          status: statusMap[row.status] || 'pending',
          priority: row.priority,
          createdAt: row.createdAt,
          polledAt: row.assignedAt || undefined,
          completedAt: row.completedAt || undefined,
          attempts: row.retryCount,
          maxAttempts: row.maxRetries,
          errorMessage: row.errorMessage || undefined,
          data: {
            elements: JSON.parse(row.passElements || '[]'),
            printData: JSON.parse(row.visitorData || '{}') as TCPLPrintData,
            settings: JSON.parse(row.printerSettings || '{}') as TCPLSettings,
          },
        };
        this.jobs.set(row.id, job);
      }

      console.log(`✅ Restored ${pendingJobs.length} pending job(s) and ${activeServices.length} active service(s) from database`);
    }).catch((err: Error) => {
      console.warn('⚠️ Could not load persisted print queue state from database — starting with empty queue:', err.message);
    });
  }

  /**
   * Persist job state to database.
   * Fire-and-forget: logs a warning on failure but never throws.
   */
  private persistJobState(job: PrintJob): void {
    // Map in-memory status values to the database enum
    const dbStatus: string =
      job.status === 'polling' || job.status === 'printing' ? 'processing' : job.status;

    db.insert(printQueue).values({
      id: job.id,
      customerId: job.customerId,
      jobType: 'visitor_pass',          // PrintJob predates multi-type support; safe default
      printerType: job.printerType,
      priority: job.priority,
      visitorData: JSON.stringify(job.data.printData),
      passElements: JSON.stringify(job.data.elements),
      printerSettings: JSON.stringify(job.data.settings),
      status: dbStatus,
      assignedAt: job.polledAt || null,
      completedAt: job.completedAt || null,
      errorMessage: job.errorMessage || null,
      retryCount: job.attempts,
      maxRetries: job.maxAttempts,
      requestSource: 'web_app',
    }).onConflictDoUpdate({
      target: printQueue.id,
      set: {
        status: dbStatus,
        assignedAt: job.polledAt || null,
        completedAt: job.completedAt || null,
        errorMessage: job.errorMessage || null,
        retryCount: job.attempts,
      },
    }).catch((err: Error) => {
      console.warn(`⚠️ Could not persist print job ${job.id} to database:`, err.message);
    });
  }

  /**
   * Persist service registration/heartbeat to database.
   * Fire-and-forget: logs a warning on failure but never throws.
   */
  private persistServiceState(service: PrintService): void {
    db.insert(printServiceInstances).values({
      id: service.id,
      customerId: service.customerId,
      serviceName: service.serviceName,
      machineId: service.id,            // PrintService has no machineId; use stable id as placeholder
      apiToken: service.apiToken,
      location: service.location || null,
      supportedPrinters: [service.printerType],
      isActive: service.status !== 'offline',
      lastHeartbeat: service.lastHeartbeat,
    }).onConflictDoUpdate({
      target: printServiceInstances.apiToken,
      set: {
        serviceName: service.serviceName,
        location: service.location || null,
        supportedPrinters: [service.printerType],
        isActive: service.status !== 'offline',
        lastHeartbeat: service.lastHeartbeat,
        updatedAt: new Date(),
      },
    }).catch((err: Error) => {
      console.warn(`⚠️ Could not persist print service ${service.id} to database:`, err.message);
    });
  }
}

// Singleton instance
export const printJobQueue = new PrintJobQueue();

export default printJobQueue;