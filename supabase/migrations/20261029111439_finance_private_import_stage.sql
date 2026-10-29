-- Resumable deployment-only transfer for the initial portable HTML.
-- This schema is not exposed by PostgREST and has no browser grants or policies.
create schema finance_private;
revoke all on schema finance_private from public, anon, authenticated;
create table finance_private.import_chunks (
  import_id text not null,
  part integer not null check (part >= 0),
  content text not null,
  primary key (import_id, part)
);
alter table finance_private.import_chunks enable row level security;
revoke all on finance_private.import_chunks from public, anon, authenticated;
