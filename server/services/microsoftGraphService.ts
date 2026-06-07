import { logger } from '../utils/logger';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  start: Date;
  attendees: { email: string; displayName: string }[];
}

export async function fetchMicrosoftEvents(
  accessToken: string,
  daysAhead: number
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + daysAhead * 86_400_000).toISOString();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${end}&$select=id,subject,start,attendees&$top=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Microsoft Graph error ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  return (data.value || []).map((event: any) => ({
    id: event.id,
    subject: event.subject || '(No subject)',
    start: new Date(event.start?.dateTime || event.start?.date),
    attendees: (event.attendees || []).map((a: any) => ({
      email: a.emailAddress?.address || '',
      displayName: a.emailAddress?.name || '',
    })).filter((a: any) => !!a.email),
  }));
}

export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'Calendars.Read User.Read offline_access',
  });

  const response = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Microsoft token refresh failed: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
  };
}

export function buildMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('MICROSOFT_OAUTH_CLIENT_ID not set');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'Calendars.Read User.Read offline_access',
    state,
    access_type: 'offline',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; userEmail: string }> {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Microsoft OAuth credentials not configured');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'Calendars.Read User.Read offline_access',
  });

  const response = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Microsoft token exchange failed: ${text.substring(0, 200)}`);
  }

  const data = await response.json();

  // Fetch user email
  let userEmail = '';
  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      userEmail = me.mail || me.userPrincipalName || '';
    }
  } catch (e) {
    logger.warn('Could not fetch Microsoft user email:', e);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    userEmail,
  };
}
