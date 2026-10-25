-- Jalankan ini di Supabase Dashboard > SQL Editor > New Query > Run
-- Menambahkan kolom reminder_offset_min untuk reminder dinamis per-todo (dalam menit)

alter table public.todos 
  add column if not exists reminder_offset_min integer default 30;

-- Optional: Index untuk mempercepat query reminder
create index if not exists idx_todos_reminder_lead
  on public.todos (done, reminded, due_at, reminder_offset_min);
