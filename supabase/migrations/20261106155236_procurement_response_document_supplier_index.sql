create index if not exists procurement_response_documents_supplier_idx
  on public.procurement_response_documents(supplier_id,uploaded_at desc);
