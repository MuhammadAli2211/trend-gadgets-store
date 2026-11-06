# Cart2Door Cloudflare Cron

This Worker calls the existing protected Vercel schedule endpoint. It does not contain publishing logic and does not change the backend, database, Meta integration, or schedule records.

## Schedule

Cloudflare Cron uses UTC:

- `8,23,38,53 3-13 * * *` = 08:08 through 18:53 Pakistan time, every 15 minutes
- `5 14 * * *` = 19:05 Pakistan time

## Deploy

1. Create or sign in to a Cloudflare account.
2. Install Node.js 20 or newer on the computer used for deployment.
3. Open a terminal in this folder:
   `cd cloudflare-cron`
4. Install Wrangler:
   `npm install --save-dev wrangler`
5. Authenticate:
   `npx wrangler login`
6. Add the same secret value used by the backend's Vercel `CRON_SECRET`:
   `npx wrangler secret put CRON_SECRET`
7. Deploy:
   `npx wrangler deploy`

Do not paste the secret into source files, commit it, or expose it in a URL.

## Verify safely

- In Cloudflare, open Workers & Pages → `cart2door-schedule-cron` → Settings → Triggers and confirm both cron expressions.
- Open the Worker’s Cron Events / Logs and confirm scheduled invocations.
- A successful Worker invocation means the protected API returned a successful HTTP response. Check the response log and Cart2Door admin schedule status to confirm actual publishing.
- Do not manually invoke the production schedule endpoint just to test it: it can publish an overdue post.

Keep the existing GitHub Actions schedule enabled during initial Cloudflare verification. Once Cloudflare has completed several scheduled checks successfully, disable only the GitHub Actions `schedule` trigger to avoid having two independent schedulers. Do not delete the workflow or its manual/push triggers without a separate decision.
