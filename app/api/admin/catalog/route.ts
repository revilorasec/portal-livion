import { ACTION_KEYS, APP_REGISTRY, COMPANY_REGISTRY, PROFILE_REGISTRY } from '@/lib/portal-registry.mjs';
import { apiHeaders, errorResponse, optionsResponse } from '@/lib/http';
import { requireAdministrator } from '@/lib/server-access';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    return Response.json(
      { apps: APP_REGISTRY, companies: COMPANY_REGISTRY, profiles: PROFILE_REGISTRY, actions: ACTION_KEYS },
      { headers: apiHeaders(request) },
    );
  } catch (error) {
    return errorResponse(request, error);
  }
}
