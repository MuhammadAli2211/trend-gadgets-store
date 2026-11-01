# Cart2Door

Cart2Door is a Next.js storefront and admin dashboard backed by an Express API and MongoDB. It supports product and order management, Cloudinary product/content media, Facebook and Instagram publishing, scheduled content, and WhatsApp order links.

## Requirements

- Node.js 20.9 or newer
- MongoDB (Atlas for production)
- Cloudinary account for product and social content media
- Meta developer app and the required Page/Instagram publishing permissions for social features

## Local setup

1. Copy `backend/.env.example` to `backend/.env`. Set `MONGO_URI`, a random `JWT_SECRET` with at least 32 characters, admin credentials, and Cloudinary values. Add Meta values when enabling social publishing.
2. Start the backend:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

3. Copy `frontend/.env.example` to `frontend/.env.local` and start the storefront in another terminal:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

4. Create the first admin account with `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in the backend environment:

   ```powershell
   cd backend
   npm run create-admin
   ```

The local site runs at `http://localhost:3000`; the API runs at `http://localhost:5000/api`. The storefront uses the configured WhatsApp number (default `923442905070`, corresponding to `03442905070`). Update it from **Admin Dashboard → Settings** if needed.

## Deploy on Netlify

The Netlify storefront can use the existing Vercel API deployment. The production `/api/*` rewrite in `frontend/next.config.mjs` points to `https://trend-gadgets-api.vercel.app/api/*`, so the storefront and API can remain on separate hosts:

1. Create or keep the storefront site with **Base directory** set to `frontend`. Netlify builds it with `npm run build`.
2. Keep the existing backend on Vercel and configure the production values from `backend/.env.example` there. Its `FRONTEND_URL` should be the Vercel storefront origin; the Netlify storefront origin is also allowed in the backend CORS configuration.
3. After changing `frontend/next.config.mjs`, redeploy the storefront so `/api/*` requests reach the live Vercel backend.
4. If social publishing is enabled, set the Meta callback URLs to the Vercel backend callbacks in the Meta developer settings, then reconnect the accounts from the live admin dashboard.

The backend does not need a second Netlify deployment for this setup. Netlify's Free plan has a monthly usage cap. Large video uploads and long FFmpeg reel jobs need a persistent server or a direct-to-Cloudinary media flow because serverless functions have request-size and execution-time limits.

## Deploy on Vercel

1. Import this repository in Vercel and set **Root Directory** to `frontend`.
2. Keep the detected Next.js framework. Production requests use the `/api/*` rewrite in `frontend/next.config.mjs` to reach the deployed backend; `NEXT_PUBLIC_API_URL` is only used by local development.
3. Deploy. Vercel uses `frontend/vercel.json` and `npm run build`.
4. Import this repository again as a second Vercel project and set **Root Directory** to `backend`. This is a separate Vercel project and deployment from the frontend.
5. In the backend project's environment variables, add the production values from `backend/.env.example`. Set `PORT` only if required (Vercel supplies it for local Node servers; its function entry does not need it). Use a MongoDB Atlas `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, and a separate long random `CRON_SECRET`. Add Cloudinary credentials for product media. Production Meta callbacks use the API origin in `BACKEND_URL` and one-time OAuth state records in MongoDB, so Meta can return to the API domain registered with the app. Keep `META_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI` for local development only.
6. Deploy the backend. Its URL will look like `https://your-backend.vercel.app`.
7. Set `FRONTEND_URL` in the backend to `https://trend-gadgets-storefront.vercel.app` and `BACKEND_URL` to `https://trend-gadgets-api.vercel.app` (no trailing slash), then redeploy both projects. The Netlify storefront origin is also allowed by the backend CORS configuration.
8. Add the production callback URLs in Meta developer settings: `https://trend-gadgets-api.vercel.app/api/social-accounts/facebook/callback` and `https://trend-gadgets-api.vercel.app/api/social-accounts/instagram/callback`. Add the host `trend-gadgets-api.vercel.app` to App Domains, then reconnect the accounts from the deployed admin dashboard.

The backend uses Vercel Cron to check schedules daily at 08:00 Pakistan time on the free Hobby plan. Hobby permits only one cron run per day, so that cron alone cannot publish hourly schedules. The GitHub Actions workflow at `.github/workflows/process-schedules.yml` checks due schedules every 15 minutes during Pakistan daytime. Add a GitHub Actions repository secret named `CRON_SECRET` with the same value as the backend's Vercel `CRON_SECRET`; the workflow calls the protected backend route and never puts the secret in the URL or source. GitHub scheduled runs may be delayed, so publishing can be a little later than the selected time. The 30-second in-process worker runs only on a persistent Node host, not in Vercel Functions.

Vercel Functions have a 4.5 MB request body limit. This conflicts with the backend's 100 MB video upload limit and makes direct video uploads and FFmpeg reel generation unsuitable for this serverless deployment. Keep storefront, catalog, orders, and image uploads within the platform limits on Vercel; use a persistent Node host for large video uploads and reel generation, or change the media flow to upload directly to Cloudinary before sending metadata to the API. Confirm the selected Vercel plan's function duration and package-size limits before enabling social publishing workloads.

Do not put backend secrets in `NEXT_PUBLIC_*` variables. Keep `.env` files out of source control. Product photos and videos are stored on Cloudinary; MongoDB stores their URLs and product metadata.

## Store and social content

- The cart is stored in the visitor's browser and survives page refreshes on that browser.
- Product cards use the first photo as the cover. Product details show all saved photos and videos.
- Product categories can be typed when adding/editing a product; existing categories appear as suggestions and new categories appear automatically in the storefront filters.
- Product social drafts add category and keyword hashtags and include the order contact number.
- Facebook and Instagram scheduled publishing use the connected Meta accounts. A selected WhatsApp Status schedule is marked **Ready for manual Status share** at its scheduled time, links to the saved media, and has a **Mark as shared** confirmation for the admin. The current WhatsApp Business Platform integration exposes messaging rather than a server-side Status publishing action, so an admin must finish the share in WhatsApp on a phone.
- TikTok scheduled publishing is disabled until an approved TikTok Content Posting API integration and consent flow are configured.

## Social accounts

Connect Facebook and Instagram from the admin dashboard. OAuth start routes require an admin bearer token and store one-time, expiring state records in MongoDB. Production callbacks use the API domain, and both exact callback URLs must be allowed in Meta settings. For Instagram OAuth through a local HTTPS tunnel, set `NEXT_PUBLIC_INSTAGRAM_OAUTH_API_URL` to the same tunnel API origin and restart the frontend.

Instagram's old-post cleanup needs a Facebook Page token granted through a Facebook Login for Business configuration. Configure the required Meta permissions, set `META_LOGIN_CONFIG_ID` to that configuration ID (not the App ID), and reconnect Facebook. Instagram publishing and Insights use the separate Instagram connection; reconnect after enabling its required scopes.

## Main API areas

- `/api/auth`: signup, login, profile
- `/api/products` and `/api/public/products`: product management and storefront catalog
- `/api/orders`: public order creation and admin order management
- `/api/content`, `/api/schedules`: content workflow and scheduled publishing
- `/api/social-accounts`: admin social account management and OAuth callbacks
- `/api/analytics`, `/api/public/tracking`: reporting and storefront event tracking
