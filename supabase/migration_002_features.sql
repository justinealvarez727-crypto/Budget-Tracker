-- Run this in Supabase: Dashboard > SQL Editor > New query > paste all > Run.
-- Safe to run on a database that already has data — it only adds new columns/tables.

-- 1. Category icons
alter table categories add column if not exists icon text not null default 'Tag';

-- 2. Explicit budget assignment on expenses (nullable — null means "auto match by category")
alter table transactions add column if not exists budget_id uuid references budgets(id) on delete set null;

-- 3. Savings goals
create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric not null check (target_amount > 0),
  target_date date,
  account_id uuid references accounts(id) on delete set null, -- null = tracked manually
  manual_saved numeric not null default 0,
  color text not null default '#C08829',
  created_at timestamptz not null default now()
);

alter table savings_goals enable row level security;

create policy "Users manage own savings goals" on savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_savings_goals_user on savings_goals (user_id);

-- 4. Tagging has been removed from the app. Your existing tags data is left untouched
--    and simply unused. If you'd like to permanently remove it from the database too,
--    uncomment and run the line below — this cannot be undone:
--
-- alter table transactions drop column if exists tags;
