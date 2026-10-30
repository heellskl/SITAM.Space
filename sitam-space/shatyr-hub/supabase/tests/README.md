# Permission tests

Run against a **scratch** PostgreSQL database — never the live project (it creates test users).

```bash
createdb sitam_test
psql -d sitam_test -f supabase/tests/local_supabase_stub.sql      # minimal auth/storage stand-in
psql -d sitam_test -c "alter table auth.users add column encrypted_password text"   # v17 sign-in check
for f in supabase/migrations/*.sql; do psql -d sitam_test -1 -f "$f"; done
psql -d sitam_test -X -f supabase/tests/permissions_tests.sql
psql -d sitam_test -X -f supabase/tests/v17_tests.sql              # after permissions_tests.sql
```

The v16 files need pgvector; without it, replace `extensions.vector(384)` / `extensions.vector` with `real[]`, drop the
hnsw index and define a `<=>` operator on `real[]` (cosine distance) before running them.

Every line should print `PASS` (82 checks in permissions_tests.sql, 33 in v17_tests.sql): registration, coordinator, head/member rights, projects, events, v10 heads list and competitions, v11, v12 (communities, personal e-mail, event place, industry partners, shared tags), v13 (event photos, Academic Plan), v15 (submission lab or researcher).
