-- SITAM SPACE v22.2 — h-index, citations, works and i10 of a researcher come from Scopus only (decided 2026-11-02).
-- A researcher can still add, edit and remove papers on their card (v18): those changes show in the list of papers,
-- but no longer change the totals. The totals are recomputed only when the coordinator (or an SQL update run in
-- Supabase) changes the papers, e.g. a Scopus import in Admin. Re-runnable.
create or replace function public.refresh_professor_metrics(p_prof uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_works int; v_cites int; v_h int; v_i10 int;
begin
  -- a change made by the researcher themself (any signed-in person who is not the coordinator): keep the Scopus figures
  if auth.uid() is not null and not public.is_admin() then
    return;
  end if;
  select count(*), coalesce(sum(p.citations), 0), count(*) filter (where p.citations >= 10)
    into v_works, v_cites, v_i10
    from public.publication_authors a join public.publications p on p.id = a.publication_id
   where a.professor_id = p_prof;
  select coalesce(max(rn), 0) into v_h from (
    select p.citations, row_number() over (order by p.citations desc) rn
      from public.publication_authors a join public.publications p on p.id = a.publication_id
     where a.professor_id = p_prof
  ) s where citations >= rn;
  -- Scopus totals can include works not imported here, so never lower them.
  update public.professors
     set total_works = greatest(total_works, v_works), total_citations = greatest(total_citations, v_cites),
         h_index = greatest(h_index, v_h), i10_index = greatest(i10_index, v_i10), updated_at = now()
   where id = p_prof;
end;
$$;
revoke execute on function public.refresh_professor_metrics(uuid) from anon, authenticated, public;
