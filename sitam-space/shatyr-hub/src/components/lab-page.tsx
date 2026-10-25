import { useMemo, useState, type ReactNode } from 'react';
import { gmailCompose } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft, ArrowUpRight, Award, Bookmark, BookmarkCheck, BriefcaseBusiness, CalendarDays, Crown, ExternalLink, FlaskConical, History,
  CalendarPlus, GraduationCap, Inbox, Landmark, Lock, Mail, MapPin, Pencil, Plus, Rocket, Trophy, UserCog, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabLogo, useSavedLabs } from '@/components/lab-browser';
import { ProjectCard } from '@/components/projects-showcase';
import { EventDialog, ListingDialog } from '@/components/manage-panels';
import {
  CATEGORY_LABEL, HEAD_ROLES, LAB_POSITION_LABEL, useExternalEvents, LAB_ROLE_LABEL, LAB_ROLE_ORDER, eventDate, opportunityLabel, useEvents, useInbox, useLabInternal, useOpportunities, usePeople, useProjects,
  type Lab, type LabRole,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LabCompetitions } from '@/components/external-events';

const TEAM_ORDER: LabRole[] = LAB_ROLE_ORDER.filter((r) => r !== 'former_lead');

function Section({ title, icon: Icon, children, show = true }: { title: string; icon: typeof Users; children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <section className="panel lab-section">
      <h3 className="panel-title"><Icon size={15} />{title}</h3>
      {children}
    </section>
  );
}

export function Text({ text }: { text: string | null | undefined }) {
  return text ? <p className="lab-text">{text}</p> : null;
}

export function List({ items, title }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (
    <>
      {title && <h4 className="sub-title">{title}</h4>}
      <ul className="dot-list">{items.map((s) => <li key={s}>{s}</li>)}</ul>
    </>
  );
}

export function Chips({ items, title }: { items: string[]; title?: string }) {
  if (!items.length) return null;
  return (
    <>
      {title && <h4 className="sub-title">{title}</h4>}
      <div className="stack-list">{items.map((s) => <span key={s}>{s}</span>)}</div>
    </>
  );
}

/** Free-text answers as separate cards (one card per item). */
export function Cards({ items, title }: { items: string[]; title?: string | undefined }) {
  if (!items.length) return null;
  return (
    <>
      {title && <h4 className="sub-title">{title}</h4>}
      <ul className="item-cards">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </>
  );
}

/** "a, b; c\nd" → ['a', 'b', 'c', 'd'] — for answers kept as one text field (equipment). */
export const splitItems = (text: string | null | undefined) =>
  (text ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export function LabPage({ lab, onEdit, onTeam }: { lab: Lab; onEdit: () => void; onTeam: () => void }) {
  const { user, caps } = useAuth();
  const isManager = caps.isAdmin || caps.managedLabs.some((m) => m.id === lab.id);
  const mine = caps.labMemberships.find((m) => m.id === lab.id);
  // E-mails of members with an account (visible to signed-in users) — click to write to them.
  const people = usePeople(lab.lab_members.map((m) => m.user_id).filter((x): x is string => !!x), !!user);
  const emailOf = new Map((people.data ?? []).map((p) => [p.id, p.email]));
  const [adding, setAdding] = useState<'event' | 'opportunity' | null>(null);
  const internal = useLabInternal(lab.id, isManager || caps.isStaff);
  const inbox = useInbox(isManager);
  const { data: projectsData } = useProjects();
  const { data: opps } = useOpportunities();
  const { data: eventsData } = useEvents();
  const { saved, toggle } = useSavedLabs();
  const ext = useExternalEvents();
  const competitions = (ext.data ?? []).filter((e) => e.external_event_labs.some((x) => x.lab_id === lab.id)).length;

  const projects = (projectsData ?? []).filter((p) => p.lab_id === lab.id);
  const cases = (opps ?? []).filter((o) => o.opportunity_hosts.some((h) => h.lab_id === lab.id || (h.project_id && projects.some((p) => p.id === h.project_id))));
  const events = (eventsData ?? []).filter((e) => e.event_hosts.some((h) => h.lab_id === lab.id));
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() > Date.now());
  const pending = (inbox.data ?? []).filter((a) => a.status === 'submitted' && cases.some((c) => c.id === a.opportunity_id)).length;

  // current team by position (heads first); past members (and former heads) go to their own block
  const team = useMemo(
    () => TEAM_ORDER.map((role) => ({ role, people: lab.lab_members.filter((m) => m.role === role && !m.is_past).sort((a, b) => a.sort_order - b.sort_order) })).filter((g) => g.people.length),
    [lab.lab_members],
  );
  const past = lab.lab_members.filter((m) => m.role === 'former_lead' || m.is_past).sort((a, b) => (b.graduation_year ?? 0) - (a.graduation_year ?? 0) || a.sort_order - b.sort_order);

  return (
    <main className="container content-page lab-page">
      <Link to="/labs" className="back-link"><ArrowLeft size={14} />All labs</Link>

      <header className="lab-hero">
        <LabLogo lab={lab} size={32} />
        <div className="lab-hero-text">
          <span className="eyebrow">{lab.location ? `${lab.location} · ` : ''}{lab.year_founded ? `Since ${lab.year_founded}` : 'Laboratory'}</span>
          <h1>{lab.name}</h1>
          <div className="lab-hero-meta">
            {mine && <span className={mine.canEdit ? 'role-chip' : 'role-chip member'}>{mine.canEdit ? 'You manage this lab' : 'Your lab'} · {LAB_POSITION_LABEL[mine.role as LabRole] ?? mine.role}</span>}
            {lab.focus.map((f) => <span key={f} className="pill pill-done">{f}</span>)}
          </div>
        </div>
        <div className="lab-hero-actions">
          {cases.length > 0 && <Button asChild><a href="#cases">Open cases · {cases.length}<ArrowUpRight /></a></Button>}
          {user && (
            <Button variant="outline" onClick={() => toggle(lab)}>
              {saved.includes(lab.id) ? <><BookmarkCheck />Saved</> : <><Bookmark />Save lab</>}
            </Button>
          )}
          {isManager && (
            <>
              <Button variant="outline" onClick={onEdit}><Pencil />Edit lab</Button>
              <Button variant="outline" onClick={onTeam}><UserCog />Manage members</Button>
              <Button asChild variant="secondary"><Link to="/manage" search={{ tab: 'inbox' }}><Inbox />Applications{pending ? ` · ${pending} new` : ''}</Link></Button>
            </>
          )}
        </div>
        {isManager && (
          <div className="lab-publish" role="group" aria-label="Publish from this lab">
            <span className="small-note">Publish from {lab.name} — it appears in the shared sections automatically:</span>
            <Button size="sm" onClick={() => setAdding('event')}><CalendarPlus />Event → Events</Button>
            <Button size="sm" onClick={() => setAdding('opportunity')}><Plus />Vacancy / case → Opportunities</Button>
            <Button size="sm" onClick={onEdit}><Rocket />Project → Projects</Button>
          </div>
        )}
      </header>
      {adding === 'event' && <EventDialog preset={{ labs: [lab.id], companies: [], projects: [] }} onClose={() => setAdding(null)} />}
      {adding === 'opportunity' && <ListingDialog opp={null} defaultCategory="lab" preset={{ labs: [lab.id], companies: [], projects: [] }} onClose={() => setAdding(null)} />}

      <div className="lab-layout">
        <div className="lab-main">
          <Section title="About" icon={FlaskConical}>
            <Text text={lab.description || 'The lab head has not added a description yet.'} />
            <dl className="lab-facts">
              {lab.founders.length > 0 && <div><dt>Founder{lab.founders.length > 1 ? 's' : ''}</dt><dd>{lab.founders.join(', ')}</dd></div>}
              {lab.year_founded && <div><dt>Founded</dt><dd>{lab.year_founded}</dd></div>}
              {lab.location && <div><dt>Location</dt><dd><MapPin size={13} />{lab.location}</dd></div>}
              {lab.direction && <div><dt>Direction</dt><dd>{lab.direction}</dd></div>}
              {lab.website && <div><dt>Website</dt><dd><a href={lab.website} target="_blank" rel="noopener noreferrer">{lab.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></dd></div>}
              {lab.contact_email && <div><dt>Contact</dt><dd><a href={gmailCompose(lab.contact_email)} target="_blank" rel="noopener noreferrer"><Mail size={13} className="inline" /> {lab.contact_email}</a></dd></div>}
            </dl>
            <Chips title="Research areas" items={lab.tags} />
            <Chips title="Equipment" items={splitItems(lab.equipment)} />
            <Chips title="Skills" items={lab.skills ?? []} />
            {lab.social_links.length > 0 && (
              <div className="social-row">
                {lab.social_links.map((x) => <Button key={x.url} asChild size="sm" variant="outline"><a href={x.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{x.platform}</a></Button>)}
              </div>
            )}
          </Section>

          <Section title="Projects" icon={Rocket} show={projects.length > 0}>
            <div className="project-grid two">
              {projects.map((p) => <ProjectCard key={p.id} p={p} />)}
            </div>
          </Section>

          <section className="panel lab-section" id="cases" hidden={cases.length === 0}>
            <h3 className="panel-title"><BriefcaseBusiness size={15} />Open cases</h3>
            <ul className="rows">
              {cases.map((o) => (
                <li key={o.id}>
                  <div><strong>{o.title}</strong><small>{opportunityLabel(o)}{o.deadline ? ` · until ${eventDate(o.deadline).short}` : ''}</small></div>
                  <Button asChild size="sm"><Link to="/opportunities" search={{ tab: o.category, open: o.id }}>Apply<ArrowUpRight /></Link></Button>
                </li>
              ))}
            </ul>
            <p className="small-note mt-2">{CATEGORY_LABEL.lab}s and {CATEGORY_LABEL.research.toLowerCase()}s are how students join the lab.</p>
          </section>

          <Section title="Upcoming activities" icon={CalendarDays} show={upcoming.length > 0 || (lab.upcoming_activities ?? []).length > 0}>
            {upcoming.length > 0 && (
              <ul className="rows">{upcoming.map((e) => <li key={e.id}><div><strong>{e.title}</strong><small>{eventDate(e.starts_at).long} · {eventDate(e.starts_at).time} · Room {e.room}</small></div><Button asChild size="sm" variant="outline"><Link to="/events/$eventId" params={{ eventId: e.id }}>Details</Link></Button></li>)}</ul>
            )}
            <Cards items={lab.upcoming_activities ?? []} />
          </Section>

          <Section title="Achievements" icon={Award} show={lab.awards.length > 0 || lab.grants.length > 0}>
            <Cards title="Awards & competition wins" items={lab.awards} />
            <Cards title="Grants" items={lab.grants} />
          </Section>

          <Section title="Teaching & events" icon={GraduationCap} show={[lab.seminars, lab.courses, lab.organized_events].some((a) => a.length)}>
            <Cards title="Seminars & workshops" items={lab.seminars} />
            <Cards title="Courses" items={lab.courses} />
            <Cards title="Organized events" items={lab.organized_events} />
          </Section>

          <Section title="External activities you took part in" icon={Trophy} show={lab.external_events.length > 0 || competitions > 0}>
            <LabCompetitions labId={lab.id} />
            <Cards title={competitions > 0 ? 'Also' : undefined} items={lab.external_events} />
          </Section>

          <Section title="Community & conferences" icon={Landmark}
            show={[lab.orgs_kz, lab.orgs_global, lab.events_kz, lab.events_global].some((a) => a.length > 0)}>
            <Cards title="Organizations in Kazakhstan" items={lab.orgs_kz} />
            <Cards title="International organizations" items={lab.orgs_global} />
            <Cards title="Events in Kazakhstan" items={lab.events_kz} />
            <Cards title="International events" items={lab.events_global} />
          </Section>

          <Section title="Photos" icon={CalendarDays} show={lab.photo_urls.length > 0 || !!lab.photo_archive_link}>
            {lab.photo_urls.length > 0 && (
              <div className="lab-gallery">{lab.photo_urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`${lab.name} activity`} loading="lazy" referrerPolicy="no-referrer" /></a>)}</div>
            )}
            {lab.photo_archive_link && <Button asChild variant="outline" size="sm" className="mt-3"><a href={lab.photo_archive_link} target="_blank" rel="noopener noreferrer"><ExternalLink />Photo archive</a></Button>}
          </Section>

          {(isManager || caps.isStaff) && (
            <Section title="Internal — lab heads & SITAM staff only" icon={Lock}>
              {!internal.data ? <p className="small-note">Nothing filled in yet.</p> : (
                <>
                  <Cards title="Goals for the coming year" items={internal.data.goals} />
                  <Cards title="Support needed from SDU / SITAM" items={internal.data.required_support} />
                  <Cards title="Equipment & resource gaps" items={internal.data.resource_gaps} />
                  <Cards title="Guest presenters" items={internal.data.presenters} />
                  {internal.data.action_plan_link && <Button asChild size="sm" variant="outline" className="mt-3"><a href={internal.data.action_plan_link} target="_blank" rel="noopener noreferrer"><ExternalLink />Academic Year Plan</a></Button>}
                </>
              )}
            </Section>
          )}
        </div>

        <aside className="lab-aside">
          <Section title="Team" icon={Users}>
            {team.map((g) => (
              <div key={g.role} className={HEAD_ROLES.includes(g.role) ? 'team-group is-heads' : 'team-group'}>
                <h4 className="sub-title">{HEAD_ROLES.includes(g.role) ? <><Crown size={12} className="inline" /> {LAB_ROLE_LABEL[g.role]}</> : LAB_ROLE_LABEL[g.role]}</h4>
                <ul className="team-list">
                  {g.people.map((m) => (
                    <li key={m.id}>
                      <span className="avatar avatar-sm" aria-hidden>{m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                      <div>
                        <strong>{m.user_id && user ? <Link to="/people/$id" params={{ id: m.user_id }}>{m.full_name}</Link> : m.full_name}</strong>
                        {m.title && <small>{m.title}</small>}
                        {m.user_id && emailOf.get(m.user_id) && <a className="person-mail small" href={gmailCompose(emailOf.get(m.user_id) ?? "")} target="_blank" rel="noopener noreferrer"><Mail size={11} />{emailOf.get(m.user_id)}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Past team" icon={History} show={past.length > 0}>
            <ul className="past-team">
              {past.map((m) => (
                <li key={m.id}>
                  <span>{m.full_name}</span>
                  <small>
                    {m.role === 'former_lead' ? `Former head${m.term ? ` · ${m.term}` : ''}` : LAB_POSITION_LABEL[m.role]}
                    {m.graduation_year ? ` · Class of ${m.graduation_year}` : ''}
                  </small>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Partners" icon={Landmark} show={lab.current_partners.length > 0}>
            <Cards items={lab.current_partners} />
          </Section>

          <Section title="Alumni" icon={GraduationCap} show={lab.notable_alumni.length > 0 || lab.alumni_contributors.length > 0}>
            <Cards title="Notable alumni" items={lab.notable_alumni} />
            <Cards title="Alumni who can help" items={lab.alumni_contributors} />
          </Section>

          <p className="small-note">Updated {new Date(lab.updated_at).toLocaleDateString('en-GB')}</p>
        </aside>
      </div>
    </main>
  );
}
