/* SITAM SPACE v10 — external events, competitions & hackathons; lab heads from the coordinator's list
   ─────────────────────────────────────────────────────────────────────────────────────────────────
   • external_events: competitions, hackathons, olympiads, conferences… held OUTSIDE SITAM (shown on /events).
     An event can be an edition of an annual series (event_series) — every new year links back to the series.
   • external_event_labs: a lab takes part. Before the event it shows as "Participating" with its students and
     mentors (external_event_people); after the event the head records the result ("1st place", "Runner-up"…)
     and the project they submitted.
   • Rights (checked here, the UI only shows buttons):
       – add an external event: any lab head, the coordinator;
       – edit / delete it: whoever added it, the coordinator;
       – a lab's participation, people and result: heads of THAT lab, the coordinator.
     Everyone (also guests) can see events, participants and results.
   • name_key(): same person whatever the word order ("Aziza Nazarbayeva" = "Nazarbayeva Aziza").
     assign_lab_head() now links an imported head row with the same name instead of adding a second head. */

create or replace function public.name_key(p text)
returns text language sql immutable as $$
  select coalesce(string_agg(w, ' ' order by w), '')
    from unnest(regexp_split_to_array(lower(trim(coalesce(p, ''))), '\s+')) as w
   where w <> ''
$$;

/* ───────────── coordinator assigns a head: reuse the imported row of the same person ───────────── */
create or replace function public.assign_lab_head(p_lab uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_member uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED: only the coordinator assigns lab heads'; end if;
  if not exists (select 1 from public.labs where id = p_lab) then raise exception 'NOT_FOUND: lab'; end if;
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), email) into v_name from public.profiles where id = p_user;
  if v_name is null then raise exception 'NOT_FOUND: user'; end if;
  select id into v_member from public.lab_members where lab_id = p_lab and user_id = p_user;
  if v_member is not null then
    update public.lab_members set role = 'lead' where id = v_member and not public.is_lab_head_role(role::text);
    return;
  end if;
  -- a head (or member) row imported under the same name, not linked to an account yet
  select id into v_member from public.lab_members
   where lab_id = p_lab and user_id is null and role::text <> 'former_lead' and public.name_key(full_name) = public.name_key(v_name)
   order by public.is_lab_head_role(role::text) desc, sort_order limit 1;
  if v_member is not null then
    update public.lab_members set user_id = p_user,
           role = case when public.is_lab_head_role(role::text) then role else 'lead' end
     where id = v_member;
  else
    insert into public.lab_members (lab_id, user_id, full_name, role, sort_order) values (p_lab, p_user, left(v_name, 120), 'lead', -1);
  end if;
end;
$$;

/* ───────────── tables ───────────── */
create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  kind text not null default 'competition' check (kind in ('competition', 'hackathon', 'olympiad', 'conference', 'festival', 'other')),
  organizer text check (char_length(organizer) <= 160),
  website text check (website is null or website ~* '^https?://'),
  recurrence text not null default 'annual' check (recurrence in ('annual')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists event_series_title_idx on public.event_series (lower(title));

create table if not exists public.external_events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.event_series(id) on delete set null,
  kind text not null default 'competition' check (kind in ('competition', 'hackathon', 'olympiad', 'conference', 'festival', 'other')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  organizer text check (char_length(organizer) <= 160),
  location text check (char_length(location) <= 160),
  url text check (url is null or url ~* '^https?://'),
  starts_on date,
  ends_on date check (ends_on is null or starts_on is null or ends_on >= starts_on),
  year int check (year between 1990 and 2100),           -- known even when the exact dates are not
  description text check (char_length(description) <= 2000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_events_series_idx on public.external_events (series_id);
create index if not exists external_events_start_idx on public.external_events (starts_on);

create table if not exists public.external_event_labs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.external_events(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete cascade,
  result text check (char_length(result) <= 160),          -- '1st place', 'Runner-up', 'Finalist' … (after the event)
  project_title text check (char_length(project_title) <= 200),
  project_url text check (project_url is null or project_url ~* '^https?://'),
  project_id uuid references public.projects(id) on delete set null,
  notes text check (char_length(notes) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (event_id, lab_id)
);
create index if not exists external_event_labs_lab_idx on public.external_event_labs (lab_id);

create table if not exists public.external_event_people (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.external_event_labs(id) on delete cascade,
  member_id uuid references public.lab_members(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  role text not null default 'student' check (role in ('student', 'mentor')),
  sort_order int not null default 0
);
create index if not exists external_event_people_entry_idx on public.external_event_people (entry_id);

/* read for everyone, write only through the functions below */
alter table public.event_series enable row level security;
alter table public.external_events enable row level security;
alter table public.external_event_labs enable row level security;
alter table public.external_event_people enable row level security;
drop policy if exists "Series are public" on public.event_series;
create policy "Series are public" on public.event_series for select using (true);
drop policy if exists "External events are public" on public.external_events;
create policy "External events are public" on public.external_events for select using (true);
drop policy if exists "Participations are public" on public.external_event_labs;
create policy "Participations are public" on public.external_event_labs for select using (true);
drop policy if exists "Participants are public" on public.external_event_people;
create policy "Participants are public" on public.external_event_people for select using (true);
grant select on public.event_series, public.external_events, public.external_event_labs, public.external_event_people to anon, authenticated;
revoke insert, update, delete on public.event_series, public.external_events, public.external_event_labs, public.external_event_people from anon, authenticated;

/* ───────────── rights ───────────── */
create or replace function public.is_any_lab_head()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lab_members where user_id = auth.uid() and can_edit)
$$;

create or replace function public.can_edit_external_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.external_events e where e.id = p_event and e.created_by = auth.uid())
$$;

/* ───────────── add / edit an external event ───────────── */
create or replace function public.save_external_event(
  p_id uuid, p_kind text, p_title text, p_organizer text, p_location text, p_url text,
  p_starts_on date, p_ends_on date, p_description text, p_annual boolean, p_series_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_series uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if v_id is null and not (public.is_admin() or public.is_any_lab_head()) then
    raise exception 'NOT_ALLOWED: only lab heads and the coordinator add external events';
  end if;
  if v_id is not null and not public.can_edit_external_event(v_id) then
    raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can change it';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'BAD_INPUT: enter the event name'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'BAD_INPUT: the link must start with https://'; end if;
  if p_starts_on is null then raise exception 'BAD_INPUT: choose the start date'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'BAD_INPUT: the end date is before the start date'; end if;

  -- annual event: an edition of a series (an existing one, or a new series named after the event)
  if coalesce(p_annual, false) then
    v_series := p_series_id;
    if v_series is not null and not exists (select 1 from public.event_series where id = v_series) then
      raise exception 'NOT_FOUND: event series';
    end if;
    if v_series is null then
      select id into v_series from public.event_series
       where lower(title) = lower(trim(regexp_replace(p_title, '\s*(19|20)\d\d\s*$', '')));
    end if;
    if v_series is null then
      insert into public.event_series (title, kind, organizer, website)
      values (left(trim(regexp_replace(p_title, '\s*(19|20)\d\d\s*$', '')), 160), coalesce(p_kind, 'competition'), nullif(trim(p_organizer), ''), p_url)
      returning id into v_series;
    end if;
  end if;

  if v_id is null then
    insert into public.external_events (series_id, kind, title, organizer, location, url, starts_on, ends_on, year, description)
    values (v_series, coalesce(p_kind, 'competition'), left(trim(p_title), 160), nullif(trim(p_organizer), ''), nullif(trim(p_location), ''),
            nullif(trim(p_url), ''), p_starts_on, p_ends_on, extract(year from p_starts_on)::int, nullif(trim(p_description), ''))
    returning id into v_id;
  else
    update public.external_events set series_id = v_series, kind = coalesce(p_kind, kind), title = left(trim(p_title), 160),
           organizer = nullif(trim(p_organizer), ''), location = nullif(trim(p_location), ''), url = nullif(trim(p_url), ''),
           starts_on = p_starts_on, ends_on = p_ends_on, year = extract(year from p_starts_on)::int,
           description = nullif(trim(p_description), ''), updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_external_event(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_external_event(p_id) then
    raise exception 'NOT_ALLOWED: only the person who added this event or the coordinator can delete it';
  end if;
  delete from public.external_events where id = p_id;
end;
$$;

/* ───────────── a lab's participation, people, result ───────────── */
-- p_people: [{ "member_id": uuid | null, "full_name": text, "role": "student" | "mentor" }]
create or replace function public.save_event_participation(
  p_event uuid, p_lab uuid, p_people jsonb, p_result text default null, p_project_title text default null,
  p_project_url text default null, p_project_id uuid default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_entry uuid; v_start date; v_p jsonb; v_name text; v_member uuid; v_role text; v_i int := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED: sign in first'; end if;
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: only heads of this lab can register its participation'; end if;
  select coalesce(starts_on, make_date(year, 1, 1)) into v_start from public.external_events where id = p_event;
  if not found then raise exception 'NOT_FOUND: event'; end if;
  -- results are recorded after the event has started
  if nullif(trim(coalesce(p_result, '')), '') is not null and v_start is not null and v_start > current_date then
    raise exception 'TOO_EARLY: the result can be added once the event has started';
  end if;
  if p_project_url is not null and p_project_url !~* '^https?://' then raise exception 'BAD_INPUT: the project link must start with https://'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and lab_id = p_lab) then
    raise exception 'BAD_INPUT: choose a project of this lab';
  end if;

  insert into public.external_event_labs (event_id, lab_id, result, project_title, project_url, project_id, notes, updated_by, updated_at)
  values (p_event, p_lab, nullif(trim(p_result), ''), nullif(trim(p_project_title), ''), nullif(trim(p_project_url), ''), p_project_id,
          nullif(trim(p_notes), ''), auth.uid(), now())
  on conflict (event_id, lab_id) do update set result = excluded.result, project_title = excluded.project_title,
    project_url = excluded.project_url, project_id = excluded.project_id, notes = excluded.notes,
    updated_by = excluded.updated_by, updated_at = now()
  returning id into v_entry;

  delete from public.external_event_people where entry_id = v_entry;
  for v_p in select * from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) loop
    v_member := nullif(v_p->>'member_id', '')::uuid;
    v_role := case when v_p->>'role' = 'mentor' then 'mentor' else 'student' end;
    if v_member is not null then
      select full_name into v_name from public.lab_members where id = v_member and lab_id = p_lab;
      if v_name is null then raise exception 'BAD_INPUT: a participant is not in this lab''s team'; end if;
    else
      v_name := nullif(trim(coalesce(v_p->>'full_name', '')), '');
    end if;
    if v_name is not null and char_length(v_name) >= 2 then
      insert into public.external_event_people (entry_id, member_id, full_name, role, sort_order)
      values (v_entry, v_member, left(v_name, 120), v_role, v_i);
      v_i := v_i + 1;
    end if;
  end loop;
  return v_entry;
end;
$$;

create or replace function public.remove_event_participation(p_event uuid, p_lab uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_lab_manager(p_lab) then raise exception 'NOT_ALLOWED: only heads of this lab can change its participation'; end if;
  delete from public.external_event_labs where event_id = p_event and lab_id = p_lab;
end;
$$;

revoke execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) from anon, public;
revoke execute on function public.delete_external_event(uuid) from anon, public;
revoke execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) from anon, public;
revoke execute on function public.remove_event_participation(uuid, uuid) from anon, public;
grant execute on function public.save_external_event(uuid, text, text, text, text, text, date, date, text, boolean, uuid) to authenticated;
grant execute on function public.delete_external_event(uuid) to authenticated;
grant execute on function public.save_event_participation(uuid, uuid, jsonb, text, text, text, uuid, text) to authenticated;
grant execute on function public.remove_event_participation(uuid, uuid) to authenticated;
grant execute on function public.name_key(text) to anon, authenticated;
