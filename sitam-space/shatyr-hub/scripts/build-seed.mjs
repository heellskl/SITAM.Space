#!/usr/bin/env node
// Builds SQL that loads the lab-head form export (labs.json) and the research export
// (professors.json) into the SITAM SPACE database. Re-runnable: rows are upserted.
//
//   node scripts/build-seed.mjs data/labs.json data/professors.json > supabase/migrations/<ts>_sitam_data.sql
//
// v10: safe to run on a live database — what lab heads already filled in is kept (only empty fields are filled),
// nobody is removed from a team, and people already in a team (same name, any word order) are not added twice.
// A lab may list its heads explicitly: "heads": [{ "name", "role": "lead" | "co_lead", "title"?, "email"? }].
// The e-mail links the head row to the account automatically when that person registers.
//
// Accepts either a JSON array or comma-separated objects (as copied from a larger file).
// Private answers (presenters' contacts, goals, support needs, resource gaps, action plan,
// phone numbers) go to lab_internal / lab_member_contacts — never to public tables.

import fs from 'node:fs';

function readLoose(path) {
  let s = fs.readFileSync(path, 'utf8').trim();
  s = s.replace(/,\s*\{\s*$/, '').replace(/,\s*$/, '');
  if (!s.startsWith('[')) s = `[${s}]`;
  return JSON.parse(s);
}

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const qs = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`; // NOT NULL text columns: '' instead of null
const arr = (a) => `array[${(a ?? []).filter((x) => x !== null && String(x).trim() !== '').map((x) => q(String(x).trim())).join(', ')}]::text[]`;
const json = (v) => `${q(JSON.stringify(v ?? null))}::jsonb`;
const url = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lab';

/** Google Drive "open?id=" links → an <img>-friendly thumbnail URL (works for files shared publicly). */
function driveImage(u) {
  if (!u) return null;
  const m = /[?&]id=([\w-]+)/.exec(u) ?? /\/d\/([\w-]+)/.exec(u);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : url(u);
}

const ROLE_WORDS = /^(lead|head|engineer|assistant|assistent|developer|manager|robotics|retired|dev|data|ai|ml|ios|software|research|product|founder|professor|student|intern|designer|devops|teacher-assistant|scientist)\b/i;

/** "Name, Title" / "Name Surname Title +7…" → { name, title, contact } */
function person(raw) {
  if (!raw || /^n\/?a\b/i.test(raw.trim())) return null;
  let s = raw.trim();
  const contacts = [];
  s = s.replace(/https?:\/\/\S+/g, (m) => (contacts.push(m), '')).replace(/\+?\d[\d\s()-]{8,}\d/g, (m) => (contacts.push(m.replace(/\s+/g, '')), ''));
  s = s.replace(/\bnot specified\b/gi, '').replace(/\s+/g, ' ').replace(/[\s,–-]+$/, '').trim();
  let name, title;
  if (s.includes(',') && s.split(',')[0].trim().split(' ').length <= 3) {
    const [n, ...rest] = s.split(',');
    name = n.trim();
    title = rest.join(',').trim();
  } else {
    const t = s.split(' ');
    // "Bekzhan Robotics Lead": a one-word name followed by a role
    const nameLen = t.length > 1 && ROLE_WORDS.test(t[1]) ? 1 : 2;
    name = t.slice(0, nameLen).join(' ');
    title = t.slice(nameLen).join(' ');
  }
  if (!name || name.length < 2) return null;
  return { name, title: title || null, contact: contacts.join(' ') || null };
}

const FOCUS_RENAME = { 'Academic / Education': 'Education', Courses: 'Education' }; // v11 order; v12 migration renames "Industry & Commercial Projects" to "Commercial Projects" in the database
/** Keep a value a head already entered; fill it only when it is still empty. */
const keepText = (c) => `${c} = coalesce(nullif(public.labs.${c}, ''), excluded.${c})`;
const keepArr = (c) => `${c} = case when cardinality(public.labs.${c}) = 0 then excluded.${c} else public.labs.${c} end`;
const keepJson = (c) => `${c} = case when public.labs.${c} = '[]'::jsonb then excluded.${c} else public.labs.${c} end`;
const keepNull = (c) => `${c} = coalesce(public.labs.${c}, excluded.${c})`;

function labSql(lab) {
  const slug = slugify(lab.slug ?? lab.name);
  const L = `(select id from public.labs where slug = ${q(slug)})`;
  const out = [];
  out.push(`-- ${lab.name}`);
  out.push(`insert into public.labs (slug, name, year_founded, founders, description, focus, logo_url, website, social_links, location,
  completed_projects, ongoing_projects, organized_events, seminars, courses, external_events, notable_alumni, alumni_contributors,
  current_partners, prospective_partners, grants, awards, orgs_kz, orgs_global, events_kz, events_global, photo_urls, photo_archive_link,
  visitor_walkthrough, live_demo, demo_stand)
values (${q(slug)}, ${q(lab.name)}, ${Number.isInteger(lab.year_founded) ? lab.year_founded : 'null'}, ${arr(lab.founders)}, ${qs(lab.description)},
  ${arr((lab.focus ?? []).map((f) => FOCUS_RENAME[f] ?? f))}, ${q(driveImage(lab.logo))}, ${q(url(lab.website))},
  ${json((lab.social_media ?? []).filter((s) => url(s.url)).map((s) => ({ platform: s.platform, url: s.url })))}, ${qs(lab.location)},
  ${arr(lab.completed_projects)}, ${arr(lab.ongoing_projects)}, ${arr(lab.organized_events)}, ${arr(lab.seminars)}, ${arr(lab.courses)},
  ${arr(lab.external_events)}, ${arr((lab.notable_alumni ?? []).filter((x) => !/^n\/a/i.test(x)))}, ${arr(lab.sdu_alumni_contributors)},
  ${arr(lab.current_partners)}, ${arr(lab.prospective_partners)}, ${arr(lab.grants)}, ${arr(lab.awards)},
  ${arr(lab.orgs_kz)}, ${arr(lab.orgs_global)}, ${arr(lab.events_kz)}, ${arr(lab.events_global)},
  ${arr((lab.photo_files ?? []).map(driveImage))}, ${q(url(lab.photo_archive_link))},
  ${q(lab.visitor_walkthrough)}, ${q(lab.live_demo)}, ${q(lab.demo_stand)})
on conflict (slug) do update set name = excluded.name, ${[
    keepNull('year_founded'), keepArr('founders'), keepText('description'), keepArr('focus'), keepNull('logo_url'), keepNull('website'),
    keepJson('social_links'), keepText('location'), keepArr('completed_projects'), keepArr('ongoing_projects'), keepArr('organized_events'),
    keepArr('seminars'), keepArr('courses'), keepArr('external_events'), keepArr('notable_alumni'), keepArr('alumni_contributors'),
    keepArr('current_partners'), keepArr('prospective_partners'), keepArr('grants'), keepArr('awards'), keepArr('orgs_kz'), keepArr('orgs_global'),
    keepArr('events_kz'), keepArr('events_global'), keepArr('photo_urls'), keepNull('photo_archive_link'), keepNull('visitor_walkthrough'),
    keepNull('live_demo'), keepNull('demo_stand'),
  ].join(',\n  ')};`);

  out.push(`insert into public.lab_internal (lab_id, presenters, goals, required_support, resource_gaps, action_plan_link)
values (${L}, ${arr(lab.presenters)}, ${arr(lab.goals)}, ${arr(lab.required_support)}, ${arr(lab.resource_gaps)}, ${q(url(lab.action_plan_link))})
on conflict (lab_id) do update set
  presenters = case when cardinality(public.lab_internal.presenters) = 0 then excluded.presenters else public.lab_internal.presenters end,
  goals = case when cardinality(public.lab_internal.goals) = 0 then excluded.goals else public.lab_internal.goals end,
  required_support = case when cardinality(public.lab_internal.required_support) = 0 then excluded.required_support else public.lab_internal.required_support end,
  resource_gaps = case when cardinality(public.lab_internal.resource_gaps) = 0 then excluded.resource_gaps else public.lab_internal.resource_gaps end,
  action_plan_link = coalesce(public.lab_internal.action_plan_link, excluded.action_plan_link);`);

  // Team: add people who are not in the team yet (same name in any word order = same person). Nobody is removed.
  const seen = new Set();
  let order = 0;
  const insertMember = (name, title, role, term, contact, email) => {
    out.push(`with m as (insert into public.lab_members (lab_id, full_name, title, role, term, sort_order)
  select ${L}, ${q(name)}, ${q(title)}, '${role}', ${q(term)}, ${order++}
  where not exists (select 1 from public.lab_members x where x.lab_id = ${L} and public.name_key(x.full_name) = public.name_key(${q(name)})${role === 'former_lead' ? " and x.role = 'former_lead'" : " and x.role <> 'former_lead'"})
  returning id)
${contact || email ? `insert into public.lab_member_contacts (member_id, contact, email) select id, ${q(contact)}, ${q(email?.toLowerCase())} from m;` : `insert into public.lab_member_contacts (member_id) select id from m where false;`}`);
  };
  // explicit heads (coordinator's list): names are kept exactly as given
  for (const h of lab.heads ?? []) {
    const key = h.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    insertMember(h.name, h.title ?? null, h.role === 'co_lead' ? 'co_lead' : 'lead', null, null, h.email ?? null);
    // the head's e-mail also goes on a head row added earlier under the same name (links it when they register)
    if (h.email) out.push(`insert into public.lab_member_contacts (member_id, email)
select x.id, ${q(h.email.toLowerCase())} from public.lab_members x
 where x.lab_id = ${L} and x.user_id is null and public.name_key(x.full_name) = public.name_key(${q(h.name)})
   and not exists (select 1 from public.lab_member_contacts c where c.member_id = x.id)
on conflict do nothing;
update public.lab_member_contacts c set email = ${q(h.email.toLowerCase())}
  from public.lab_members x
 where c.member_id = x.id and x.lab_id = ${L} and x.user_id is null and c.email is null and public.name_key(x.full_name) = public.name_key(${q(h.name)});`);
  }
  const add = (raw, role, termFromParens = false) => {
    let term = null;
    let text = raw;
    if (termFromParens) {
      const m = /\(([^)]+)\)\s*$/.exec(raw);
      if (m) { term = m[1]; text = raw.slice(0, m.index); }
    }
    const p = person(text);
    if (!p) return;
    const key = p.name.toLowerCase().split(/\s+/).sort().join(' ');
    if (role !== 'former_lead' && seen.has(key)) return;
    seen.add(key);
    insertMember(p.name, p.title, role, term, p.contact, null);
  };
  for (const h of lab.heads ?? []) seen.add(h.name.toLowerCase().split(/\s+/).sort().join(' '));
  if (lab.lab_lead) add(lab.lab_lead, 'lead');
  if (lab.co_lead) add(lab.co_lead, 'co_lead');
  if (lab.student_lead) add(lab.student_lead, 'student_lead');
  if (lab.deputy_student_lead) add(lab.deputy_student_lead, 'deputy_student_lead');
  for (const t of lab.team_members ?? []) add(t, /research assistant/i.test(t) ? 'research_assistant' : 'member');
  for (const t of lab.previous_leads ?? []) add(t, 'former_lead', true);

  // Lab projects (structured rows) from the form's free-text lists.
  const proj = (title, status) => {
    const year = /\b(20\d\d)\b/.exec(title)?.[1];
    const clean = title.trim();
    if (clean.length < 2) return;
    out.push(`insert into public.projects (lab_id, kind, status, title, year, created_by)
values (${L}, 'research', '${status}', ${q(clean.slice(0, 200))}, ${year ?? 'null'}, null)
on conflict (lab_id, lower(title)) do update set status = excluded.status, year = coalesce(public.projects.year, excluded.year);`);
  };
  for (const t of lab.completed_projects ?? []) proj(t, 'completed');
  for (const t of lab.ongoing_projects ?? []) proj(t, 'ongoing');
  return out.join('\n');
}

function professorSql(p) {
  const out = [];
  const m = p.metrics ?? {};
  const ids = p.external_identifiers ?? {};
  const username = String(p.username ?? p.email?.split('@')[0] ?? slugify(p.full_name)).toLowerCase();
  out.push(`-- ${p.full_name}`);
  out.push(`insert into public.professors (username, first_name, last_name, full_name, job_title, degree, email, photo_url, orcid_url, scopus_id, scholar_url,
  h_index, i10_index, total_citations, total_works, keywords, topics)
values (${q(username)}, ${q(p.first_name ?? '')}, ${q(p.last_name ?? '')}, ${q(p.full_name)}, ${q(p.job_title)}, ${q(p.degree)}, ${q(p.email?.toLowerCase())},
  ${q(url(p.photo_url))}, ${q(url(ids.orcid))}, ${q(ids.scopus)}, ${q(url(ids.google_scholar_search))},
  ${m.h_index ?? 0}, ${m.i10_index ?? 0}, ${m.total_citations ?? 0}, ${m.total_works ?? (p.publications ?? []).length},
  ${arr(p.search_tags?.keywords)}, ${json((p.topics_hierarchy ?? []).map(({ topic_name, subfield, field, domain, works_count }) => ({ topic_name, subfield, field, domain, works_count })))})
on conflict (username) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name,
  job_title = excluded.job_title, degree = excluded.degree, email = excluded.email, photo_url = coalesce(excluded.photo_url, public.professors.photo_url),
  orcid_url = excluded.orcid_url, scopus_id = excluded.scopus_id, scholar_url = excluded.scholar_url, h_index = excluded.h_index,
  i10_index = excluded.i10_index, total_citations = excluded.total_citations, total_works = excluded.total_works,
  keywords = excluded.keywords, topics = excluded.topics, updated_at = now();`);
  const P = `(select id from public.professors where username = ${q(username)})`;
  for (const pub of p.publications ?? []) {
    // match an existing paper by Scopus EID, else DOI, else title (papers found outside Scopus may have neither)
    const key = pub.scopus_eid ? `scopus_eid = ${q(pub.scopus_eid)}` : pub.doi ? `lower(doi) = lower(${q(pub.doi)})` : `lower(title) = lower(${q(pub.title)})`;
    out.push(`insert into public.publications (title, year, type, doi, venue, publisher, citations, is_open_access, url, scopus_eid, keywords)
select ${q(pub.title)}, ${Number.isInteger(pub.publication_year) ? pub.publication_year : 'null'}, ${q(pub.type)}, ${q(pub.doi)}, ${q(pub.journal_venue)},
  ${q(pub.publisher)}, ${pub.citations_count ?? 0}, ${pub.is_open_access ? 'true' : 'false'}, ${q(url(pub.pdf_url) ?? url(pub.doi))}, ${q(pub.scopus_eid)}, ${arr(pub.keywords)}
where not exists (select 1 from public.publications where ${key});
update public.publications set citations = ${pub.citations_count ?? 0}, keywords = ${arr(pub.keywords)} where ${key};
insert into public.publication_authors (publication_id, professor_id)
select id, ${P} from public.publications where ${key} on conflict do nothing;`);
  }
  return out.join('\n');
}

const [labsPath, profsPath] = process.argv.slice(2);
if (!labsPath) {
  console.error('usage: node scripts/build-seed.mjs labs.json [professors.json]');
  process.exit(1);
}
const parts = ['-- Generated by scripts/build-seed.mjs — real data from the lab form and the Scopus export.'];
for (const lab of readLoose(labsPath)) parts.push(labSql(lab));
if (profsPath) for (const p of readLoose(profsPath)) parts.push(professorSql(p));
process.stdout.write(parts.join('\n\n') + '\n');
