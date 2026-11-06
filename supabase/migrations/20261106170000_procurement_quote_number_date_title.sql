update public.procurement_requests
set title = 'COT-' || lpad(request_number::text, 6, '0') || ' - ' ||
  to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
  updated_at = now()
where title is distinct from (
  'COT-' || lpad(request_number::text, 6, '0') || ' - ' ||
  to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
);
