-- Saved paper analyses (the per-account "library").
--
-- When a signed-in user analyzes a paper we store the finished, fully-hydrated
-- spec here so it can be reopened for free instead of spending credit to
-- re-analyze the same PDF. Unlike `credits`, clients write this table directly
-- (right after a successful analysis), so row-level security must allow each
-- user to insert/read/delete only their own rows.

create table if not exists public.analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Untitled paper',
  authors     text not null default '',
  spec        jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

drop policy if exists "read own analyses" on public.analyses;
create policy "read own analyses"
  on public.analyses for select
  using (auth.uid() = user_id);

drop policy if exists "insert own analyses" on public.analyses;
create policy "insert own analyses"
  on public.analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "delete own analyses" on public.analyses;
create policy "delete own analyses"
  on public.analyses for delete
  using (auth.uid() = user_id);
