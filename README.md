# TMA Generator (Next.js + Clerk)

This project uses the Next.js App Router and Clerk for authentication.

## Local development

1. Install dependencies:

```
npm install
```

2. Start the dev server:

```
npm run dev
```

Clerk will run in keyless mode automatically when no environment variables are
present. You can sign in immediately and claim the app later.

## Environment variables

These are the relevant variables for Clerk + admin access:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required for production builds)
- `CLERK_SECRET_KEY` (required for server-side Clerk API calls)

Local usage:
- For quick local dev, you can omit keys and use Clerk keyless mode.
- For production-like local runs, add variables to `.env.local`.

Cloudflare Workers usage:
- Add the Clerk keys in Build configuration (build variables and secrets).
- Add the same keys in Settings > Variables & Secrets for runtime.

## Cloudflare Workers (OpenNext)

This project targets Cloudflare Workers using the `@opennextjs/cloudflare`
adapter (Node.js runtime). OpenNext currently supports Next.js 15.x (and the
latest 14.x), so the app is pinned to Next 15.1.6 for deployment compatibility.
The OpenNext CLI handles build, preview, and deploy workflows. Use the package
scripts rather than raw `wrangler` commands.

### Local preview (Workers runtime)

```
npm run preview
```

### Deploy (manual)

```
npm run deploy
```

### Deploy (Workers Builds)

1. Create a Workers project and connect this repo.
2. Ensure the Worker name in the Cloudflare dashboard matches the `name` in
   `wrangler.jsonc`.
3. Set the build command to `npx @opennextjs/cloudflare build`.
4. Set the deploy command to `npx @opennextjs/cloudflare deploy`.
5. (Optional) Set the non-production deploy command to
   `npx @opennextjs/cloudflare upload` for preview builds.
6. Add build-time secrets for Clerk in Build configuration (build variables and
   secrets). Add the same values in Settings > Variables & Secrets for runtime.

### Workers Builds checklist

- Build command: `npx @opennextjs/cloudflare build`
- Deploy command: `npx @opennextjs/cloudflare deploy`
- Preview command (optional): `npx @opennextjs/cloudflare upload`
- Secrets in Build configuration and Settings > Variables & Secrets
- Worker name matches `wrangler.jsonc`

## Troubleshooting

- Build fails with `Missing publishableKey`: the build environment does not see
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Add it to Build configuration and
  Settings > Variables & Secrets, then redeploy.
- Build fails with `.open-next/worker.js` not found: the build command did not
  run. Ensure the build command is `npx @opennextjs/cloudflare build` and the
  deploy command is `npx @opennextjs/cloudflare deploy`.
- Build fails with “routes not configured to run with the Edge Runtime”: that
  means you are using Pages or `next-on-pages`. This repo targets Workers via
  OpenNext and does not use Edge runtime.
- Deploy fails with a `createRequire`/`handler.mjs` error: this usually indicates
  an unsupported Next.js version. Ensure Next is pinned to 15.x for OpenNext.

## Admin access

Admins are managed via Clerk user `privateMetadata`:

- The admin UI lets existing admins grant or revoke access (including bulk
  actions and full-directory search).
- On a fresh app (no admins yet), the first signed-in user can claim admin
  access from `/admin` (bootstrap flow).
- Admin changes are logged to an audit trail when the optional KV binding is
  configured.

### Audit log (optional KV)

To persist the audit log, create a Cloudflare KV namespace and bind it as
`AUDIT_LOG`. If not configured, the admin settings page will show a warning and
skip persistence.

## Project structure

- `app/` - App Router routes
- `app/layout.tsx` - wrapped in `ClerkProvider`
- `app/login/page.tsx` - Clerk sign-in page
- `app/dashboard/page.tsx` - protected dashboard view
- `app/dashboard/layout.tsx` - guards all `/dashboard` routes
- `app/admin/page.tsx` - user admin page using `auth()` + `clerkClient()`
- `app/admin/layout.tsx` - guards all `/admin` routes
- `app/admin/settings/page.tsx` - admin settings + audit log view
- `app/admin/audit-log.ts` - audit log helpers (KV-backed when configured)
- `app/protected/page.tsx` - server-rendered route using `auth()`
- `app/protected/layout.tsx` - guards all `/protected` routes
- `proxy.ts` - Clerk middleware
- `middleware.ts` - middleware entrypoint for Next 15 (re-exports `proxy.ts`)
- `open-next.config.ts` - OpenNext adapter config
- `wrangler.jsonc` - Worker configuration
- `.dev.vars` - local Workers env file
- `.gitignore` - ignored build artifacts
- `public/_headers` - static asset cache headers
- `app/profile/page.tsx` - profile settings page
- `app/profile/layout.tsx` - guards `/profile`
- `app/lib/user-utils.ts` - shared user display helpers
- `app/components/site-nav.tsx` - app-wide navigation
