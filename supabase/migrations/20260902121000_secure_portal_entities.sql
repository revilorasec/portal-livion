alter table public.portal_entities enable row level security;

comment on table public.portal_entities is
  'Portal entities are accessible only through service-role Edge Functions.';
