// Leader-first lab sections: the labs a user leads come first, then labs they belong to.
// Layout depends on the number of labs: one led lab = a large feature panel, several = cards.

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CircleCheck, Circle, Crown, FlaskConical, Inbox, MapPin, Pencil, Sparkles, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabLogo, leadOf } from '@/components/lab-browser';
import { LAB_POSITION_LABEL, LAB_ROLE_ORDER, labSetupSteps, useLabs, type Lab, type LabRole } from '@/lib/api';
import { useAuth, type LabMembership } from '@/lib/auth';

export type MyLab = { lab: Lab; membership: LabMembership };

/** Labs of the signed-in user, split into led (can manage) and member-only. */
export function useMyLabs() {
  const { caps } = useAuth();
  const labs = useLabs();
  return useMemo(() => {
    const byId = new Map((labs.data ?? []).map((l) => [l.id, l]));
    const mine = caps.labMemberships.map((m) => ({ lab: byId.get(m.id), membership: m })).filter((x): x is MyLab => !!x.lab);
    const led = mine.filter((x) => x.membership.canEdit);
    const member = mine.filter((x) => !x.membership.canEdit);
    return { led, member, ids: mine.map((x) => x.lab.id), isLoading: labs.isLoading, error: labs.error };
  }, [caps.labMemberships, labs.data, labs.isLoading, labs.error]);
}

const position = (role: string) => LAB_POSITION_LABEL[role as LabRole] ?? role;
const activeTeam = (lab: Lab) =>
  lab.lab_members.filter((m) => m.role !== 'former_lead').sort((a, b) => LAB_ROLE_ORDER.indexOf(a.role) - LAB_ROLE_ORDER.indexOf(b.role) || a.sort_order - b.sort_order);

function ManageActions({ lab, size = 'sm' }: { lab: Lab; size?: 'sm' | 'default' }) {
  return (
    <div className="lead-actions">
      <Button asChild size={size}><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Pencil />Edit lab</Link></Button>
      <Button asChild size={size} variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ team: true }}><UserCog />Manage members</Link></Button>
      <Button asChild size={size} variant="outline"><Link to="/manage" search={{ tab: 'inbox' }}><Inbox />Applications</Link></Button>
      <Button asChild size={size} variant="ghost"><Link to="/labs/$slug" params={{ slug: lab.slug }}>Open lab page<ArrowUpRight /></Link></Button>
    </div>
  );
}

/** First access for lab leaders: what is still missing, with a direct path to finish it. */
export function LabSetupCard({ items }: { items: MyLab[] }) {
  const pending = items.filter((x) => !x.lab.setup_completed_at && labSetupSteps(x.lab).some((s) => !s.done));
  if (!pending.length) return null;
  return (
    <div className="dash-stack">
      {pending.map(({ lab, membership }) => {
        const steps = labSetupSteps(lab);
        const done = steps.filter((s) => s.done).length;
        const needsTeam = !steps.find((s) => s.key === 'team')?.done;
        return (
          <section key={lab.id} className="setup-card" aria-label={`Set up ${lab.name}`}>
            <h3><Sparkles size={16} />Finish setting up {lab.name}</h3>
            <p className="small-note">You are {position(membership.role).toLowerCase()} of this lab. Complete the lab profile so students, teachers and partners can find it — {done} of {steps.length} done.</p>
            <div className="setup-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
            <ul className="setup-steps">
              {steps.map((s) => (
                <li key={s.key} className={s.done ? 'done' : 'todo'}>{s.done ? <CircleCheck size={13} /> : <Circle size={13} />}{s.label}</li>
              ))}
            </ul>
            <div className="setup-actions">
              <Button asChild size="sm"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ edit: true }}><Pencil />Complete lab information</Link></Button>
              <Button asChild size="sm" variant={needsTeam ? 'default' : 'outline'}><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ team: true }}><UserCog />Add your team</Link></Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Case A: the user leads exactly one lab. */
function LeadFeature({ item }: { item: MyLab }) {
  const { lab, membership } = item;
  const team = activeTeam(lab);
  return (
    <article className="lead-feature">
      <div className="lead-feature-main">
        <div className="lead-feature-title">
          <LabLogo lab={lab} size={26} />
          <div>
            <span className="role-chip"><Crown size={11} />{position(membership.role)}</span>
            <h3><Link to="/labs/$slug" params={{ slug: lab.slug }}>{lab.name}</Link></h3>
          </div>
        </div>
        <p className="lead-feature-desc">{lab.description || 'No description yet — add one so people know what the lab does.'}</p>
        {(lab.focus.length > 0 || lab.tags.length > 0) && (
          <div className="stack-list">{[...lab.focus, ...lab.tags].slice(0, 10).map((t) => <span key={t}>{t}</span>)}</div>
        )}
        <div className="lead-meta">
          {lab.location && <span><MapPin size={13} />{lab.location}</span>}
          <span><Users size={13} />{team.length} people</span>
          {lab.year_founded && <span>Since {lab.year_founded}</span>}
        </div>
        <ManageActions lab={lab} size="default" />
      </div>
      <aside className="lead-feature-team" aria-label="Team">
        <h4><span>Team</span><span>{team.length}</span></h4>
        {team.length === 0 ? (
          <p className="small-note">No members yet.</p>
        ) : (
          <ul className="mini-team">
            {team.slice(0, 7).map((m) => (
              <li key={m.id}>
                <span className="avatar avatar-sm" aria-hidden>{m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <div><strong>{m.full_name}</strong><small>{position(m.role)}</small></div>
              </li>
            ))}
          </ul>
        )}
        {team.length > 7 && <p className="small-note">+{team.length - 7} more</p>}
        <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }} search={{ team: true }}><UserCog />Manage members</Link></Button>
      </aside>
    </article>
  );
}

/** Case B: the user leads several labs. */
function LeadCard({ item }: { item: MyLab }) {
  const { lab, membership } = item;
  const team = activeTeam(lab);
  const steps = labSetupSteps(lab);
  const missing = steps.filter((s) => !s.done).length;
  return (
    <article className="lead-card">
      <div className="lead-feature-title">
        <LabLogo lab={lab} />
        <div>
          <span className="role-chip"><Crown size={11} />{position(membership.role)}</span>
          <h3><Link to="/labs/$slug" params={{ slug: lab.slug }}>{lab.name}</Link></h3>
        </div>
      </div>
      <p className="lead-feature-desc">{lab.description || 'No description yet.'}</p>
      <div className="lead-meta">
        <span><Users size={13} />{team.length} people</span>
        {lab.location && <span><MapPin size={13} />{lab.location}</span>}
        {missing > 0 && !lab.setup_completed_at && <span className="pill pill-wip">{missing} setup step{missing === 1 ? '' : 's'} left</span>}
      </div>
      <ManageActions lab={lab} />
    </article>
  );
}

/** Case C: a member without management rights. */
function MemberCard({ item }: { item: MyLab }) {
  const { lab, membership } = item;
  const team = activeTeam(lab);
  return (
    <article className="member-card">
      <div className="lead-feature-title">
        <LabLogo lab={lab} />
        <div>
          <span className="role-chip member">{position(membership.role)}</span>
          <h3><Link to="/labs/$slug" params={{ slug: lab.slug }}>{lab.name}</Link></h3>
        </div>
      </div>
      {membership.title && <p className="small-note">{membership.title}</p>}
      <div className="lead-meta">
        <span><Crown size={13} />{leadOf(lab)}</span>
        <span><Users size={13} />{team.length} people</span>
      </div>
      <Button asChild size="sm" variant="outline"><Link to="/labs/$slug" params={{ slug: lab.slug }}>Team & lab page<ArrowUpRight /></Link></Button>
    </article>
  );
}

/** The "My labs" part of the Labs page. Renders nothing for users without memberships. */
export function MyLabsSections() {
  const { led, member } = useMyLabs();
  if (!led.length && !member.length) return null;
  return (
    <>
      {led.length > 0 && (
        <section className="labs-section" aria-labelledby="labs-i-lead">
          <div className="labs-section-head">
            <h2 id="labs-i-lead"><Crown size={18} />{led.length === 1 ? 'Laboratory I lead' : `Laboratories I lead · ${led.length}`}</h2>
            <p>You can edit these labs and manage their teams.</p>
          </div>
          <LabSetupCard items={led} />
          <div className={led.length === 1 ? 'mt-4' : 'lead-grid mt-4'}>
            {led.length === 1 ? <LeadFeature item={led[0]!} /> : led.map((x) => <LeadCard key={x.lab.id} item={x} />)}
          </div>
        </section>
      )}
      {member.length > 0 && (
        <section className="labs-section" aria-labelledby="labs-member">
          <div className="labs-section-head">
            <h2 id="labs-member"><FlaskConical size={18} />{led.length ? 'Other labs I belong to' : 'My labs'}</h2>
            <p>Your position and team in each lab.</p>
          </div>
          <div className="member-grid">{member.map((x) => <MemberCard key={x.lab.id} item={x} />)}</div>
        </section>
      )}
    </>
  );
}
