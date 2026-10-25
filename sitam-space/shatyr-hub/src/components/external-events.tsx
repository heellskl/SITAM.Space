// External events, competitions & hackathons (Events → "Competitions & Hackathons", and on each lab).
// Before the event a lab shows as "Participating" with its students and mentors; afterwards the head adds
// the result and the submitted project. Annual events are editions of one series.
// Rights are checked in the database (save_external_event, save_event_participation); buttons only mirror them.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { CalendarPlus, ExternalLink, ImagePlus, MapPin, Pencil, Plus, Repeat, Trash2, Trophy, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  EXTERNAL_KIND_LABEL, externalDates, hasStartedExternal, humanError, isUpcomingExternal, useDeleteExternalEvent, useEventSeries,
  uploadLabImage, useExternalEvents, useLabs, useProjects, useRemoveParticipation, useSaveExternalEvent, useSaveParticipation, useSetPoster,
  type ExternalEntry, type ExternalEvent, type ExternalEventDraft, type ExternalKind, type ParticipantRole, type ParticipationDraft,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

const KINDS = Object.keys(EXTERNAL_KIND_LABEL) as ExternalKind[];
const RESULT_PRESETS = ['1st place', '2nd place', '3rd place', 'Runner-up', 'Finalist', 'Special prize', 'Participated'];

/** Who may add events / manage a lab's entry — mirrors the database, for buttons only. */
export function useExternalRights() {
  const { user, caps } = useAuth();
  const myLabs = caps.isAdmin ? null : caps.managedLabs; // null = coordinator (any lab)
  return {
    canAdd: caps.isAdmin || caps.managedLabs.length > 0,
    canEditEvent: (e: ExternalEvent) => caps.isAdmin || (!!user && e.created_by === user.id),
    canManageLab: (labId: string) => caps.isAdmin || caps.managedLabs.some((l) => l.id === labId),
    myLabs,
    managed: caps.managedLabs,
  };
}

function People({ entry }: { entry: ExternalEntry }) {
  const students = entry.external_event_people.filter((p) => p.role === 'student');
  const mentors = entry.external_event_people.filter((p) => p.role === 'mentor');
  if (!students.length && !mentors.length) return null;
  return (
    <p className="xev-people">
      {students.length > 0 && <span><Users size={12} />Students: {students.map((p) => p.full_name).join(', ')}</span>}
      {mentors.length > 0 && <span>Mentors: {mentors.map((p) => p.full_name).join(', ')}</span>}
    </p>
  );
}

function EntryRow({ event, entry, onEdit }: { event: ExternalEvent; entry: ExternalEntry; onEdit?: (() => void) | undefined }) {
  const upcoming = isUpcomingExternal(event);
  return (
    <li className="xev-entry">
      <div className="xev-entry-head">
        {entry.labs ? <Link to="/labs/$slug" params={{ slug: entry.labs.slug }} className="pill pill-live">{entry.labs.name}</Link> : <span className="pill">Lab</span>}
        {entry.result ? <span className="xev-result"><Trophy size={13} />{entry.result}</span> : <span className="xev-status">{upcoming ? 'Participating' : 'Took part'}</span>}
        {onEdit && <button type="button" className="link-button xev-edit" onClick={onEdit}><Pencil size={12} />{upcoming ? 'Edit team' : entry.result ? 'Edit result' : 'Add result'}</button>}
      </div>
      <People entry={entry} />
      {(entry.project_title || entry.project_url) && (
        <p className="xev-project">
          Project: {entry.project_url ? <a href={entry.project_url} target="_blank" rel="noopener noreferrer">{entry.project_title || entry.project_url}<ExternalLink size={11} className="inline" /></a> : entry.project_title}
        </p>
      )}
      {entry.notes && <p className="small-note">{entry.notes}</p>}
    </li>
  );
}

export function ExternalCard({ event, editions, onEditEvent, onParticipate }: {
  event: ExternalEvent; editions: ExternalEvent[]; onEditEvent?: (() => void) | undefined; onParticipate: (labId?: string) => void;
}) {
  const rights = useExternalRights();
  const mine = rights.managed.filter((l) => !event.external_event_labs.some((x) => x.lab_id === l.id));
  return (
    <article className="xev-card">
      <div className="xev-top">
        <span className="eyebrow">
          {EXTERNAL_KIND_LABEL[event.kind]}
          {event.event_series && <span className="xev-annual"><Repeat size={11} />Annual</span>}
        </span>
        {onEditEvent && <button type="button" className="link-button" onClick={onEditEvent}><Pencil size={12} />Edit</button>}
      </div>
      <h3>{event.url ? <a href={event.url} target="_blank" rel="noopener noreferrer">{event.title}<ExternalLink size={14} className="inline" /></a> : event.title}</h3>
      <p className="xev-meta">
        <span>{externalDates(event)}</span>
        {event.organizer && <span>{event.organizer}</span>}
        {event.location && <span><MapPin size={12} />{event.location}</span>}
      </p>
      {event.description && <p className="lab-text">{event.description}</p>}
      {editions.length > 0 && (
        <p className="xev-editions">Other editions: {editions.map((x) => x.year ?? '—').join(' · ')}</p>
      )}
      {event.external_event_labs.length > 0 ? (
        <ul className="xev-entries">
          {event.external_event_labs.map((en) => (
            <EntryRow key={en.id} event={event} entry={en} onEdit={rights.canManageLab(en.lab_id) ? () => onParticipate(en.lab_id) : undefined} />
          ))}
        </ul>
      ) : <p className="small-note">No SITAM lab has joined yet.</p>}
      {(mine.length > 0 || (rights.myLabs === null && rights.canAdd)) && (
        <Button size="sm" variant="outline" className="xev-join" onClick={() => onParticipate()}><Plus />{isUpcomingExternal(event) ? 'Our lab participates' : 'Add our lab’s result'}</Button>
      )}
    </article>
  );
}

export function ExternalEventsBoard({ query = '' }: { query?: string }) {
  const { data, isLoading, error } = useExternalEvents();
  const rights = useExternalRights();
  const [filter, setFilter] = useState<'upcoming' | 'results' | 'all'>('all');
  const [editing, setEditing] = useState<ExternalEvent | null | 'new'>(null);
  const [joining, setJoining] = useState<{ event: ExternalEvent; labId?: string | undefined } | null>(null);
  const term = query.trim().toLowerCase();

  const list = useMemo(() => {
    const all = (data ?? []).filter((e) =>
      !term || `${e.title} ${e.organizer ?? ''} ${e.location ?? ''} ${e.external_event_labs.map((x) => `${x.labs?.name ?? ''} ${x.result ?? ''}`).join(' ')}`.toLowerCase().includes(term));
    const up = all.filter((e) => isUpcomingExternal(e)).sort((a, b) => (a.starts_on ?? '').localeCompare(b.starts_on ?? ''));
    const past = all.filter((e) => !isUpcomingExternal(e));
    if (filter === 'upcoming') return up;
    if (filter === 'results') return past.filter((e) => e.external_event_labs.some((x) => x.result));
    return [...up, ...past];
  }, [data, term, filter]);

  return (
    <>
      <div className="xev-toolbar">
        <div className="filter-list">
          {([['all', 'All'], ['upcoming', 'Upcoming'], ['results', 'Results & wins']] as const).map(([v, l]) => (
            <Button key={v} variant="ghost" className={filter === v ? 'filter active' : 'filter'} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</Button>
          ))}
        </div>
        {rights.canAdd && <Button size="sm" onClick={() => setEditing('new')}><CalendarPlus />Add competition / hackathon</Button>}
      </div>
      {error && <p className="form-alert">{humanError(error)}</p>}
      <div className="xev-grid">
        {isLoading && <div className="xev-card skeleton-card" aria-hidden />}
        {list.map((e) => (
          <ExternalCard
            key={e.id}
            event={e}
            editions={e.series_id ? (data ?? []).filter((x) => x.series_id === e.series_id && x.id !== e.id) : []}
            onEditEvent={rights.canEditEvent(e) ? () => setEditing(e) : undefined}
            onParticipate={(labId) => setJoining({ event: e, labId })}
          />
        ))}
      </div>
      {!isLoading && list.length === 0 && (
        <div className="mini-empty"><Trophy size={20} /><p>{filter === 'upcoming' ? 'No upcoming competitions yet.' : 'Nothing here yet.'}</p></div>
      )}
      {editing && <ExternalEventDialog event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {joining && <ParticipationDialog event={joining.event} labId={joining.labId} onClose={() => setJoining(null)} />}
    </>
  );
}

/* ───────────── posters ───────────── */
/** Picks a poster image (PNG/JPG/WebP ≤ 10 MB) and shows a preview; the parent uploads it on save. */
export function PosterPicker({ current, file, onFile, onClear }: { current: string | null | undefined; file: File | null; onFile: (f: File | null) => void; onClear?: (() => void) | undefined }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : current ?? null), [file, current]);
  useEffect(() => () => { if (file && preview) URL.revokeObjectURL(preview); }, [file, preview]);
  return (
    <div className="poster-pick">
      <span className="poster-pick-thumb">{preview ? <img src={preview} alt="Poster preview" /> : <ImagePlus size={20} />}</span>
      <div>
        <span className="file-pick file-picked">
          <ImagePlus size={16} /><span>{preview ? 'Replace poster' : 'Add a poster (PNG/JPG/WebP, ≤ 10 MB)'}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > 10 * 1024 * 1024) { toast.error('The poster is larger than 10 MB'); return; }
            onFile(f);
          }} />
        </span>
        {(preview && onClear) && <button type="button" className="link-button" onClick={() => { onFile(null); onClear(); }}>Remove poster</button>}
        <p className="small-note">Portrait 4:5 looks best. Without a poster the card gets a designed cover with the date.</p>
      </div>
    </div>
  );
}

/** Upload into the storage folder the person may write to (their lab, or their own folder for the coordinator). */
export async function uploadPoster(file: File, folder: string) {
  return uploadLabImage(folder, file, 'posters');
}

/** An external event opened from the Events feed: details, labs taking part, results, and the head's actions. */
export function ExternalEventSheet({ event, all, onClose }: { event: ExternalEvent; all: ExternalEvent[]; onClose: () => void }) {
  const rights = useExternalRights();
  const [editing, setEditing] = useState(false);
  const [joining, setJoining] = useState<{ labId?: string | undefined } | null>(null);
  const fresh = all.find((x) => x.id === event.id) ?? event; // follows saves while open
  return (
    <>
      <Dialog open={!editing && !joining} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="hub-dialog wide xev-sheet">
          <DialogTitle className="sr-only">{fresh.title}</DialogTitle>
          <DialogDescription className="sr-only">External event details</DialogDescription>
          {fresh.poster_url && <img className="xev-sheet-poster" src={fresh.poster_url} alt="" />}
          <ExternalCard
            event={fresh}
            editions={fresh.series_id ? all.filter((x) => x.series_id === fresh.series_id && x.id !== fresh.id) : []}
            onEditEvent={rights.canEditEvent(fresh) ? () => setEditing(true) : undefined}
            onParticipate={(labId) => setJoining({ labId })}
          />
        </DialogContent>
      </Dialog>
      {editing && <ExternalEventDialog event={fresh} onClose={() => setEditing(false)} />}
      {joining && <ParticipationDialog event={fresh} labId={joining.labId} onClose={() => setJoining(null)} />}
    </>
  );
}

/* ───────────── add / edit an external event ───────────── */
export function ExternalEventDialog({ event, onClose }: { event: ExternalEvent | null; onClose: () => void }) {
  const save = useSaveExternalEvent();
  const del = useDeleteExternalEvent();
  const series = useEventSeries();
  const setPoster = useSetPoster();
  const { user, caps } = useAuth();
  const [poster, setPosterFile] = useState<File | null>(null);
  const [clearPoster, setClearPoster] = useState(false);
  const [d, setD] = useState<ExternalEventDraft>(() => ({
    id: event?.id ?? null, kind: event?.kind ?? 'hackathon', title: event?.title ?? '', organizer: event?.organizer ?? '',
    location: event?.location ?? '', url: event?.url ?? '', starts_on: event?.starts_on ?? '', ends_on: event?.ends_on ?? '',
    description: event?.description ?? '', annual: !!event?.series_id, series_id: event?.series_id ?? null,
  }));
  const [error, setError] = useState('');
  const set = <K extends keyof ExternalEventDraft>(k: K, v: ExternalEventDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (d.title.trim().length < 2) return setError('Enter the event name.');
    if (!d.starts_on) return setError('Choose the start date.');
    if (d.url.trim() && !/^https?:\/\//i.test(d.url.trim())) return setError('The link must start with https://');
    try {
      const id = await save.mutateAsync(d);
      if (poster) {
        const folder = caps.managedLabs[0]?.id ?? user?.id ?? '';
        const url = await uploadPoster(poster, folder);
        await setPoster.mutateAsync({ kind: 'external', id, url });
      } else if (clearPoster && event?.poster_url) {
        await setPoster.mutateAsync({ kind: 'external', id, url: null });
      }
      toast.success(event ? 'Event updated' : 'Event added', { description: d.title });
      onClose();
    } catch (err) {
      setError(humanError(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">Competitions & hackathons</span>
        <DialogTitle>{event ? 'Edit external event' : 'Add an external event'}</DialogTitle>
        <DialogDescription>A competition, hackathon, olympiad or conference outside SITAM. Labs then mark that they participate.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <div className="auth-row">
            <label>Type<select value={d.kind} onChange={(e) => set('kind', e.target.value as ExternalKind)}>{KINDS.map((k) => <option key={k} value={k}>{EXTERNAL_KIND_LABEL[k]}</option>)}</select></label>
            <label>Name<input value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={160} placeholder="Decentrathon 2027" /></label>
          </div>
          <div className="auth-row">
            <label>Organizer<input value={d.organizer} onChange={(e) => set('organizer', e.target.value)} maxLength={160} placeholder="Astana Hub" /></label>
            <label>City / venue<input value={d.location} onChange={(e) => set('location', e.target.value)} maxLength={160} placeholder="Astana" /></label>
          </div>
          <div className="auth-row">
            <label>Starts<input type="date" value={d.starts_on} onChange={(e) => set('starts_on', e.target.value)} /></label>
            <label>Ends<input type="date" value={d.ends_on} onChange={(e) => set('ends_on', e.target.value)} /></label>
          </div>
          <label>Website<input value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></label>
          <label>Description<textarea rows={2} maxLength={2000} value={d.description} onChange={(e) => set('description', e.target.value)} /></label>
          <fieldset><legend>Poster</legend>
            <PosterPicker current={clearPoster ? null : event?.poster_url} file={poster} onFile={setPosterFile} onClear={() => setClearPoster(true)} />
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={d.annual} onChange={(e) => set('annual', e.target.checked)} />
            Annual event — this is one edition of a yearly series
          </label>
          {d.annual && (
            <label>Series
              <select value={d.series_id ?? ''} onChange={(e) => set('series_id', e.target.value || null)}>
                <option value="">New series (named after this event, without the year)</option>
                {(series.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          )}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="dialog-actions wrap">
            <Button type="submit" disabled={save.isPending || setPoster.isPending}>{save.isPending || setPoster.isPending ? 'Saving…' : event ? 'Save' : 'Add event'}</Button>
            {event && (
              <Button type="button" variant="ghost" disabled={del.isPending} onClick={() => {
                if (!window.confirm(`Delete “${event.title}” with all participations?`)) return;
                del.mutate(event.id, { onSuccess: () => { toast.success('Event deleted'); onClose(); }, onError: (err) => setError(humanError(err)) });
              }}><Trash2 />Delete</Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── a lab's participation: team before, result after ───────────── */
type PersonDraft = ParticipationDraft['people'][number];

export function ParticipationDialog({ event, labId, onClose }: { event: ExternalEvent; labId?: string | undefined; onClose: () => void }) {
  const { caps } = useAuth();
  const labsQ = useLabs();
  const projectsQ = useProjects();
  const save = useSaveParticipation();
  const remove = useRemoveParticipation();
  const choices = caps.isAdmin ? (labsQ.data ?? []).map((l) => ({ id: l.id, name: l.name })) : caps.managedLabs.map((l) => ({ id: l.id, name: l.name }));
  const [lab, setLab] = useState(labId ?? choices.find((c) => !event.external_event_labs.some((x) => x.lab_id === c.id))?.id ?? choices[0]?.id ?? '');
  // the coordinator's lab list may arrive after the dialog opens
  useEffect(() => { if (!lab && choices[0]) setLab(choices[0].id); }, [lab, choices.length]);
  const existing = event.external_event_labs.find((x) => x.lab_id === lab);
  const started = hasStartedExternal(event);
  const [people, setPeople] = useState<PersonDraft[]>(() => (existing?.external_event_people ?? []).map((p) => ({ member_id: p.member_id, full_name: p.full_name, role: p.role })));
  const [result, setResult] = useState(existing?.result ?? '');
  const [projectTitle, setProjectTitle] = useState(existing?.project_title ?? '');
  const [projectUrl, setProjectUrl] = useState(existing?.project_url ?? '');
  const [projectId, setProjectId] = useState<string | null>(existing?.project_id ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');

  const team = (labsQ.data ?? []).find((l) => l.id === lab)?.lab_members.filter((m) => m.role !== 'former_lead') ?? [];
  const labProjects = (projectsQ.data ?? []).filter((p) => p.lab_id === lab);
  const picked = (id: string) => people.find((p) => p.member_id === id);

  function switchLab(id: string) {
    setLab(id);
    const en = event.external_event_labs.find((x) => x.lab_id === id);
    setPeople((en?.external_event_people ?? []).map((p) => ({ member_id: p.member_id, full_name: p.full_name, role: p.role })));
    setResult(en?.result ?? ''); setProjectTitle(en?.project_title ?? ''); setProjectUrl(en?.project_url ?? '');
    setProjectId(en?.project_id ?? null); setNotes(en?.notes ?? '');
  }
  const toggleMember = (id: string, name: string, on: boolean, role: ParticipantRole) =>
    setPeople((l) => (on ? [...l.filter((p) => p.member_id !== id), { member_id: id, full_name: name, role }] : l.filter((p) => p.member_id !== id)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!lab) return setError('Choose the lab.');
    if (projectUrl.trim() && !/^https?:\/\//i.test(projectUrl.trim())) return setError('The project link must start with https://');
    try {
      await save.mutateAsync({ event_id: event.id, lab_id: lab, people, result: started ? result : '', project_title: projectTitle, project_url: projectUrl, project_id: projectId, notes });
      toast.success(started && result ? 'Result saved' : 'Participation saved', { description: event.title });
      onClose();
    } catch (err) {
      setError(humanError(err));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">{EXTERNAL_KIND_LABEL[event.kind]} · {externalDates(event)}</span>
        <DialogTitle>{event.title}</DialogTitle>
        <DialogDescription>
          {started ? 'Record who took part, the result and the project you submitted.' : 'Mark your lab as participating and list the students and mentors who go.'}
        </DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          {choices.length > 1 && !labId && (
            <label>Lab<select value={lab} onChange={(e) => switchLab(e.target.value)}>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          )}
          <fieldset>
            <legend>Team from the lab</legend>
            {team.length === 0 && <p className="small-note">This lab has no team members yet — add people by name below.</p>}
            <ul className="xev-pick">
              {team.map((m) => {
                const p = picked(m.id);
                return (
                  <li key={m.id}>
                    <label className="check"><input type="checkbox" checked={!!p} onChange={(e) => toggleMember(m.id, m.full_name, e.target.checked, 'student')} />{m.full_name}</label>
                    {p && (
                      <select aria-label={`Role of ${m.full_name}`} value={p.role} onChange={(e) => toggleMember(m.id, m.full_name, true, e.target.value as ParticipantRole)}>
                        <option value="student">Student</option><option value="mentor">Mentor</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <fieldset>
            <legend>Other participants</legend>
            {people.map((p, i) => p.member_id ? null : (
              <div key={i} className="social-edit">
                <input aria-label="Full name" placeholder="Full name" value={p.full_name} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, full_name: e.target.value } : x)))} />
                <select aria-label="Role" value={p.role} onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, role: e.target.value as ParticipantRole } : x)))}>
                  <option value="student">Student</option><option value="mentor">Mentor</option>
                </select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setPeople((l) => l.filter((_, j) => j !== i))}><X /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setPeople((l) => [...l, { member_id: null, full_name: '', role: 'student' }])}><Plus />Add a person</Button>
          </fieldset>
          {started ? (
            <>
              <label>Result
                <input list="xev-results" value={result} onChange={(e) => setResult(e.target.value)} maxLength={160} placeholder="1st place, Runner-up, Finalist…" />
                <datalist id="xev-results">{RESULT_PRESETS.map((r) => <option key={r} value={r} />)}</datalist>
              </label>
              <div className="auth-row">
                <label>Submitted project<input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} maxLength={200} placeholder="Project name" /></label>
                <label>Project link<input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://" /></label>
              </div>
              {labProjects.length > 0 && (
                <label>Or link a lab project
                  <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}>
                    <option value="">—</option>
                    {labProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </label>
              )}
            </>
          ) : <p className="small-note">The result and the submitted project can be added once the event has started.</p>}
          <label>Notes<textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prize, track, anything worth noting" /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="dialog-actions wrap">
            <Button type="submit" disabled={save.isPending || !lab}>{save.isPending ? 'Saving…' : 'Save'}</Button>
            {existing && (
              <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() =>
                remove.mutate({ event_id: event.id, lab_id: lab }, { onSuccess: () => { toast.success('Participation removed'); onClose(); }, onError: (err) => setError(humanError(err)) })}>
                <Trash2 />Remove our lab
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── on a lab: its competitions and wins ───────────── */
export function LabCompetitions({ labId }: { labId: string }) {
  const { data } = useExternalEvents();
  const list = (data ?? []).filter((e) => e.external_event_labs.some((x) => x.lab_id === labId));
  if (!list.length) return null;
  return (
    <ul className="rows">
      {list.map((e) => {
        const en = e.external_event_labs.find((x) => x.lab_id === labId)!;
        return (
          <li key={e.id}>
            <div>
              <strong>{e.title}</strong>
              <small>{EXTERNAL_KIND_LABEL[e.kind]} · {externalDates(e)}{en.result ? ` · ${en.result}` : isUpcomingExternal(e) ? ' · Participating' : ''}</small>
            </div>
            {en.result && <Trophy size={16} className="xev-trophy" aria-label="Result" />}
          </li>
        );
      })}
    </ul>
  );
}
