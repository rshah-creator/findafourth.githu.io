import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const { phone } = await req.json();  // E.164 format, e.g. "+923001234567"

  if (!phone) {
    return new Response(JSON.stringify({ error: 'Phone number is required' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Whitelisted test numbers (e.g. US testers we can't SMS without A2P 10DLC
  // brand registration) skip Infobip + the DB entirely. The shared code they
  // enter is checked in verify-phone-otp. Matching is digit-only normalized so
  // formatting/"+" in the TEST_OTP_NUMBERS secret doesn't matter.
  const testNumbers = (Deno.env.get('TEST_OTP_NUMBERS') ?? '')
    .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean);
  const phoneDigits = String(phone).replace(/\D/g, '');
  if (testNumbers.includes(phoneDigits)) {
    return new Response(JSON.stringify({ error: null }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Flood protection: reject if a code was sent within the last 60 seconds
  const { data: existing } = await supabase
    .from('phone_otps')
    .select('created_at')
    .eq('phone', phone)
    .single();

  if (existing?.created_at) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < 60_000) {
      const waitSec = Math.ceil((60_000 - ageMs) / 1000);
      return new Response(JSON.stringify({ error: `Please wait ${waitSec}s before requesting another code` }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  }

  // Generate a 4-digit code and set a 5-minute expiry
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: dbErr } = await supabase
    .from('phone_otps')
    .upsert({ phone, code, expires_at: expiresAt, attempts: 0 }, { onConflict: 'phone' });

  if (dbErr) {
    console.error('[send-phone-otp] DB error:', dbErr.message);
    return new Response(JSON.stringify({ error: 'Failed to create OTP' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Send the SMS via Infobip
  const baseUrl = Deno.env.get('INFOBIP_BASE_URL')!;
  const apiKey  = Deno.env.get('INFOBIP_API_KEY')!;

  const resp = await fetch(`https://${baseUrl}/sms/3/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `App ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        sender: 'FindAFourth',
        destinations: [{ to: phone }],
        content: { text: `Your Find a Fourth verification code is ${code}. The code will be valid for 5 minutes.` },
      }],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody?.requestError?.serviceException?.text ?? 'Failed to send SMS';
    console.error('[send-phone-otp] Infobip error:', msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: null }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
