# Multi-user journals with Auth0

The journal uses the same Auth0 v4 `Auth0Client` pattern as state-of-ai-2026,
with Next.js 15 middleware (that project uses Next.js 16 proxy).
Each authenticated user gets a private journal. There are no shared accounts or
administrator views into other users' journals.

## Configure

1. In your existing Auth0 tenant, create a **Regular Web Application** for Trade Journal.
   A separate application gives this journal its own client secret and callback settings.
2. Add `http://localhost:3000/auth/callback` to **Allowed Callback URLs**.
   Add `http://localhost:3000` to **Allowed Logout URLs** and **Allowed Web Origins**.
   For deployment, add the corresponding HTTPS origin and callback URL.
3. Set these variables in the environment of the web process:

   ```dotenv
   JOURNAL_AUTH=auth0
   AUTH0_DOMAIN=your-tenant.eu.auth0.com
   AUTH0_CLIENT_ID=your-application-client-id
   AUTH0_CLIENT_SECRET=your-application-client-secret
   AUTH0_SECRET=your-generated-session-secret
   APP_BASE_URL=http://localhost:3000
   ```

   Generate `AUTH0_SECRET` using `openssl rand -hex 32`. Keep it stable across
   replicas. Do not copy the other application's session secret. Keep the existing
   `DATABASE_URL` and `JOURNAL_SECRET` / persisted data-directory encryption key.

4. Restart the web process. Visiting the journal redirects to Auth0 Universal Login.
   Use **Sign out** in the sidebar to switch accounts. Signup and allowed login
   connections are controlled in Auth0; any user allowed to authenticate to this
   application can create their own journal.

Docker Compose forwards these variables from the root `.env`. For local Next.js
commands, supply them through your shell or `apps/web/.env.local`.

## Existing journal

Existing data remains in the `public` schema; no records are moved or deleted.
New Auth0 users start with empty journals. To give your existing journal to your
own login, find your exact **User ID** in Auth0's user details and set:

```dotenv
JOURNAL_LEGACY_OWNER_SUB=auth0|your-user-id
```

Only that subject can access the legacy journal. Set it before your first login
if you want to keep using the existing data. Changing it transfers access to the
legacy journal; it does not merge a user's newly created journal. Do not change
Auth0 tenants without reviewing this assignment. Back up the whole database and
encryption key before changing deployment authentication.

## Isolation and operations

The server verifies the Auth0 session for every API request. Its authenticated
`sub`, namespaced by `AUTH0_DOMAIN`, selects a deterministic PostgreSQL schema.
User-supplied headers, IDs and request bodies cannot select the schema. All
existing tables, including settings, attachments, notes, exports, broker secrets,
and fixed-key daily entries, are isolated there. Search paths are transaction-local
and contain no fallback to `public`. Missing identity fails closed in Auth0 mode.
Schema creation and migrations run lazily on first use per process.

The database role needs permission to create schemas. This is application-level
isolation under one database role, not separate database credentials per user.
Backups must include all schemas. Existing local-only maintenance scripts lack an
Auth0 user context and must not run against a multi-user deployment without being
adapted to select an explicit trusted user.

Server environment AI/market-data credentials remain deployment-wide services
available to authenticated users; saved credentials are private to each journal.
Do not configure shared paid-service keys unless you intend to fund that usage.
Browser appearance preferences remain per browser. Database connection capacity
is shared, and schema-per-user is intended for a modest self-hosted user base.

With no Auth0 configuration, the existing local/password mode continues unchanged.
Partial Auth0 configuration fails instead of falling back to an open journal.
Removing all Auth0 configuration re-enables local mode, so keep deployment
configuration managed consistently.

SDK reference: https://github.com/auth0/nextjs-auth0
