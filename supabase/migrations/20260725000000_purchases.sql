-- Card top-ups: the record of what was paid for, and the only atomic way to
-- add credit.
--
-- Written exclusively by the stripe-webhook edge function (service_role, which
-- bypasses RLS). The unique constraint on stripe_session_id is what makes the
-- webhook safe to retry: Stripe delivers at least once, and a replay must not
-- grant a second time.

create table if not exists public.purchases (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  stripe_session_id  text not null unique,
  amount_usd         numeric(10, 2) not null,   -- what the buyer actually paid
  granted_usd        numeric(10, 4) not null,   -- balance added for it
  pack               text,                      -- e.g. "ADV2-STD1"
  papers             integer,
  created_at         timestamptz not null default now()
);

create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);

alter table public.purchases enable row level security;

drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases"
  on public.purchases for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy: only the service_role key can write.

-- Atomic credit grant. A read-modify-write from the edge function could lose a
-- concurrent purchase or a concurrent analysis deduction; this cannot.
create or replace function public.add_credit(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  insert into public.credits (user_id, balance_usd)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set balance_usd = public.credits.balance_usd + excluded.balance_usd,
        updated_at  = now()
  returning balance_usd into new_balance;

  return new_balance;
end;
$$;

-- Callable only by the service_role key (the webhook), never by a signed-in
-- client — otherwise anyone could grant themselves credit.
revoke all on function public.add_credit(uuid, numeric) from public, anon, authenticated;
