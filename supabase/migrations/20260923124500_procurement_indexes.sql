-- Índices das relações usadas nas telas e na conciliação histórica.
create index if not exists procurement_offers_supplier_idx on public.procurement_offers(supplier_id);
create index if not exists procurement_orders_supplier_idx on public.procurement_orders(supplier_id);
create index if not exists procurement_order_items_request_item_idx on public.procurement_order_items(request_item_id);
create index if not exists procurement_order_items_offer_idx on public.procurement_order_items(offer_id);
create index if not exists procurement_receipt_items_order_item_idx on public.procurement_receipt_items(order_item_id);
create index if not exists procurement_legacy_request_idx on public.procurement_legacy_rows(request_id);
create index if not exists procurement_legacy_item_idx on public.procurement_legacy_rows(item_id);
create index if not exists procurement_legacy_offer_idx on public.procurement_legacy_rows(offer_id);
create index if not exists procurement_legacy_order_idx on public.procurement_legacy_rows(order_id);
