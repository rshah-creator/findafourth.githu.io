# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Find a Fourth** — a golf matchmaking app. Expo Router + React Native + TypeScript, backed by Supabase. This `find-a-fourth/` directory is the real production app. (Note: `C:\Users\revol\index.html` and the CLAUDE.md at `C:\Users\revol\` describe a *separate*, older single-file HTML prototype of the same product — they are not this codebase.)

## Commands

```bash
npm start            # expo start (press i / a / w, or scan QR with Expo Go)
npm run ios          # expo start --ios
npm run android      # expo start --android
npx tsc --noEmit     # typecheck — there is NO test framework / jest in this repo
```

There are **no unit tests**. Verification is typecheck + running the app. Note that `npx tsc` currently reports a handful of **pre-existing** errors (in `index.tsx`, `onboarding.tsx`, `profile-setup.tsx`); Metro bundles via Babel without typechecking, so these don't block the app. When you typecheck, filter to the files you touched rather than expecting a clean global pass.

### Shipping changes (critical workflow)

JS/TS changes reach devices via **EAS Update (OTA)**, not rebuilds. The user's own phone runs the **preview** channel; beta testers run **production**. Always publish to **both**:

```powershell
.\publish-update.ps1 "Your update message"   # exports + publishes to preview AND production
```

This PowerShell script sets `EXPO_PUBLIC_APP_VARIANT` correctly per channel before each `eas update`. Only run native builds (`eas build --profile production` + `eas submit`) when native modules change or for a new TestFlight binary — routine feature work is OTA.

### Supabase (backend)

Edge functions live in `supabase/functions/` (Deno — excluded from `tsconfig`). They are deployed separately and changes do **not** go through OTA:

```bash
supabase functions deploy send-phone-otp
supabase secrets set NAME=value
```

Project ref `gqaqonskzeaasjihvipp`. Idempotent table/RLS setup scripts are checked in at `supabase/*_setup.sql` (e.g. `friend_requests_setup.sql`, `games_setup.sql`) — run these in the SQL Editor to (re)create tables, RLS policies, and realtime publication membership. If a Supabase-backed feature silently returns nothing, missing/incorrect **RLS policies** are the usual cause.

## Architecture

**Navigation** is file-based via `expo-router` (`app/`). `app/_layout.tsx` loads fonts and gates onboarding/auth; `app/(tabs)/` holds the 5 main screens (Profile/Discover/Broadcast/Friends/Messages); `app/chat/[id].tsx`, `onboarding.tsx`, `profile-setup.tsx`, `social-connect.tsx` are full-screen routes. Path alias `@/*` maps to the repo root.

**State is centralized in `context/AppContext.tsx`** — a single large provider that owns nearly all app state *and* most business logic (friend requests, threads, broadcasts, ratings, notifications, profile data). Screens are mostly presentational: they read state and call callbacks from `useApp()`. When adding a feature, expect to wire state + handlers here and consume them in the screen.

**Two pervasive mode flags** (both in AppContext) gate behavior everywhere:
- `profileMode: 'real' | 'mock'` — `'real'` uses Supabase; `'mock'` uses the fixtures in `constants/Data.ts` (`PLAYERS`, `FRIENDS`, `GAMES`, `THREADS`). Most screens branch on this. Mock mode is dev-only.
- `phase: 'free' | 'freePro' | 'pro'` — feature/upsell gating for Pro features.

**Supabase access is wrapped in `lib/`**, never called raw from screens:
- `supabase.ts` — client (AsyncStorage-persisted session)
- `auth.ts` — profiles, friend requests (`sendFriendRequestToSupabase`, `fetchIncomingFriendRequests`, `fetchAcceptedFriends`, …), OAuth/OTP helpers, avatar upload
- `games.ts` — broadcasts (`createGame`, `fetchGamesByCity`, `fetchFriendsGames`, `rowToGame`)
- `chat.ts` — threads/messages + realtime
- `notifications.ts` — expo-notifications (local push)
- `appVariant.ts` — `IS_PRODUCTION` / `IS_DEV_BUILD`, derived from the runtime `Updates.channel` (immune to `EXPO_PUBLIC_*` env-inlining drift). **Gate all dev-only UI on `IS_DEV_BUILD`** so it never leaks to production testers.

**Auth model:** a real account = a Supabase auth session, created by **OAuth (Google/Apple)** *or* **email OTP** (Supabase native, in `profile-setup.tsx`). **Phone OTP is custom** (Infobip via the `send-/verify-phone-otp` edge functions + `phone_otps` table) and is standalone verification — it grants **no** session and creates no account. So "from-scratch" signup must complete email verification to produce a usable account that appears in discovery and can use friend requests.

**Realtime + refetch pattern:** Supabase-backed lists (friend requests, games) subscribe to `postgres_changes` *and* re-fetch on tab focus (`useFocusEffect`), so data still appears if realtime delivery is off. Accepted friendships are rebuilt on load from the `friend_requests` table (status `accepted`, either direction) since the in-memory friends list doesn't persist.

## Conventions & gotchas

- **Avatar URLs must be `https`.** Device-local `file://`/`ph://` picker paths only resolve on the originating device; uploaded/OAuth avatars are remote https. Code strips non-https avatar URLs to `null` and falls back to a name initial. Pass both `uri` and `initials` to `<Avatar>`.
- **Mock data IDs** are short strings (`'yousef'`, `'ali'`, …) mapped to pravatar images via `AVATAR_IDS`; **real** users use Supabase UUIDs. Don't derive display initials from `who` when it may be a UUID.
- The app ships in a **390-wide iOS-style** design system; colors/tokens are in `constants/Colors.ts` (light + dark), consumed via `colors` from `useApp()`.
- Deep-link scheme is `findafourth://`; OAuth redirect is `findafourth://auth/callback`.
- `dist/` and `supabase/.temp/` are build/CLI artifacts — don't edit.
