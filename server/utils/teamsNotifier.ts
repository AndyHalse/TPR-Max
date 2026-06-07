import { pool } from '../db';
import { logger } from './logger';

export type TeamsEventType =
  | 'visitor_arrival'
  | 'evacuation_started'
  | 'evacuation_ended'
  | 'riddor_incident'
  | 'compliance_red'
  | 'document_expiry';

export interface TeamsNotificationPayload {
  eventType: TeamsEventType;
  title: string;
  summary: string;
  facts?: { name: string; value: string }[];
  urgency?: 'normal' | 'high';
}

const EVENT_COLUMN: Record<TeamsEventType, string> = {
  visitor_arrival: 'notify_visitor_arrival',
  evacuation_started: 'notify_evacuation',
  evacuation_ended: 'notify_evacuation',
  riddor_incident: 'notify_riddor',
  compliance_red: 'notify_compliance_red',
  document_expiry: 'notify_document_expiry',
};

function buildAdaptiveCard(payload: TeamsNotificationPayload): object {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            text: payload.title,
            weight: 'Bolder',
            size: 'Medium',
            color: payload.urgency === 'high' ? 'Attention' : 'Default',
          },
          {
            type: 'TextBlock',
            text: payload.summary,
            wrap: true,
          },
          ...(payload.facts && payload.facts.length > 0
            ? [{ type: 'FactSet', facts: payload.facts }]
            : []),
          {
            type: 'TextBlock',
            text: `TPR · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
            size: 'Small',
            color: 'Light',
          },
        ],
      },
    }],
  };
}

export async function sendTeamsNotification(
  schemaName: string,
  eventType: TeamsEventType,
  payload: TeamsNotificationPayload
): Promise<void> {
  try {
    const col = EVENT_COLUMN[eventType];
    const result = await pool.query(
      `SELECT webhook_url FROM "${schemaName}".teams_webhooks WHERE active = true AND ${col} = true`
    );
    if (result.rows.length === 0) return;

    const card = buildAdaptiveCard(payload);
    const body = JSON.stringify(card);

    await Promise.allSettled(
      result.rows.map(row =>
        fetch(row.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).then(async r => {
          if (!r.ok) {
            const text = await r.text().catch(() => r.statusText);
            logger.warn(`Teams webhook responded ${r.status}: ${text.substring(0, 120)}`);
          }
        }).catch(err => {
          logger.warn(`Teams webhook POST failed: ${err.message}`);
        })
      )
    );
  } catch (err: any) {
    // Never propagate — Teams notifications must never break primary operations
    logger.warn(`sendTeamsNotification error (${eventType}): ${err.message}`);
  }
}
