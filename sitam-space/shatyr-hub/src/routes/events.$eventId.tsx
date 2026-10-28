import { useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Clock3, Download, ImagePlus, Images, MapPin, ScanLine, Search, Ticket as TicketIcon, Trash2, Users } from 'lucide-react';
import { PhotoGallery } from '@/components/photo-gallery';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HostPills, TicketBadge, canManageEvent } from '@/components/event-board';
import { PosterPicker, uploadPoster } from '@/components/external-events';
import {
  eventDate, humanError, uploadLabImage, useAttendees, useCancelRegistration, useCheckIn, useEvents, useMyRegistrations, useRegister, useSetEventPhotos, useSetPoster, type Attendee,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVENT_META } from '@/lib/sitam-data';

/** Organizers add or change the event poster (shown on the Events page cards). */
function PosterPanel({ eventId, current, folder }: { eventId: string; current: string | null; folder: string }) {
  const setPoster = useSetPoster();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(next: File | null) {
    setBusy(true);
    try {
      const url = next ? await uploadPoster(next, folder) : null;
      await setPoster.mutateAsync({ kind: 'sdu', id: eventId, url });
      toast.success(next ? 'Poster saved' : 'Poster removed');
      setFile(null);
    } catch (e) {
      toast.error('Poster not saved', { description: humanError(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mb-6">
      <h3 className="panel-title"><ImagePlus size={16} />Poster</h3>
      <PosterPicker current={current} file={file} onFile={(f) => { setFile(f); if (f) void save(f); }} onClear={current ? () => void save(null) : undefined} />
      {busy && <p className="small-note">Saving…</p>}
    </section>
  );
}

/** Event photos: everyone sees the gallery; organizers upload to Supabase Storage and remove photos. */
function EventPhotos({ eventId, title, photos, canManage, folder }: { eventId: string; title: string; photos: string[]; canManage: boolean; folder: string }) {
  const setPhotos = useSetEventPhotos();
  const [busy, setBusy] = useState(false);
  if (!photos.length && !canManage) return null;
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 20)) {
        if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} is larger than 10 MB`); continue; }
        urls.push(await uploadLabImage(folder, f, 'event-photos'));
      }
      await setPhotos.mutateAsync({ id: eventId, urls: [...photos, ...urls].slice(0, 80) });
      toast.success(`${urls.length} ${urls.length === 1 ? 'photo' : 'photos'} added`);
    } catch (e) {
      toast.error('Photos not saved', { description: humanError(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mb-6" aria-labelledby="event-photos">
      <h3 className="panel-title" id="event-photos"><Images size={16} />Photos{photos.length ? ` · ${photos.length}` : ''}</h3>
      <PhotoGallery photos={photos} title={`${title} — photos`} limit={12} />
      {canManage && (
        <div className="photo-admin">
          <label className="file-pick"><ImagePlus size={14} />{busy ? 'Uploading…' : 'Add photos'}
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => void add(e.target.files)} />
          </label>
          {photos.length > 0 && (
            <div className="photo-admin-list">
              {photos.map((u) => (
                <span key={u} className="photo-admin-item">
                  <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <button type="button" aria-label="Remove photo" disabled={setPhotos.isPending}
                    onClick={() => setPhotos.mutate({ id: eventId, urls: photos.filter((x) => x !== u) }, { onError: (e) => toast.error(humanError(e)) })}><Trash2 size={13} /></button>
                </span>
              ))}
            </div>
          )}
          {!photos.length && <p className="small-note">After the event, add photos here — they open in a gallery for everyone.</p>}
        </div>
      )}
    </section>
  );
}

export const Route = createFileRoute('/events/$eventId')({
  head: () => ({ meta: [{ title: 'Event — SITAM SPACE · SDU' }] }),
  component: EventPage,
});

function toCsv(rows: Attendee[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'E-mail', 'Role', 'Course', 'Major', 'Ticket', 'Status', 'Registered at', 'Checked in at'];
  const body = rows.map((r) => [r.name, r.email, r.role, r.course, r.major, r.ticket_code, r.status, r.registered_at, r.checked_in_at ?? ''].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

function EventPage() {
  const { eventId } = Route.useParams();
  const { user, profile, caps } = useAuth();
  const { data, isLoading } = useEvents();
  const event = data?.find((e) => e.id === eventId);
  const canManage = !!event && canManageEvent(event, user?.id, caps);
  const attendees = useAttendees(eventId, canManage);
  const regs = useMyRegistrations(user?.id);
  const register = useRegister();
  const cancel = useCancelRegistration();
  const checkIn = useCheckIn();
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'registered' | 'checked_in' | 'cancelled'>('all');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (attendees.data ?? []).filter((a) => (filter === 'all' || a.status === filter) && `${a.name} ${a.email} ${a.ticket_code} ${a.major ?? ''}`.toLowerCase().includes(q));
  }, [attendees.data, query, filter]);

  if (isLoading) return <main className="container content-page"><p className="small-note">Loading…</p></main>;
  if (!event) return <main className="container content-page"><p className="form-alert">Event not found.</p><Link to="/events" className="back-link"><ArrowLeft size={14} />All events</Link></main>;

  const d = eventDate(event.starts_at);
  const isPast = new Date(event.starts_at).getTime() < Date.now() - 3_600_000;
  const myReg = (regs.data ?? []).find((r) => r.event_id === event.id);
  const all = attendees.data ?? [];
  const checked = all.filter((a) => a.status === 'checked_in').length;
  const active = all.filter((a) => a.status !== 'cancelled').length;

  function scan(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    checkIn.mutate(code, {
      onSuccess: (r) => {
        if (r.event_id !== eventId) toast.warning(`Ticket is for another event: ${r.event}`, { description: r.name });
        else if (r.already) toast.info(`${r.name} was already checked in`);
        else toast.success(`Checked in: ${r.name}`);
        setCode('');
      },
      onError: (err) => toast.error(humanError(err)),
    });
  }

  function download() {
    const blob = new Blob([`﻿${toCsv(all)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendees-${event?.starts_at.slice(0, 10)}-${eventId.slice(0, 6)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container content-page">
      <Link to="/events" className="back-link"><ArrowLeft size={14} />All events</Link>
      <span className="eyebrow">{EVENT_META[event.kind].label} · {d.long.toUpperCase()}</span>
      <h1 className="event-title">{event.title}</h1>
      <div className="event-meta big">
        <span><Clock3 size={15} />{d.time}</span>
        <span><MapPin size={15} />Room {event.room}</span>
        <span><Users size={15} />{event.registered} registered · {event.capacity} seats</span>
      </div>
      {event.speaker && <p className="speaker mt-3"><strong>{event.speaker}</strong>{event.speaker_role && <span> · {event.speaker_role}</span>}</p>}
      {event.description && <p className="page-intro">{event.description}</p>}
      {event.event_hosts.length > 0 && <div className="mb-6"><span className="sub-title">Hosted by</span><HostPills hosts={event.event_hosts} /></div>}
      {event.poster_url && <img className="event-poster" src={event.poster_url} alt={`Poster: ${event.title}`} referrerPolicy="no-referrer" />}
      {canManage && <PosterPanel eventId={event.id} current={event.poster_url ?? null} folder={event.event_hosts.find((h) => h.lab_id && caps.managedLabs.some((m) => m.id === h.lab_id))?.lab_id ?? user?.id ?? ''} />}
      <EventPhotos eventId={event.id} title={event.title} photos={event.photo_urls ?? []} canManage={canManage}
        folder={event.event_hosts.find((h) => h.lab_id && caps.managedLabs.some((m) => m.id === h.lab_id))?.lab_id ?? user?.id ?? ''} />

      {!isPast && (
        <section className="panel mb-6">
          <h3 className="panel-title"><TicketIcon size={16} />Your ticket</h3>
          {!user ? (
            <p className="small-note">Sign in with your SDU e-mail to register. <Link to="/login">Sign in</Link></p>
          ) : myReg ? (
            <div className="ticket-wrap">
              <TicketBadge event={event} reg={myReg} holder={profile ? `${profile.firstName} ${profile.lastName}` : undefined} />
              {myReg.status === 'registered' && <Button variant="ghost" size="sm" onClick={() => cancel.mutate(event.id, { onSuccess: () => toast('Registration cancelled') })}>Cancel registration</Button>}
            </div>
          ) : (
            <Button disabled={register.isPending} onClick={() => register.mutate(event.id, { onSuccess: () => toast.success('Registered — your QR ticket is below'), onError: (e) => toast.error(humanError(e)) })}>Register in 1-click</Button>
          )}
        </section>
      )}

      {canManage && (
        <section className="panel attendee-panel">
          <div className="attendee-head">
            <div>
              <span className="eyebrow">ORGANIZER</span>
              <h2>Registered attendees</h2>
              <p className="small-note">Everyone who registered via QR, in one list. Updates every 15 seconds.</p>
            </div>
            <div className="kpi-row">
              <div className="kpi mini"><strong>{active}</strong><span>registered</span></div>
              <div className="kpi mini"><strong>{checked}</strong><span>checked in</span></div>
              <div className="kpi mini"><strong>{active ? Math.round((checked / active) * 100) : 0}%</strong><span>show-up</span></div>
            </div>
          </div>

          <form className="checkin-form" onSubmit={scan}>
            <ScanLine size={18} />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan QR or type ticket code" aria-label="Ticket code" autoComplete="off" />
            <Button type="submit" disabled={checkIn.isPending}>Check in</Button>
          </form>
          <p className="small-note mb-4">Tip: scanning the QR with a phone camera opens the check-in page directly for signed-in organizers.</p>

          <div className="lab-controls">
            <div className="filter-list">
              {(['all', 'registered', 'checked_in', 'cancelled'] as const).map((f) => (
                <Button key={f} variant="ghost" className={filter === f ? 'filter active' : 'filter'} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'checked_in' ? 'Checked in' : f[0]?.toUpperCase() + f.slice(1)}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={download} disabled={!all.length}><Download />CSV</Button>
            </div>
            <label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, e-mail, ticket" aria-label="Search attendees" /></label>
          </div>

          {attendees.error ? <p className="form-alert">{humanError(attendees.error)}</p> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>E-mail</th><th>Course / role</th><th>Ticket</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {list.map((a, i) => (
                    <tr key={a.registration_id}>
                      <td>{i + 1}</td>
                      <td><strong>{a.name || '—'}</strong></td>
                      <td>{a.email}</td>
                      <td>{a.role === 'student' ? `${a.course ?? '?'} course · ${a.major ?? ''}` : a.role}</td>
                      <td><code>{a.ticket_code}</code></td>
                      <td><span className={`pill ${a.status === 'checked_in' ? 'pill-live' : a.status === 'cancelled' ? 'pill-done' : 'pill-wip'}`}>{a.status === 'checked_in' ? `✓ ${a.checked_in_at ? new Date(a.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}` : a.status}</span></td>
                      <td>{a.status === 'registered' && <Button size="sm" variant="outline" onClick={() => checkIn.mutate(a.ticket_code, { onSuccess: (r) => toast.success(`Checked in: ${r.name}`), onError: (e) => toast.error(humanError(e)) })}><CheckCircle2 />Mark attended</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!attendees.isLoading && list.length === 0 && <div className="mini-empty"><Users size={20} /><p>No attendees match.</p></div>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
