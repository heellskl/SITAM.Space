/* ════════════════════════════════════════════════════════════════════════════
   SITAM SPACE v18 — researchers keep their publications up to date (approved by the user 2026-10-31)
   • The teacher linked to a researcher card adds, edits and removes the papers on that card,
     or imports their own Scopus export. The coordinator can do the same for every card
     (also from one Scopus export with many authors).
   • professors.publications_updated_at: when the list was last updated (shown on the page).
   • Totals (works, citations, h-index, i10) are still recomputed by refresh_professor_metrics.
   Safe to run more than once.
   ════════════════════════════════════════════════════════════════════════════ */

alter table public.professors add column if not exists publications_updated_at timestamptz;
grant select (publications_updated_at) on public.professors to anon, authenticated;

-- who may change the papers of a researcher card: the teacher linked to it, or the coordinator / admin
create or replace function public.can_edit_professor(p_prof uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.professors where id = p_prof and profile_id = auth.uid() and auth.uid() is not null)
$$;
revoke execute on function public.can_edit_professor(uuid) from anon, public;
grant execute on function public.can_edit_professor(uuid) to authenticated;

create or replace function public.pub_clean_doi(p text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '^(https?://)?(dx\.)?doi\.org/|^doi:\s*', '', 'i')), '')
$$;

-- add or update one paper on a researcher card; returns the paper id
create or replace function public.save_publication(
  p_prof uuid, p_id uuid, p_title text, p_year int, p_type text, p_venue text, p_doi text, p_url text,
  p_citations int, p_open_access boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_doi text := public.pub_clean_doi(p_doi); v_title text := btrim(coalesce(p_title, ''));
begin
  if not public.can_edit_professor(p_prof) then
    raise exception 'NOT_ALLOWED: only the researcher or the coordinator can change these publications';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 600 then raise exception 'INVALID: the title is required'; end if;
  if p_year is not null and (p_year < 1950 or p_year > extract(year from now())::int + 1) then raise exception 'INVALID: check the year'; end if;
  if coalesce(p_citations, 0) < 0 then raise exception 'INVALID: citations cannot be negative'; end if;

  if p_id is not null then
    if not exists (select 1 from public.publication_authors where publication_id = p_id and professor_id = p_prof) then
      raise exception 'NOT_ALLOWED: this paper is not on this researcher card';
    end if;
    v_id := p_id;
  else
    -- the same paper may already exist (co-author, earlier import): link it instead of copying
    select id into v_id from public.publications
     where (v_doi is not null and lower(doi) = v_doi)
        or (v_doi is null and lower(title) = lower(v_title) and year is not distinct from p_year)
     limit 1;
  end if;

  if v_id is null then
    insert into public.publications (title, year, type, venue, doi, url, citations, is_open_access)
    values (v_title, p_year, nullif(btrim(p_type), ''), nullif(btrim(p_venue), ''), v_doi, nullif(btrim(p_url), ''),
            coalesce(p_citations, 0), coalesce(p_open_access, false))
    returning id into v_id;
  else
    update public.publications
       set title = v_title, year = p_year, type = nullif(btrim(p_type), ''), venue = nullif(btrim(p_venue), ''),
           doi = coalesce(v_doi, doi), url = coalesce(nullif(btrim(p_url), ''), url),
           citations = coalesce(p_citations, citations), is_open_access = coalesce(p_open_access, is_open_access)
     where id = v_id;
  end if;

  insert into public.publication_authors (publication_id, professor_id) values (v_id, p_prof) on conflict do nothing;
  perform public.refresh_professor_metrics(p_prof);
  update public.professors set publications_updated_at = now() where id = p_prof;
  return v_id;
end;
$$;

-- remove a paper from a researcher card (the paper itself is deleted when no other researcher has it)
create or replace function public.remove_publication(p_prof uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_professor(p_prof) then
    raise exception 'NOT_ALLOWED: only the researcher or the coordinator can change these publications';
  end if;
  delete from public.publication_authors where publication_id = p_id and professor_id = p_prof;
  delete from public.publications p where p.id = p_id and not exists (select 1 from public.publication_authors a where a.publication_id = p.id);
  update public.professors set publications_updated_at = now() where id = p_prof;
end;
$$;

-- import many papers for one researcher (from a Scopus export); new papers are added, known ones get fresh citations.
-- p_items: [{title, year, type, venue, publisher, doi, url, citations, open_access, eid, keywords[]}]
create or replace function public.import_publications(p_prof uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_id uuid; v_doi text; v_eid text; v_title text; v_year int; v_cites int; v_added int := 0; v_updated int := 0;
begin
  if not public.can_edit_professor(p_prof) then
    raise exception 'NOT_ALLOWED: only the researcher or the coordinator can change these publications';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then raise exception 'INVALID: too many rows'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_title := btrim(coalesce(it->>'title', ''));
    continue when char_length(v_title) < 3;
    v_title := left(v_title, 600);
    v_doi := public.pub_clean_doi(it->>'doi');
    v_eid := nullif(btrim(coalesce(it->>'eid', '')), '');
    v_year := case when (it->>'year') ~ '^\d{4}$' and (it->>'year')::int between 1950 and 2100 then (it->>'year')::int end;
    v_cites := case when (it->>'citations') ~ '^\d{1,7}$' then (it->>'citations')::int else 0 end;
    v_id := null;
    select id into v_id from public.publications
     where (v_eid is not null and scopus_eid = v_eid)
        or (v_doi is not null and lower(doi) = v_doi)
        or (lower(title) = lower(v_title) and year is not distinct from v_year)
     limit 1;
    if v_id is null then
      insert into public.publications (title, year, type, venue, publisher, doi, url, citations, is_open_access, scopus_eid, keywords)
      values (v_title, v_year, nullif(it->>'type', ''), nullif(it->>'venue', ''), nullif(it->>'publisher', ''), v_doi,
              nullif(it->>'url', ''), v_cites, coalesce((it->>'open_access')::boolean, false), v_eid,
              coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(it->'keywords') = 'array' then it->'keywords' else '[]'::jsonb end)), '{}'))
      returning id into v_id;
      v_added := v_added + 1;
    else
      update public.publications
         set citations = greatest(citations, v_cites), doi = coalesce(doi, v_doi), scopus_eid = coalesce(scopus_eid, v_eid),
             venue = coalesce(venue, nullif(it->>'venue', '')), url = coalesce(url, nullif(it->>'url', ''))
       where id = v_id;
      v_updated := v_updated + 1;
    end if;
    insert into public.publication_authors (publication_id, professor_id) values (v_id, p_prof) on conflict do nothing;
  end loop;
  perform public.refresh_professor_metrics(p_prof);
  update public.professors set publications_updated_at = now() where id = p_prof;
  return jsonb_build_object('added', v_added, 'updated', v_updated);
end;
$$;

revoke execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) from anon, public;
revoke execute on function public.remove_publication(uuid, uuid) from anon, public;
revoke execute on function public.import_publications(uuid, jsonb) from anon, public;
grant execute on function public.save_publication(uuid, uuid, text, int, text, text, text, text, int, boolean) to authenticated;
grant execute on function public.remove_publication(uuid, uuid) to authenticated;
grant execute on function public.import_publications(uuid, jsonb) to authenticated;
