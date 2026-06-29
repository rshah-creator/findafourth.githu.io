/**
 * Supabase Edge Function: moderate-image
 *
 * Accepts a base64-encoded JPEG image, runs it through Sightengine's
 * nudity and offensive-content models, and returns { safe, reason }.
 *
 * Environment variables required (set via `supabase secrets set`):
 *   SIGHTENGINE_USER   — your Sightengine API user ID
 *   SIGHTENGINE_SECRET — your Sightengine API secret
 *
 * Free tier: 500 checks/month at sightengine.com
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THRESHOLD = 0.4; // probability above which content is considered unsafe

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image } = await req.json() as { image: string };

    if (!image) {
      return new Response(JSON.stringify({ safe: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Decode base64 → binary blob (Sightengine requires a real file, not a data URI string)
    const binaryStr = atob(image);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const form = new FormData();
    form.append('media', blob, 'image.jpg');
    form.append('models', 'nudity-2.1,offensive-2.0');
    form.append('api_user',   Deno.env.get('SIGHTENGINE_USER')   ?? '');
    form.append('api_secret', Deno.env.get('SIGHTENGINE_SECRET') ?? '');

    const resp = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
    });

    const result = await resp.json();

    // If Sightengine returns an API-level error (bad credentials, etc.), fail open
    if (result.status === 'failure') {
      console.error('[moderate-image] Sightengine API error:', JSON.stringify(result.error));
      return new Response(JSON.stringify({ safe: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // nudity.none is Sightengine's probability that the image has NO nudity.
    // Inverting it gives a broad nudity signal that catches images that score
    // low on individual explicit sub-scores but are clearly not clean.
    const nudityNoneProb  = (result.nudity?.none             ?? 1) as number;
    const nudityScore = Math.max(
      (result.nudity?.sexual_activity ?? 0) as number,
      (result.nudity?.sexual_display  ?? 0) as number,
      (result.nudity?.erotica         ?? 0) as number,
      1 - nudityNoneProb,                               // broad nudity signal
    );
    const offensiveScore = (result.offensive?.prob ?? 0) as number;

    console.log(
      '[moderate-image] scores — nudity:', nudityScore.toFixed(3),
      '(none:', nudityNoneProb.toFixed(3) + ')',
      'offensive:', offensiveScore.toFixed(3),
    );

    const safe = nudityScore < THRESHOLD && offensiveScore < THRESHOLD;
    const reason = safe ? undefined
      : nudityScore >= THRESHOLD ? 'nudity' : 'offensive content';

    return new Response(JSON.stringify({ safe, reason }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // If Sightengine is unreachable, fail open — don't block the user
    console.error('[moderate-image] error:', err);
    return new Response(JSON.stringify({ safe: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
