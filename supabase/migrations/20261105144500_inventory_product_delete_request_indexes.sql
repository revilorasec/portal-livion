create index if not exists inventory_product_delete_requests_merged_target_idx
  on public.inventory_product_delete_requests(merged_into_product_id)
  where merged_into_product_id is not null;
