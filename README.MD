# Qrunto Backend

## Local setup

Copy `.env.example` to `.env`. From **Supabase Dashboard > Connect**, set
`DATABASE_URL` to the transaction pooler URI (port `6543`) and `DIRECT_URL` to
the session pooler URI (port `5432`). Keep the project reference and database
password identical in both URLs, then run:

```powershell
Copy-Item .env.example .env
npx prisma generate
npm run db:check
npm run dev
```

`DATABASE_URL` is used by the running API. `DIRECT_URL` is used by Prisma CLI
commands through `prisma.config.ts`; run `npx prisma migrate deploy` only when
the repository contains reviewed migrations ready for that database.

All real environment files are ignored by Git. Only the placeholder-only
`.env.example` template may be committed.
