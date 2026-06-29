import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

// Required on Android so the browser tab closes after OAuth
WebBrowser.maybeCompleteAuthSession();

// SecureStore has a 2 KB per-item limit but Supabase JWTs can exceed that.
// This adapter chunks large values across multiple SecureStore keys.
const CHUNK_SIZE = 1800; // chars — safely under the 2 KB byte limit

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const chunks: string[] = [];
    for (let i = 0; ; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}.${i}`);
      if (chunk === null) break;
      chunks.push(chunk);
    }
    return chunks.length > 0 ? chunks.join('') : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)));
    // Delete any leftover chunks from a previously longer value
    for (let i = chunks.length; ; i++) {
      const stale = await SecureStore.getItemAsync(`${key}.${i}`);
      if (stale === null) break;
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
  },

  async removeItem(key: string): Promise<void> {
    for (let i = 0; ; i++) {
      const existing = await SecureStore.getItemAsync(`${key}.${i}`);
      if (existing === null) break;
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
  },
};

export const supabaseUrl = 'https://gqaqonskzeaasjihvipp.supabase.co';
export const supabaseAnonKey = 'sb_publishable_fXfzsiYL9fMp8fh3o4WQjg_B57HhS7y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Using implicit flow: PKCE causes "invalid flow state" on React Native because
    // the code verifier stored by signInWithOAuth isn't reliably found by
    // exchangeCodeForSession across the browser session boundary.
    // Implicit flow returns tokens directly in the callback URL hash.
    flowType: 'implicit',
  },
});

// Google is active. Apple is wired (requires Apple Developer Services ID in Supabase).
export async function performOAuthSignIn(provider: 'google' | 'apple') {
  // Use the registered app scheme directly. Linking.createURL generates a
  // dynamic exp://IP:PORT/-- URL in Expo Go whose host:port portion isn't
  // matched by Supabase's exp://** wildcard, causing it to fall back to the
  // Site URL (localhost). A fixed scheme-based URL is intercepted by
  // ASWebAuthenticationSession before the OS ever tries to open it as a
  // deep link, so this works in Expo Go and production builds alike.
  const redirectTo = 'findafourth://auth/callback';

  const scopeMap: Record<typeof provider, string> = {
    google: 'email profile',
    apple:  'name email',
  };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,  // we open the browser ourselves via openAuthSessionAsync
      scopes: scopeMap[provider],
    },
  });

  if (error || !data?.url) {
    return { user: null, error: error ?? new Error('No OAuth URL returned') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    return { user: null, error: new Error('Sign-in was cancelled or failed') };
  }

  // Implicit flow: callback URL contains #access_token=...&refresh_token=...
  const raw = result.url.includes('#')
    ? result.url.split('#')[1]
    : result.url.split('?')[1] ?? '';
  const params = new URLSearchParams(raw);
  const access_token  = params.get('access_token');
  const refresh_token = params.get('refresh_token') ?? '';

  if (!access_token) {
    return { user: null, error: new Error('No access token in callback URL') };
  }

  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) return { user: null, error: sessionError };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  return { user: userData?.user ?? null, error: userError ?? null };
}
