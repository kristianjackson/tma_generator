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

## Cloudflare Workers (OpenNext)

This project targets Cloudflare Workers using the `@opennextjs/cloudflare`
adapter (Node.js runtime). The OpenNext CLI handles build, preview, and deploy
workflows. Use the package scripts rather than raw `wrangler` commands.

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
3. Set the deploy command to `npm run deploy`.
4. Add build-time secrets for Clerk in Build configuration (build variables and
   secrets). Add the same values in Settings > Variables & Secrets for runtime.

## Admin access

To restrict `/admin` to specific users, set `ADMIN_USER_IDS` as a comma-separated
list of Clerk user IDs (for example, `ADMIN_USER_IDS=user_123,user_456`). If the
variable is omitted, any signed-in user can access `/admin`.

## Project structure

- `app/` - App Router routes
- `app/layout.tsx` - wrapped in `ClerkProvider`
- `app/login/page.tsx` - Clerk sign-in page
- `app/dashboard/page.tsx` - protected dashboard view
- `app/dashboard/layout.tsx` - guards all `/dashboard` routes
- `app/admin/page.tsx` - user admin page using `auth()` + `clerkClient()`
- `app/admin/layout.tsx` - guards all `/admin` routes
- `app/protected/page.tsx` - server-rendered route using `auth()`
- `app/protected/layout.tsx` - guards all `/protected` routes
- `proxy.ts` - Clerk middleware
- `open-next.config.ts` - OpenNext adapter config
- `wrangler.jsonc` - Worker configuration
- `.dev.vars` - local Workers env file
- `.gitignore` - ignored build artifacts
- `public/_headers` - static asset cache headers
