alter table public.inventory_registry_merges
  add column if not exists review_status text not null default 'PENDENTE',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

alter table public.inventory_registry_merges drop constraint if exists inventory_registry_merges_review_status_check;
alter table public.inventory_registry_merges add constraint inventory_registry_merges_review_status_check check (review_status in ('PENDENTE','CONFIRMADO'));
create index if not exists inventory_registry_merges_pending_review_idx on public.inventory_registry_merges(entity_type,review_status,merged_at desc);
