# Execution and verification

Apply required database migrations in the active project's Supabase SQL Editor and verify the result. Run the affected user flow in a browser at http://localhost:3000 after each web feature or fix. Start a local server when needed. Check navigation, form submissions, browser console errors, network responses and database persistence. Perform these checks directly rather than delegating them to the user.

Prefer rolled-back SQL tests. For browser submissions, identify test records precisely, remove them after verification, restore their inventory changes and verify cleanup. Report completion only after the applicable SQL and browser checks pass.
