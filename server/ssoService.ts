import * as client from 'openid-client';
import { logger } from './utils/logger';

function requireEnvVars(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    const msg = 'Azure SSO environment variables are not configured on this server';
    logger.error(`❌ SSO: ${msg}`);
    throw new Error(msg);
  }
  return { tenantId, clientId, clientSecret };
}

let cachedConfig: client.Configuration | null = null;

async function getConfig(): Promise<client.Configuration> {
  const { tenantId, clientId, clientSecret } = requireEnvVars();
  if (!cachedConfig) {
    cachedConfig = await client.discovery(
      new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
      clientId,
      clientSecret
    );
    logger.info('✅ SSO: OpenID Connect discovery completed');
  }
  return cachedConfig;
}

export function getDiscoveryUrl(): string {
  const { tenantId } = requireEnvVars();
  return `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

export async function buildAuthUrl(state: string): Promise<{ url: string; codeVerifier: string }> {
  const config = await getConfig();
  const baseUrl = process.env.APP_BASE_URL || '';
  const redirectUri = `${baseUrl}/api/auth/sso/callback`;

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return { url: url.toString(), codeVerifier };
}

export async function handleCallback(
  fullCallbackUrl: string,
  expectedState: string,
  codeVerifier: string
): Promise<{ oid: string; email: string; displayName: string; givenName?: string; surname?: string } | null> {
  try {
    const config = await getConfig();
    const tokens = await client.authorizationCodeGrant(config, new URL(fullCallbackUrl), {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    const claims = tokens.claims();
    if (!claims) {
      logger.warn('⚠️ SSO: No claims in token response');
      return null;
    }
    const oid = ((claims as any).oid || claims.sub) as string;
    const email = (claims.email || (claims as any).preferred_username) as string;
    const displayName = ((claims as any).name || '') as string;
    const givenName = (claims as any).given_name as string | undefined;
    const surname = (claims as any).family_name as string | undefined;
    if (!oid || !email) {
      logger.warn('⚠️ SSO: Missing required claims (oid or email)');
      return null;
    }
    return { oid, email, displayName, givenName, surname };
  } catch (error: any) {
    logger.error('❌ SSO: Callback handling failed:', error.message);
    return null;
  }
}

export async function findOrProvisionUser(
  customerDb: any,
  claims: { oid: string; email: string; displayName: string; givenName?: string; surname?: string },
  autoProvision: boolean,
  defaultRole: string
): Promise<any | null> {
  const { users } = await import('./isolatedSchema');
  const { eq } = await import('drizzle-orm');

  let found = await customerDb.select().from(users).where(eq(users.azureObjectId, claims.oid)).limit(1);
  if (found.length > 0) {
    logger.info(`✅ SSO: Found user by azureObjectId: ${found[0].username}`);
    return found[0];
  }

  found = await customerDb.select().from(users).where(eq(users.email, claims.email)).limit(1);
  if (found.length > 0) {
    logger.info(`✅ SSO: Found user by email, linking azureObjectId: ${found[0].username}`);
    await customerDb.update(users)
      .set({ azureObjectId: claims.oid, authProvider: 'azure_entra' })
      .where(eq(users.id, found[0].id));
    return { ...found[0], azureObjectId: claims.oid, authProvider: 'azure_entra' };
  }

  if (!autoProvision) {
    logger.warn(`⚠️ SSO: No user found for ${claims.email} and auto-provision is disabled`);
    return null;
  }

  const nameParts = claims.displayName.split(' ');
  const firstName = claims.givenName || nameParts[0] || '';
  const lastName = claims.surname || nameParts.slice(1).join(' ') || '';
  const username = claims.email.split('@')[0] || claims.email;

  logger.info(`✅ SSO: Auto-provisioning new user: ${username}`);
  const newUsers = await customerDb.insert(users).values({
    username,
    password: null,
    email: claims.email,
    role: defaultRole,
    firstName,
    lastName,
    azureObjectId: claims.oid,
    authProvider: 'azure_entra',
    isActive: true,
  }).returning();

  return newUsers[0] || null;
}

export function isSsoConfigured(): boolean {
  return !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

export function getMissingConfigReason(): string | null {
  if (!process.env.AZURE_TENANT_ID) return 'AZURE_TENANT_ID is missing';
  if (!process.env.AZURE_CLIENT_ID) return 'AZURE_CLIENT_ID is missing';
  if (!process.env.AZURE_CLIENT_SECRET) return 'AZURE_CLIENT_SECRET is missing';
  return null;
}
