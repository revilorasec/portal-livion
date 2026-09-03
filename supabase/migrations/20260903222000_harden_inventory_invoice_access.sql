-- Fiscal writes are performed exclusively by the authenticated inventory Edge Function.
revoke all on function public.inventory_import_invoice(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.inventory_import_invoice(jsonb, jsonb, text) to service_role;

alter function public.inventory_prevent_movement_mutation() set search_path = public, pg_temp;

create index if not exists inventory_documents_invoice_idx
  on public.inventory_documents (invoice_id)
  where invoice_id is not null;

create index if not exists inventory_invoice_items_movement_idx
  on public.inventory_invoice_items (movement_id)
  where movement_id is not null;

create index if not exists inventory_invoices_supplier_idx
  on public.inventory_invoices (supplier_id)
  where supplier_id is not null;

create index if not exists inventory_lots_invoice_item_idx
  on public.inventory_lots (invoice_item_id)
  where invoice_item_id is not null;

create index if not exists inventory_supplier_price_history_supplier_idx
  on public.inventory_supplier_price_history (supplier_id);
