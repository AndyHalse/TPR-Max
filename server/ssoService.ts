import * as client from 'openid-client';
import { logger } from './utils/logger';

export interface SsoCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export function isSsoConfigured(creds: { ssoTenantId?: string | null; ssoClientId?: string | null; ssoClientSecret?: string | null }): boolean {
  return !!(creds.ssoTenantId && creds.ssoClientId && creds.ssoClientSecret);
}

export function getMissingConfigReason(creds: { ssoTenantId?: string | null; ssoClientId?: string | null; ssoClientSecret?: string | null }): string | null {
  if (!creds.ssoTenantId) return 'Azure Tenant ID is not configured';
  if (!creds.ssoClientId) return 'Azure Client ID is not configured';
  if (!creds.ssoClientSecret) return 'Azure Client Secret is not configured';
  return null;
}

async function buildConfig(creds: SsoCredentials): Promise<client.Configuration> {
  const config = await client.discovery(
    new URL(`https://login.microsoftonline.com/${creds.tenantId}/v2.0`),
    creds.clientId,
    creds.clientSecret
  );
  logger.info('✅ SSO: OpenID Connect discovery completed');
  return config;
}

export async function buildAuthUrl(
  state: string,
  creds: SsoCredentials
): Promise<{ url: string; codeVerifier: string }> {
  const config = await buildConfig(creds);
  const redirectUri = creds.redirectUri || `${process.env.APP_BASE_URL || ''}/api/auth/sso/callback`;

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
  codeVerifier: string,
  creds: SsoCredentials
): Promise<{ oid: string; email: string; displayName: string; givenName?: string; surname?: string } | null> {
  try {
    const config = await buildConfig(creds);
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
