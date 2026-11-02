# Permission tests

Run against a **scratch** PostgreSQL database — never the live project (it creates test users).

```bash
createdb sitam_test
psql -d sitam_test -f supabase/tests/local_supabase_stub.sql      # minimal auth/storage stand-in
for f in supabase/migrations/*.sql; do psql -d sitam_test -1 -f "$f"; done
psql -d sitam_test -X -f supabase/tests/permissions_tests.sql
```

Every line should print `PASS` (110 checks): registration, coordinator, head/member rights, projects, events, v10 heads list and competitions, v11, v12 (communities, personal e-mail, event place, industry partners, shared tags), v13 (event photos, Academic Plan), v15 (submission lab or researcher), v16–v17, v18 (researchers update their publications), v19 (work / internship history).
