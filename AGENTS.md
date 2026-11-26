# Execution and verification

Apply required database migrations in the active project's Supabase SQL Editor and verify the result. Run the affected user flow in a browser at http://localhost:3000 after each web feature or fix. Start a local server when needed. Check navigation, form submissions, browser console errors, network responses and database persistence. Perform these checks directly rather than delegating them to the user.

Prefer rolled-back SQL tests. For browser submissions, identify test records precisely, remove them after verification, restore their inventory changes and verify cleanup. Report completion only after the applicable SQL and browser checks pass.

## Supabase Direct Execution Rule (Save Tokens — No Browser Automation)
- Never use Chrome, Playwright, or Computer Use to open the Supabase Dashboard SQL Editor.
- Whenever you need to apply a `.sql` migration or run an admin SQL query, execute it directly via the Supabase Management API using `$env:SUPABASE_ACCESS_TOKEN` and project ref `zpabcnskkbpplurngtle`:
  `POST https://api.supabase.com/v1/projects/zpabcnskkbpplurngtle/database/query` with `Authorization: Bearer $env:SUPABASE_ACCESS_TOKEN` and JSON body `{"query": "<SQL_CONTENT>"}`.
- Before any write, query `public.stores` and verify that `nova-store` resolves to `00000000-0000-0000-0000-000000000001` and `omar-a7a` resolves to `b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c`; stop if either mapping differs.
- Never print `$env:SUPABASE_ACCESS_TOKEN` or `.env.local` secret values in terminal output or logs.

## Multi-Agent Handoff Protocol (.handoff.md)

- The Architect implements the change, applies required migrations, runs the agreed build checks, then writes `STATUS: READY_FOR_QA` in the ignored root `.handoff.md` and stops. Include changed files, applied migrations, environment variables, exact QA steps and a suggested commit message.
- QA/Release verifies the SQL and affected browser flows, fixes minor issues, cleans up its test records and inventory, then commits and pushes. After release, reset the handoff to `STATUS: IDLE`.
- For a deep architectural or SQL issue, QA/Release writes `STATUS: NEEDS_ARCH_FIX` with the evidence and returns the work to the Architect before release.
