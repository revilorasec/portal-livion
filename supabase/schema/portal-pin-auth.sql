-- Apply as hosted migration portal_external_pin_auth. No existing user gets a PIN.
create table public.portal_pin_credentials (
  user_id bigint primary key references public.portal_users(id) on delete cascade,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  salt text not null check (salt ~ '^[0-9a-f]{32}$'),
  version uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
create table public.portal_pin_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id bigint not null references public.portal_pin_credentials(user_id) on delete cascade,
  credential_version uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index portal_pin_sessions_user_idx on public.portal_pin_sessions(user_id);
create index portal_pin_sessions_expiry_idx on public.portal_pin_sessions(expires_at);
create table public.portal_pin_attempts (
  bucket text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);
alter table public.portal_pin_credentials enable row level security;
alter table public.portal_pin_sessions enable row level security;
alter table public.portal_pin_attempts enable row level security;
revoke all on public.portal_pin_credentials, public.portal_pin_sessions, public.portal_pin_attempts from public, anon, authenticated;
grant all on public.portal_pin_credentials, public.portal_pin_sessions, public.portal_pin_attempts to service_role;

-- Counters are incremented before verification and serialized across all instances.
create function public.portal_pin_reserve_attempt(p_email_bucket text, p_ip_bucket text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; allowed boolean := true;
begin
  insert into public.portal_pin_attempts as a(bucket) values (p_email_bucket)
    on conflict(bucket) do update set
      attempts = case when a.window_start <= now()-interval '15 minutes' then 1 else a.attempts+1 end,
      window_start = case when a.window_start <= now()-interval '15 minutes' then now() else a.window_start end
    returning attempts into n;
  allowed := n <= 5;
  insert into public.portal_pin_attempts as a(bucket) values (p_ip_bucket)
    on conflict(bucket) do update set
      attempts = case when a.window_start <= now()-interval '15 minutes' then 1 else a.attempts+1 end,
      window_start = case when a.window_start <= now()-interval '15 minutes' then now() else a.window_start end
    returning attempts into n;
  return allowed and n <= 60;
end $$;
revoke all on function public.portal_pin_reserve_attempt(text,text) from public, anon, authenticated;
grant execute on function public.portal_pin_reserve_attempt(text,text) to service_role;

-- User details and credential changes commit together; errors roll back both.
create function public.portal_save_user_with_pin(p_payload jsonb, p_action text, p_digest text default null, p_salt text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v public.portal_users; saved_id bigint; has_pin boolean;
begin
  if p_action not in ('keep','set','remove') then raise exception 'INVALID_PIN_ACTION'; end if;
  v := jsonb_populate_record(null::public.portal_users,p_payload);
  perform pg_advisory_xact_lock(hashtextextended(v.email,0));
  select exists(select 1 from public.portal_pin_credentials c join public.portal_users u on u.id=c.user_id where u.email=v.email) into has_pin;
  if p_action='set' or (p_action='keep' and has_pin) then
    if v.user_type not in ('CLIENTE','PARCEIRO') or v.profile='ADMINISTRADOR' or v.apps ? 'fretes' then
      raise exception 'PIN_NOT_ALLOWED';
    end if;
  end if;
  insert into public.portal_users(email,name,profile,active,user_type,entity_key,organization_key,client_key,phone,document_number,photo_url,photo_url_2,photo_url_3,photo_url_4,personal_notes,person_category,apps,actions,companies,updated_at)
  values(v.email,v.name,v.profile,v.active,v.user_type,v.entity_key,v.organization_key,v.client_key,v.phone,v.document_number,v.photo_url,v.photo_url_2,v.photo_url_3,v.photo_url_4,v.personal_notes,v.person_category,v.apps,v.actions,v.companies,now())
  on conflict(email) do update set name=excluded.name,profile=excluded.profile,active=excluded.active,user_type=excluded.user_type,entity_key=excluded.entity_key,organization_key=excluded.organization_key,client_key=excluded.client_key,phone=excluded.phone,document_number=excluded.document_number,photo_url=excluded.photo_url,photo_url_2=excluded.photo_url_2,photo_url_3=excluded.photo_url_3,photo_url_4=excluded.photo_url_4,personal_notes=excluded.personal_notes,person_category=excluded.person_category,apps=excluded.apps,actions=excluded.actions,companies=excluded.companies,updated_at=excluded.updated_at
  returning id into saved_id;
  if p_action='set' then
    insert into public.portal_pin_credentials(user_id,digest,salt) values(saved_id,p_digest,p_salt)
    on conflict(user_id) do update set digest=excluded.digest,salt=excluded.salt,version=gen_random_uuid(),updated_at=now();
  elsif p_action='remove' then
    delete from public.portal_pin_credentials where user_id=saved_id;
  end if;
  if p_action <> 'keep' or not v.active then
    delete from public.portal_pin_sessions where user_id=saved_id;
  end if;
end $$;
revoke all on function public.portal_save_user_with_pin(jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.portal_save_user_with_pin(jsonb,text,text,text) to service_role;
