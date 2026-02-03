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
- `middleware.ts` - Next.js entrypoint re-exporting Clerk middleware

## Cloudflare Pages

This is a standard Next.js app and can be deployed with Cloudflare Pages.
