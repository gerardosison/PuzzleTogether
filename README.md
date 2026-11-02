# PuzzleTogether

A shared jigsaw table, styled like a quiet museum visit. The interface uses off-white and black, square edges, plain typography, exhibit labels, and artwork-led layouts. No decorative gradients, invented engagement metrics, or equal-weight dashboard tiles.

For downloading this feature branch and updating an existing laptop copy, see [UPDATE_GUIDE.md](UPDATE_GUIDE.md).

## Run locally

Requires Node.js 22.12+ (validated with Node 24) and npm.

```sh
npm ci
npm run dev
```

Vite serves the application on port 5173. Solo play needs no environment variables, account, or external image/font service. All artwork and fonts are local. Browser storage retains completed pieces, loose board positions, and current puzzle metadata on the same device. Existing saved completed-piece progress remains compatible.

## What is implemented

- Responsive landing page, searchable/filterable ten-work collection, and contextual create/join forms.
- Solo image selection, validated JPG/PNG/WebP uploads up to 5 MB, aspect-preserving normalization to 1600 pixels, and preview.
- Deterministic complementary jigsaw tabs/blanks with flat borders. Easy: 3×4 / 12 pieces; medium: 6×8 / 48; hard: 10×12 / 120.
- A viewport-fitted puzzle table keeps the board and adaptive piece tray visible together on desktop, tablet, and phone screens.
- Freeform React Konva dragging: unfinished pieces stay wherever you leave them on the board, remain movable, and can return to the tray. Only correctly matched pieces snap, lock, and count toward completion.
- An overlay image reference, touch dragging, keyboard/tap placement controls, elapsed time, and completion view.
- Local solo persistence, resume, restart, and custom photo storage on this device. Storage denial is reported; it does not prevent playing within the tab.
- Real Supabase anonymous auth and room/game API, private room lobby, readiness, host settings, invitation copying, presence, and shared board integration.
- SQL migration with membership RLS, private realtime/storage policies, cryptographic server-generated codes, atomic room capacity, leased piece locks, placement validation, idempotent scoring, game completion, host transfer, and new rounds.
- Authoritative database snapshots and subscribed database updates; transient movement broadcasts are throttled and never determine completion.

**Multiplayer is implemented but has not been tested against a hosted Supabase project in this environment.** Missing public configuration produces a visible setup message and a working link to solo play. The application never creates fake rooms or simulates other players.

## Architecture

```text
src/
  components/        Header, footer, artwork cards, shared Konva PuzzleBoard
  data/artworks.ts   Gallery metadata
  lib/               Geometry, shared types, image validation, Supabase and room API
  pages/             Home, collection, solo, rooms/lobby/game/results, about
public/art/          Local artwork + original generated museum hero
supabase/
  migrations/        Schema, RLS, RPCs, realtime authorization, storage policies
  tests/             Local PostgreSQL security/game-rule tests
 tests/              Playwright browser tests
```

React 19 + TypeScript strict mode + Vite; React Router; Lucide; React Konva/Konva; Supabase JS. Purpose-built CSS keeps the museum layout explicit and avoids adding a UI component framework. State is managed with React hooks; canonical multiplayer state lives in PostgreSQL. A single engine renders both solo and multiplayer. Geometry and server placement use normalized coordinates independent of the viewport.

## Connect Supabase

1. Create a Supabase Cloud project. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**. Add your frontend URL to the project's allowed authentication URLs. Enable CAPTCHA/rate limiting as appropriate before opening public guest registration.
2. Apply the SQL files in `supabase/migrations/` in filename order using Supabase SQL Editor or `supabase db push` in a linked project. For a fresh project, run `202611030001_puzzle_together.sql`, then `202611030002_freeform_piece_movement.sql`. If you already applied the first migration, run **only** the new `002` migration to enable saved loose-piece moves. It relies on the standard Supabase `auth`, `storage`, `realtime`, `extensions` schemas and `supabase_realtime` publication.
3. Copy `.env.example` to `.env.local` and set:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
   ```

   These are public frontend settings. Never use a service-role/secret key in a `VITE_` variable. Do not commit `.env.local`.

4. Restart Vite. In a restricted cloud environment, allow your exact `YOUR_PROJECT.supabase.co` hostname in environment settings; requests use HTTPS and Realtime uses WSS.
5. Realtime uses private `room:<room UUID>:game` channels. The migration grants Broadcast/Presence access only to active room members, enables publication of the four canonical tables, and creates a private `puzzle-images` storage bucket. Do not disable RLS or make the bucket public.

### How to test real multiplayer

Use two separate browser profiles or a private browser window (not just two tabs sharing one anonymous identity). Create a room in one profile, join its code in the second, mark the guest ready, and start. Drop a piece away from its solution and verify both players see it without awarding progress. Refresh and confirm that loose position returns. Move it again or return it to the tray. Verify both players see the same solved placements and progress; try claiming the same piece; refresh/reconnect; finish the puzzle; compare results; and start another round. Also test a third profile cannot read or modify an unjoined room. Repeat with 48 and 120 pieces. This hosted integration procedure remains **unverified**, including WebSocket reconnection and multiple simultaneous browsers.

### Persistence and lifecycle

Piece locks last 10 seconds and renew every 4 seconds while dragging. Room clients send a heartbeat every 20 seconds. A disappeared host has a 90-second grace period; the earliest eligible recently connected member becomes host when a connected member calls the server heartbeat. Explicit leave transfers immediately. Abandoned room access expires after 24 hours. This release does **not** configure a scheduled deletion job. For production, configure a privileged scheduled task to delete expired rooms (child rows cascade) and clean up associated storage objects through the Storage API. Browser timers are not used to delete records.

## Checks

```sh
npm run lint         # ESLint and hook rules
npm test             # 14 geometry, snap, bounds, and fitted-table checks
npm run test:db      # 81 PostgreSQL game-rule/security assertions
npm run build        # TypeScript check and production bundle
npm run test:e2e     # 19 Chromium flows including real mouse/touch dragging
```

The database tests apply all real migrations in order inside PGlite with pgcrypto and small stubs of Supabase-owned schemas. They test the application SQL, not Supabase Auth, Storage APIs, hosted Realtime authorization, actual parallel transactions, or network behavior. They cover access rejection, direct mutation rejection, readiness, capacity, all difficulty counts, locks/expiry, placement validation, duplicate scoring, completion, snapshots, and host grace/transfer.

Playwright defaults to `/usr/bin/chromium` in this cloud machine. Elsewhere run `npx playwright install chromium` and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your installed browser path (or adjust the config to use Playwright's bundled browser). The test runner starts Vite when no server is running.

## Deploy

Import the repository into Vercel, set the two public Supabase variables, and deploy. `vercel.json` configures the production build and client-side route rewrites. Add the deployed URL to Supabase's auth URL configuration. Changes to `VITE_` values require rebuilding. No Vercel or Supabase deployment has been performed as part of this implementation.

## Known limitations

- Hosted multiplayer, actual multi-client concurrency, 120-piece multiplayer performance, and reconnect behavior need live integration validation.
- Custom photo upload is available in **solo only**. Multiplayer intentionally exposes the curated gallery only. Storage policies and a signed-URL helper exist, but server-side binary image validation and an end-to-end private upload flow are not implemented; do not treat the storage foundation as a finished upload feature.
- Scheduled room/storage cleanup and production operational monitoring are not configured.
- Anonymous identity belongs to the originating browser. Clearing its storage or changing devices does not recover a previous identity. Solo storage is also per browser and may be cleared by the user/browser.
- No piece rotation or moving connected groups. Loose pieces stay inside the board bounds; their rectangular image area fits inside the board, though jigsaw tabs can extend slightly past an edge. The tray uses adaptive pagination. Small touchscreens can use the larger piece-selection controls below the table when fine dragging is difficult.
- The museum hero is an original AI-generated architectural scene inspired by the supplied reference, not a documentary photo of a real museum. Artwork sources and public-domain status are documented in `ASSET_CREDITS.md`; some source reproductions contain small watermarks.

## Troubleshooting

**Rooms are disabled:** check both public variables and restart/rebuild. **Guest sign-in fails:** enable anonymous sign-ins and check project/network settings. **Room does not open:** join the code in the same browser profile first; an expired room needs a new invitation. **Realtime stays disconnected:** apply migration policies/publication, verify the exact project hostname and WSS access, and inspect Supabase Realtime logs. **Saved puzzle missing:** use the same browser/device and permit local storage. **Custom image rejected:** use a genuine JPG/PNG/WebP under 5 MB, at least 240×180 pixels and below 48 megapixels.
