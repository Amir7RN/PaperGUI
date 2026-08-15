-- Charge a user's balance ATOMICALLY.
--
-- Every metered function used to deduct with a read-modify-write: SELECT the
-- balance, subtract the cost in JavaScript, UPDATE the row. That is correct
-- exactly as long as one request runs at a time.
--
-- Digitizing a figure now fires one request PER SUBPLOT, in parallel, because
-- a single call reading a four-panel figure outlived Supabase's 150s wall
-- clock. Four parallel read-modify-writes all read the same starting balance
-- and the last write wins, so three of the four charges vanish — the reader
-- gets a figure for a quarter of its cost and the meter quietly stops meaning
-- anything.
--
-- Doing the arithmetic IN the UPDATE takes a row lock for the duration, so
-- concurrent charges queue behind each other and every one of them lands.
--
-- Deliberately not clamped at zero: a request that has already been spent with
-- Anthropic has already cost real money, and a small negative balance is an
-- honest record of that. The balance CHECK before the call is what stops a
-- user with no credit from starting one.

create or replace function public.charge_credit(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  update public.credits
     set balance_usd = balance_usd - p_amount,
         updated_at  = now()
   where user_id = p_user_id
  returning balance_usd into new_balance;
  return new_balance;
end;
$$;

-- Only the edge functions (service_role, which bypasses these grants) may
-- charge. A client that could call this could refund itself.
revoke all on function public.charge_credit(uuid, numeric) from public;
revoke all on function public.charge_credit(uuid, numeric) from anon;
revoke all on function public.charge_credit(uuid, numeric) from authenticated;
