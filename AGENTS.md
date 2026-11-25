# Execution and verification

Apply required database migrations in the active project's Supabase SQL Editor and verify the result. Run the affected user flow in a browser at http://localhost:3000 after each web feature or fix. Start a local server when needed. Check navigation, form submissions, browser console errors, network responses and database persistence. Perform these checks directly rather than delegating them to the user.

Prefer rolled-back SQL tests. For browser submissions, identify test records precisely, remove them after verification, restore their inventory changes and verify cleanup. Report completion only after the applicable SQL and browser checks pass.

## Supabase Direct Execution Rule (Save Tokens — No Browser Automation)
- Never use Chrome, Playwright, or Computer Use to open the Supabase Dashboard SQL Editor.
- Whenever you need to apply a `.sql` migration or run an admin SQL query, execute it directly via the Supabase Management API using `$env:SUPABASE_ACCESS_TOKEN` and project ref `whitelabel-demo`:
  `POST https://api.supabase.com/v1/projects/whitelabel-demo/database/query` with `Authorization: Bearer $env:SUPABASE_ACCESS_TOKEN` and JSON body `{"query": "<SQL_CONTENT>"}`.
- Never print `$env:SUPABASE_ACCESS_TOKEN` or `.env.local` secret values in terminal output or logs.
