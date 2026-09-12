-- Run this in Supabase: Dashboard > SQL Editor > New query > paste all > Run.
-- Safe on a database that already has data — only adds a new table and a new column.

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  total_amount numeric not null check (total_amount > 0),
  due_date date,
  color text not null default '#A13A1F',
  created_at timestamptz not null default now()
);

alter table debts enable row level security;

create policy "Users manage own debts" on debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_debts_user on debts (user_id);

-- Links an expense to a debt so its amount is automatically deducted from what's owed.
-- Null = this expense isn't a debt payment.
alter table transactions add column if not exists debt_id uuid references debts(id) on delete set null;
