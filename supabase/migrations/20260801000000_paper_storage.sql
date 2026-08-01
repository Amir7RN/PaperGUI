-- Keep the reader's PDF, privately, so the paper itself can be the reading surface.
--
-- Until now an uploaded PDF was sent to the analyzer and then dropped: only the
-- generated spec survived. That made the paper's own text unavailable the moment
-- the tab closed, so a reopened analysis could only ever show the AI's summary of
-- the paper — never the paper.
--
-- The PDF now lives in a PRIVATE bucket, one folder per user, and the owning
-- `analyses` row points at it. Nothing here is public: the bucket is private, so
-- the only way to read an object is a short-lived signed URL minted for a caller
-- who already passed the RLS checks below. Deleting an analysis deletes its PDF
-- (see deleteAnalysis in src/supabase.js) — the app promises that, so it must hold.

-- Which paper belongs to which saved analysis. Null for every analysis saved
-- before this migration, and for any run whose upload failed — both cases fall
-- back to the pre-existing dashboard view rather than erroring.
alter table public.analyses
  add column if not exists pdf_path text;

-- Private bucket. `public => false` is the whole security model here; the
-- policies below only decide who may mint a signed URL for an object.
insert into storage.buckets (id, name, public)
values ('papers', 'papers', false)
on conflict (id) do nothing;

-- Object keys are `{user_id}/{uuid}.pdf`, so the first path segment IS the owner.
-- storage.foldername() splits the key on "/", and Postgres arrays are 1-indexed,
-- so [1] is that leading user-id folder.
drop policy if exists "read own papers" on storage.objects;
create policy "read own papers"
  on storage.objects for select
  using (
    bucket_id = 'papers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "upload own papers" on storage.objects;
create policy "upload own papers"
  on storage.objects for insert
  with check (
    bucket_id = 'papers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own papers" on storage.objects;
create policy "delete own papers"
  on storage.objects for delete
  using (
    bucket_id = 'papers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
