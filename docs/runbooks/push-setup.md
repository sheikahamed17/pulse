# Web Push Setup Runbook

This runbook guides the deployment of the Web Push feature for Pulse Phase 3.4.

## VAPID Key Generation

VAPID (Voluntary Application Server Identification) keypair must be generated once and stored securely.

### Generate Keys

```bash
node scripts/generate-vapid-keys.mjs
```

or using web-push CLI (requires npm):

```bash
npx web-push generate-vapid-keys
```

Output will be two lines:
- `VAPID_PUBLIC_KEY="...base64url..."`
- `VAPID_PRIVATE_KEY='{"crv":"P-256",...}'`

**Keep the private key secret.** Copy both for the steps below.

### Provision to Wrangler

Store the private key in Cloudflare's secret store:

```bash
echo 'PRIVATE_KEY_JSON_HERE' | wrangler secret put VAPID_PRIVATE_KEY
```

(Replace `PRIVATE_KEY_JSON_HERE` with the full JSON object from the keygen script — e.g., `{"crv":"P-256","d":"...","ext":true,"key_ops":["sign"],"kty":"EC","x":"...","y":"..."}`)

Verify it's stored:

```bash
wrangler secret list
```

### Store Public Key in wrangler.toml

Add to `wrangler.toml` [vars] section:

```toml
[vars]
VAPID_PUBLIC_KEY = "base64url_public_key_here"
```

(No quotes in the value itself; the TOML quotes are for the key-value pair.)

## GitHub Actions Setup

The public key is also consumed at build time by Next.js to set the `NEXT_PUBLIC_VAPID_PUBLIC_KEY` environment variable.

### Set GitHub Actions Variable

1. Go to repository Settings > Secrets and variables > Actions
2. Click "New repository variable"
3. Name: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
4. Value: (paste the base64url public key from keygen)
5. Click Add variable

The deploy.yml build step automatically reads this and passes it to the Next.js build.

### Verify Build Environment Wiring

The deploy.yml build step includes:

```yaml
      - name: Build for Cloudflare (Next.js + OpenNext)
        env:
          NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${{ vars.NEXT_PUBLIC_VAPID_PUBLIC_KEY }}
        run: pnpm cf:build
```

If the build fails with "NEXT_PUBLIC_VAPID_PUBLIC_KEY not found", verify the GitHub Actions variable is set above.

## Verification

### Local Dev

Test the public key is accessible at build time:

```bash
pnpm dev
```

Navigate to /settings/preferences. Enable notifications by clicking the toggle in Settings→Preferences→Notifications. The browser should prompt for notification permission. If the VAPID key is missing, the subscription attempt will throw an error before the browser prompt appears.

To verify the key is inlined in the client bundle, you can also inspect the build output or check that the subscription succeeds.

### Post-Deploy

Confirm the secret is provisioned before deploy:

```bash
wrangler secret list | grep VAPID_PRIVATE_KEY
```

After deploy, tail logs for successful push notifications:

```bash
wrangler tail --format json | grep sendWakeUpPush
```

Should see 200 responses to push notification payloads.

### First Push Event

Subscribe to notifications from the Pulse app (Settings > Preferences > Notifications toggle).

Confirm a task is created with a future due_at. Wait for the due_at time, or manually test with:

```bash
curl -X POST https://pulse.sdsheikahamed.workers.dev/api/cron/due-tasks \
  -H "Authorization: Bearer $CRON_SECRET"
```

A notification should appear on your device within seconds.

## Troubleshooting

**"VAPID_PRIVATE_KEY missing":** Confirm `wrangler secret list` shows the key.

**"applicationServerKey not found":** Verify `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set in GitHub Actions variables and build env includes it.

**Push fails with 403/404:** The endpoint URL may have expired. Unsubscribe and re-subscribe in Pulse preferences.

**No notification appears:** Check device notification settings; iOS PWA must be installed to home screen; Android requires notification permission.
