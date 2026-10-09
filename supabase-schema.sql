-- Jalankan di Supabase Dashboard > SQL Editor > New Query > Run
-- Tabel todos untuk web app + trigger WA (1 nomor tujuan)

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_at timestamptz null,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  done boolean not null default false,
  reminded boolean not null default false,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

-- Index buat query reminder tiap menit (cepat)
create index if not exists idx_todos_reminder
  on public.todos (done, reminded, due_at);

-- Aktifkan RLS + policy terbuka untuk demo single-user.
-- Nanti kalau mau multi-user + login, ganti dengan policy auth.uid().
alter table public.todos enable row level security;

drop policy if exists "demo-all" on public.todos;
create policy "demo-all" on public.todos
  for all using (true) with check (true);

-- Aktifkan realtime biar checklist di HP/laptop lain langsung update
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='todos') then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
