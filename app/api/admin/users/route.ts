import { ACTION_KEYS, APP_KEYS, COMPANY_KEYS, PROFILES } from '@/lib/portal-registry.mjs';
import { normalizeEmail } from '@/lib/access-control.mjs';
import { audit, deleteUser, listUsers, saveUser } from '@/lib/db';
import { apiHeaders, errorResponse, optionsResponse } from '@/lib/http';
import { requireAdministrator } from '@/lib/server-access';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) { return optionsResponse(request); }

export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    return Response.json({ users: await listUsers() }, { headers: apiHeaders(request) });
  } catch (error) { return errorResponse(request, error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdministrator(request);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 30000) return Response.json({ error: 'Solicitacao muito grande.' }, { status: 413, headers: apiHeaders(request) });
    const body = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim().slice(0, 120);
    const profile = String(body.profile || '');
    const apps = Array.isArray(body.apps) ? body.apps.map(String).filter((app) => APP_KEYS.includes(app)) : [];
    const companies = Array.isArray(body.companies) ? body.companies.map(String).filter((item) => COMPANY_KEYS.includes(item)) : [];
    const actions = Array.isArray(body.actions) ? body.actions.map(String).filter((item) => item === '*' || ACTION_KEYS.includes(item)) : [];
    if (!email || !email.includes('@') || !name || !PROFILES.includes(profile)) {
      return Response.json({ error: 'Dados do usuario invalidos.' }, { status: 400, headers: apiHeaders(request) });
    }
    if (email === actor.user.email && body.active === false) {
      return Response.json({ error: 'Voce nao pode desativar o proprio usuario administrador.' }, { status: 400, headers: apiHeaders(request) });
    }
    await saveUser({ email, name, profile, active: body.active !== false, apps, companies, actions });
    await audit(actor.user.email, 'USER_UPSERT', email, { profile, active: body.active !== false, apps, companies, actions });
    return Response.json({ ok: true }, { headers: apiHeaders(request) });
  } catch (error) { return errorResponse(request, error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdministrator(request);
    const email = normalizeEmail(new URL(request.url).searchParams.get('email'));
    if (!email || !email.includes('@')) return Response.json({ error: 'Usuario invalido.' }, { status: 400, headers: apiHeaders(request) });
    if (email === actor.user.email) return Response.json({ error: 'Voce nao pode excluir o proprio usuario administrador.' }, { status: 400, headers: apiHeaders(request) });
    await deleteUser(email);
    await audit(actor.user.email, 'USER_DELETE', email);
    return Response.json({ ok: true }, { headers: apiHeaders(request) });
  } catch (error) { return errorResponse(request, error); }
}
