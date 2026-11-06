-- Cotações integradas ao estoque: fornecedores convidados, contatos e câmbio auditável.
create table if not exists public.procurement_request_suppliers (
  request_supplier_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.procurement_requests(request_id) on delete cascade,
  supplier_id text not null references public.inventory_suppliers(supplier_id),
  status text not null default 'PENDENTE' check (status in ('PENDENTE','ENVIADA','RESPONDIDA','RECUSADA')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id,supplier_id)
);

create table if not exists public.inventory_supplier_quote_contacts (
  contact_id uuid primary key default gen_random_uuid(),
  supplier_id text not null references public.inventory_suppliers(supplier_id) on delete cascade,
  name text,
  email text not null,
  phone text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inventory_supplier_quote_contacts_email_uidx
  on public.inventory_supplier_quote_contacts(supplier_id,lower(email));
create index if not exists procurement_request_suppliers_request_idx
  on public.procurement_request_suppliers(request_id,status);
create index if not exists procurement_request_suppliers_supplier_idx
  on public.procurement_request_suppliers(supplier_id,status);

alter table public.procurement_offers
  add column if not exists exchange_rate_original numeric,
  add column if not exists exchange_rate_current numeric,
  add column if not exists exchange_rate_current_at timestamptz,
  add column if not exists response_source text not null default 'MANUAL',
  add column if not exists response_file_name text;

update public.procurement_offers
set exchange_rate_original=coalesce(exchange_rate_original,exchange_rate),
    exchange_rate_current=coalesce(exchange_rate_current,exchange_rate),
    exchange_rate_current_at=case when coalesce(exchange_rate_current,exchange_rate) is null then exchange_rate_current_at else coalesce(exchange_rate_current_at,updated_at) end
where exchange_rate is not null;

create table if not exists public.procurement_fx_rates (
  fx_rate_id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD',
  quote_currency text not null default 'BRL',
  rate numeric not null check(rate>0),
  rate_at timestamptz not null,
  source text not null default 'BCB_PTAX',
  fetched_at timestamptz not null default now(),
  fetched_by text not null,
  unique(base_currency,quote_currency,rate_at,source)
);
create index if not exists procurement_fx_rates_latest_idx
  on public.procurement_fx_rates(base_currency,quote_currency,rate_at desc);

insert into public.procurement_request_suppliers(request_id,supplier_id,status,sent_at,responded_at,created_by)
select distinct i.request_id,o.supplier_id,
  case when o.responded_at is not null then 'RESPONDIDA' else 'ENVIADA' end,
  coalesce(o.requested_at,o.created_at),o.responded_at,o.created_by
from public.procurement_offers o
join public.procurement_request_items i on i.item_id=o.item_id
where o.supplier_id is not null
on conflict(request_id,supplier_id) do nothing;

insert into public.inventory_supplier_quote_contacts(supplier_id,name,email,is_primary)
select supplier_id,name,trim(email),true
from public.inventory_suppliers
where nullif(trim(email),'') is not null
on conflict do nothing;

alter table public.procurement_request_suppliers enable row level security;
alter table public.inventory_supplier_quote_contacts enable row level security;
alter table public.procurement_fx_rates enable row level security;
revoke all on public.procurement_request_suppliers,public.inventory_supplier_quote_contacts,public.procurement_fx_rates from public,anon,authenticated;

update public.portal_apps
set href='https://portal.livionsolutions.com.br/estoque.html?v=19',
    description='Estoque, notas fiscais, preços, compras e cotações integrados.',
    actions=actions || '[
      {"key":"compras.visualizar","label":"Visualizar compras e cotações"},
      {"key":"compras.criar_solicitacao","label":"Criar cotações"},
      {"key":"compras.cotar","label":"Registrar e importar propostas"},
      {"key":"compras.aprovar","label":"Aprovar compras"},
      {"key":"compras.emitir_pedido","label":"Emitir pedidos"},
      {"key":"compras.receber","label":"Receber e dar entrada no estoque"},
      {"key":"compras.visualizar_valores","label":"Visualizar valores de compras"},
      {"key":"compras.gerenciar_fornecedores","label":"Gerenciar fornecedores e contatos"},
      {"key":"compras.exportar","label":"Gerar planilhas de cotação"}
    ]'::jsonb,
    updated_at=now()
where key='estoque';

update public.portal_users
set apps=apps || '["estoque"]'::jsonb,
    updated_at=now()
where apps ? 'compras-cotacoes' and not apps ? 'estoque';

update public.portal_apps
set active=false,updated_at=now()
where key='compras-cotacoes';
