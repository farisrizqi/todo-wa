-- Per-user WhatsApp number, set once in Profile.
-- Each user's todos notify THEIR OWN number.
-- Run in Supabase Dashboard > SQL Editor > New Query > Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles-owner-read" on public.profiles;
drop policy if exists "profiles-owner-insert" on public.profiles;
drop policy if exists "profiles-owner-update" on public.profiles;

create policy "profiles-owner-read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles-owner-insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles-owner-update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
