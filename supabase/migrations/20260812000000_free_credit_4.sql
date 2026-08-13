-- Raise the free signup credit from $1.50 to $4.00.
--
-- $1.50 covered exactly one Advanced pass and nothing after it. That was the
-- right number when an analysis WAS the product; it is the wrong number now
-- that the first pass is deliberately cheap and everything worth paying for —
-- a section unlock, a lesson built from a highlighted passage, a figure made
-- live — is a separate priced click afterwards. A new account that can afford
-- the pass but not one thing it unlocks never sees what the app actually does.
--
-- This changes the default for accounts created AFTER it runs. Existing rows
-- keep whatever balance they have: those are real balances, some of them paid
-- for, and silently rewriting them is not a migration's job. To top up an
-- existing account:
--   update public.credits set balance_usd = 4.00 where user_id = '<uuid>';

alter table public.credits alter column balance_usd set default 4.00;
