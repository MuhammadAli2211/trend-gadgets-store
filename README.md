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

The local site runs at `http://localhost:3000`; the API runs at `http://localhost:5000/api`. The storefront uses the configured WhatsApp number (default `92344295070`, corresponding to `03442905070`). Update it from **Admin Dashboard → Settings** if needed.

## Deploy on Vercel

1. Import this repository in Vercel and set **Root Directory** to `frontend`.
2. Keep the detected Next.js framework and set the production environment variable `NEXT_PUBLIC_API_URL` to the public API base URL, including `/api` (for example, `https://api.example.com/api`). Add it for Production and Preview if both environments should work.
3. Deploy. Vercel uses `frontend/vercel.json` and `npm run build`.
4. Import this repository again as a second Vercel project and set **Root Directory** to `backend`. This is a separate Vercel project and deployment from the frontend.
5. In the backend project's environment variables, add the production values from `backend/.env.example`. Set `PORT` only if required (Vercel supplies it for local Node servers; its function entry does not need it). Use a MongoDB Atlas `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, and a separate long random `CRON_SECRET`. Add Cloudinary credentials for product media. Set `META_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI` to the backend's deployed `/api/social-accounts/.../callback` URLs if social publishing is enabled.
6. Deploy the backend. Its URL will look like `https://your-backend.vercel.app`.
7. Set `FRONTEND_URL` in the backend to the live storefront origin (no trailing slash). Set `NEXT_PUBLIC_API_URL` in the frontend to `https://your-backend.vercel.app/api`, then redeploy both projects. The CORS allowlist currently accepts this one frontend origin.
8. Add matching Facebook and Instagram callback URLs in Meta developer settings, then reconnect the accounts from the deployed admin dashboard.

The backend uses Vercel Cron to check schedules daily at 08:00 Pakistan time on the free Hobby plan. Hobby permits only one cron run per day, so social posts scheduled for other times will not publish promptly on this plan. Configure `CRON_SECRET` in the backend project so Vercel sends the matching bearer token to the protected cron route. The 30-second in-process worker runs only on a persistent Node host, not in Vercel Functions.

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

Connect Facebook and Instagram from the admin dashboard. OAuth start routes require an admin bearer token and use one-time state cookies. Production needs HTTPS, matching frontend/backend origins, and exact callback URLs. For Instagram OAuth through a local HTTPS tunnel, set `NEXT_PUBLIC_INSTAGRAM_OAUTH_API_URL` to the same tunnel API origin and restart the frontend.

Instagram's old-post cleanup needs a Facebook Page token granted through a Facebook Login for Business configuration. Configure the required Meta permissions, set `META_LOGIN_CONFIG_ID` to that configuration ID (not the App ID), and reconnect Facebook. Instagram publishing and Insights use the separate Instagram connection; reconnect after enabling its required scopes.

## Main API areas

- `/api/auth`: signup, login, profile
- `/api/products` and `/api/public/products`: product management and storefront catalog
- `/api/orders`: public order creation and admin order management
- `/api/content`, `/api/schedules`: content workflow and scheduled publishing
- `/api/social-accounts`: admin social account management and OAuth callbacks
- `/api/analytics`, `/api/public/tracking`: reporting and storefront event tracking
