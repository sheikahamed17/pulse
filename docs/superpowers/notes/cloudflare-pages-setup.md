# Cloudflare Pages — manual setup for Pulse

After GitHub push + CI green, do this in the Cloudflare dashboard.

## 1. Connect the repo

- Go to <https://dash.cloudflare.com/> → Workers & Pages → Create application → Pages → Connect to Git
- Authorize Cloudflare to read your GitHub account (one-time)
- Pick repo: `sheikahamed17/pulse`
- Production branch: `main`

## 2. Build settings

- **Framework preset:** None (we use OpenNext, not the built-in Next.js preset which targets Vercel/Workers built-in adapter)
- **Build command:** `pnpm install --frozen-lockfile && pnpm cf:build`
- **Build output directory:** `.open-next/assets`
- **Root directory:** `/` (project root)
- **Environment variables:** see section 3 below
- **Node version:** `20` (set via `NODE_VERSION=20` env var)

## 3. Environment variables (Production + Preview)

Paste these in the Pages dashboard → Settings → Environment variables → Add (one per variable; mark as **Encrypted** for secrets):

| Key | Value | Encrypted? |
|---|---|---|
| `BETTER_AUTH_SECRET` | (the long hex string from your local `.env.local` — generate one if you don't have it via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | Yes |
| `BETTER_AUTH_URL` | (set this AFTER first deploy; it's the `*.pages.dev` URL Cloudflare assigns. Example: `https://pulse-abc.pages.dev`) | No |
| `GROQ_API_KEY` | (your Groq free-tier key from <https://console.groq.com/keys>) | Yes |
| `NODE_ENV` | `production` | No |
| `NODE_VERSION` | `20` | No |

## 4. D1 binding

- In the Pages project → Settings → Functions → D1 database bindings → Add binding
- **Variable name:** `DB`
- **D1 database:** select the existing `pulse` database (created in T7)

## 5. First deploy

- Click **Save and Deploy**
- First build takes ~5 minutes (downloads pnpm, runs install, OpenNext compile, deploy)
- Watch the build log; if it fails, paste the error back to me

## 6. After first deploy

- Note the assigned URL (e.g. `https://pulse-abc.pages.dev`)
- Set `BETTER_AUTH_URL` to that exact URL in the env vars (you skipped this in step 3)
- Trigger a re-deploy (Settings → Redeploy)

## 7. Apply the D1 migration to production

Local dev has its own D1 SQLite file. The remote D1 database is empty until you apply the migration:

```powershell
cd C:\Users\SDMrSheikAhamed\Documents\Claude\Projects\Pulse
pnpm exec wrangler d1 execute pulse --file=migrations/0001_initial.sql --remote
```

This runs the SQL against the cloud D1 instance. Verify with:

```powershell
pnpm exec wrangler d1 execute pulse --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected output includes: `account`, `devices`, `op_log`, `session`, `user`, `verification`, `widgets`.

## 8. Now T22

Open the deployed URL on your phone, install as PWA, sign in via magic-link (the link will print to the Cloudflare Worker logs — find it via dashboard → Pages → project → Logs OR `wrangler tail` from your terminal). Add a widget. Open the same URL on desktop, sign in. Watch the widget appear within 10 seconds.
