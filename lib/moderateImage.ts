/**
 * Profile picture content moderation.
 *
 * Reads the cropped image as base64, sends it to a Supabase edge function
 * which calls the Sightengine API (nudity + offensive content detection).
 *
 * Uses a direct fetch rather than supabase.functions.invoke so the call
 * succeeds regardless of auth state — the edge function is public and only
 * needs the project's anon key, not a user JWT.
 *
 * Behaviour on failure:
 *   - Edge function unreachable (not deployed, network error) → FAIL OPEN (allow upload)
 *     Don't block users because of an infrastructure issue.
 *   - Edge function ran and returned safe:false → FAIL CLOSED (block upload)
 *     The moderation service actively flagged the image.
 *
 * Manual setup (one-time, in Supabase):
 *   1. Sign up at sightengine.com (free tier: 500 checks/month)
 *   2. supabase functions deploy moderate-image
 *   3. supabase secrets set SIGHTENGINE_USER=xxx SIGHTENGINE_SECRET=yyy
 */
import * as FileSystem from 'expo-file-system/legacy';
import { supabaseUrl, supabaseAnonKey } from './supabase';

export interface ModerationResult {
  safe: boolean;
  reason?: string; // 'nudity' | 'offensive content' — surfaced in Alert to user
}

export async function moderateImage(localUri: string): Promise<ModerationResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    const resp = await fetch(`${supabaseUrl}/functions/v1/moderate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ image: base64 }),
    });

    if (!resp.ok) {
      console.warn('[moderateImage] edge function returned', resp.status, '— allowing upload');
      return { safe: true };
    }

    const data = await resp.json();

    if (!data || typeof data.safe !== 'boolean') {
      console.warn('[moderateImage] unexpected response shape — allowing upload:', JSON.stringify(data));
      return { safe: true };
    }

    return { safe: data.safe, reason: data.reason };
  } catch (e) {
    console.warn('[moderateImage] fetch error — allowing upload:', e);
    return { safe: true };
  }
}
