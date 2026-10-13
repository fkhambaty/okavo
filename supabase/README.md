# Retired

Production does not use Supabase. The project `fzgnzaflvbimbiseqnrz` was deleted on 13 October 2026.

Accounts, marketplace rows, files, and payments are in Cloudflare D1 `okavo`, reached through the Worker `okavo-api`. See `ARCHITECTURE.md` and `docs/deploy.md`.

Do not run `supabase db push`, the old edge functions, or `scripts/okavo.mjs` commands that expected a service-role key. The operator console reads D1:

```bash
node scripts/okavo.mjs help
```
