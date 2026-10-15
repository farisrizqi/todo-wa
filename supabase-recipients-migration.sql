-- Per-todo recipients (max 5 numbers per todo, chosen at creation).
-- Run in Supabase Dashboard > SQL Editor > New Query > Run,
-- AFTER supabase-schema.sql (and auth migration, if used).

alter table public.todos
  add column if not exists recipients text[] not null default '{}';
