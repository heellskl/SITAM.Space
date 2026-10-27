/* SITAM SPACE v12.1 — one shared list of research areas, skills and equipment
   ───────────────────────────────────────────────────────────────────────────
   What one lab types becomes a suggestion for every other lab (the site reads labs.tags, labs.skills,
   labs.equipment). The coordinator keeps the list clean:
   • admin_rename_lab_tag(kind, old, new) renames a tag in every lab, or merges it into an existing one
     ("pytorch" → "PyTorch"); with new = null it removes the tag everywhere.
   kind: 'area' (labs.tags) · 'skill' (labs.skills) · 'equipment' (labs.equipment, a comma separated text).
   Re-runnable. */

create or replace function public.admin_rename_lab_tag(p_kind text, p_old text, p_new text)
returns int language plpgsql security definer set search_path = public as $$
declare v_old text := lower(trim(coalesce(p_old, ''))); v_new text := nullif(left(trim(coalesce(p_new, '')), 60), ''); n int;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the SITAM coordinator manages the tag list'; end if;
  if p_kind not in ('area', 'skill', 'equipment') then raise exception 'BAD_INPUT: kind must be area, skill or equipment'; end if;
  if v_old = '' then raise exception 'BAD_INPUT: choose the tag to change'; end if;

  if p_kind = 'equipment' then
    update public.labs l set equipment = nullif((
      select string_agg(x, ', ' order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else trim(e) end as x, o
            from regexp_split_to_table(l.equipment, '\s*[\n,;]+\s*') with ordinality as t(e, o)) s
         where x is not null and x <> '' order by lower(x), o) d), '')
     where exists (select 1 from regexp_split_to_table(l.equipment, '\s*[\n,;]+\s*') e where lower(trim(e)) = v_old);
  elsif p_kind = 'area' then
    update public.labs l set tags = coalesce((
      select array_agg(x order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else e end as x, o from unnest(l.tags) with ordinality as t(e, o)) s
         where x is not null order by lower(x), o) d), '{}')
     where exists (select 1 from unnest(l.tags) e where lower(trim(e)) = v_old);
  else
    update public.labs l set skills = coalesce((
      select array_agg(x order by o) from (
        select distinct on (lower(x)) x, o from (
          select case when lower(trim(e)) = v_old then v_new else e end as x, o from unnest(l.skills) with ordinality as t(e, o)) s
         where x is not null order by lower(x), o) d), '{}')
     where exists (select 1 from unnest(l.skills) e where lower(trim(e)) = v_old);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.admin_rename_lab_tag(text, text, text) from anon, public;
grant execute on function public.admin_rename_lab_tag(text, text, text) to authenticated;
