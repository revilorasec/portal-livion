-- Permite distinguir notas consultadas diretamente pelo QR das importadas por XML.
alter table public.inventory_invoices
  drop constraint if exists inventory_invoices_source_check;

alter table public.inventory_invoices
  add constraint inventory_invoices_source_check
  check (source in ('XML_NFE','QR_NFE','LEGACY_IMPORT'));
