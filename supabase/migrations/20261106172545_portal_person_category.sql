-- Organizational label only; access continues to be controlled by profile and actions.
alter table public.portal_users
  add column person_category text
  check (person_category is null or person_category in ('SOCIO', 'SOCIO_ADMINISTRADOR', 'FUNCIONARIO'));
