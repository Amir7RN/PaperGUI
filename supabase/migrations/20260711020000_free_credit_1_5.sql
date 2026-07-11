-- Raise the free signup credit from $1.00 to $1.50.
--
-- One Advanced (Opus) analysis of a dense paper can run slightly over $1, so
-- $1.50 guarantees a new account can finish at least one full Advanced paper.
-- This changes the default for accounts created AFTER it runs; existing rows
-- are unaffected (top them up manually if desired).

alter table public.credits alter column balance_usd set default 1.50;
