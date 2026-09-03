alter table public.inventory_media drop constraint if exists inventory_media_entity_type_check;
alter table public.inventory_media add constraint inventory_media_entity_type_check
  check (entity_type in ('PRODUCT','REQUESTER','SUPPLIER','MOVEMENT'));
