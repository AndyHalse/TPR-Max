import winston from 'winston';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

// Production-ready structured logging for AWS CloudWatch
// Replaces console.log with structured JSON logging for better monitoring

interface LogContext {
  requestId?: string;
  customerId?: string;
  userId?: string;
  companyName?: string;
  userAgent?: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  responseTime?: number;
  [key: string]: any;
}

interface AppLogger {
  info: (message: string, meta?: LogContext) => void;
  warn: (message: string, meta?: LogContext) => void;
  error: (message: string, meta?: LogContext) => void;
  debug: (message: string, meta?: LogContext) => void;
  http: (message: string, meta?: LogContext) => void;
}

// Configure Winston for production
const createLogger = (): winston.Logger => {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

  // Production format: structured JSON for AWS CloudWatch
  const productionFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...meta } = info;
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message,
        service: 'visigate-pro',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
        ...meta
      });
    })
  );

  // Development format: readable console output
  const developmentFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf((info) => {
      const { timestamp, level, message, requestId, customerId, userId, ...meta } = info;
      const contextParts = [];
      if (requestId && typeof requestId === 'string') contextParts.push(`req:${requestId.slice(-8)}`);
      if (customerId && typeof customerId === 'string') contextParts.push(`customer:${customerId.slice(-8)}`);
      if (userId && typeof userId === 'string') contextParts.push(`user:${userId.slice(-8)}`);
      
      const context = contextParts.length > 0 ? ` [${contextParts.join('|')}]` : '';
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      
      return `${timestamp} ${level}${context}: ${message}${metaStr}`;
    })
  );

  return winston.createLogger({
    level: logLevel,
    format: isProduction ? productionFormat : developmentFormat,
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true
      })
    ],
    exitOnError: false
  });
};

// Create global logger instance
const winstonLogger = createLogger();

// Application logger with enhanced context
export const logger: AppLogger = {
  info: (message: string, meta: LogContext = {}) => {
    winstonLogger.info(message, meta);
  },
  
  warn: (message: string, meta: LogContext = {}) => {
    winstonLogger.warn(message, meta);
  },
  
  error: (message: string, meta: LogContext = {}) => {
    winstonLogger.error(message, meta);
  },
  
  debug: (message: string, meta: LogContext = {}) => {
    winstonLogger.debug(message, meta);
  },
  
  http: (message: string, meta: LogContext = {}) => {
    winstonLogger.http(message, meta);
  }
};

// Request ID generation and attachment
export const generateRequestId = (): string => randomUUID();

// Express middleware to attach request ID and logging context
export const requestLoggingMiddleware = (req: Request, res: Response, next: Function) => {
  // Generate unique request ID
  const requestId = generateRequestId();
  
  // Attach to request for use throughout the request lifecycle
  (req as any).requestId = requestId;
  (req as any).startTime = Date.now();
  
  // Add request ID header for client correlation
  res.setHeader('X-Request-Id', requestId);
  
  // Extract context from session if available
  const customerId = req.session?.customerId;
  const userId = req.session?.userId;
  const companyName = req.session?.companyName;
  
  // Create logging context
  const logContext: LogContext = {
    requestId,
    customerId,
    userId,
    companyName,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    method: req.method,
    path: req.path
  };
  
  // Attach context to request for use in route handlers
  (req as any).logContext = logContext;
  
  // Log incoming request
  logger.http('Incoming request', logContext);
  
  // Log outgoing response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - (req as any).startTime;
    logger.http('Outgoing response', {
      ...logContext,
      statusCode: res.statusCode,
      responseTime
    });
    return originalSend.call(this, data);
  };
  
  next();
};

// Helper to get logger with request context
export const getRequestLogger = (req: Request): AppLogger & { context: LogContext } => {
  const context = (req as any).logContext || {};
  
  return {
    context,
    info: (message: string, meta: LogContext = {}) => 
      logger.info(message, { ...context, ...meta }),
    warn: (message: string, meta: LogContext = {}) => 
      logger.warn(message, { ...context, ...meta }),
    error: (message: string, meta: LogContext = {}) => 
      logger.error(message, { ...context, ...meta }),
    debug: (message: string, meta: LogContext = {}) => 
      logger.debug(message, { ...context, ...meta }),
    http: (message: string, meta: LogContext = {}) => 
      logger.http(message, { ...context, ...meta })
  };
};

// Security logger for audit trails
export const securityLogger = {
  authAttempt: (success: boolean, details: LogContext) => {
    logger.info(`Authentication ${success ? 'success' : 'failure'}`, {
      ...details,
      security: true,
      eventType: 'auth_attempt'
    });
  },
  
  rateLimitHit: (details: LogContext) => {
    logger.warn('Rate limit exceeded', {
      ...details,
      security: true,
      eventType: 'rate_limit'
    });
  },
  
  csrfFailure: (details: LogContext) => {
    logger.warn('CSRF token validation failed', {
      ...details,
      security: true,
      eventType: 'csrf_failure'
    });
  },
  
  unauthorizedAccess: (details: LogContext) => {
    logger.warn('Unauthorized access attempt', {
      ...details,
      security: true,
      eventType: 'unauthorized_access'
    });
  }
};

// Performance logger for slow operations
export const performanceLogger = {
  slowQuery: (queryName: string, duration: number, details: LogContext = {}) => {
    logger.warn('Slow database query detected', {
      ...details,
      performance: true,
      queryName,
      duration,
      eventType: 'slow_query'
    });
  },
  
  slowRequest: (path: string, duration: number, details: LogContext = {}) => {
    logger.warn('Slow request detected', {
      ...details,
      performance: true,
      path,
      duration,
      eventType: 'slow_request'
    });
  }
};

// Business logger for important business events
export const businessLogger = {
  customerCreated: (customerId: string, companyName: string, details: LogContext = {}) => {
    logger.info('New customer created', {
      ...details,
      business: true,
      eventType: 'customer_created',
      customerId,
      companyName
    });
  },
  
  visitorCheckedIn: (visitorId: string, details: LogContext = {}) => {
    logger.info('Visitor checked in', {
      ...details,
      business: true,
      eventType: 'visitor_checkin',
      visitorId
    });
  },
  
  printJobCompleted: (printJobId: string, details: LogContext = {}) => {
    logger.info('Print job completed', {
      ...details,
      business: true,
      eventType: 'print_completed',
      printJobId
    });
  }
};

export { LogContext };