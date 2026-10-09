-- Migrasi login: jalankan di Supabase Dashboard > SQL Editor > New Query > Run
-- SETELAH supabase-schema.sql pernah di-run.
-- Menambah pemilik (user_id) + mengunci data per user (RLS).

alter table public.todos
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists idx_todos_user on public.todos (user_id);
create index if not exists idx_todos_user_reminder
  on public.todos (user_id, done, reminded, due_at);

-- Cabut policy demo terbuka, ganti policy per-pemilik.
drop policy if exists "demo-all" on public.todos;

create policy "todos-owner-read" on public.todos
  for select using (auth.uid() = user_id);
create policy "todos-owner-insert" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "todos-owner-update" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todos-owner-delete" on public.todos
  for delete using (auth.uid() = user_id);

-- CATATAN: baris lama yang user_id-nya NULL jadi tidak terlihat siapa pun.
-- Hapus baris lama di Table Editor, lalu tambah ulang setelah login.
