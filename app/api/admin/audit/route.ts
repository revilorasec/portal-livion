import { listAudit } from '@/lib/db';
import { apiHeaders, errorResponse, optionsResponse } from '@/lib/http';
import { requireAdministrator } from '@/lib/server-access';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) { return optionsResponse(request); }

export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const limit = Number(new URL(request.url).searchParams.get('limit') || 200);
    return Response.json({ audit: await listAudit(limit) }, { headers: apiHeaders(request) });
  } catch (error) { return errorResponse(request, error); }
}
