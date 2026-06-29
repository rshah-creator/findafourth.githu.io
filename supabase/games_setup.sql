-- ============================================================================
-- Find a Fourth — games (broadcasts): complete, idempotent setup & repair script
-- ----------------------------------------------------------------------------
-- Paste this WHOLE file into Supabase Dashboard → SQL Editor and run it.
-- Safe to run multiple times. It creates the table if missing, adds any newer
-- columns, enables RLS, (re)creates the read/manage policies, and prints
-- diagnostics. Run this if broadcasts (incl. friends' broadcasts) don't show.
-- ============================================================================

-- 1 · Table -----------------------------------------------------------------
create table if not exists public.games (
  id             uuid default gen_random_uuid() primary key,
  broadcaster_id uuid references auth.users(id) on delete cascade not null,
  title          text not null,
  venue          text not null,
  city           text,
  when_date      text not null,
  when_time      text not null,
  hcp_range      text default 'Open',
  pace           text default 'Any',
  tees           text default 'Any',
  cart           text default 'Any',
  holes          text default '18 Holes',
  format         text default 'Stroke Play',
  spots          int  default 3 check (spots between 1 and 3),
  boosted        boolean default false,
  co_broadcasters         jsonb default '[]',
  pending_co_broadcasters jsonb default '[]',
  joined_players          jsonb default '[]',
  posted_at      timestamptz default now()
);

-- Add columns that may be missing on an older table (all no-ops if present).
alter table public.games add column if not exists co_broadcasters         jsonb default '[]';
alter table public.games add column if not exists pending_co_broadcasters jsonb default '[]';
alter table public.games add column if not exists joined_players          jsonb default '[]';

-- 2 · Row Level Security ----------------------------------------------------
alter table public.games enable row level security;

-- 3 · Policies (drop + recreate so this script is authoritative) -------------
drop policy if exists "Read all games"  on public.games;
drop policy if exists "Manage own games" on public.games;
drop policy if exists "games_read_all"  on public.games;
drop policy if exists "games_manage_own" on public.games;

-- Any signed-in user can read all games (this is what makes OTHER people's /
-- friends' broadcasts visible — without it, Discover fetches nothing).
create policy "games_read_all" on public.games
  for select using (auth.role() = 'authenticated');

-- Users can only insert/update/delete their own games.
create policy "games_manage_own" on public.games
  for all using (auth.uid() = broadcaster_id)
  with check (auth.uid() = broadcaster_id);

-- 4 · Diagnostics -----------------------------------------------------------
-- Expect 2 policy rows (one SELECT, one ALL):
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'games'
order by cmd;

-- See recent broadcasts (newest first). Confirms posts are landing + their city:
select g.id, g.title, g.city, g.when_date, g.when_time, g.posted_at,
       p.first_name as broadcaster_first
from public.games g
left join public.profiles p on p.id = g.broadcaster_id
order by g.posted_at desc
limit 50;
