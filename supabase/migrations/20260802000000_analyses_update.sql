-- Let an owner UPDATE their own saved analysis.
--
-- Analyses used to be written once and never touched again, so insert/read/
-- delete were the only policies needed. Figures are now digitized on demand —
-- a reader makes one figure live, pays for that read, and the result has to
-- survive closing the paper, or they would pay for the same figure every time
-- they reopened it.
--
-- Same ownership rule as every other policy on this table: a row is only ever
-- visible or writable to the account that created it.

drop policy if exists "update own analyses" on public.analyses;
create policy "update own analyses"
  on public.analyses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
