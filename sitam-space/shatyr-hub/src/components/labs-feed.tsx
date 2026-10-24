// Labs page: search → grid of lab cards (each card is a link) → the chosen lab's full info below the grid.
// Same layout for everyone; management buttons appear only for heads of that lab (and the coordinator).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight, Bot, BookOpen, Boxes, BrainCircuit, ChartColumn, Eye, Globe, HeartPulse, MessagesSquare, Palette, ServerCog, ShieldCheck, Wallet,
  Award, CalendarDays, CalendarPlus, Crown, GraduationCap, Landmark, Trophy, ExternalLink, FlaskConical, Mail, MapPin, Pencil, Plus, Rocket, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabLogo } from '@/components/lab-browser';
import { Chips, List, VisitInfo } from '@/components/lab-page';
import { EventDialog } from '@/components/manage-panels';
import { SearchBar } from '@/components/search-bar';
import { HEAD_ROLES, LAB_POSITION_LABEL, LAB_ROLE_ORDER, eventDate, humanError, useEvents, useLabs, usePeople, useProjects, type Lab } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { gmailCompose } from '@/lib/utils';
import { labProfile, type LabIconKey } from '@/lib/lab-profile';
import { useMyLabs } from '@/lib/my-labs';
import { LabCompetitions } from '@/components/external-events';

const ICONS: Record<LabIconKey, typeof FlaskConical> = {
  chart: ChartColumn, brain: BrainCircuit, globe: Globe, palette: Palette, shield: ShieldCheck, server: ServerCog, bot: Bot,
  wallet: Wallet, heart: HeartPulse, book: BookOpen, boxes: Boxes, flask: FlaskConical, eye: Eye, chat: MessagesSquare,
};


export function LabsFeed({ selected }: { selected?: string | undefined }) {
  const { data, isLoading, error } = useLabs();
  const projects = useProjects();
  const [q, setQ] = useState('');
  const detail = useRef<HTMLDivElement>(null);
  const my = useMyLabs();

  const labs = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (l) =>
        (!term || `${l.name} ${l.tags.join(' ')} ${(l.skills ?? []).join(' ')} ${l.lab_members.map((m) => m.full_name).join(' ')}`.toLowerCase().includes(term)),
    );
    return list;
  }, [data, q, my]);
  const current = (data ?? []).find((l) => l.slug === selected);

  const projectCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects.data ?? []) if (p.lab_id) m.set(p.lab_id, (m.get(p.lab_id) ?? 0) + 1);
    return m;
  }, [projects.data]);
  useEffect(() => {
    if (current) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [current?.id]);

  const mine = labs.filter((l) => my.isMineLab(l.id));
  const others = labs.filter((l) => !my.isMineLab(l.id));

  const card = (l: Lab) => {
    const pr = labProfile(l);
    const Icon = ICONS[pr.icon];
    const n = projectCount.get(l.id) ?? 0;
    return (
      <Link
        key={l.id}
        to="/labs"
        search={{ lab: l.slug }}
        replace
        resetScroll={false}
        className={current?.id === l.id ? 'labcard is-active' : 'labcard'}
        aria-current={current?.id === l.id ? 'true' : undefined}
      >
        <div className="labcard-top">
          <span className={`labcard-icon tone-${pr.tone}`} aria-hidden>
            {l.logo_url ? <LabLogo lab={l} size={20} /> : <Icon size={20} strokeWidth={1.75} />}
          </span>
          {my.isMineLab(l.id) && <span className="labcard-mine">Your lab</span>}
          <span className="labcard-count">{n} {n === 1 ? 'project' : 'projects'}</span>
          <ArrowUpRight className="labcard-arrow" size={18} aria-hidden />
        </div>
        <div className="labcard-bottom">
          <h3>{l.name}</h3>
          <p>{pr.line}</p>
          {pr.tags.length > 0 && <div className="labcard-tags">{pr.tags.map((t) => <span key={t}>{t}</span>)}</div>}
        </div>
      </Link>
    );
  };

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search labs, people, topics" />

      {error && <p className="form-alert">{humanError(error)}</p>}

      {/* Lab heads: their own lab(s) first — one lab gets a wide panel with its tools, several labs a grid. */}
      {mine.length === 1 && <MyLabPanel lab={mine[0]!} projects={projectCount.get(mine[0]!.id) ?? 0} card={card} />}
      {mine.length > 1 && (
        <section className="mylabs" aria-label="Your labs">
          <h2 className="mylabs-title">Your labs · {mine.length}</h2>
          <div className="labcard-grid">
            {mine.map((l) => (
              <div key={l.id} className="mylab-cell">
                {card(l)}
                <HeadTools lab={l} compact />
              </div>
            ))}
          </div>
        </section>
      )}
      {mine.length > 0 && others.length > 0 && <h2 className="mylabs-title mylabs-others">Other laboratories</h2>}

      <div className="labcard-grid" aria-label="Laboratories">
        {isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="labcard skeleton-card" aria-hidden />)}
        {others.map(card)}
      </div>
      {!isLoading && labs.length === 0 && <div className="empty-state"><FlaskConical /><h3>No labs found</h3></div>}

      <div ref={detail}>{current && <LabDetail lab={current} />}</div>
    </>
  );
}

/** The head's tools for one lab: edit info, team (add people, change positions), projects and events. */
function HeadTools({ lab, compact }: { lab: Lab; compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className={compact ? 'head-tools compact' : 'head-tools'}>
      <Button asChild size="sm"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Pencil />Edit info</Link></Button>
      <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ team: true }}><UserCog />Team & positions</Link></Button>
      {!compact && <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Plus />New project</Link></Button>}
      {!compact && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><CalendarPlus />New event</Button>}
      {adding && <EventDialog preset={{ labs: [lab.id], companies: [], projects: [] }} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** A head of exactly one lab: that lab as a wide panel with all tools, above the other labs. */
function MyLabPanel({ lab, projects, card }: { lab: Lab; projects: number; card: (l: Lab) => ReactNode }) {
  const members = lab.lab_members.filter((m) => m.role !== 'former_lead').length;
  return (
    <section className="mylab-one" aria-label="Your lab">
      <div className="mylab-one-card">{card(lab)}</div>
      <div className="mylab-one-side">
        <span className="eyebrow">Your lab</span>
        <p className="mylab-one-stats">{members} {members === 1 ? 'person' : 'people'} in the team · {projects} {projects === 1 ? 'project' : 'projects'}</p>
        <p className="small-note">Fill in the lab information, add students to the team and change their positions.</p>
        <HeadTools lab={lab} />
      </div>
    </section>
  );
}

function LabDetail({ lab }: { lab: Lab }) {
  const { user, caps } = useAuth();
  const isHead = caps.isAdmin || caps.managedLabs.some((m) => m.id === lab.id);
  const [adding, setAdding] = useState(false);
  const projects = useProjects();
  const events = useEvents();
  const team = lab.lab_members
    .filter((m) => m.role !== 'former_lead')
    .sort((a, b) => LAB_ROLE_ORDER.indexOf(a.role) - LAB_ROLE_ORDER.indexOf(b.role) || a.sort_order - b.sort_order);
  const heads = team.filter((m) => HEAD_ROLES.includes(m.role));
  const members = team.filter((m) => !HEAD_ROLES.includes(m.role));
  const people = usePeople(team.map((m) => m.user_id).filter((x): x is string => !!x), !!user);
  const emailOf = new Map((people.data ?? []).map((p) => [p.id, p.email]));
  const labProjects = (projects.data ?? []).filter((p) => p.lab_id === lab.id);
  const labEvents = (events.data ?? [])
    .filter((e) => e.event_hosts.some((h) => h.lab_id === lab.id) && new Date(e.starts_at).getTime() > Date.now() - 3_600_000);

  const person = (m: (typeof team)[number]) => {
    const email = m.user_id ? emailOf.get(m.user_id) : undefined;
    return (
      <li key={m.id}>
        <span className="avatar avatar-sm" aria-hidden>{m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
        <div>
          <strong>{m.user_id && user ? <Link to="/people/$id" params={{ id: m.user_id }}>{m.full_name}</Link> : m.full_name}</strong>
          <small>{LAB_POSITION_LABEL[m.role]}{m.title ? ` · ${m.title}` : ''}</small>
          {email && <a className="person-mail small" href={gmailCompose(email)} target="_blank" rel="noopener noreferrer"><Mail size={11} />{email}</a>}
        </div>
      </li>
    );
  };

  return (
    <section className="lab-detail" aria-label={lab.name}>
      <div className="lab-detail-head">
        <LabLogo lab={lab} size={28} />
        <div>
          <span className="eyebrow">{lab.focus.join(' · ') || 'Laboratory'}</span>
          <h2>{lab.name}</h2>
        </div>
        <div className="lead-actions">
          {isHead && (
            <>
              <Button asChild size="sm"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Pencil />Edit</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ team: true }}><UserCog />Add member</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Plus />New project</Link></Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}><CalendarPlus />New event</Button>
            </>
          )}
          <Button asChild size="sm" variant="ghost"><Link to="/labs/$slug" params={{ slug: lab.slug }}>Full page<ArrowUpRight /></Link></Button>
        </div>
      </div>

      <section className="panel mb-4">
        <p className="lab-text pre-line">{lab.description || 'The lab head has not added a description yet.'}</p>
        <dl className="lab-facts">
          {lab.year_founded && <div><dt>Founded</dt><dd>{lab.year_founded}</dd></div>}
          {lab.founders.length > 0 && <div><dt>Founder{lab.founders.length > 1 ? 's' : ''}</dt><dd>{lab.founders.join(', ')}</dd></div>}
          {lab.location && <div><dt>Location</dt><dd><MapPin size={13} className="inline" /> {lab.location}</dd></div>}
          {lab.website && <div><dt>Website</dt><dd><a href={lab.website} target="_blank" rel="noopener noreferrer">{lab.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></dd></div>}
          {lab.contact_email && <div><dt>Contact</dt><dd><a href={gmailCompose(lab.contact_email)} target="_blank" rel="noopener noreferrer">{lab.contact_email}</a></dd></div>}
        </dl>
        <Chips title="Research areas" items={lab.tags} />
        <Chips title="Skills" items={lab.skills ?? []} />
        {lab.social_links.length > 0 && (
          <div className="social-row mt-2">
            {lab.social_links.map((x) => <Button key={x.url} asChild size="sm" variant="outline"><a href={x.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{x.platform}</a></Button>)}
          </div>
        )}
      </section>

      <div className="lab-detail-grid">
        <section className="panel">
          <h3 className="panel-title"><Crown size={15} />Head</h3>
          {heads.length ? <ul className="team-list">{heads.map(person)}</ul> : <p className="small-note">Not assigned yet.</p>}
          <h3 className="panel-title mt-6"><Users size={15} />Members · {members.length}</h3>
          {members.length ? <ul className="team-list">{members.map(person)}</ul> : <p className="small-note">No members yet.</p>}
        </section>
        <div className="dash-stack">
          <section className="panel">
            <h3 className="panel-title"><Rocket size={15} />Projects · {labProjects.length}</h3>
            {labProjects.length ? (
              <ul className="rows">
                {labProjects.map((p) => (
                  <li key={p.id}><div><strong>{p.title}</strong><small>{p.status === 'ongoing' ? 'Ongoing' : `Completed${p.year ? ` · ${p.year}` : ''}`}</small></div></li>
                ))}
              </ul>
            ) : <p className="small-note">No projects yet.</p>}
          </section>
          <section className="panel">
            <h3 className="panel-title"><CalendarDays size={15} />Events · {labEvents.length}</h3>
            {labEvents.length ? (
              <ul className="rows">
                {labEvents.map((e) => (
                  <li key={e.id}>
                    <div><strong>{e.title}</strong><small>{eventDate(e.starts_at).long} · {eventDate(e.starts_at).time} · Room {e.room}</small></div>
                    <Button asChild size="sm" variant="outline"><Link to="/events/$eventId" params={{ eventId: e.id }}>Open</Link></Button>
                  </li>
                ))}
              </ul>
            ) : <p className="small-note">No upcoming events.</p>}
          </section>
          <section className="panel">
            <h3 className="panel-title"><Trophy size={15} />Competitions & hackathons</h3>
            <LabCompetitions labId={lab.id} />
            <p className="small-note"><Link to="/events">All competitions on the Events page</Link></p>
          </section>
        </div>
      </div>
      <div className="lab-detail-grid mt-4">
        {[lab.courses, lab.seminars, lab.organized_events].some((a) => a.length > 0) && (
          <section className="panel">
            <h3 className="panel-title"><GraduationCap size={15} />Teaching & events</h3>
            <List title="Courses" items={lab.courses} />
            <List title="Seminars & workshops" items={lab.seminars} />
            <List title="Organized events" items={lab.organized_events} />
          </section>
        )}
        {(lab.awards.length > 0 || lab.grants.length > 0 || lab.external_events.length > 0) && (
          <section className="panel">
            <h3 className="panel-title"><Award size={15} />Achievements</h3>
            <List title="Awards" items={lab.awards} />
            <List title="Grants" items={lab.grants} />
            <Chips title="Competitions we take part in" items={lab.external_events} />
          </section>
        )}
        {(lab.current_partners.length > 0 || lab.prospective_partners.length > 0 || lab.notable_alumni.length > 0) && (
          <section className="panel">
            <h3 className="panel-title"><Landmark size={15} />Partners & alumni</h3>
            <List title="Partners" items={lab.current_partners} />
            <List title="Looking to work with" items={lab.prospective_partners} />
            <List title="Notable alumni" items={lab.notable_alumni} />
          </section>
        )}
        {(lab.visitor_walkthrough || lab.live_demo || lab.demo_stand) && (
          <section className="panel">
            <h3 className="panel-title"><MapPin size={15} />Visit the lab</h3>
            <VisitInfo lab={lab} />
          </section>
        )}
      </div>
      {adding && <EventDialog preset={{ labs: [lab.id], companies: [], projects: [] }} onClose={() => setAdding(false)} />}
    </section>
  );
}
