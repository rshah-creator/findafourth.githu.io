import * as Updates from 'expo-updates';

/**
 * Whether this is the PRODUCTION build (App Store / TestFlight production
 * channel) — used to strip all dev controls for beta testers.
 *
 * Primary signal is `Updates.channel`, which is baked into the native binary at
 * build time from the eas.json build profile's `channel` field. Unlike
 * `process.env.EXPO_PUBLIC_APP_VARIANT` (inlined by Metro at *export* time, and
 * therefore prone to drifting between the binary and OTA bundles or failing to
 * inline during `eas update`), the channel reflects the actual binary the user
 * installed and never changes via OTA.
 *
 *   - production build  → channel === 'production'      → IS_PRODUCTION = true  (dev controls hidden)
 *   - preview build     → channel === 'preview'         → IS_PRODUCTION = false (dev controls shown)
 *   - Expo Go / dev     → channel === null/undefined    → IS_PRODUCTION = false (dev controls shown)
 *
 * The env var is kept as a secondary signal: we treat the build as production
 * if EITHER says production, so dev controls can never leak to a production user.
 */
function resolveChannel(): string | null {
  try {
    return (Updates as any).channel ?? null;
  } catch {
    return null;
  }
}

export const IS_PRODUCTION =
  resolveChannel() === 'production' ||
  process.env.EXPO_PUBLIC_APP_VARIANT === 'production';

/** Convenience inverse — true when dev controls/tools should be available. */
export const IS_DEV_BUILD = !IS_PRODUCTION;
