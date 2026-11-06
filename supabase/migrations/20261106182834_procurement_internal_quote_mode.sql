-- Permite distinguir a cotacao enviada a fornecedores da pesquisa feita internamente.
alter table public.procurement_requests
  add column if not exists quote_mode text not null default 'SUPPLIER';

alter table public.procurement_requests
  drop constraint if exists procurement_requests_quote_mode_check;

alter table public.procurement_requests
  add constraint procurement_requests_quote_mode_check
  check (quote_mode in ('SUPPLIER','INTERNAL'));

comment on column public.procurement_requests.quote_mode is
  'SUPPLIER gera uma planilha por fornecedor; INTERNAL gera uma unica planilha para pesquisa interna.';
