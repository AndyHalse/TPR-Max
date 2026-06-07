import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { encryptData, decryptData } from '../utils/encryption';
import { fetchMicrosoftEvents, refreshMicrosoftToken } from './microsoftGraphService';
import { fetchGoogleEvents, refreshGoogleToken } from './googleCalendarService';
import { logger } from '../utils/logger';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function encryptToken(plaintext: string): string {
  const result = encryptData(plaintext);
  return JSON.stringify(result);
}

export function decryptToken(stored: string): string {
  const { encryptedData, iv, authTag } = JSON.parse(stored);
  return decryptData(encryptedData, iv, authTag);
}

// ─── Refresh tokens if expiring within 5 minutes ─────────────────────────────

async function refreshIfNeeded(
  pool: Pool,
  schemaName: string,
  connection: any
): Promise<string> {
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null;
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiry && expiry > fiveMinutesFromNow) {
    return decryptToken(connection.access_token);
  }

  const refreshToken = decryptToken(connection.refresh_token);
  let newTokens: { accessToken: string; refreshToken: string; expiresAt: Date };

  if (connection.provider === 'microsoft') {
    newTokens = await refreshMicrosoftToken(refreshToken);
  } else {
    newTokens = await refreshGoogleToken(refreshToken);
  }

  await pool.query(
    `UPDATE "${schemaName}".calendar_connections
     SET access_token = $1, refresh_token = $2, token_expiry = $3
     WHERE id = $4`,
    [
      encryptToken(newTokens.accessToken),
      encryptToken(newTokens.refreshToken),
      newTokens.expiresAt,
      connection.id,
    ]
  );

  return newTokens.accessToken;
}

// ─── Skip internal attendees ──────────────────────────────────────────────────

function isInternalAttendee(email: string, connection: any): boolean {
  if (!email) return true;
  const domain = connection.domain_filter;
  if (!domain) return false;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

// ─── Create visitor pre-registration ─────────────────────────────────────────

async function createVisitorPreReg(
  pool: Pool,
  schemaName: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    expectedArrival: Date;
    hostNote: string;
  }
): Promise<string> {
  const qrCode = 'PB-' + randomUUID().replace(/-/g, '').substring(0, 12);
  const visitTime = data.expectedArrival
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

  const result = await pool.query(
    `INSERT INTO "${schemaName}".pre_bookings
       (id, visitor_first_name, visitor_last_name, visitor_email, visit_date, visit_time,
        qr_code, status, purpose, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), NOW())
     RETURNING id`,
    [
      data.firstName || 'Unknown',
      data.lastName || '',
      data.email,
      data.expectedArrival,
      visitTime,
      qrCode,
      data.hostNote,
    ]
  );

  return result.rows[0].id;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncCalendarForCustomer(
  pool: Pool,
  schemaName: string,
  connection: any
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  const accessToken = await refreshIfNeeded(pool, schemaName, connection);

  const events =
    connection.provider === 'microsoft'
      ? await fetchMicrosoftEvents(accessToken, connection.sync_window_days || 7)
      : await fetchGoogleEvents(accessToken, connection.sync_window_days || 7, connection.calendar_id || 'primary');

  for (const event of events) {
    for (const attendee of event.attendees) {
      if (!attendee.email) continue;
      if (isInternalAttendee(attendee.email, connection)) { skipped++; continue; }

      // Check if already synced
      const existing = await pool.query(
        `SELECT id FROM "${schemaName}".calendar_synced_events
         WHERE connection_id = $1 AND external_event_id = $2 AND attendee_email = $3`,
        [connection.id, event.id, attendee.email]
      );
      if (existing.rows.length > 0) { skipped++; continue; }

      let preRegId: string | null = null;
      if (connection.auto_create_pre_reg) {
        const nameParts = (attendee.displayName || '').trim().split(/\s+/);
        preRegId = await createVisitorPreReg(pool, schemaName, {
          firstName: nameParts[0] || attendee.email.split('@')[0],
          lastName: nameParts.slice(1).join(' '),
          email: attendee.email,
          expectedArrival: event.start,
          hostNote: `Auto-created from calendar: ${event.subject}`,
        });
        created++;
      }

      await pool.query(
        `INSERT INTO "${schemaName}".calendar_synced_events
           (connection_id, external_event_id, event_title, event_start, attendee_email,
            visitor_pre_reg_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          connection.id,
          event.id,
          event.subject,
          event.start,
          attendee.email,
          preRegId,
          preRegId ? 'pre_reg_created' : 'synced',
        ]
      );
    }
  }

  await pool.query(
    `UPDATE "${schemaName}".calendar_connections SET last_synced_at = NOW() WHERE id = $1`,
    [connection.id]
  );

  return { created, skipped };
}
