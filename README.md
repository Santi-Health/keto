# Keto Tracker

A personal app to track food, macros, electrolytes, glucose and ketones. It's built as a PWA, so it installs on Android (Pixel Fold) from Chrome.

The full feature spec is in `../keto-tracker-build-prompt.md`. This repo is being built in 8 phases.

| Phase | What | Status |
|---|---|---|
| 1 | Project setup, cloud database + passphrase lock, installable app shell, Settings with calculated targets, 2,000 kcal ceiling + refeed days, GitHub Pages deploy | ✅ Done |
| 2 | Food logging: search, barcode scan, units, My Foods, live Today totals, watch list (sat fat, trans fat, mercury, processed meat…) | Next |
| 3 | JSON import + "copy prompt for Claude chat" (no API), then AI label photos | |
| 4 | Saved meals + recipe builder | |
| 5 | Readings (glucose, ketones, urine), GKI, weight, labs, exercise, fasting timer, water | |
| 6 | Fitbit integration | |
| 7 | Ketosis engine (prediction + personal learning + carb-limit recommendation) | |
| 8 | Trends, export, doctor summary, polish | |

## Run it on your computer

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). Without Supabase set up, the local version skips the lock screen and saves to that browser only. The published site always requires sign-in.

```bash
npm test
```

runs the tests for the calculations (targets, net carbs, GKI).

## One-time setup (≈15 minutes)

### 1. Supabase (cloud database + sign-in, free)

1. Create an account at https://supabase.com and create a new project (any name, pick a region near you, save the database password somewhere safe).
2. In the project, open **SQL Editor → New query**, paste everything from `supabase/migrations/0001_initial_schema.sql`, and click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. For local use: copy `.env.example` to `.env.local` and paste both values.
5. Open **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Nobody can create an account on the public site.
6. Open **Authentication → Users → Add user → Create new user**: enter your email and your **passphrase** (10+ characters; a few random words works well) and tick **Auto Confirm User**. This is the only account.
7. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-github-username>.github.io/keto-tracker/`
   - **Redirect URLs:** add that same URL and `http://localhost:5173/` (used by "Forgot passphrase?" emails)

The published app shows only a lock screen until you sign in with that email and passphrase. Your data is protected by the database rules (row-level security), so even though the code is public, nobody can read it without signing in.

### 2. GitHub (hosting, free)

1. Create a new repository named `keto-tracker` (it can be private if your GitHub plan allows Pages on private repos; otherwise public is fine, because no secrets or data are in the code).
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/<your-username>/keto-tracker.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Settings → Secrets and variables → Actions → Variables** tab: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as above.
5. **Actions** tab: re-run the "Deploy to GitHub Pages" workflow. When it's green, the app is at `https://<your-username>.github.io/keto-tracker/`.

### 3. Install on your Pixel Fold

Open the URL in Chrome → menu (⋮) → **Add to home screen → Install**. Then unlock it with your email and passphrase.

## Where things live

- `src/lib/targets.ts`: calorie, protein, fat targets (Mifflin-St Jeor, activity factor, deficit, Fitbit burn when available)
- `src/lib/nutrition.ts`: net carbs (fiber + sugar alcohol rules), GKI
- `src/lib/profileStore.ts`: profile saved on the device first, synced to Supabase when signed in
- `supabase/migrations/`: database tables for all phases, each locked to your account with row-level security

## Notes

This is a personal tracking tool, not medical advice.
