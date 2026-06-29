# STATUS — Pending Manual Steps

_Last updated: 2026-06-29_

All app code changes below are **already published OTA to both `preview` and `production`** channels (via `publish-update.ps1`). The items here are the **backend / manual steps that only you can do** — they live in the Supabase dashboard or CLI, not in the app bundle, so they don't ship via OTA.

---

## 1 · Friend requests — run the RLS/realtime SQL  ⬜

Friend requests (send / receive / accept) depend on the `friend_requests` table having the correct RLS policies and realtime publication. The receiver silently sees nothing if the SELECT policy is missing.

**Do:** Supabase Dashboard → SQL Editor → paste the entire contents of [`supabase/friend_requests_setup.sql`](supabase/friend_requests_setup.sql) → Run. It's idempotent (safe to re-run) and prints diagnostics (4 policies, 1 realtime row, recent requests).

---

## 2 · Broadcasts — run the games SQL  ⬜

Discover shows nothing (incl. friends' broadcasts) if the `games` table lacks the "read all games" SELECT policy.

**Do:** Supabase Dashboard → SQL Editor → paste the entire contents of [`supabase/games_setup.sql`](supabase/games_setup.sql) → Run. Idempotent; prints policies + your last 50 broadcasts (check the `city` column — discovery is city-scoped for non-friends).

---

## 3 · Whitelist US tester phone numbers for OTP  ⬜

Infobip can't SMS US numbers without A2P 10DLC brand registration. The two edge functions now support a server-side whitelist (code committed, **not yet deployed**).

**Do (Supabase CLI):**
```bash
# Set the two secrets (your real US tester numbers + a shared 4-digit code)
supabase secrets set TEST_OTP_NUMBERS="+15551234567,+15559876543"
supabase secrets set TEST_OTP_CODE="0000"

# Deploy BOTH functions so the new whitelist code goes live
supabase functions deploy send-phone-otp
supabase functions deploy verify-phone-otp
```
- Setting secrets alone does nothing until the functions are redeployed with the new code.
- Later, add/remove testers by re-running the `TEST_OTP_NUMBERS` secret (full comma-separated list) — **no redeploy needed**.
- Testers must pick 🇺🇸 +1 in the country picker (defaults to Pakistan).
- Email OTP still required for from-scratch signup (it creates the account); phone whitelist only unblocks the phone step.

### If `supabase login` keeps failing ("Access token not provided")
Use a Personal Access Token instead of `login` (Windows keychain write often fails silently):
1. Create a token at https://supabase.com/dashboard/account/tokens (starts with `sbp_`).
2. In the same PowerShell window: `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."`
3. Run the commands above (optionally add `--project-ref gqaqonskzeaasjihvipp`).

Alternative (no CLI): set the secrets under Project Settings → Edge Functions → Secrets, and paste the updated function code into the in-browser editor under Edge Functions → Deploy.

---

## 4 · Verify dev controls are hidden for beta testers  ⬜

Dev controls are now gated on the runtime update channel (`lib/appVariant.ts` → `IS_DEV_BUILD`), so a production build hides them regardless of OTA env drift.

**Do:** have one beta tester force-close + reopen the app twice (to pull the latest production OTA), then check Settings.
- Dev controls gone → ✅ done.
- Still showing → that tester is on a **preview**-profile build, not production. Fix only by building + submitting a production binary:
  ```bash
  npx eas build --platform ios --profile production
  npx eas submit --platform ios --latest
  ```
  (Build history indicates they're on production build #2, so this is unlikely — but this is the check.)

---

## Notes (no action required)

- **iOS bundle id `com.razaushah.findafourth` is locked** — it's live in App Store Connect / TestFlight (App ID 6777946576). Do not change it. The Android/iOS identifier mismatch is cosmetic and harmless.
- **`app.json` native config** (deduped Android permissions this session) only takes effect on the next native build — not via OTA. No action unless/until you rebuild.
- **Avatars must be public https URLs** to show cross-device. If a tester's photo doesn't appear, their avatar was likely saved as a device-local path; they re-set their profile photo to upload it.

---

## Routine: shipping JS/TS changes

```powershell
.\publish-update.ps1 "message"   # exports + publishes to BOTH preview and production
```
Use native `eas build` only for native/`app.json` changes or a new TestFlight binary.
