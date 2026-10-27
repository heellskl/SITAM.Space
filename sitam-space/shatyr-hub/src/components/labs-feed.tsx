// Labs page: search + two filters (focus, direction) → compact lab cards. A card opens the lab's own page.
// Heads see their own lab(s) first, with their tools. Rights are checked in the database.

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight, Bot, BookOpen, Boxes, BrainCircuit, ChartColumn, Eye, Globe, HeartPulse, MessagesSquare, Palette, ServerCog, ShieldCheck, Wallet,
  CalendarPlus, FlaskConical, Pencil, Plus, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LabLogo } from '@/components/lab-browser';
import { EventDialog } from '@/components/manage-panels';
import { SearchBar } from '@/components/search-bar';
import { humanError, useLabs, useProjects, type Lab } from '@/lib/api';
import { labProfile, type LabIconKey } from '@/lib/lab-profile';
import { useMyLabs } from '@/lib/my-labs';
import { LAB_DIRECTIONS, LAB_FOCUS } from '@/lib/sitam-data';

const ICONS: Record<LabIconKey, typeof FlaskConical> = {
  chart: ChartColumn, brain: BrainCircuit, globe: Globe, palette: Palette, shield: ShieldCheck, server: ServerCog, bot: Bot,
  wallet: Wallet, heart: HeartPulse, book: BookOpen, boxes: Boxes, flask: FlaskConical, eye: Eye, chat: MessagesSquare,
};

/** One row of filter chips ("All" + options). */
function ChipFilter<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | 'all'; onChange: (v: T | 'all') => void }) {
  return (
    <div className="chip-filter" role="group" aria-label={label}>
      <span className="chip-filter-label">{label}</span>
      {(['all', ...options] as (T | 'all')[]).map((o) => (
        <button key={o} type="button" className={value === o ? 'chip is-on' : 'chip'} aria-pressed={value === o} onClick={() => onChange(o)}>
          {o === 'all' ? 'All' : o}
        </button>
      ))}
    </div>
  );
}

/** kind = 'lab' (laboratories) or 'community' (student communities: same page, same tools). */
export function LabsFeed({ kind = 'lab' }: { kind?: 'lab' | 'community' }) {
  const { data, isLoading, error } = useLabs();
  const projects = useProjects();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState<(typeof LAB_FOCUS)[number] | 'all'>('all');
  const [direction, setDirection] = useState<(typeof LAB_DIRECTIONS)[number] | 'all'>('all');
  const my = useMyLabs();

  const labs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((l) =>
      (l.kind ?? 'lab') === kind
      && (focus === 'all' || l.focus.includes(focus))
      && (direction === 'all' || l.direction === direction)
      && (!term || `${l.name} ${l.tags.join(' ')} ${(l.skills ?? []).join(' ')} ${l.lab_members.map((m) => m.full_name).join(' ')}`.toLowerCase().includes(term)));
  }, [data, q, focus, direction, kind]);

  const projectCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects.data ?? []) if (p.lab_id) m.set(p.lab_id, (m.get(p.lab_id) ?? 0) + 1);
    return m;
  }, [projects.data]);

  const mine = labs.filter((l) => my.isMineLab(l.id));
  const others = labs.filter((l) => !my.isMineLab(l.id));

  const card = (l: Lab) => {
    const pr = labProfile(l);
    const Icon = ICONS[pr.icon];
    const n = projectCount.get(l.id) ?? 0;
    return (
      <Link key={l.id} to="/labs/$slug" params={{ slug: l.slug }} className="labcard">
        <div className="labcard-top">
          <span className={`labcard-icon tone-${pr.tone}`} aria-hidden>
            {l.logo_url ? <LabLogo lab={l} size={18} /> : <Icon size={18} strokeWidth={1.75} />}
          </span>
          {my.isMineLab(l.id) && <span className="labcard-mine">Your lab</span>}
          <span className="labcard-count">{n} {n === 1 ? 'project' : 'projects'}</span>
          <ArrowUpRight className="labcard-arrow" size={16} aria-hidden />
        </div>
        <div className="labcard-bottom">
          <h3>{l.name}</h3>
          <p title={pr.line}>{pr.line}</p>
          {pr.tags.length > 0 && <div className="labcard-tags">{pr.tags.map((t) => <span key={t}>{t}</span>)}</div>}
        </div>
      </Link>
    );
  };

  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder={kind === 'community' ? 'Search communities, people, topics' : 'Search labs, people, topics'} />
      {kind === 'lab' && (
        <div className="lab-filters">
          <ChipFilter label="Focus" options={LAB_FOCUS} value={focus} onChange={setFocus} />
          <ChipFilter label="Direction" options={LAB_DIRECTIONS} value={direction} onChange={setDirection} />
        </div>
      )}

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
      {/* no "Other laboratories" heading: the rest of the list simply follows */}

      <div className={mine.length ? 'labcard-grid mylabs-rest' : 'labcard-grid'} aria-label={kind === 'community' ? 'Communities' : 'Laboratories'}>
        {isLoading && Array.from({ length: 8 }, (_, i) => <div key={i} className="labcard skeleton-card" aria-hidden />)}
        {others.map(card)}
      </div>
      {!isLoading && labs.length === 0 && <div className="empty-state"><FlaskConical /><h3>{kind === 'community' ? 'No communities found' : 'No labs match these filters'}</h3></div>}
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
