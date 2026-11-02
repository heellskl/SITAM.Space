-- SITAM SPACE v20.4 — Yerbol Palzhanov: position as for the other professors (no extra text). Re-runnable.
update public.professors set job_title = 'Assistant Professor SDU', bio = null, interests = '{}', updated_at = now()
where username = 'yerbol.palzhanov';
