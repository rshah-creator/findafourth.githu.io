/**
 * Supabase helpers for the `games` table.
 *
 * SQL migration (run once in Supabase SQL editor):
 *
 * create table public.games (
 *   id             uuid default gen_random_uuid() primary key,
 *   broadcaster_id uuid references auth.users(id) on delete cascade not null,
 *   title          text not null,
 *   venue          text not null,
 *   city           text,
 *   when_date      text not null,
 *   when_time      text not null,
 *   hcp_range      text default 'Open',
 *   pace           text default 'Any',
 *   tees           text default 'Any',
 *   cart           text default 'Any',
 *   holes          text default '18 Holes',
 *   format         text default 'Stroke Play',
 *   spots          int  default 3 check (spots between 1 and 3),
 *   boosted        boolean default false,
 *   co_broadcasters         jsonb default '[]',
 *   pending_co_broadcasters jsonb default '[]',
 *   joined_players          jsonb default '[]',
 *   posted_at      timestamptz default now()
 * );
 * alter table public.games enable row level security;
 * create policy "Read all games" on public.games for select using (auth.role() = 'authenticated');
 * create policy "Manage own games" on public.games for all
 *   using (auth.uid() = broadcaster_id) with check (auth.uid() = broadcaster_id);
 *
 * -- If the table already exists, add the new columns:
 * -- alter table public.games add column pending_co_broadcasters jsonb default '[]';
 */
import { supabase } from './supabase';
import type { Game } from '@/types';

export interface CreateGameInput {
  title:           string;
  venue:           string;
  city:            string;
  when_date:       string;
  when_time:       string;
  hcp_range:       string;
  pace:            string;
  tees:            string;
  cart:            string;
  holes:           string;
  format:          string;
  spots:           number;
  boosted:         boolean;
  co_broadcasters: string[]; // IDs of co-broadcasters (empty array if solo)
  pending_co_broadcasters?: string[]; // defaults to co_broadcasters (all start pending)
}

/** Build a chips display array from game fields (used for both local and DB-fetched games). */
export function buildChipsFromGame(g: {
  hcp_range?: string;
  pace?:      string;
  holes?:     string;
  format?:    string;
}): [string, string][] {
  const out: [string, string][] = [];
  if (g.hcp_range && g.hcp_range !== 'Open')        out.push(['brand', g.hcp_range]);
  if (g.pace      && g.pace      !== 'Any')          out.push(['gray',  g.pace]);
  if (g.holes     && g.holes     !== '18 Holes')     out.push(['gray',  g.holes]);
  if (g.format    && g.format    !== 'Stroke Play')  out.push(['gray',  g.format]);
  return out;
}

/** Maps a raw Supabase games row to the app Game type. */
function rowToGame(row: any): Game {
  // crew = broadcaster + co-broadcasters + joined players. Needed so the
  // "Friends only" filter and friend detection can match a game's participants,
  // and so solo-vs-group message routing works.
  const crew = [
    row.broadcaster_id,
    ...(row.co_broadcasters ?? []),
    ...(row.joined_players ?? []),
  ].filter(Boolean);
  return {
    id:            row.id,
    title:         row.title,
    venue:         row.venue,
    city:          row.city,
    when:          `${row.when_date} ${row.when_time}`,
    crew,
    crewNames:     '',
    crewRating:    '—',
    chips:         buildChipsFromGame({
      hcp_range: row.hcp_range,
      pace:      row.pace,
      holes:     row.holes,
      format:    row.format,
    }),
    spots:           row.spots,
    boosted:         row.boosted,
    hcp_range:       row.hcp_range,
    pace:            row.pace,
    tees:            row.tees,
    cart:            row.cart,
    holes:           row.holes,
    format:          row.format,
    broadcaster_id:  row.broadcaster_id,
    co_broadcasters: row.co_broadcasters ?? [],
    pending_co_broadcasters: row.pending_co_broadcasters ?? [],
    joined_players:  row.joined_players ?? [],
  };
}

/** Insert a new game. Returns { game, error }. */
export async function createGame(userId: string, input: CreateGameInput) {
  // Added co-broadcasters all start pending until they confirm
  const row = {
    broadcaster_id: userId,
    ...input,
    pending_co_broadcasters: input.pending_co_broadcasters ?? input.co_broadcasters,
  };
  const { data, error } = await supabase
    .from('games')
    .insert(row)
    .select()
    .single();
  return { game: data ? rowToGame(data) : null, error };
}

/**
 * Fetch open games in a city (posted within 24 h).
 * Excludes the current user's own game (shown separately as "Your Broadcast").
 */
export async function fetchGamesByCity(city: string, excludeUserId?: string) {
  let q = supabase
    .from('games')
    .select('*')
    .eq('city', city)
    .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('boosted', { ascending: false })
    .order('posted_at',  { ascending: false });
  if (excludeUserId) q = q.neq('broadcaster_id', excludeUserId);
  const { data, error } = await q;
  return { games: (data ?? []).map(rowToGame), error };
}

/**
 * Fetch friends' open games regardless of city (posted within 24 h), excluding
 * the current user's own. A friend's broadcast should surface even if they're in
 * a different city than you, so this is merged into Discover alongside the
 * city-scoped list.
 */
export async function fetchFriendsGames(friendIds: string[], excludeUserId?: string) {
  const ids = friendIds.filter(id => id && id !== excludeUserId);
  if (!ids.length) return { games: [] as Game[], error: null };
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .in('broadcaster_id', ids)
    .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('posted_at', { ascending: false });
  return { games: (data ?? []).map(rowToGame), error };
}

/** Fetch the current user's own active game (if they posted one in the last 24 h). */
export async function fetchMyGame(userId: string) {
  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('broadcaster_id', userId)
    .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('posted_at', { ascending: false })
    .limit(1)
    .single();
  return data ? { ...rowToGame(data), crewNames: 'You' } : null;
}

/** Delete a game (only succeeds if the RLS policy passes — i.e. own game). */
export async function cancelGame(gameId: string) {
  const { error } = await supabase.from('games').delete().eq('id', gameId);
  return { error };
}

/** Update mutable fields of an existing game (broadcaster only). */
export async function updateGame(
  gameId: string,
  updates: Partial<Pick<CreateGameInput,
    'hcp_range' | 'pace' | 'tees' | 'cart' | 'holes' | 'format' | 'spots' | 'co_broadcasters' | 'pending_co_broadcasters'
  > & { joined_players: string[] }>,
) {
  const { data, error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', gameId)
    .select()
    .single();
  return { game: data ? rowToGame(data) : null, error };
}
