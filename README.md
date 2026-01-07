# ChatterDocs Portal

Discord-style chat hub with optional embedded Minecraft web play per room. Includes a Node.js backend with REST + WebSocket APIs, SQLite persistence, Google SSO, and an admin panel for configuring rooms and Minecraft endpoints.

## Features
- Dark UI inspired by Discord with halo hover states and responsive layout.
- Chat + WebSocket presence, transcripts download/copy, and profanity/blur toggles.
- Room types: chat-only or Minecraft-enabled with connection metadata rendered inline.
- Google OAuth2 sign-in with secure HttpOnly cookies; logout support.
- Admin panel to create/update/delete rooms and manage Minecraft settings.
- Web-playable Minecraft support via room-level embedded web client URL.
- SQLite storage with easy future migration to Postgres-friendly schema.
- Security defaults: Helmet, rate limits on chat send, input validation basics, SameSite/secure cookies.

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template and configure secrets:
   ```bash
   cp backend/.env.example backend/.env
   # set GOOGLE_CLIENT_ID, SESSION_SECRET, BASE_URL
   ```
3. Run in development (watches backend):
   ```bash
   npm run dev
   ```
4. Production build/start:
   ```bash
   npm run build
   npm start
   ```

The backend serves static assets from `backend/src/public/app` (main portal) and `backend/src/public/admin` (admin UI at `/admin`).

## Cloudflare Tunnel / HTTPS
- Run backend locally on port 3000.
- Expose via Cloudflare Tunnel pointing to `http://localhost:3000` to ensure HTTPS/WSS on 443.
- WebSockets are available at `/ws` and respect the session cookie for auth.

## Database
SQLite database lives in `backend/data/chatterdocs.db` (created automatically). Tables cover users, rooms, memberships, messages, configs. Swap to Postgres by replacing `better-sqlite3` queries with a knex/pg layer while keeping the schema shape.

## Security notes
- Cookies: HttpOnly, SameSite=Lax, Secure in production. Update `BASE_URL` to match deployment origin.
- Rate limits: chat send capped in the WebSocket layer per connection; adjust window and max as needed.
- Input: message length limited, HTML not rendered; images only via links.
- Auth required: `/api/me`, `/api/rooms`, `/api/messages/:roomId`, `/api/export/:roomId` now require a signed-in session; admin UI and room mutations also require `role=admin`.
- Dev auth: set `DEV_AUTH=true` in `backend/.env` for a quick local-only login button. This is disabled in production.

## Manual test checklist
- `npm install` (ensure registry access from your network).
- `npm run dev`, visit `http://localhost:3000`.
- Sign in with Google; first user becomes admin automatically.
- Confirm rooms load and chat works; for a `minecraft` room the right panel shows the configured host/port.
- Download and copy transcript buttons work.
- Admin: visit `/admin`, create/update/delete rooms, and verify updates reflect in the portal list.

## Admin guidance for Minecraft
- Set room type to `minecraft` and provide host/port/version/resource pack info.
- Add a web client URL (hosted Minecraft web client) to enable in-room play.
- Use admin panel to document server definitions (host/port) and surface them in the room view for quick connect.
- For modded servers, add notes in the resource pack/modpack field; restart/stop controls can be wired to the REST layer following the provided room schema.
