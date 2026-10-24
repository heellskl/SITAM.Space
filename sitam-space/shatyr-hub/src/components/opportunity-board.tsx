import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Building2, CheckCircle2, Clock3, FlaskConical, MapPin, Microscope, Search, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { ApplyDialog } from '@/components/apply-dialog';
import { formatDate, humanError, opportunityLabel, useMyApplications, useOpportunities, type Host, type IndustrialType, type Opportunity, type OpportunityCategory } from '@/lib/api';
import { mineFirst, useMyLabs } from '@/lib/my-labs';
import { useAuth } from '@/lib/auth';

export type OppTab = 'all' | OpportunityCategory;

const TABS: { value: OppTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'industrial', label: 'Industrial Cases' },
  { value: 'lab', label: 'Lab Cases' },
  { value: 'research', label: 'Research Cases' },
];
const SUB: { value: 'all' | IndustrialType; label: string }[] = [
  { value: 'all', label: 'All industrial' },
  { value: 'vacancy', label: 'Vacancies' },
  { value: 'internship', label: 'Internships' },
  { value: 'project', label: 'Projects' },
];
const ICONS: Record<OpportunityCategory, LucideIcon> = { industrial: Building2, lab: FlaskConical, research: Microscope };
const FORMAT: Record<string, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };

const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(`${iso}T23:59:59+05:00`).getTime() - Date.now()) / 86_400_000) : null);

function HostLinks({ hosts }: { hosts: Host[] }) {
  return (
    <p className="opp-org">
      {hosts.map((h, i) => (
        <span key={h.id}>
          {i > 0 && ' · '}
          {h.labs ? <Link to="/labs/$slug" params={{ slug: h.labs.slug }}>{h.labs.name}</Link>
            : h.companies ? h.companies.name
            : h.person_name ? (h.person_username ? <Link to="/research/$username" params={{ username: h.person_username }}>Prof. {h.person_name}</Link> : `Prof. ${h.person_name}`)
            : h.projects?.title}
        </span>
      ))}
    </p>
  );
}

export function OpportunityBoard({ initialTab = 'all', openId }: { initialTab?: OppTab; openId?: string | undefined }) {
  const [tab, setTab] = useState<OppTab>(initialTab);
  const [sub, setSub] = useState<'all' | IndustrialType>('all');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Opportunity | null>(null);
  const { user, caps } = useAuth();
  // Professors, partners and admins see listings but cannot apply (only students and PhD students can).
  const hideApply = !!user && !caps.canApply;
  const { data, isLoading, error } = useOpportunities();
  const mine = useMyApplications(user?.id);
  const my = useMyLabs();

  useEffect(() => {
    if (!openId || !data) return;
    const o = data.find((x) => x.id === openId);
    if (o && !hideApply) setTarget(o);
  }, [openId, data, hideApply]);

  const count = (t: OppTab) => (data ?? []).filter((o) => t === 'all' || o.category === t).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data ?? []).filter(
      (o) =>
        (tab === 'all' || o.category === tab) &&
        (tab !== 'industrial' || sub === 'all' || o.industrial_type === sub) &&
        `${o.title} ${o.description} ${o.tags.join(' ')} ${o.opportunity_hosts.map((h) => h.labs?.name ?? h.companies?.name ?? h.projects?.title ?? h.person_name).join(' ')}`.toLowerCase().includes(q),
    );
    return mineFirst(list, (o) => o.opportunity_hosts.some((h) => my.isMineLab(h.lab_id))); // the head's own lab cases first
  }, [data, tab, sub, query, my]);

  return (
    <>
      <SearchBar value={query} onChange={setQuery} placeholder="Search role, lab, company, tech" />
      <div className="lab-controls">
        <div className="filter-list" role="tablist" aria-label="Opportunity category">
          {TABS.map((t) => (
            <Button key={t.value} role="tab" aria-selected={tab === t.value} variant="ghost" className={tab === t.value ? 'filter active' : 'filter'} onClick={() => { setTab(t.value); setSub('all'); }}>
              {t.label}<span className="count-badge">{count(t.value)}</span>
            </Button>
          ))}
        </div>
      </div>
      {tab === 'industrial' && (
        <div className="filter-list sub-filters mb-4" aria-label="Industrial type">
          {SUB.map((s) => (
            <Button key={s.value} variant="ghost" size="sm" className={sub === s.value ? 'filter active' : 'filter'} onClick={() => setSub(s.value)}>{s.label}</Button>
          ))}
        </div>
      )}

      {error && <p className="form-alert">{humanError(error)}</p>}

      <div className="opp-grid">
        {isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="opp-card skeleton-card" aria-hidden />)}
        {shown.map((o) => {
          const Icon = ICONS[o.category];
          const left = daysLeft(o.deadline);
          const applied = (mine.data ?? []).some((a) => a.opportunity_id === o.id && a.status !== 'withdrawn');
          return (
            <article key={o.id} className="opp-card">
              <div className="opp-head">
                <span className={`lab-icon ${o.category === 'industrial' ? 'gold' : 'blue'}`}><Icon size={20} /></span>
                <span className="opp-type">{opportunityLabel(o)}</span>
              </div>
              <HostLinks hosts={o.opportunity_hosts} />
              <h3>{o.title}</h3>
              <p className="opp-desc">{o.description}</p>
              {o.tags.length > 0 && <div className="stack-list">{o.tags.map((t) => <span key={t}>{t}</span>)}</div>}
              {o.requirements.length > 0 && <ul className="opp-req">{o.requirements.map((r) => <li key={r}>{r}</li>)}</ul>}
              <div className="opp-meta">
                {o.duration && <span><Clock3 size={13} />{o.duration}</span>}
                <span><Wallet size={13} />{o.compensation ?? (o.paid ? 'Paid' : 'Unpaid / credit')}</span>
                {o.work_format && <span><MapPin size={13} />{FORMAT[o.work_format]}</span>}
                {left !== null && (
                  <span className={left <= 7 ? 'deadline soon' : 'deadline'}>{left < 0 ? 'Closed' : `Until ${formatDate(o.deadline ?? '', { day: 'numeric', month: 'short' })} · ${left}d`}</span>
                )}
              </div>
              {hideApply ? (
                <p className="apply-note">{o.created_by === user?.id || o.opportunity_hosts.some((h) => h.person_id === user?.id) ? 'Your listing — applicants are in Manage → Applications.' : 'Only students can apply.'}</p>
              ) : (
                <Button onClick={() => setTarget(o)} disabled={left !== null && left < 0} variant={applied ? 'secondary' : 'default'}>
                  {applied ? <><CheckCircle2 />Applied</> : <>Apply with CV<ArrowUpRight /></>}
                </Button>
              )}
            </article>
          );
        })}
      </div>

      {!isLoading && shown.length === 0 && (
        <div className="empty-state">
          <Search />
          <h3>Nothing here yet</h3>
          <p>Try another tab or keyword.</p>
        </div>
      )}

      <ApplyDialog opp={target} onClose={() => setTarget(null)} />
    </>
  );
}
