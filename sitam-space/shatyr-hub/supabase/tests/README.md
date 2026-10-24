# Permission tests

Run against a **scratch** PostgreSQL database — never the live project (it creates test users).

```bash
createdb sitam_test
psql -d sitam_test -f supabase/tests/local_supabase_stub.sql      # minimal auth/storage stand-in
for f in supabase/migrations/*.sql; do psql -d sitam_test -1 -f "$f"; done
psql -d sitam_test -X -f supabase/tests/permissions_tests.sql
```

Every line should print `PASS` (51 checks): registration, coordinator, head/member rights, projects, events, v10 heads list and competitions.
