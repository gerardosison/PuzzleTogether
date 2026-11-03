# Security measures and verification

## Browser configuration

Only the Supabase project base URL and public publishable key (or legacy public `anon` key) belong in `VITE_SUPABASE_*`. The build and dev server reject secret/service-role keys, non-public legacy roles, credentials embedded in a URL, remote HTTP, and API/dashboard paths. Values never appear in configuration error messages. Local HTTP Supabase development endpoints remain supported.

All `.env` and `.env.*` files are ignored by Git except `.env.example`. Public Vite values are embedded in the browser bundle: ignoring a file does not make a frontend key private. Keep database passwords, service-role keys, and other server credentials outside `VITE_` variables and the repository.

## Backend authorization

The SQL migrations enforce authenticated room membership with RLS. Clients cannot directly update rooms, games, scores, or pieces. Functions validate membership and host privileges, serialize critical operations, enforce room capacity and leased locks, validate coordinates, reject stale games, and derive progress from accepted placements. Loose moves never award solved-piece contributions. Realtime and private storage policies require room membership.

`npm run test:db` applies both migrations with 81 assertions inside PostgreSQL-compatible PGlite. It verifies application SQL access and game rules. It does not verify the actual settings, deployed policies, Auth service, Realtime service, or abuse limits of a hosted Supabase project.

## Production headers

`vercel.json` and the local production preview apply:

- Content Security Policy: scripts/fonts from this origin; images from this origin, data/blob URLs, and Supabase; HTTPS/WSS connections to Supabase; no object embeds or framing; same-origin form actions and base URLs.
- `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.
- Strict origin referrer policy and disabled camera, microphone, and location permissions.

Inline style attributes remain allowed because the canvas layout and puzzle previews use them. Inline scripts are not allowed. The development server intentionally retains Vite's HMR behavior and does not apply the production CSP.

For a custom Supabase hostname, add that exact HTTPS/WSS hostname to the CSP in both `security-headers.ts` and `vercel.json`; the default policy permits `*.supabase.co`. When deploying somewhere other than Vercel, configure these headers on that hosting service; the JSON file is Vercel-specific. The production preview verifies the same headers locally.

## Dependency updates

The lint/test tools were upgraded to supported compatible versions. A `minimatch` override selects patched 11.x because transitive lint dependencies still request affected older majors. Lint, build, unit tests, and browser tests were executed after this override. Reassess the override when upstream dependencies adopt a fixed version themselves.

`npm audit` reported **0 known vulnerabilities at the time of this change**. Audit results can change as advisories are published; this is not a guarantee that the application has no security defects. Do not run `npm audit fix --force` without reviewing and testing its breaking changes.

## Before a public launch

Apply the migrations to the intended Supabase project and test with two independent browser profiles plus an unjoined third identity. Verify that an outsider cannot read or modify room data. Configure and monitor Supabase Auth rate limits appropriate to public anonymous registration. CAPTCHA requires a matching client token flow, which is not currently implemented; switching it on alone would prevent anonymous guest sign-in.

Scheduled deletion of expired rooms/storage and private multiplayer photo uploads remain incomplete. Solo uploads are validated and processed locally. Keep shared-room play limited to the curated artwork until server-side upload validation is implemented.
