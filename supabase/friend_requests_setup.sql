-- ============================================================================
-- Find a Fourth — friend_requests: complete, idempotent setup & repair script
-- ----------------------------------------------------------------------------
-- Safe to run multiple times. Paste the WHOLE file into the Supabase
-- Dashboard → SQL Editor and run it. It will:
--   1. Create the table (if missing) with the correct columns + unique key
--   2. Enable Row Level Security
--   3. (Re)create the 4 RLS policies the app relies on
--   4. Add the table to the realtime publication (live delivery)
--   5. Print diagnostics so you can confirm everything is in place
--
-- This is the single source of truth for the friend-request backend. If the
-- feature ever misbehaves, run this first.
-- ============================================================================

-- 1 · Table -----------------------------------------------------------------
create table if not exists public.friend_requests (
  id          uuid default gen_random_uuid() primary key,
  sender_id   uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  status      text not null default 'pending'
              check (status in ('pending', 'accepted', 'rejected')),
  created_at  timestamptz default now()
);

-- The app upserts on this pair; the unique constraint is REQUIRED for that to
-- work and to prevent duplicate requests. Add it only if it isn't there yet.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'friend_requests_sender_receiver_key'
      and conrelid = 'public.friend_requests'::regclass
  ) then
    alter table public.friend_requests
      add constraint friend_requests_sender_receiver_key
      unique (sender_id, receiver_id);
  end if;
end $$;

-- 2 · Row Level Security ----------------------------------------------------
alter table public.friend_requests enable row level security;

-- 3 · Policies (drop + recreate so this script is authoritative) -------------
drop policy if exists "fr_insert_own"  on public.friend_requests;
drop policy if exists "fr_select_own"  on public.friend_requests;
drop policy if exists "fr_update_recv" on public.friend_requests;
drop policy if exists "fr_delete_own"  on public.friend_requests;
-- Also drop the older names from the original plan, in case they exist.
drop policy if exists "Insert own"  on public.friend_requests;
drop policy if exists "Read own"    on public.friend_requests;
drop policy if exists "Respond"     on public.friend_requests;
drop policy if exists "Delete own"  on public.friend_requests;

-- Sender may create a request as themselves (covers INSERT and the UPSERT path).
create policy "fr_insert_own" on public.friend_requests
  for insert with check (auth.uid() = sender_id);

-- Both parties may read rows that involve them (THIS is what lets the receiver
-- see incoming requests — if it's missing the receiver silently gets nothing).
create policy "fr_select_own" on public.friend_requests
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Receiver may update status (accept / reject). The upsert path re-arms a row
-- to 'pending'; allow the sender to update their own row too so re-requests work.
create policy "fr_update_recv" on public.friend_requests
  for update using (auth.uid() = receiver_id or auth.uid() = sender_id)
  with check (auth.uid() = receiver_id or auth.uid() = sender_id);

-- Either party may delete (cancel / clean up).
create policy "fr_delete_own" on public.friend_requests
  for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- 4 · Realtime --------------------------------------------------------------
-- Add to the realtime publication so receivers get requests live (without this
-- they still appear, but only when the Friends tab is opened / app restarted).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end $$;

-- 5 · Diagnostics -----------------------------------------------------------
-- Confirm policies exist (expect 4 rows: insert/select/update/delete):
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'friend_requests'
order by cmd;

-- Confirm realtime is on (expect 1 row):
select tablename from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public' and tablename = 'friend_requests';

-- See current requests (newest first). Useful for confirming a send landed:
select fr.id, fr.status, fr.created_at,
       s.first_name as sender_first, r.first_name as receiver_first
from public.friend_requests fr
left join public.profiles s on s.id = fr.sender_id
left join public.profiles r on r.id = fr.receiver_id
order by fr.created_at desc
limit 50;
