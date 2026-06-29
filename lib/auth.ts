import type { User } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

/** Decodes a base64 string to a Uint8Array (no external dependency). */
function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let len = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') { len--; if (base64[base64.length - 2] === '=') len--; }

  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)];
    const e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)];
    const e4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (base64.charCodeAt(i + 2) !== 61) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (base64.charCodeAt(i + 3) !== 61) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

/**
 * Uploads a locally-picked image to the public `avatars` Storage bucket and
 * returns its public URL. Local `file://` picker paths only resolve on the
 * device that picked them, so they must be uploaded for other users to see
 * the avatar. Remote `http(s)` URLs (e.g. Google/Apple OAuth) are returned
 * unchanged. Returns null on failure so callers can fall back to the local URI.
 *
 * One-time Supabase setup: create a PUBLIC bucket named `avatars`.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string | null> {
  if (/^https?:\/\//.test(localUri)) return localUri; // already a remote URL
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
    const bytes = base64ToUint8Array(base64);
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) { console.warn('[uploadAvatar] upload failed:', error.message); return null; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a replaced avatar at the same path refreshes on other devices
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    console.warn('[uploadAvatar] error:', e);
    return null;
  }
}

export type SocialProfileData = {
  firstName: string;
  lastName:  string;
  email:     string;
  avatarUrl: string | null;
  provider:  'google' | 'apple';
};

/**
 * Maps Supabase OAuth user metadata to the fields profile-setup needs.
 * Handles both Google and Apple metadata shapes.
 */
export function extractProfileFromOAuth(user: User): SocialProfileData {
  const meta = user.user_metadata ?? {};

  // Google: full_name, avatar_url, email
  // Apple:  name, picture, email
  const fullName: string = (meta.full_name ?? meta.name ?? '').trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName  = parts.slice(1).join(' ');

  return {
    firstName,
    lastName,
    email:    user.email ?? meta.email ?? '',
    avatarUrl: meta.avatar_url ?? meta.picture ?? null,
    provider: (user.app_metadata?.provider ?? 'google') as 'google' | 'apple',
  };
}

type ProfileRow = {
  first_name?:     string;
  last_name?:      string;
  gender?:         string;
  city?:           string;
  avatar_url?:     string;
  phone?:          string;
  handicap?:       string;
  tees?:           string;
  pace?:           string;
  cart?:           string;
  partners?:       string;
  music?:          string;
  home_course?:    string;
  avail_schedule?: object[];
  provider?:       string;
  setup_complete?: boolean;
};

/** Upserts profile data to the Supabase `profiles` table. */
export async function saveProfileToSupabase(userId: string, data: ProfileRow) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...data }, { onConflict: 'id' });
  return { error };
}

/** Returns profiles in the same city (excluding the signed-in user) for friend discovery. */
export async function fetchNearbyProfiles(city: string, excludeId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, home_course')
    .eq('city', city)
    .neq('id', excludeId)
    .eq('setup_complete', true)
    .limit(5);
  return data ?? [];
}

export type RealProfile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  home_course?: string | null;
  handicap?: string | null;
  city?: string | null;
};

/** Returns all setup_complete profiles (excluding the current user) for beta discovery. */
export async function fetchAllProfiles(excludeId: string, excludePhone?: string): Promise<RealProfile[]> {
  // Fetch all profiles, then exclude the caller client-side.
  // We can't rely solely on .neq('id', excludeId) because the profile row may
  // have been saved under a different UUID than the current auth session (e.g.
  // the user re-authenticated and got a new UUID). Phone is used as a fallback
  // identifier when the UUID doesn't match any profile row.
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, home_course, handicap, city, phone')
    .eq('setup_complete', true)
    .limit(20);

  const myPhone = (excludePhone ?? '').replace(/\D/g, '');

  return (data ?? [])
    .filter((p: any) => {
      // Primary exclusion: UUID match
      if (p.id === excludeId) return false;
      // Secondary exclusion: phone match (handles profile saved under a different UUID)
      if (myPhone && (p.phone ?? '').replace(/\D/g, '') === myPhone) return false;
      return true;
    })
    .map((p: any): RealProfile => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      // Strip device-local URIs (file://, ph://) — only valid on the original device.
      avatar_url: (p.avatar_url ?? '').startsWith('https://') ? p.avatar_url : null,
      home_course: p.home_course,
      handicap: p.handicap,
      city: p.city,
    }));
}

export async function sendFriendRequestToSupabase(senderId: string, receiverId: string) {
  // Upsert (not insert) on the (sender_id, receiver_id) unique constraint so that
  // re-requesting after a previous cancel/reject re-arms the row to 'pending'
  // instead of failing forever with a duplicate-key error (23505) and leaving the
  // receiver unable to ever see the request.
  const row = { sender_id: senderId, receiver_id: receiverId, status: 'pending' };
  const { error } = await supabase
    .from('friend_requests')
    .upsert(row, { onConflict: 'sender_id,receiver_id' });

  // No unique constraint on (sender_id, receiver_id) → upsert can't resolve a
  // conflict target (42P10). Fall back to a plain insert so sending still works.
  if ((error as any)?.code === '42P10') {
    const { error: insErr } = await supabase.from('friend_requests').insert(row);
    if (insErr?.code === '23505') return { error: null };
    if (insErr) console.warn('[sendFriendRequestToSupabase] insert fallback error:', insErr.message, (insErr as any).code);
    return { error: insErr };
  }
  // A duplicate row already exists — treat as "already requested".
  if (error?.code === '23505') return { error: null };
  if (error) console.warn('[sendFriendRequestToSupabase] error:', error.message, (error as any).code);
  return { error };
}

export async function cancelFriendRequestInSupabase(senderId: string, receiverId: string) {
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .eq('status', 'pending');
  return { error };
}

export async function fetchOutgoingPendingRequests(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('friend_requests')
    .select('receiver_id')
    .eq('sender_id', userId)
    .eq('status', 'pending');
  return (data ?? []).map((r: any) => r.receiver_id as string);
}

export async function fetchIncomingFriendRequests(userId: string): Promise<{
  requestId: string; senderId: string; senderName: string;
  avatarUrl?: string | null; handicap?: string | null;
}[]> {
  const { data: reqs, error } = await supabase
    .from('friend_requests')
    .select('id, sender_id')
    .eq('receiver_id', userId)
    .eq('status', 'pending');
  if (error) console.warn('[fetchIncomingFriendRequests] error:', error.message);
  if (!reqs?.length) return [];
  // Resolve each sender's profile for display (name/avatar/handicap).
  const senderIds = reqs.map((r: any) => r.sender_id as string);
  const profileMap: Record<string, any> = {};
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, handicap')
    .in('id', senderIds);
  (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
  return reqs.map((r: any) => {
    const p = profileMap[r.sender_id] ?? {};
    const fallbackName = [p.first_name, p.last_name].filter(Boolean).join(' ');
    return {
      requestId: r.id as string,
      senderId: r.sender_id as string,
      senderName: fallbackName || 'Golfer',
      avatarUrl: p.avatar_url ?? null,
      handicap: p.handicap ?? null,
    };
  });
}

export async function respondToFriendRequest(requestId: string, status: 'accepted' | 'rejected') {
  // .select() so we can tell whether the UPDATE actually matched a row. If RLS
  // blocks the update (e.g. the "respond" policy is missing) the call returns no
  // error but updates nothing — surface that instead of silently "succeeding".
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status })
    .eq('id', requestId)
    .select();
  if (error) console.warn('[respondToFriendRequest] error:', error.message, (error as any).code);
  else if (!data?.length) console.warn('[respondToFriendRequest] updated 0 rows (RLS or stale id?) requestId=', requestId);
  return { error, updated: data?.length ?? 0 };
}

/**
 * Returns the accepted-friend profiles for `userId` (rows where the user is
 * sender OR receiver and status='accepted'), resolved against the profiles
 * table. Used to rebuild the friends list on app launch so accepted
 * friendships survive restarts (they are otherwise only in memory).
 */
export async function fetchAcceptedFriends(userId: string): Promise<{
  id: string; name: string; avatarUrl?: string | null;
  handicap?: string | null; homeCourse?: string | null;
}[]> {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (error) console.warn('[fetchAcceptedFriends] error:', error.message, (error as any).code);
  if (!rows?.length) return [];
  // The "other party" in each accepted row is the friend.
  const friendIds = Array.from(new Set(
    rows.map((r: any) => (r.sender_id === userId ? r.receiver_id : r.sender_id) as string),
  ));
  if (!friendIds.length) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, handicap, home_course, city')
    .in('id', friendIds);
  const map: Record<string, any> = {};
  (profiles ?? []).forEach((p: any) => { map[p.id] = p; });
  return friendIds.map(fid => {
    const p = map[fid] ?? {};
    return {
      id: fid,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Golfer',
      avatarUrl: (p.avatar_url ?? '').startsWith('https://') ? p.avatar_url : null,
      handicap: p.handicap ?? null,
      homeCourse: p.home_course || p.city || null,
    };
  });
}

/** Sends email OTP. For from-scratch users this also creates a Supabase auth account. */
export async function sendEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error };
}

/** Verifies email OTP token. Returns the session on success. */
export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email, token, type: 'email',
  });
  return { data, error };
}

/** Sends phone OTP via Infobip SMS. */
export async function sendPhoneOtp(phone: string) {
  const { data, error } = await supabase.functions.invoke('send-phone-otp', {
    body: { phone },
  });
  if (error)       return { error: error as Error };
  if (data?.error) return { error: new Error(data.error) };
  return { error: null };
}

/** Verifies phone OTP code against the code stored by sendPhoneOtp. */
export async function verifyPhoneOtp(phone: string, token: string) {
  const { data, error } = await supabase.functions.invoke('verify-phone-otp', {
    body: { phone, pin: token },
  });
  if (error)           return { verified: false, error: error as Error };
  if (!data?.verified) return { verified: false, error: new Error(data?.error ?? 'Invalid code') };
  return { verified: true, error: null };
}

/** Checks whether a signed-in user has already completed profile setup. */
export async function checkSetupComplete(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('setup_complete')
    .eq('id', userId)
    .single();
  return data?.setup_complete === true;
}

/**
 * Distinguishes a definitively-missing/incomplete profile from a failed query.
 * Uses .maybeSingle() so an absent row returns { data: null, error: null } rather
 * than an error — letting us tell "profile deleted server-side" apart from a
 * transient network failure (which must NOT trigger a sign-out / cache wipe).
 *   'complete'   → row exists and setup_complete = true
 *   'incomplete' → row genuinely absent, or exists with setup_complete = false
 *   'unknown'    → query failed (offline / server error) — caller should not act
 */
export async function getProfileStatus(
  userId: string,
): Promise<'complete' | 'incomplete' | 'unknown'> {
  const { data, error } = await supabase
    .from('profiles')
    .select('setup_complete')
    .eq('id', userId)
    .maybeSingle();
  if (error) return 'unknown';
  if (!data) return 'incomplete';
  return data.setup_complete === true ? 'complete' : 'incomplete';
}
