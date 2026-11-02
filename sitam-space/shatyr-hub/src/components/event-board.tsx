import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, History, LayoutGrid, MapPin, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EXTERNAL_KIND_LABEL, eventDate, externalDates, hostNames, humanError, isUpcomingExternal, ticketUrl, useEvents, useExternalEvents, type ExternalEvent, type Host, type Registration, type SitamEvent } from '@/lib/api';
import { mineFirst, useMyLabs } from '@/lib/my-labs';
import { type Capabilities } from '@/lib/auth';
import { EVENT_META } from '@/lib/sitam-data';
import { ExternalEventSheet } from '@/components/external-events';

/** Mirrors can_manage_event() in the database (for showing buttons only; the DB decides). */
export function canManageEvent(e: Pick<SitamEvent, 'organizer_id' | 'event_hosts'>, userId: string | undefined, caps: Capabilities) {
  // Events are managed by heads of a hosting lab and by the coordinator (database: can_manage_event).
  void userId;
  if (caps.isAdmin) return true;
  return e.event_hosts.some((h) => !!h.lab_id && caps.managedLabs.some((m) => m.id === h.lab_id));
}

export function HostPills({ hosts }: { hosts: Host[] }) {
  if (!hosts.length) return null;
  return (
    <p className="event-links">
      {hosts.map((h) =>
        h.labs ? <Link key={h.id} to="/labs/$slug" params={{ slug: h.labs.slug }} className="pill pill-live">{h.labs.name}</Link>
        : h.companies ? <span key={h.id} className="pill pill-gold">{h.companies.name}</span>
        : h.projects ? <Link key={h.id} to="/labs" search={{ tab: 'projects' }} className="pill pill-done">{h.projects.title}</Link> : null,
      )}
    </p>
  );
}

/** E-ticket, boarding-pass style: details on the left, QR stub on the right (stacks on phones). */
export function TicketBadge({ event, reg, holder }: { event: Pick<SitamEvent, 'kind' | 'title' | 'starts_at' | 'room'>; reg: Registration; holder?: string | undefined }) {
  const d = eventDate(event.starts_at);
  const checked = reg.status === 'checked_in';
  return (
    <div className={`eticket eticket-${event.kind}${checked ? ' is-used' : ''}`}>
      <div className="eticket-main">
        <div className="eticket-brand">
          <img src="/sitam-emblem.png" alt="" width={18} height={22} />
          <span>SITAM SPACE</span>
          <span className="eticket-kind">{EVENT_META[event.kind].label}</span>
        </div>
        <strong className="eticket-title">{event.title}</strong>
        <dl className="eticket-grid">
          <div><dt>Date</dt><dd>{d.day} {d.month}</dd></div>
          <div><dt>Time</dt><dd>{d.time}</dd></div>
          <div><dt>Room</dt><dd>{event.room}</dd></div>
          {holder && <div className="span-3"><dt>Guest</dt><dd>{holder}</dd></div>}
        </dl>
        {checked && (
          <p className="eticket-status">
            {`✓ Checked in${reg.checked_in_at ? ` at ${new Date(reg.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          </p>
        )}
      </div>
      <div className="eticket-stub">
        <div className="eticket-qr">
          <QRCodeSVG value={ticketUrl(reg.ticket_code)} size={132} bgColor="#ffffff" fgColor="#0A1930" level="M" title={`QR ticket ${reg.ticket_code}`} />
        </div>
        <code>{reg.ticket_code.toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')}</code>
        <span className="eticket-admit">{checked ? 'Admitted' : 'Admit one'}</span>
      </div>
    </div>
  );
}

/* ═════════════ v11/v12 feed: SDU events + external events, filters, list or calendar, posters ═════════════ */

export type FeedType = 'industry' | 'research' | 'competitions';
type FeedLocation = 'sdu' | 'outside' | 'online';
type FeedOrganizer = 'sdu' | 'external' | 'cohosted';
type FeedItem = {
  key: string;
  type: FeedType;
  location: FeedLocation;
  organizer: FeedOrganizer;
  title: string;
  host: string;
  start: Date | null;            // null = only the year is known
  end: Date | null;
  year: number | null;
  upcoming: boolean;
  poster: string | null;
  meta: string;                  // second line under the title
  sdu?: SitamEvent;
  external?: ExternalEvent;
};
const TYPE_LABEL: Record<FeedType, string> = { industry: 'Industry', research: 'Research', competitions: 'Competitions' };
const LOCATION_LABEL: Record<FeedLocation, string> = { sdu: 'At SDU', outside: 'Outside SDU', online: 'Online' };
const ORGANIZER_LABEL: Record<FeedOrganizer, string> = { sdu: 'SDU', external: 'External', cohosted: 'Co-hosted' };
const ONLINE = /(^|\W)(online|zoom|google meet|meet\.google|teams|remote|webinar)(\W|$)/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function toFeed(events: SitamEvent[], external: ExternalEvent[], now: number): FeedItem[] {
  const sdu = events.map((e): FeedItem => {
    const start = new Date(e.starts_at);
    return {
      key: `sdu-${e.id}`, type: e.kind === 'industrial' ? 'industry' : 'research', title: e.title,
      location: ONLINE.test(e.room ?? '') ? 'online' : 'sdu',
      // an SDU event with a company among its hosts is co-hosted
      organizer: e.event_hosts.some((h) => !!h.company_id) ? 'cohosted' : 'sdu',
      host: hostNames(e.event_hosts) || 'SITAM', start, end: null, year: start.getFullYear(), upcoming: start.getTime() > now - 3_600_000,
      poster: e.poster_url ?? null, meta: `${eventDate(e.starts_at).short} · ${eventDate(e.starts_at).time} · Room ${e.room}${e.speaker ? ` · ${e.speaker}` : ''}`, sdu: e,
    };
  });
  const ext = external.map((x): FeedItem => {
    const start = x.starts_on ? new Date(`${x.starts_on}T09:00:00`) : null;
    return {
      key: `ext-${x.id}`, type: x.kind === 'conference' ? 'research' : x.kind === 'other' ? 'industry' : 'competitions', title: x.title,
      location: x.location_type ?? (ONLINE.test(x.location ?? '') ? 'online' : 'outside'),
      organizer: x.cohosted ? 'cohosted' : 'external',
      host: x.organizer ?? EXTERNAL_KIND_LABEL[x.kind], start, end: x.ends_on ? new Date(`${x.ends_on}T18:00:00`) : null, year: x.year,
      upcoming: isUpcomingExternal(x), poster: x.poster_url ?? null,
      meta: `${externalDates(x)}${x.location ? ` · ${x.location}` : ''}`, external: x,
    };
  });
  return [...sdu, ...ext];
}

/** Poster card in the spirit of SDU Life: a picture (or a designed cover), host chip, title, categories. */
function PosterCard({ item, onOpen }: { item: FeedItem; onOpen: (i: FeedItem) => void }) {
  const results = item.external?.external_event_labs.filter((x) => x.result) ?? [];
  const cover = (
    <div className={`poster poster-${item.type}`}>
      {item.poster ? <img src={item.poster} alt="" loading="lazy" referrerPolicy="no-referrer" /> : (
        <div className="poster-cover" aria-hidden>
          <span className="poster-cover-type">{TYPE_LABEL[item.type]}</span>
          <strong className="poster-cover-title">{item.title}</strong>
          <span className="poster-cover-date">
            {item.start ? <><b>{item.start.getDate()}</b>{MONTHS[item.start.getMonth()]} {item.start.getFullYear()}</> : <b>{item.year ?? '—'}</b>}
          </span>
        </div>
      )}
      <span className="poster-chip">{item.host}</span>
      {results.length > 0 && <span className="poster-win"><Trophy size={12} />{results[0]!.result}</span>}
    </div>
  );
  const body = (
    <>
      {cover}
      <h3 className="poster-title">{item.title}</h3>
      <p className="poster-tags"><span className={`ev-tag ev-${item.type}`}>{TYPE_LABEL[item.type]}</span></p>
    </>
  );
  return item.sdu ? (
    <Link to="/events/$eventId" params={{ eventId: item.sdu.id }} className="poster-card">{body}</Link>
  ) : (
    <button type="button" className="poster-card" onClick={() => onOpen(item)}>{body}</button>
  );
}

/** Month grid (Mon–Sun). Days with events list them; a click opens the event. */
function CalendarView({ items, onOpen }: { items: FeedItem[]; onOpen: (i: FeedItem) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = useMemo(() => {
    const m = new Map<string, FeedItem[]>();
    for (const it of items) {
      if (!it.start) continue;
      const last = it.end && it.end > it.start ? it.end : it.start;
      for (let d = new Date(it.start.getFullYear(), it.start.getMonth(), it.start.getDate()), n = 0; d <= last && n < 14; d.setDate(d.getDate() + 1), n++) {
        const k = dayKey(d);
        m.set(k, [...(m.get(k) ?? []), it]);
      }
    }
    return m;
  }, [items]);
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1);
  const today = dayKey(new Date());
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const go = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  return (
    <div className="ev-cal">
      <div className="ev-cal-head">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft /></Button>
        <strong>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => go(1)}><ChevronRight /></Button>
        <Button variant="outline" size="sm" onClick={() => setMonth(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })}>Today</Button>
      </div>
      <div className="ev-cal-grid" role="grid" aria-label="Events calendar">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="ev-cal-dow" role="columnheader">{d}</span>)}
        {cells.map((n, i) => {
          if (n < 1 || n > days) return <span key={i} className="ev-cal-cell is-out" aria-hidden />;
          const date = new Date(month.getFullYear(), month.getMonth(), n);
          const list = byDay.get(dayKey(date)) ?? [];
          return (
            <div key={i} className={`ev-cal-cell${dayKey(date) === today ? ' is-today' : date.getTime() < todayStart ? ' is-past-day' : ''}`} role="gridcell" aria-current={dayKey(date) === today ? 'date' : undefined} aria-label={`${n} ${month.toLocaleDateString('en-GB', { month: 'long' })}${dayKey(date) === today ? ' (today)' : ''}: ${list.length} events`}>
              <span className="ev-cal-day">{n}</span>
              {list.slice(0, 3).map((it) => (
                <button key={it.key} type="button" className={`ev-cal-item ev-${it.type}${it.upcoming ? '' : ' is-past'}`} onClick={() => onOpen(it)} title={it.title}>
                  {it.title}
                </button>
              ))}
              {list.length > 3 && <span className="ev-cal-more">+{list.length - 3} more</span>}
            </div>
          );
        })}
      </div>
      <p className="ev-cal-legend">
        {(Object.keys(TYPE_LABEL) as FeedType[]).map((t) => <span key={t}><i className={`ev-${t}`} />{TYPE_LABEL[t]}</span>)}
      </p>
    </div>
  );
}

/** Compact filter: a pill button ("Type ▾") that opens a small menu, same as Labs → Focus. */
function FilterRow<T extends string>({ label, options, labels, value, onChange }: {
  label: string; options: readonly T[]; labels: Record<T, string>; value: T | 'all'; onChange: (v: T | 'all') => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (o: T | 'all') => { onChange(o); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={value === 'all' ? 'filter menu-trigger' : 'filter active menu-trigger'} aria-label={`${label}: ${value === 'all' ? 'All' : labels[value]}`}>
          {value === 'all' ? label : labels[value]}<ChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="period-pop menu-pop">
        <p className="period-pop-label is-top">{label}</p>
        <div className="period-quick" role="group" aria-label={label}>
          {(['all', ...options] as (T | 'all')[]).map((o) => (
            <button key={o} type="button" className={value === o ? 'is-on' : ''} aria-pressed={value === o} onClick={() => pick(o)}>{o === 'all' ? 'All' : labels[o]}</button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Event posters in one row that scrolls to the right (carousel), with arrow buttons on a computer. */
function PosterList({ items, onOpen, past }: { items: FeedItem[]; onOpen: (i: FeedItem) => void; past?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(update, [items.length]);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * Math.max(260, (ref.current?.clientWidth ?? 600) * 0.8), behavior: 'smooth' });
  if (!items.length) return null;
  return (
    <div className="ev-carousel">
      <div ref={ref} className={past ? 'ev-track is-past' : 'ev-track'} onScroll={update} role="list">
        {items.map((it) => <div key={it.key} role="listitem" className="ev-slide"><PosterCard item={it} onOpen={onOpen} /></div>)}
      </div>
      {!edge.start && <button type="button" className="ev-arrow prev" aria-label="Scroll left" onClick={() => go(-1)}><ChevronLeft /></button>}
      {!edge.end && <button type="button" className="ev-arrow next" aria-label="Scroll right" onClick={() => go(1)}><ChevronRight /></button>}
    </div>
  );
}

/* ───────── v22: "Coming up next" — the nearest day's events as large cards (several → they scroll to the right) ───────── */
function whenLine(it: FeedItem) {
  if (it.sdu) { const d = eventDate(it.sdu.starts_at); return `${d.long} · ${d.time}`; }
  return it.external ? externalDates(it.external) : '';
}
function placeLine(it: FeedItem) {
  if (it.sdu) return it.location === 'online' ? 'Online' : `Room ${it.sdu.room}`;
  return it.external?.location || LOCATION_LABEL[it.location];
}
const shortDay = (d: Date | null, year: number | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : year ? String(year) : '');

function PosterImage({ item }: { item: FeedItem }) {
  return item.poster ? <img src={item.poster} alt="" loading="lazy" referrerPolicy="no-referrer" /> : (
    <div className="poster-cover" aria-hidden>
      <span className="poster-cover-type">{TYPE_LABEL[item.type]}</span>
      <strong className="poster-cover-title">{item.title}</strong>
    </div>
  );
}

function NextCard({ item, onOpen }: { item: FeedItem; onOpen: (i: FeedItem) => void }) {
  return (
    <a href={item.sdu ? `/events/${item.sdu.id}` : '#'} className="ev-next-card" onClick={(e) => { e.preventDefault(); onOpen(item); }}>
      <div className={`ev-next-poster poster-${item.type}`}><PosterImage item={item} /></div>
      <div className="ev-next-body">
        <div className="ev-next-tags">
          <span className="ev-next-tag">{TYPE_LABEL[item.type]}</span>
          <span className="ev-next-tag is-soft">{LOCATION_LABEL[item.location]}</span>
        </div>
        <h3>{item.title}</h3>
        <p><CalendarDays size={16} aria-hidden />{whenLine(item)}</p>
        <p><MapPin size={16} aria-hidden />{placeLine(item)}</p>
        <span className="ev-next-link">View event<ArrowRight size={16} /></span>
      </div>
    </a>
  );
}

function ComingUpNext({ items, onOpen, onViewAll }: { items: FeedItem[]; onOpen: (i: FeedItem) => void; onViewAll: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const first = items[0];
  // every event that starts on the same day as the nearest one
  const sameDay = first?.start ? items.filter((it) => it.start && dayKey(it.start) === dayKey(first.start!)) : [];
  const update = () => {
    const el = ref.current;
    if (el) setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(update, [sameDay.length]);
  if (!first) return null;
  const many = sameDay.length > 1;
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current?.clientWidth ?? 600) * 0.8, behavior: 'smooth' });
  return (
    <section className="ev-next" aria-labelledby="ev-next-title">
      <div className="ev-next-head">
        <h2 id="ev-next-title">Coming Up Next{many && <span className="ev-next-count">{sameDay.length} events</span>}</h2>
        <button type="button" className="ev-next-all" onClick={onViewAll}>View all<ArrowRight size={16} /></button>
      </div>
      {many ? (
        <div className="ev-next-carousel">
          <div ref={ref} className="ev-next-track" onScroll={update} role="list">
            {sameDay.map((it) => <div key={it.key} role="listitem" className="ev-next-slide"><NextCard item={it} onOpen={onOpen} /></div>)}
          </div>
          {!edge.start && <button type="button" className="ev-arrow prev" aria-label="Scroll left" onClick={() => go(-1)}><ChevronLeft /></button>}
          {!edge.end && <button type="button" className="ev-arrow next" aria-label="Scroll right" onClick={() => go(1)}><ChevronRight /></button>}
        </div>
      ) : <NextCard item={first} onOpen={onOpen} />}
    </section>
  );
}

/* ───────── v22: the next days in one row; dots show how many events each day has (up to 3) ───────── */
const DAY_STRIP = 16;
function DayStrip({ items, selected, onSelect }: { items: FeedItem[]; selected: string | null; onSelect: (k: string | null) => void }) {
  const days = useMemo(() => {
    const t = new Date();
    return Array.from({ length: DAY_STRIP }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
  }, []);
  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) for (const k of daysOf(it)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [items]);
  const months = Array.from(new Set(days.map((d) => d.toLocaleDateString('en-GB', { month: 'long' }))));
  return (
    <div className="ev-days">
      <div className="ev-days-head">
        <strong>{months.join(' – ')}</strong>
        {selected && <button type="button" className="ev-days-clear" onClick={() => onSelect(null)}><X size={14} />All days</button>}
      </div>
      <div className="ev-days-row" role="group" aria-label="Upcoming days">
        {days.map((d) => {
          const k = dayKey(d);
          const n = count.get(k) ?? 0;
          const label = `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${n} ${n === 1 ? 'event' : 'events'}`;
          return (
            <button key={k} type="button" className={`ev-day${selected === k ? ' is-on' : ''}${n ? ' has-events' : ''}`} aria-pressed={selected === k} aria-label={label} title={label}
              onClick={() => onSelect(selected === k ? null : k)}>
              <small>{d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2).toLowerCase()}</small>
              <b>{d.getDate()}</b>
              <span className="ev-dots" aria-hidden>{Array.from({ length: Math.min(n, 3) }, (_, i) => <i key={i} />)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
/** Day keys an event covers (a multi-day competition counts on each of its days, at most two weeks). */
function daysOf(it: FeedItem) {
  if (!it.start) return [];
  const last = it.end && it.end > it.start ? it.end : it.start;
  const out: string[] = [];
  for (let d = new Date(it.start.getFullYear(), it.start.getMonth(), it.start.getDate()), n = 0; d <= last && n < 14; d.setDate(d.getDate() + 1), n++) out.push(dayKey(d));
  return out;
}

/**
 * Events feed. `fixedType` (Industry page) shows one type only and hides the Type filter;
 * the Location filter works the same everywhere, for upcoming and past events.
 */
export function EventBoard({ query = '', fixedType, search }: { query?: string; fixedType?: FeedType; search?: ReactNode }) {
  const { data, isLoading, error } = useEvents();
  const ext = useExternalEvents();
  const navigate = useNavigate();
  const [typeSel, setType] = useState<FeedType | 'all'>('all');
  const type = fixedType ?? typeSel;
  const [location, setLocation] = useState<FeedLocation | 'all'>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [when, setWhen] = useState<'all' | 'upcoming' | 'past'>('all');
  const [open, setOpen] = useState<ExternalEvent | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const my = useMyLabs();
  const listRef = useRef<HTMLDivElement>(null);

  const term = query.trim().toLowerCase();
  const items = useMemo(() => {
    const all = toFeed(data ?? [], ext.data ?? [], Date.now());
    return all.filter((it) =>
      (type === 'all' || it.type === type) && (location === 'all' || it.location === location)
      && (!term || `${it.title} ${it.host} ${it.sdu?.speaker ?? ''} ${it.sdu?.tags.join(' ') ?? ''}`.toLowerCase().includes(term)));
  }, [data, ext.data, type, location, term]);
  const mineFirstItem = (it: FeedItem) => !!it.sdu?.event_hosts.some((h) => my.isMineLab(h.lab_id)) || !!it.external?.external_event_labs.some((x) => my.isMineLab(x.lab_id));
  const upcoming = mineFirst(items.filter((i) => i.upcoming).sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)), mineFirstItem);
  // the strip's chosen day narrows the upcoming list
  const upcomingShown = day ? upcoming.filter((it) => daysOf(it).includes(day)) : upcoming;
  // "Coming up next" does not follow the filters: the nearest events, mine first among those on the same day
  const nextUp = useMemo(() => toFeed(data ?? [], ext.data ?? [], Date.now())
    .filter((i) => i.upcoming && !!i.start && (!fixedType || i.type === fixedType))
    .sort((a, b) => a.start!.getTime() - b.start!.getTime()), [data, ext.data, fixedType]);
  const past = items.filter((i) => !i.upcoming).sort((a, b) => (b.start?.getTime() ?? (b.year ?? 0) * 1e11) - (a.start?.getTime() ?? (a.year ?? 0) * 1e11));
  const openItem = (it: FeedItem) => {
    if (it.sdu) void navigate({ to: '/events/$eventId', params: { eventId: it.sdu.id } });
    else if (it.external) setOpen(it.external);
  };
  const loading = isLoading || ext.isLoading;
  // remount the lists when filters change, so "Show all" starts collapsed again
  const listKey = `${type}-${location}-${term}-${day ?? ''}`;
  const viewAll = () => { setWhen('upcoming'); setView('list'); setDay(null); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <>
      {(error || ext.error) && <p className="form-alert">{humanError(error ?? ext.error)}</p>}
      {/* order: Coming up next · search · filters · the next days · upcoming and past events */}
      {!loading && <ComingUpNext items={nextUp} onOpen={openItem} onViewAll={viewAll} />}
      {search && <div className="ev-search">{search}</div>}
      <div ref={listRef} className="ev-toolbar ev-compact">
        <div className="ev-filters">
          <div className="seg" role="tablist" aria-label="Time">
            {([['all', 'All'], ['upcoming', 'Upcoming'], ['past', 'Past']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={when === k} className={when === k ? 'is-on' : ''} onClick={() => setWhen(k)}>{label}</button>
            ))}
          </div>
          {!fixedType && <FilterRow label="Type" options={['industry', 'research', 'competitions'] as const} labels={TYPE_LABEL} value={typeSel} onChange={setType} />}
          <FilterRow label="Location" options={['sdu', 'outside', 'online'] as const} labels={LOCATION_LABEL} value={location} onChange={setLocation} />
        </div>
        <div className="ev-actions">
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'list' ? 'is-on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')} title="List"><LayoutGrid size={15} /><span className="sr-only">List</span></button>
            <button type="button" className={view === 'calendar' ? 'is-on' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')} title="Calendar"><CalendarDays size={15} /><span className="sr-only">Calendar</span></button>
          </div>
        </div>
      </div>

      {view === 'list' && when !== 'past' && <DayStrip items={upcoming} selected={day} onSelect={setDay} />}

      {view === 'calendar' ? (
        <CalendarView items={when === 'all' ? items : when === 'upcoming' ? upcoming : past} onOpen={openItem} />
      ) : (
        <>
          {when !== 'past' && <section aria-label="Upcoming events">
            {loading && <div className="ev-track">{Array.from({ length: 4 }, (_, i) => <div key={i} className="ev-slide"><div className="poster-card skeleton-card" aria-hidden /></div>)}</div>}
            {!loading && <PosterList key={`u-${listKey}`} items={upcomingShown} onOpen={openItem} />}
            {!loading && upcomingShown.length === 0 && <div className="mini-empty"><CalendarDays size={20} /><p>{day ? 'No events on this day.' : 'No upcoming events for these filters.'}</p></div>}
          </section>}

          {when === 'past' && !loading && past.length === 0 && <div className="mini-empty"><History size={20} /><p>No past events for these filters.</p></div>}
          {when !== 'upcoming' && past.length > 0 && (
            <section className={when === 'past' ? 'past-events is-only' : 'past-events'} aria-labelledby={`past-events-${fixedType ?? 'all'}`}>
              <h2 id={`past-events-${fixedType ?? 'all'}`}><History size={18} />Past Events · {past.length}</h2>
              <PosterList key={`p-${listKey}`} items={past} onOpen={openItem} past />
            </section>
          )}
        </>
      )}

      {open && <ExternalEventSheet event={open} all={ext.data ?? []} onClose={() => setOpen(null)} />}
    </>
  );
}
