-- Run this in Supabase: Dashboard > SQL Editor > New query > paste all > Run.
-- Safe on a database that already has data — only adds a new column.

alter table transactions add column if not exists is_adjustment boolean not null default false;
