# Ledger — Budget Tracker

A personal budget tracker: unlimited accounts, expense/income/transfer logging with tags,
custom categories, live daily/weekly/monthly budgets, and a dashboard with net worth trends.
Data is stored in Supabase (Postgres) behind row-level security, so only you can ever see it.
It's also a PWA, so it installs on your phone like a normal app.

You'll do three short one-time steps: create a free Supabase project, deploy to Vercel,
and add the app to your phone's home screen. Total time: about 15 minutes.

## 1. Create your Supabase project (free)

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**.
2. Pick any name/region and a database password (save it somewhere safe — you won't need it
   day-to-day, only if you ever connect a raw Postgres client).
3. Once the project is ready, open **SQL Editor** in the left sidebar → **New query**.
4. Paste the entire contents of `supabase/schema.sql` (included in this project) and click **Run**.
   This creates your `accounts`, `categories`, `transactions`, and `budgets` tables, and turns on
   row-level security so every row is only visible to the user who created it.
5. Open **Project settings → API**. Copy two values — you'll need them next:
   - **Project URL**
   - **anon public** key

By default Supabase requires email confirmation for new sign-ups. For a single-user personal
app you can turn this off to skip the confirmation email: **Authentication → Providers → Email
→ toggle off "Confirm email"**. You can leave it on if you'd rather confirm via email once.

## 2. Run it locally (optional, but good to verify first)

```bash
cp .env.example .env
# edit .env and paste in your Project URL and anon key
npm install
npm run dev
```

Open the printed `localhost` URL, sign up with your email/password, and confirm you can create
an account, log a transaction, and see it on the dashboard.

## 3. Deploy to Vercel (free)

1. Push this project to a GitHub repository (create a new empty repo, then):
   ```bash
   git init
   git add .
   git commit -m "Budget tracker"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** →
   import the repo you just pushed.
3. Vercel auto-detects Vite. Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon key
4. Click **Deploy**. You'll get a URL like `https://your-app.vercel.app` — that's your live app.

## 4. Put it on your phone

- **iPhone (Safari):** open the Vercel URL → tap the Share icon → **Add to Home Screen**.
- **Android (Chrome):** open the URL → tap the ⋮ menu → **Install app** (or **Add to Home
  screen**).

It'll open full-screen with its own icon, no browser bar — just like a regular app. Because it
talks to Supabase over the internet, you'll want a connection to save new entries, but the app
shell itself is cached for fast loading.

## Updating an existing install

If you already deployed this app and are now adding the calculator / icons / search /
theme / budget-assignment / savings features, you only need to do two things:

1. In Supabase → **SQL Editor** → new query → paste the contents of
   `supabase/migration_002_features.sql` → **Run**. This only adds new columns and a new
   table — it does not touch or delete any of your existing accounts, transactions, or
   budgets.
2. Push the updated code to your GitHub repo (`git add . && git commit -m "Add new
   features" && git push`). Vercel redeploys automatically within about a minute.

Your login, accounts, and transaction history stay exactly as they were.

## Notes for daily use

- Every entry you log gets its date and time stamped automatically.
- Deleting an account or category doesn't delete its past transactions — they just lose that
  reference, so your history stays intact.
- Since this uses email/password auth, anyone with your email and password can sign in — treat
  it like any other account and use a real password.
- The anon key is safe to expose in a front-end app; Supabase's row-level security (not the key)
  is what actually keeps your data private per-user.

## Project structure

```
src/
  supabaseClient.js   Supabase connection (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  Auth.jsx            Sign in / sign up screen
  App.jsx             Session gate — shows Auth or the tracker
  BudgetTracker.jsx   The whole app: dashboard, transactions, accounts, categories, budgets
supabase/schema.sql   Run once in the Supabase SQL editor
```
