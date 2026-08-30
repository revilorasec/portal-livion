export function isExpectedPortalClient(claims, tenantId, clientId) {
  if (!claims || typeof claims !== 'object') return false;
  const callingClient = String(claims.azp || claims.appid || '');
  return claims.tid === tenantId && callingClient === clientId;
}
