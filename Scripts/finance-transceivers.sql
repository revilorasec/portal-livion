-- Complementary records only. No ERP, stock movement, payable or receivable is mutated.
create table public.finance_transceiver_catalog (
 product_code text primary key check(length(product_code) between 1 and 64),
 fields jsonb not null default '{}' check(jsonb_typeof(fields)='object'),
 revision integer not null default 1 check(revision>0),
 history jsonb not null default '[]' check(jsonb_typeof(history)='array'),
 updated_at timestamptz not null default now(), updated_by text not null
);
create table public.finance_transceiver_operations (
 id uuid primary key, source_key text unique not null,
 product_code text not null, kind text not null check(kind in ('purchase','sale')),
 document text not null, counterparty text not null, lot text not null default '', date date not null,
 quantity numeric(18,6) not null check(quantity>0), unit_cost numeric(18,6) check(unit_cost>=0),
 unit_price numeric(18,6) check(unit_price>=0), notes text not null default '',
 created_at timestamptz not null default now(), created_by text not null,
 check((kind='purchase' and unit_cost is not null) or (kind='sale' and unit_price is not null))
);
-- Only identities of existing ERP sales, used to reject duplicate manual registration.
create table public.finance_transceiver_references (
 source_key text primary key, snapshot_sha256 text not null
);
alter table public.finance_transceiver_catalog enable row level security;
alter table public.finance_transceiver_operations enable row level security;
alter table public.finance_transceiver_references enable row level security;
revoke all on public.finance_transceiver_catalog,public.finance_transceiver_operations,public.finance_transceiver_references from public,anon,authenticated;
grant select,insert,update on public.finance_transceiver_catalog to service_role;
grant select,insert on public.finance_transceiver_operations to service_role;
grant select,insert,update on public.finance_transceiver_references to service_role;
create index finance_transceiver_operations_product_date on public.finance_transceiver_operations(product_code,date);
