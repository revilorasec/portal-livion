const portalOrigin = 'https://portal-livion.revilorasec.chatgpt.site';

function allowedOrigin(origin: string) {
  return origin === portalOrigin || origin === 'https://revilorasec.github.io' ||
    /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin);
}

export function apiHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string,string> = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
  if (allowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function optionsResponse(request: Request) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    ...apiHeaders(request),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  }});
}

export function errorResponse(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : 500;
  const message = status === 401 ? 'Entre com sua conta Microsoft.' :
    status === 403 ? 'Seu usuario nao possui acesso.' : 'Nao foi possivel validar o acesso.';
  return Response.json({ error: message }, { status, headers: apiHeaders(request) });
}
