import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { logger } from './utils/logger';
import { verifySessionToken } from './auth';
import { databaseService } from './databaseService';
import { db } from './db';
import { evacuations } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

interface MusterUpdateMessage {
  type: 'muster_update';
  evacuationId: string;
  personId: string;
  personName: string;
  personType: 'staff' | 'visitor' | 'contractor';
  isAccountedFor: boolean;
  musterPoint?: string;
  timestamp: string;
}

interface ClientConnection {
  ws: WebSocket;
  customerId?: string;
  evacuationId?: string;
}

async function validateCredential(
  credentialType: string,
  credential: string,
  customerId: string
): Promise<boolean> {
  switch (credentialType) {
    case 'fire-marshal': {
      const result = await databaseService.findFireMarshalByUrlId(credential);
      return result !== null && result.customerId === customerId;
    }
    case 'session': {
      const tokenData = verifySessionToken(credential);
      return tokenData.customerId === customerId;
    }
    case 'emergency-token': {
      // Safety tokens have format customerId.base64url — the prefix is the customerId
      const prefix = credential.split('.')[0];
      return prefix === customerId;
    }
    case 'monitor': {
      // Validate the evacuationId exists for this customerId (read-only channel)
      const rows = await db
        .select({ id: evacuations.id })
        .from(evacuations)
        .where(and(
          eq(evacuations.evacuationId, credential),
          eq(evacuations.customerId, customerId)
        ))
        .limit(1);
      return rows.length > 0;
    }
    default:
      return false;
  }
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientConnection> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/muster'
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      logger.info('WebSocket client connected', { 
        path: req.url,
        eventType: 'websocket_connection'
      });

      const client: ClientConnection = { ws };
      this.clients.set(ws, client);

      ws.on('message', (data: Buffer) => {
        // Inner IIFE handles async validation without changing the event handler signature
        (async () => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === 'register') {
              const { customerId, evacuationId, credential, credentialType } = message;

              let authorized = false;

              if (credential && credentialType && customerId) {
                try {
                  authorized = await validateCredential(credentialType, credential, customerId);
                } catch (err) {
                  logger.warn('WebSocket credential validation error', {
                    credentialType,
                    error: err instanceof Error ? err.message : String(err),
                    eventType: 'websocket_register_validation_error'
                  });
                  authorized = false;
                }
              }

              if (!authorized) {
                ws.send(JSON.stringify({ type: 'register_failed', reason: 'Unauthorized' }));
                logger.warn('WebSocket register rejected — unauthorized', {
                  customerId,
                  credentialType,
                  eventType: 'websocket_register_rejected'
                });
                return;
              }

              client.customerId = customerId;
              client.evacuationId = evacuationId;
              logger.info('WebSocket client registered', {
                customerId,
                evacuationId,
                credentialType,
                eventType: 'websocket_register'
              });
              ws.send(JSON.stringify({ type: 'registered', timestamp: new Date().toISOString() }));
            }
          } catch (error) {
            logger.error('WebSocket message parse error', {
              error: error instanceof Error ? error.message : String(error),
              eventType: 'websocket_error'
            });
          }
        })();
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected', {
          eventType: 'websocket_disconnect'
        });
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', {
          error: error.message,
          eventType: 'websocket_error'
        });
        this.clients.delete(ws);
      });

      // Send initial connection success
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString()
      }));
    });

    logger.info('WebSocket server initialized', {
      path: '/ws/muster',
      eventType: 'websocket_init'
    });
  }

  broadcastMusterUpdate(
    customerId: string,
    evacuationId: string,
    update: {
      personId: string;
      personName: string;
      personType: 'staff' | 'visitor' | 'contractor';
      isAccountedFor: boolean;
      musterPoint?: string;
    }
  ) {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized', {
        eventType: 'websocket_broadcast_failed'
      });
      return;
    }

    const message: MusterUpdateMessage = {
      type: 'muster_update',
      evacuationId,
      personId: update.personId,
      personName: update.personName,
      personType: update.personType,
      isAccountedFor: update.isAccountedFor,
      musterPoint: update.musterPoint,
      timestamp: new Date().toISOString()
    };

    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;

    this.clients.forEach((client, ws) => {
      if (
        ws.readyState === WebSocket.OPEN &&
        client.customerId === customerId
      ) {
        ws.send(messageStr);
        broadcastCount++;
      }
    });

    logger.info('Muster update broadcasted', {
      customerId,
      evacuationId,
      personId: update.personId,
      personName: update.personName,
      isAccountedFor: update.isAccountedFor,
      broadcastCount,
      eventType: 'muster_broadcast'
    });
  }

  broadcastPersonnelUpdate(
    customerId: string,
    update: {
      personId: string;
      personName: string;
      personType: 'staff' | 'visitor' | 'contractor' | 'member';
      action: 'checkin' | 'checkout';
    }
  ) {
    if (!this.wss) return;

    const message = {
      type: 'personnel_update',
      personId: update.personId,
      personName: update.personName,
      personType: update.personType,
      action: update.action,
      timestamp: new Date().toISOString()
    };

    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;

    this.clients.forEach((client, ws) => {
      if (
        ws.readyState === WebSocket.OPEN &&
        client.customerId === customerId
      ) {
        ws.send(messageStr);
        broadcastCount++;
      }
    });

    logger.info('Personnel update broadcasted', {
      customerId,
      personName: update.personName,
      action: update.action,
      broadcastCount,
      eventType: 'personnel_broadcast'
    });
  }

  getConnectedClientsCount(customerId?: string, evacuationId?: string): number {
    if (!customerId || !evacuationId) {
      return this.clients.size;
    }

    let count = 0;
    this.clients.forEach((client) => {
      if (client.customerId === customerId && client.evacuationId === evacuationId) {
        count++;
      }
    });
    return count;
  }

  close() {
    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket server closed', {
          eventType: 'websocket_close'
        });
      });
    }
  }
}

export const websocketService = new WebSocketService();
