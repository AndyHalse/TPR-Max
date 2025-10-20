import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { logger } from './utils/logger';

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
        try {
          const message = JSON.parse(data.toString());
          
          // Handle client registration with customer/evacuation context
          if (message.type === 'register') {
            client.customerId = message.customerId;
            client.evacuationId = message.evacuationId;
            logger.info('Client registered', {
              customerId: message.customerId,
              evacuationId: message.evacuationId,
              eventType: 'websocket_register'
            });

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'registered',
              timestamp: new Date().toISOString()
            }));
          }
        } catch (error) {
          logger.error('WebSocket message parse error', {
            error: error instanceof Error ? error.message : String(error),
            eventType: 'websocket_error'
          });
        }
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

    // Broadcast to all clients for this customer and evacuation
    this.clients.forEach((client, ws) => {
      if (
        ws.readyState === WebSocket.OPEN &&
        client.customerId === customerId &&
        client.evacuationId === evacuationId
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
