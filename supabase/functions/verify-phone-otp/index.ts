import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const { phone, pin } = await req.json();

  if (!phone || !pin) {
    return new Response(JSON.stringify({ verified: false, error: 'Phone and pin are required' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Whitelisted test numbers verify against the shared TEST_OTP_CODE (default
  // '0000'), skipping the phone_otps DB lookup. Matching is digit-only normalized.
  const testNumbers = (Deno.env.get('TEST_OTP_NUMBERS') ?? '')
    .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean);
  const testCode = (Deno.env.get('TEST_OTP_CODE') ?? '0000').trim();
  const phoneDigits = String(phone).replace(/\D/g, '');
  if (testNumbers.includes(phoneDigits)) {
    const ok = String(pin).trim() === testCode;
    return new Response(
      JSON.stringify(ok ? { verified: true, error: null }
                        : { verified: false, error: 'Invalid code — please try again' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error: dbErr } = await supabase
    .from('phone_otps')
    .select('code, expires_at, attempts')
    .eq('phone', phone)
    .single();

  if (dbErr || !data) {
    return new Response(JSON.stringify({ verified: false, error: 'No OTP found — please request a new code' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Brute-force protection: too many failed attempts → invalidate and force a resend
  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    await supabase.from('phone_otps').delete().eq('phone', phone);
    return new Response(JSON.stringify({ verified: false, error: 'Too many attempts — please request a new code' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabase.from('phone_otps').delete().eq('phone', phone);
    return new Response(JSON.stringify({ verified: false, error: 'Code expired — please request a new one' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (data.code !== pin) {
    // Increment attempt counter before returning the error
    await supabase
      .from('phone_otps')
      .update({ attempts: (data.attempts ?? 0) + 1 })
      .eq('phone', phone);

    const remaining = MAX_ATTEMPTS - (data.attempts ?? 0) - 1;
    const hint = remaining > 0 ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} left)` : '';
    return new Response(JSON.stringify({ verified: false, error: `Invalid code — please try again${hint}` }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Verified — delete the row so the code can't be reused
  await supabase.from('phone_otps').delete().eq('phone', phone);

  return new Response(JSON.stringify({ verified: true, error: null }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
