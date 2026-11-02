-- SITAM SPACE v22 — Ask SITAM archive: every answered question is saved for the person who asked it
-- (FAQ → "Ask SITAM AI" tab shows the archive; the floating chat saves there too). Only the owner sees and deletes
-- their questions. Re-runnable.
create table if not exists public.ask_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 3 and 600),
  answer text not null default '' check (char_length(answer) <= 20000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  scope text not null default 'auto' check (scope in ('auto', 'labs', 'people', 'papers', 'events', 'opportunities', 'projects', 'faq')),
  created_at timestamptz not null default now()
);
create index if not exists ask_questions_user_idx on public.ask_questions (user_id, created_at desc);
alter table public.ask_questions enable row level security;
drop policy if exists "Own Ask questions: read" on public.ask_questions;
drop policy if exists "Own Ask questions: add" on public.ask_questions;
drop policy if exists "Own Ask questions: delete" on public.ask_questions;
create policy "Own Ask questions: read" on public.ask_questions for select to authenticated using (user_id = auth.uid());
create policy "Own Ask questions: add" on public.ask_questions for insert to authenticated with check (user_id = auth.uid());
create policy "Own Ask questions: delete" on public.ask_questions for delete to authenticated using (user_id = auth.uid());
revoke all on public.ask_questions from anon, public;
revoke update on public.ask_questions from authenticated;
grant select, insert, delete on public.ask_questions to authenticated;
