# Cart2Door Storefront

This Next.js app contains the Cart2Door storefront and admin dashboard.

## Deploy on Vercel

1. Import this frontend project into Vercel. If the repository contains both apps, set **Root Directory** to `frontend`.
2. Production API requests use the same-origin `/api` proxy configured in `next.config.mjs`; `NEXT_PUBLIC_API_URL` is only needed for local development.
3. Deploy with the detected Next.js framework and `npm run build`.
4. The backend can run as a second Vercel project using `backend` as its Root Directory and `backend/vercel.json` for routing and scheduled checks. Set `FRONTEND_URL` to the deployed storefront origin and configure MongoDB Atlas, JWT, Cloudinary, admin, and Meta environment variables in that project. Review the repository deployment notes for serverless upload and scheduler limitations; use a persistent Node.js host when large video uploads or FFmpeg reel generation are required.

Do not expose backend credentials through `NEXT_PUBLIC_*` variables. Product and social media files are stored in Cloudinary.
