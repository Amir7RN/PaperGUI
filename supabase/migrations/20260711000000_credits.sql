-- Per-account API spend credit.
--
-- Every signed-up user gets a one-time $1.00 balance. The analyze-paper edge
-- function is the ONLY writer of balance_usd (via the service_role key, which
-- bypasses RLS) — it deducts the real metered cost of each Anthropic request
-- after the fact. Clients can only read their own row.

create table if not exists public.credits (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  balance_usd   numeric(10, 4) not null default 1.00,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.credits enable row level security;

drop policy if exists "read own credits" on public.credits;
create policy "read own credits"
  on public.credits for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for authenticated/anon: only the
-- service_role key (used exclusively by the edge function) can write.

-- Grant every new account its starting balance automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Operational note: to top up or reset a specific user's balance later,
-- run e.g.:
--   update public.credits set balance_usd = 1.00 where user_id = '<uuid>';
-- Find the uuid via: select id, email from auth.users where email = '...';
