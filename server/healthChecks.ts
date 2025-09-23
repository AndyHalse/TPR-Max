import { Request, Response } from "express";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as sharedSchema from "@shared/schema";

/**
 * HEALTH CHECK SERVICE
 * 
 * Provides comprehensive health and readiness checks for AWS deployment.
 * These endpoints are critical for load balancer health checks and monitoring.
 */

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    neonApi?: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    stripe?: {
      status: 'healthy' | 'unhealthy';
      configured: boolean;
      error?: string;
    };
  };
  environment: string;
  version: string;
  memoryUsage: NodeJS.MemoryUsage;
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private startTime = Date.now();

  private constructor() {}

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Liveness probe - Checks if the application is running
   * AWS Load Balancer uses this to determine if the instance should be restarted
   */
  async liveness(req: Request, res: Response): Promise<void> {
    try {
      const result: Partial<HealthCheckResult> = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        environment: process.env.NODE_ENV || 'unknown',
        version: process.env.npm_package_version || '1.0.0',
        memoryUsage: process.memoryUsage()
      };

      res.status(200).json(result);
    } catch (error) {
      console.error('🔥 Liveness check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Liveness check failed'
      });
    }
  }

  /**
   * Readiness probe - Checks if the application is ready to serve traffic
   * AWS Load Balancer uses this to determine if traffic should be routed to this instance
   */
  async readiness(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const dependencies = await this.checkAllDependencies();
      const allHealthy = Object.values(dependencies).every(dep => dep.status === 'healthy');
      
      const result: HealthCheckResult = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        dependencies,
        environment: process.env.NODE_ENV || 'unknown',
        version: process.env.npm_package_version || '1.0.0',
        memoryUsage: process.memoryUsage()
      };

      const statusCode = allHealthy ? 200 : 503;
      res.status(statusCode).json(result);
      
      if (!allHealthy) {
        console.warn('⚠️ Readiness check failed - some dependencies unhealthy:', dependencies);
      }
    } catch (error) {
      console.error('🔥 Readiness check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Readiness check failed',
        dependencies: {}
      });
    }
  }

  /**
   * Database health check
   */
  private async checkDatabase(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      if (!process.env.DATABASE_URL) {
        return {
          status: 'unhealthy',
          error: 'DATABASE_URL not configured'
        };
      }

      // Test database connection with a simple query
      const pool = new Pool({ 
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000 // 5 second timeout for health checks
      });
      
      const db = drizzle({ client: pool, schema: sharedSchema });
      
      // Simple query to test connectivity and responsiveness
      await db.execute(sql`SELECT 1 as health_check`);
      
      await pool.end();
      
      const responseTime = Date.now() - startTime;
      
      // Consider slow responses as warning (but still healthy)
      if (responseTime > 3000) {
        console.warn(`⚠️ Database health check slow: ${responseTime}ms`);
      }
      
      return {
        status: 'healthy',
        responseTime
      };
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Database connection failed'
      };
    }
  }

  /**
   * Neon API health check (if configured)
   */
  private async checkNeonApi(): Promise<{ status: 'healthy' | 'unhealthy'; responseTime?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
        // Neon API not configured - this is acceptable for development
        return {
          status: 'healthy',
          responseTime: 0
        };
      }

      // Test Neon API connectivity with a simple project info request
      const response = await fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.NEON_API_KEY}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Neon API returned ${response.status}: ${response.statusText}`);
      }

      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Neon API check failed'
      };
    }
  }

  /**
   * Stripe health check
   */
  private async checkStripe(): Promise<{ status: 'healthy' | 'unhealthy'; configured: boolean; error?: string }> {
    try {
      const configured = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
      
      if (!configured) {
        // Stripe not configured - this is acceptable for development
        return {
          status: 'healthy',
          configured: false
        };
      }

      // If configured, we assume it's healthy since Stripe is external
      // We don't make actual API calls to avoid rate limiting on health checks
      return {
        status: 'healthy',
        configured: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        error: error instanceof Error ? error.message : 'Stripe check failed'
      };
    }
  }

  /**
   * Check all dependencies
   */
  private async checkAllDependencies() {
    const [database, neonApi, stripe] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkNeonApi(),
      this.checkStripe()
    ]);

    return {
      database: database.status === 'fulfilled' ? database.value : { 
        status: 'unhealthy' as const, 
        error: 'Health check promise rejected' 
      },
      neonApi: neonApi.status === 'fulfilled' ? neonApi.value : { 
        status: 'unhealthy' as const, 
        error: 'Health check promise rejected' 
      },
      stripe: stripe.status === 'fulfilled' ? stripe.value : { 
        status: 'unhealthy' as const, 
        configured: false,
        error: 'Health check promise rejected' 
      }
    };
  }

  /**
   * Combined health and metrics endpoint for monitoring
   */
  async combined(req: Request, res: Response): Promise<void> {
    try {
      const dependencies = await this.checkAllDependencies();
      const allHealthy = Object.values(dependencies).every(dep => dep.status === 'healthy');
      
      const result: HealthCheckResult & { 
        metrics: {
          requestCount?: number;
          averageResponseTime?: number;
          errorRate?: number;
        }
      } = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        dependencies,
        environment: process.env.NODE_ENV || 'unknown',
        version: process.env.npm_package_version || '1.0.0',
        memoryUsage: process.memoryUsage(),
        metrics: {
          // TODO: Implement request metrics collection
          requestCount: 0,
          averageResponseTime: 0,
          errorRate: 0
        }
      };

      const statusCode = allHealthy ? 200 : 503;
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('🔥 Combined health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  }
}

// Export singleton instance
export const healthCheckService = HealthCheckService.getInstance();