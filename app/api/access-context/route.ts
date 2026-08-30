import { apiHeaders, errorResponse, optionsResponse } from '@/lib/http';
import { requireAccessContext } from '@/lib/server-access';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  try {
    const context = await requireAccessContext(request);
    return Response.json(context, { headers: apiHeaders(request) });
  } catch (error) {
    return errorResponse(request, error);
  }
}
