-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste all > Run.

create extension if not exists pgcrypto;

-- ACCOUNTS ------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'cash',
  initial_balance numeric not null default 0,
  color text not null default '#3E6B4F',
  created_at timestamptz not null default now()
);

-- CATEGORIES ------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  color text not null default '#55696B',
  created_at timestamptz not null default now()
);

-- TRANSACTIONS ------------------------------------------------------------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric not null check (amount > 0),
  account_id uuid references accounts(id) on delete set null,
  from_account_id uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  tags text[] not null default '{}',
  note text default '',
  fee_enabled boolean not null default false,
  fee_amount numeric not null default 0,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- BUDGETS ------------------------------------------------------------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  category_id uuid references categories(id) on delete set null, -- null = all categories
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- ROW LEVEL SECURITY ----------------------------------------------------
-- Ensures every user can only ever read/write their own rows.

alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;

create policy "Users manage own accounts" on accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own budgets" on budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes ---------------------------------------------------------
create index if not exists idx_transactions_user_date on transactions (user_id, occurred_at desc);
create index if not exists idx_accounts_user on accounts (user_id);
create index if not exists idx_categories_user on categories (user_id);
create index if not exists idx_budgets_user on budgets (user_id);
