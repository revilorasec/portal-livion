create table public.finance_bank_notes (
 account_id uuid not null,
 transaction_id uuid not null,
 note text not null check (char_length(note)<=3000),
 revision integer not null check(revision>0),
 history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array'),
 updated_at timestamptz not null default now(),
 updated_by text not null,
 primary key(account_id,transaction_id)
);
alter table public.finance_bank_notes enable row level security;
revoke all on public.finance_bank_notes from public,anon,authenticated;
grant select,insert,update on public.finance_bank_notes to service_role;
comment on table public.finance_bank_notes is 'Observações de movimentações bancárias do Painel Financeiro. Sem alterar pagamentos, baixas ou valores. Autorização do Portal na finance-api; histórico e revisão preservados.';
