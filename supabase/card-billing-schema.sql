ALTER TABLE public.expense_cards
  ADD COLUMN IF NOT EXISTS closing_day smallint CHECK (closing_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS due_day smallint CHECK (due_day BETWEEN 1 AND 31);
COMMENT ON COLUMN public.expense_cards.closing_day IS 'Optional statement closing day. Same-day purchases forecast next cycle.';
COMMENT ON COLUMN public.expense_cards.due_day IS 'Optional statement due day, clamped to the last day of shorter months.';
