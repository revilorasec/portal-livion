import { microsoftAuth } from './auth-config';
import { isExpectedPortalClient } from './token-policy.mjs';

export type MicrosoftIdentity = { id: string; email: string; name: string };

function bearer(request: Request) {
  const value = request.headers.get('authorization') || '';
  if (!value.startsWith('Bearer ') || value.length > 9000) throw new Error('UNAUTHENTICATED');
  return value.slice(7);
}

function tokenClaims(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)) as { tid?: string; azp?: string; appid?: string };
  } catch {
    return {};
  }
}

export async function verifyMicrosoftIdentity(request: Request): Promise<MicrosoftIdentity> {
  const token = bearer(request);
  const claims = tokenClaims(token);
  if (!isExpectedPortalClient(claims, microsoftAuth.tenantId, microsoftAuth.clientId)) {
    throw new Error('UNAUTHENTICATED');
  }
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('UNAUTHENTICATED');
  const me = await response.json() as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
  const email = String(me.mail || me.userPrincipalName || '').trim().toLowerCase();
  if (!me.id || !email) throw new Error('UNAUTHENTICATED');
  return { id: me.id, email, name: me.displayName || email };
}
