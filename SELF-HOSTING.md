# Self-hosting Pulse

Pulse is a **local-first, single-user** personal life-OS (money + tasks + learning + notes, voice/NL capture, weekly digests). Because it's local-first and runs entirely on your own free-tier cloud, the right way to use it is to **deploy your own copy** — your data, your API keys, your quota, fully isolated from anyone else's. This guide takes you from a clone to a live instance in about 20 minutes.

## What you need (all have free tiers)

- A **Cloudflare** account — Workers + D1 (database) + R2 (file storage). The free plan is enough.
- A **Groq** API key ([console.groq.com](https://console.groq.com)) — powers the AI parsing/agents (free daily quota).
- A **Resend** account ([resend.com](https://resend.com)) — sends your sign-in email (free tier).
- **Node 22** + **pnpm**, and the Wrangler CLI: `npm i -g wrangler` then `wrangler login`.

## 1. Get the code

```bash
git clone https://github.com/sheikahamed17/pulse.git
cd pulse
pnpm install
```

## 2. Create your Cloudflare resources

```bash
wrangler login
wrangler d1 create pulse                    # note the printed database_id
wrangler r2 bucket create pulse-receipts
```

In `wrangler.toml`, replace the `database_id` under `[[d1_databases]]` with **your** new D1 id. (Enable R2 in the Cloudflare dashboard once if prompted.)

## 3. Apply the database migrations

Run every file in `migrations/` (0001 → 0014) against your remote D1, in order:

```bash
wrangler d1 execute pulse --remote --file=migrations/0001_initial.sql
wrangler d1 execute pulse --remote --file=migrations/0002_phase_1_money.sql
# …continue through every file up to 0014_user_prefs_sms_token.sql
```

> If `--file` returns a `401` with an OAuth login, apply each as `--command "<paste the file's SQL>"` instead — a known Wrangler quirk with OAuth tokens.

## 4. Generate your Web-Push (VAPID) keys

```bash
node scripts/generate-vapid-keys.mjs
```

This prints a **public** and a **private** key. Both are set as secrets in step 5 — you don't edit `wrangler.toml` for these (keeping the file identical across forks so it never conflicts on sync). If you set up auto-deploy (see Notes), also add the public key as the GitHub Actions **variable** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## 5. Set your secrets

```bash
wrangler secret put BETTER_AUTH_SECRET   # any random string, 32+ chars
wrangler secret put BETTER_AUTH_URL      # your instance URL, e.g. https://pulse.<you>.workers.dev
wrangler secret put GROQ_API_KEY         # from console.groq.com
wrangler secret put RESEND_API_KEY       # from resend.com
wrangler secret put VAPID_PUBLIC_KEY     # public key from step 4
wrangler secret put VAPID_PRIVATE_KEY    # private key from step 4
wrangler secret put CRON_SECRET          # any random string
```

Leave `EMAIL_FROM = "Pulse <onboarding@resend.dev>"` in `wrangler.toml` as-is (see step 7).

## 6. Build & deploy

```bash
pnpm cf:build
wrangler deploy
```

Wrangler prints your live URL (e.g. `https://pulse.<you>.workers.dev`). If you hadn't set `BETTER_AUTH_URL` to it yet, set it now (step 5) and `wrangler deploy` again.

## 7. Sign in

> **⚠ Use your Resend-account email.** On Resend's free tier without a verified domain, the sandbox sender `onboarding@resend.dev` **only delivers to the email you signed up to Resend with**. So enter *that* email on the login page — the magic link arrives there. That's all a personal single-user instance needs; **no domain required.**
>
> (To let *other people* sign in to one shared instance, verify a domain in Resend and change `EMAIL_FROM` to `you@yourdomain.com`. For most people, a separate self-hosted copy each is simpler.)

After signing in, add a **passkey** (Settings → Security) for Face ID / one-tap sign-in on your phone. Then "Add to Home Screen" to install it as a PWA.

## Notes

- **Free-tier reality:** Groq's free *daily* quota is modest but fine for one person; Cloudflare Workers/D1/R2 free tiers are plenty for personal use. This is exactly why one instance *per person* beats a shared one — you each get your own quota.
- **Auto-deploy (optional):** to redeploy on every `git push`, add a `CLOUDFLARE_API_TOKEN` GitHub Actions **secret** (with Workers **and** D1 edit scopes) and a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` Actions **variable** — the bundled `.github/workflows/deploy.yml` does the rest.
- **Transaction auto-import (optional):** Settings → "Auto-import transactions" works on your instance too (Google Apps Script → your endpoint; see the in-app steps).
- **Everything is yours:** your entries live in your browser (Dexie) and sync to *your* D1. Nothing is shared with the upstream repo or its author.
