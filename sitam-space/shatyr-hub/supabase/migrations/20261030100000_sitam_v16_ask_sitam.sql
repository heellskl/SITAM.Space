/* SITAM SPACE v16 — "Ask SITAM" (RAG MVP)
   ───────────────────────────────────────
   One knowledge table for the assistant instead of an embedding column in every table:
   a lab, a researcher, a paper, a project, an event, a vacancy or an FAQ answer each becomes one row of
   public.ai_documents (title, text, link, embedding). One index, one search function, and private data can never
   leak in by accident — only what public.ai_sources produces is indexed.

   • extension vector (pgvector); embeddings: 384 numbers = Supabase AI model "gte-small" (free, runs inside Edge Functions).
   • public.ai_sources (view): the PUBLIC text of every item. Never: CVs, phones, e-mails, applications, lab Internal.
   • public.ai_pending_documents(limit): what is new or changed since the last indexing (by md5 of the text).
   • public.ai_upsert_document / ai_remove_stale: used by the Edge Function "ai-index" (service role only).
   • public.match_documents(query_embedding, match_count, min_similarity): vector search (cosine).
   • public.ai_usage + ai_take_quota(): daily limit of questions per person (default 30).
   Re-runnable. */

create extension if not exists vector with schema extensions;

/* ───────────── knowledge table ───────────── */
create table if not exists public.ai_documents (
  id bigint generated always as identity primary key,
  source_type text not null check (source_type in ('lab', 'researcher', 'publication', 'project', 'event', 'external_event', 'opportunity', 'partner', 'faq')),
  source_id text not null,
  title text not null,
  url text not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(384),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists ai_documents_embedding_idx on public.ai_documents
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.ai_documents enable row level security;
-- the whole table is public knowledge; only the server (service role) writes it
drop policy if exists "AI documents are public" on public.ai_documents;
create policy "AI documents are public" on public.ai_documents for select using (true);
revoke insert, update, delete on public.ai_documents from anon, authenticated;
grant select on public.ai_documents to anon, authenticated;

/* ───────────── FAQ (same text as the FAQ page) ───────────── */
create table if not exists public.ai_faq (
  id serial primary key,
  question text not null unique,
  answer text not null
);
alter table public.ai_faq enable row level security;
drop policy if exists "FAQ is public" on public.ai_faq;
create policy "FAQ is public" on public.ai_faq for select using (true);
grant select on public.ai_faq to anon, authenticated;
revoke insert, update, delete on public.ai_faq from anon, authenticated;
insert into public.ai_faq (question, answer) values
  ('How do I become a lab head?', 'Lab heads are assigned by the SITAM coordinator. Register and sign in once, then ask the coordinator to assign you to your lab. A student or a teacher can be a lab head; your account type does not change.'),
  ('What can a lab head do?', 'Only for your own lab: edit all lab information, add and remove members (search registered users), create, edit and delete lab projects and events. Everyone else sees the lab read-only.'),
  ('How is my account type set?', 'You choose it when you register: Student, Teacher or Industry partner. Students and teachers register with their SDU e-mail.'),
  ('How do I join a lab?', 'A lab head adds you to the lab after you have signed in at least once. Labs also post Lab cases on the Opportunities page.'),
  ('How do I register and sign in?', 'Open Register, choose Student, Teacher or Industry partner, fill in the form and you are signed in right away. Next time sign in with your e-mail and password. Forgot the password? Use “E-mail me a sign-in link” on the Sign in page.'),
  ('I am a teacher. How do I offer a topic or position to students?', 'After the SITAM office verifies your account, open your profile → “Post an opportunity”. It appears on the Opportunities page automatically, and you see every applicant with contacts and CV in Manage → Applications.'),
  ('Where do lab events, projects and vacancies appear?', 'Everywhere at once. When a lab head adds an event, a project or a vacancy on the lab page, it automatically shows up in Events, Projects or Opportunities.'),
  ('How do I join a laboratory?', 'Labs post Lab Cases and Research Cases on the Opportunities page. Apply there — the CV from your registration is attached automatically, and you can replace it for a single application. Lab heads review applications in their inbox.'),
  ('Can I use a different CV for one application?', 'Yes. When you apply, keep the CV from your profile or upload another PDF for that application only. Your profile CV stays unchanged.'),
  ('I head a lab and I am also a student. Can I apply to company vacancies?', 'Yes. Roles are additive: lab-head rights let you manage your lab, and your student account can still apply anywhere except to your own lab’s listings.'),
  ('How do lab heads update their lab page and projects?', 'On the Labs page open your lab: Edit, Add member, New project and New event appear only for its heads.'),
  ('When and where are the events?', 'Research events run on Tuesdays at 17:00 and Industry events on Thursdays at 17:00, in Room C1.2. An event can be hosted by several labs, companies or projects together. Register in one click to get a QR ticket.'),
  ('Where do the publication numbers come from?', 'From the Scopus export: publications, citations, h-index and research topics per professor. Click a researcher to see all of their papers.'),
  ('Who sees my data?', 'Your applications and CV are visible only to you and to the people reviewing that specific opportunity. Attendee lists are visible only to event organizers. Your name, role and e-mail are visible to signed-in members so they can write to you; your phone is not shown.')
on conflict (question) do update set answer = excluded.answer;

/* ───────────── what the assistant may know (public data only) ───────────── */
-- drop first: an older version of this view may have other columns ("cannot drop columns from view")
drop view if exists public.ai_sources;
create view public.ai_sources with (security_invoker = false) as
  -- laboratories and student communities
  select 'lab'::text as source_type, l.id::text as source_id, l.name as title, '/labs/' || l.slug as url,
         concat_ws(E'\n',
           (case when l.kind = 'community' then 'Student community: ' else 'Laboratory: ' end) || l.name,
           nullif(l.description, ''),
           case when cardinality(l.focus) > 0 then 'Focus: ' || array_to_string(l.focus, ', ') end,
           case when l.direction is not null then 'Direction: ' || l.direction end,
           case when cardinality(l.tags) > 0 then 'Research areas: ' || array_to_string(l.tags, ', ') end,
           case when cardinality(coalesce(l.skills, '{}')) > 0 then 'Skills: ' || array_to_string(l.skills, ', ') end,
           case when nullif(l.equipment, '') is not null then 'Equipment: ' || l.equipment end,
           case when nullif(l.location, '') is not null then 'Location: ' || l.location end,
           (select 'Heads: ' || string_agg(m.full_name, ', ' order by m.sort_order) from public.lab_members m
             where m.lab_id = l.id and m.role::text in ('lead', 'co_lead')),
           case when cardinality(l.ongoing_projects) > 0 then 'Ongoing projects: ' || array_to_string(l.ongoing_projects, '; ') end,
           case when cardinality(l.completed_projects) > 0 then 'Completed projects: ' || array_to_string(l.completed_projects, '; ') end,
           case when cardinality(l.awards) > 0 then 'Awards: ' || array_to_string(l.awards, '; ') end,
           case when cardinality(l.current_partners) > 0 then 'Partners: ' || array_to_string(l.current_partners, '; ') end,
           case when cardinality(coalesce(l.upcoming_activities, '{}')) > 0 then 'Upcoming: ' || array_to_string(l.upcoming_activities, '; ') end
         ) as content
    from public.labs l
  union all
  -- researchers (Scopus): no e-mail
  select 'researcher', p.id::text, p.full_name, '/research/' || p.username,
         concat_ws(E'\n',
           'Researcher: ' || p.full_name,
           nullif(concat_ws(', ', p.job_title, p.degree), ''),
           format('Scopus: %s works, %s citations, h-index %s', p.total_works, p.total_citations, p.h_index),
           case when cardinality(p.keywords) > 0 then 'Keywords: ' || array_to_string(p.keywords, ', ') end,
           (select 'Research topics: ' || string_agg(t->>'topic_name', '; ') from jsonb_array_elements(p.topics) t),
           (select 'Recent papers: ' || string_agg(x.title, '; ') from (
              select pb.title from public.publication_authors pa join public.publications pb on pb.id = pa.publication_id
               where pa.professor_id = p.id order by pb.year desc nulls last limit 8) x)
         )
    from public.professors p
  union all
  -- publications
  select 'publication', pb.id::text, pb.title,
         '/research?tab=search&q=' || left(regexp_replace(pb.title, '[^A-Za-z0-9 ]', ' ', 'g'), 80),
         concat_ws(E'\n',
           'Paper: ' || pb.title,
           nullif(concat_ws(', ', pb.venue, pb.year::text, pb.type), ''),
           (select 'Authors (SDU): ' || string_agg(pr.full_name, ', ') from public.publication_authors pa
              join public.professors pr on pr.id = pa.professor_id where pa.publication_id = pb.id),
           case when cardinality(pb.keywords) > 0 then 'Keywords: ' || array_to_string(pb.keywords, ', ') end,
           format('Citations: %s%s', pb.citations, case when pb.is_open_access then ', open access' else '' end)
         )
    from public.publications pb
  union all
  -- projects (published only)
  select 'project', pr.id::text, pr.title, '/labs?tab=projects',
         concat_ws(E'\n',
           initcap(pr.kind::text) || ': ' || pr.title,
           nullif(pr.summary, ''),
           (select 'Lab: ' || l.name from public.labs l where l.id = coalesce(pr.lab_id, pr.related_lab_id)),
           case when cardinality(pr.authors) > 0 then 'Team: ' || array_to_string(pr.authors, ', ') end,
           case when cardinality(pr.tags) > 0 then 'Tags: ' || array_to_string(pr.tags, ', ') end,
           'Status: ' || pr.status::text || coalesce(', ' || pr.year::text, '')
         )
    from public.projects pr where pr.moderation = 'approved'
  union all
  -- SDU events (published)
  select 'event', e.id::text, e.title, '/events/' || e.id,
         concat_ws(E'\n',
           (case when e.kind::text = 'industrial' then 'Industry event: ' else 'Research event: ' end) || e.title,
           'When: ' || to_char(e.starts_at at time zone 'Asia/Almaty', 'DD Mon YYYY HH24:MI') || ' (Almaty), room ' || e.room,
           case when e.speaker is not null then 'Speaker: ' || e.speaker || coalesce(', ' || e.speaker_role, '') end,
           nullif(e.description, ''),
           (select 'Hosted by: ' || string_agg(coalesce(l.name, c.name), ', ') from public.event_hosts h
              left join public.labs l on l.id = h.lab_id left join public.companies c on c.id = h.company_id where h.event_id = e.id)
         )
    from public.events e where e.is_published
  union all
  -- competitions, hackathons, conferences outside SITAM
  select 'external_event', x.id::text, x.title, '/events',
         concat_ws(E'\n',
           initcap(x.kind::text) || ': ' || x.title,
           case when x.organizer is not null then 'Organizer: ' || x.organizer end,
           case when x.starts_on is not null then 'Dates: ' || x.starts_on::text || coalesce(' – ' || x.ends_on::text, '') else 'Year: ' || x.year::text end,
           case when x.location is not null then 'Where: ' || x.location end,
           nullif(x.description, ''),
           (select 'SITAM labs taking part: ' || string_agg(l.name || coalesce(' (' || el.result || ')', ''), '; ')
              from public.external_event_labs el join public.labs l on l.id = el.lab_id where el.event_id = x.id)
         )
    from public.external_events x
  union all
  -- open vacancies, internships and cases
  select 'opportunity', o.id::text, o.title, '/opportunities?open=' || o.id,
         concat_ws(E'\n',
           initcap(o.category::text) || coalesce(' ' || o.industrial_type::text, '') || ' case: ' || o.title,
           o.description,
           case when cardinality(o.requirements) > 0 then 'Requirements: ' || array_to_string(o.requirements, '; ') end,
           case when cardinality(o.tags) > 0 then 'Tags: ' || array_to_string(o.tags, ', ') end,
           case when o.deadline is not null then 'Deadline: ' || o.deadline::text end,
           nullif(concat_ws(', ', o.duration, o.work_format, case when o.paid then 'paid' end, o.compensation), '')
         )
    from public.opportunities o where o.is_active and (o.deadline is null or o.deadline >= current_date)
  union all
  -- industry partners
  select 'partner', ip.id::text, ip.name, '/opportunities?view=partners',
         concat_ws(E'\n',
           'Industry partner: ' || ip.name || coalesce(' (' || ip.short_name || ')', ''),
           case when ip.ceo is not null then 'CEO / Head: ' || ip.ceo end,
           case when ip.founded_year is not null then 'Founded: ' || ip.founded_year end,
           case when cardinality(ip.upcoming_projects) > 0 then 'Upcoming projects: ' || array_to_string(ip.upcoming_projects, '; ') end,
           case when cardinality(ip.completed_projects) > 0 then 'Completed projects: ' || array_to_string(ip.completed_projects, '; ') end
         )
    from public.industry_partners ip
  union all
  select 'faq', f.id::text, f.question, '/faq', 'FAQ — ' || f.question || E'\n' || f.answer
    from public.ai_faq f;
revoke all on public.ai_sources from anon, authenticated, public;

/* ───────────── indexing helpers (Edge Function "ai-index", service role) ───────────── */
create or replace function public.ai_pending_documents(p_limit int default 50)
returns table (source_type text, source_id text, title text, url text, content text, content_hash text)
language sql stable security definer set search_path = public, extensions as $$
  select s.source_type, s.source_id, s.title, s.url, left(s.content, 4000), md5(s.title || s.url || s.content)
    from public.ai_sources s
    left join public.ai_documents d on d.source_type = s.source_type and d.source_id = s.source_id
   where d.id is null or d.content_hash <> md5(s.title || s.url || s.content) or d.embedding is null
   limit greatest(1, least(p_limit, 200))
$$;

create or replace function public.ai_upsert_document(p_source_type text, p_source_id text, p_title text, p_url text,
                                                     p_content text, p_hash text, p_embedding extensions.vector(384))
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.ai_documents (source_type, source_id, title, url, content, content_hash, embedding, updated_at)
  values (p_source_type, p_source_id, p_title, p_url, p_content, p_hash, p_embedding, now())
  on conflict (source_type, source_id) do update
    set title = excluded.title, url = excluded.url, content = excluded.content, content_hash = excluded.content_hash,
        embedding = excluded.embedding, updated_at = now()
$$;

-- items that were deleted or became private (e.g. a closed vacancy) leave the index
create or replace function public.ai_remove_stale()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.ai_documents d
   where not exists (select 1 from public.ai_sources s where s.source_type = d.source_type and s.source_id = d.source_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.ai_index_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'indexed', (select count(*) from public.ai_documents where embedding is not null),
    'pending', (select count(*) from public.ai_pending_documents(200)),
    'last_update', (select max(updated_at) from public.ai_documents))
$$;

/* ───────────── vector search ───────────── */
create or replace function public.match_documents(query_embedding extensions.vector(384), match_count int default 8,
                                                  min_similarity float default 0.2, filter_types text[] default null)
returns table (id bigint, source_type text, source_id text, title text, url text, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.source_type, d.source_id, d.title, d.url, d.content, 1 - (d.embedding <=> query_embedding) as similarity
    from public.ai_documents d
   where d.embedding is not null
     and (filter_types is null or cardinality(filter_types) = 0 or d.source_type = any(filter_types))
     and 1 - (d.embedding <=> query_embedding) >= min_similarity
   order by d.embedding <=> query_embedding
   limit greatest(1, least(match_count, 20))
$$;

/* ───────────── daily limit of questions ───────────── */
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  questions int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "Own AI usage" on public.ai_usage;
create policy "Own AI usage" on public.ai_usage for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- +1 question for this person today; false when the daily limit is reached
create or replace function public.ai_take_quota(p_user uuid, p_limit int default 30)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, questions) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set questions = public.ai_usage.questions + 1
  returning questions into n;
  return n <= p_limit;
end;
$$;

/* only the server (service role key inside the Edge Functions) runs these */
revoke execute on function public.ai_pending_documents(int) from anon, authenticated, public;
revoke execute on function public.ai_upsert_document(text, text, text, text, text, text, extensions.vector) from anon, authenticated, public;
revoke execute on function public.ai_remove_stale() from anon, authenticated, public;
revoke execute on function public.ai_take_quota(uuid, int) from anon, authenticated, public;
revoke execute on function public.match_documents(extensions.vector, int, float, text[]) from anon, public;
grant execute on function public.match_documents(extensions.vector, int, float, text[]) to authenticated;
grant execute on function public.ai_index_status() to authenticated;
grant execute on function public.ai_pending_documents(int), public.ai_upsert_document(text, text, text, text, text, text, extensions.vector),
  public.ai_remove_stale(), public.ai_take_quota(uuid, int), public.match_documents(extensions.vector, int, float, text[]), public.ai_index_status() to service_role;
