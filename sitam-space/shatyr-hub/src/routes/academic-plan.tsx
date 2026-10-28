import { useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarRange, Download, ExternalLink, FileUp, Pencil, Plus, Printer, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { humanError, useEvents, useExternalEvents, useLabs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pageHead } from '@/lib/hub-data';
import {
  AUDIENCE_LABEL, PLAN_KIND_LABEL, semesterOf, uploadPlanPdf, useAcademicPlans, usePlanActions,
  type AcademicPlan, type PlanAudience, type PlanItem, type PlanItemDraft, type PlanKind,
} from '@/lib/academic-plan';

export const Route = createFileRoute('/academic-plan')({
  head: () => pageHead('Academic Plan', 'The SITAM Academic Year Plan: grant and R&D deadlines, Research Poster Days, conferences, hackathons and lab reports.'),
  component: AcademicPlanPage,
});

type Entry = {
  key: string; title: string; kind: string; start: string; end: string | null; audiences: PlanAudience[];
  description: string | null; url: string | null; labSlug?: string | undefined; labName?: string | undefined;
  eventId?: string | undefined; fromEvents: boolean; item?: PlanItem;
};
const AUDIENCES: PlanAudience[] = ['students', 'researchers', 'industry'];
const MONTH = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const DAY = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function AcademicPlanPage() {
  const { caps } = useAuth();
  const plans = useAcademicPlans();
  const events = useEvents();
  const ext = useExternalEvents();
  const labs = useLabs();
  const [audience, setAudience] = useState<PlanAudience | 'all'>('all');
  const [withEvents, setWithEvents] = useState(true);
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null);
  const [settings, setSettings] = useState(false);
  const actions = usePlanActions();
  const coordinator = caps.isCoordinator || caps.isAdmin;

  const plan = plans.data?.plans.find((p) => p.is_current) ?? plans.data?.plans[0] ?? null;
  const labOf = useMemo(() => new Map((labs.data ?? []).map((l) => [l.id, l])), [labs.data]);
  const today = new Date().toISOString().slice(0, 10);

  const entries = useMemo<Entry[]>(() => {
    if (!plan) return [];
    const inRange = (d: string) => d >= plan.starts_on && d <= plan.ends_on;
    const own: Entry[] = (plans.data?.items ?? []).filter((i) => i.plan_id === plan.id).map((i) => {
      const lab = i.lab_id ? labOf.get(i.lab_id) : undefined;
      return { key: `p-${i.id}`, title: i.title, kind: PLAN_KIND_LABEL[i.kind], start: i.starts_on, end: i.ends_on, audiences: i.audiences, description: i.description, url: i.url,
        labSlug: lab?.slug, labName: lab?.name, fromEvents: false, item: i };
    });
    const fromEvents: Entry[] = !withEvents ? [] : [
      ...(events.data ?? []).map((e): Entry => ({
        key: `e-${e.id}`, title: e.title, kind: e.kind === 'industrial' ? 'Industry event' : 'Research event', start: e.starts_at.slice(0, 10), end: null,
        audiences: e.kind === 'industrial' ? ['students', 'industry'] : ['students', 'researchers'], description: null, url: null, eventId: e.id, fromEvents: true,
      })),
      ...(ext.data ?? []).filter((x) => x.starts_on).map((x): Entry => ({
        key: `x-${x.id}`, title: x.title, kind: x.kind === 'conference' ? 'Conference' : x.kind === 'hackathon' ? 'Hackathon' : 'Competition', start: x.starts_on!, end: x.ends_on,
        audiences: x.kind === 'conference' ? ['researchers', 'students'] : ['students'], description: null, url: x.url, fromEvents: true,
      })),
    ];
    return [...own, ...fromEvents]
      .filter((e) => inRange(e.start) && (audience === 'all' || e.audiences.includes(audience)))
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }, [plan, plans.data, events.data, ext.data, withEvents, audience, labOf]);

  // Fall 2026 → months → entries
  const semesters = useMemo(() => {
    const out: { name: string; months: { name: string; list: Entry[] }[] }[] = [];
    for (const e of entries) {
      const sem = `${semesterOf(e.start)} ${e.start.slice(0, 4)}`;
      let s = out.find((x) => x.name === sem);
      if (!s) { s = { name: sem, months: [] }; out.push(s); }
      const mon = MONTH(e.start);
      let m = s.months.find((x) => x.name === mon);
      if (!m) { m = { name: mon, list: [] }; s.months.push(m); }
      m.list.push(e);
    }
    return out;
  }, [entries]);

  return (
    <main className="container content-page plan-page">
      <div className="page-head-row">
        <div>
          <span className="eyebrow">SITAM · Academic Year Plan</span>
          <h1>{plan?.title ?? 'Academic Plan'}</h1>
          {plan && <p className="small-note mt-2">{DAY(plan.starts_on)} {plan.starts_on.slice(0, 4)} – {DAY(plan.ends_on)} {plan.ends_on.slice(0, 4)}</p>}
        </div>
        <div className="dash-quick plan-actions">
          {plan?.pdf_url
            ? <Button asChild><a href={plan.pdf_url} target="_blank" rel="noopener noreferrer" download><Download />Download PDF</a></Button>
            : <Button variant="outline" onClick={() => window.print()}><Printer />Save as PDF</Button>}
          {coordinator && plan && <Button variant="outline" onClick={() => setEditing('new')}><Plus />Add date</Button>}
          {coordinator && plan && <Button variant="ghost" onClick={() => setSettings(true)}><Settings2 />Plan settings</Button>}
        </div>
      </div>
      {plan?.intro && <p className="page-intro">{plan.intro}</p>}

      <div className="plan-filters">
        <div className="chip-filter" role="group" aria-label="For whom">
          <span className="chip-filter-label">Show</span>
          {(['all', ...AUDIENCES] as const).map((a) => (
            <button key={a} type="button" className={audience === a ? 'chip is-on' : 'chip'} aria-pressed={audience === a} onClick={() => setAudience(a)}>
              {a === 'all' ? 'Everything' : AUDIENCE_LABEL[a]}
            </button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={withEvents} onChange={(e) => setWithEvents(e.target.checked)} /><span>Include events from the Events page</span></label>
      </div>

      {plans.error && <p className="form-alert">{humanError(plans.error)}</p>}
      {plans.isLoading && <div className="plan-skeleton skeleton-card" aria-hidden />}
      {!plans.isLoading && !plan && <div className="empty-state"><CalendarRange /><h3>The Academic Year Plan is not published yet</h3></div>}
      {plan && !plans.isLoading && entries.length === 0 && (
        <div className="empty-state"><CalendarRange /><h3>No dates for this filter yet</h3>{coordinator && <p>Add the first date with “Add date”.</p>}</div>
      )}

      <div className="plan-timeline">
        {semesters.map((s) => (
          <section key={s.name} className="plan-semester" aria-labelledby={`sem-${s.name}`}>
            <h2 id={`sem-${s.name}`} className="plan-semester-title">{s.name}</h2>
            {s.months.map((m) => (
              <div key={m.name} className="plan-month">
                <h3 className="plan-month-title">{m.name}</h3>
                <ol className="plan-list">
                  {m.list.map((e) => {
                    const past = (e.end ?? e.start) < today;
                    const now = e.start <= today && (e.end ?? e.start) >= today;
                    return (
                      <li key={e.key} className={`plan-item${past ? ' is-past' : ''}${now ? ' is-now' : ''}${e.fromEvents ? ' is-event' : ''}`}>
                        <div className="plan-date" aria-hidden>
                          <b>{Number(e.start.slice(8, 10))}</b>
                          <span>{new Date(`${e.start}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })}</span>
                        </div>
                        <div className="plan-card">
                          <div className="plan-card-top">
                            <span className="plan-kind">{e.kind}</span>
                            {now && <span className="pill pill-live">Now</span>}
                            {e.item && coordinator && (
                              <span className="plan-tools">
                                <Button size="icon" variant="ghost" aria-label={`Edit ${e.title}`} onClick={() => setEditing(e.item!)}><Pencil /></Button>
                                <Button size="icon" variant="ghost" aria-label={`Delete ${e.title}`} disabled={actions.deleteItem.isPending}
                                  onClick={() => { if (window.confirm(`Delete “${e.title}”?`)) actions.deleteItem.mutate(e.item!.id, { onError: (x) => toast.error(humanError(x)) }); }}><Trash2 /></Button>
                              </span>
                            )}
                          </div>
                          <h4>{e.eventId ? <Link to="/events/$eventId" params={{ eventId: e.eventId }}>{e.title}</Link> : e.title}</h4>
                          <p className="plan-when">{DAY(e.start)}{e.end && e.end !== e.start ? ` – ${DAY(e.end)}` : ''}{e.labName && <> · <Link to="/labs/$slug" params={{ slug: e.labSlug! }}>{e.labName}</Link></>}</p>
                          {e.description && <p className="plan-desc">{e.description}</p>}
                          <div className="plan-card-foot">
                            {e.audiences.map((a) => <span key={a} className={`plan-aud aud-${a}`}>{AUDIENCE_LABEL[a]}</span>)}
                            {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="plan-link"><ExternalLink size={12} />Details</a>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        ))}
      </div>

      {editing && plan && <ItemDialog plan={plan} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {settings && plan && <PlanSettings plan={plan} onClose={() => setSettings(false)} />}
    </main>
  );
}

function ItemDialog({ plan, item, onClose }: { plan: AcademicPlan; item: PlanItem | null; onClose: () => void }) {
  const { saveItem } = usePlanActions();
  const labs = useLabs();
  const [aud, setAud] = useState<PlanAudience[]>(item?.audiences ?? AUDIENCES);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    if (s('title').length < 2) return setError('Enter the title.');
    if (!s('starts_on')) return setError('Choose the date.');
    if (s('ends_on') && s('ends_on') < s('starts_on')) return setError('The end date is before the start date.');
    if (s('url') && !/^https?:\/\//i.test(s('url'))) return setError('The link must start with https://');
    if (!aud.length) return setError('Choose at least one audience.');
    const d: PlanItemDraft = {
      id: item?.id ?? null, plan_id: plan.id, title: s('title'), kind: s('kind') as PlanKind, starts_on: s('starts_on'), ends_on: s('ends_on') || null,
      audiences: aud, description: s('description') || null, url: s('url') || null, lab_id: s('lab_id') || null,
    };
    try {
      await saveItem.mutateAsync(d);
      toast.success(item ? 'Date updated' : 'Date added', { description: d.title });
      onClose();
    } catch (x) { setError(humanError(x)); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <span className="eyebrow">{plan.title}</span>
        <DialogTitle>{item ? 'Edit date' : 'Add a date'}</DialogTitle>
        <DialogDescription>Shown on the Academic Plan timeline for the audiences you choose.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <div className="auth-row">
            <label>Type<select name="kind" defaultValue={item?.kind ?? 'other'}>{(Object.keys(PLAN_KIND_LABEL) as PlanKind[]).map((k) => <option key={k} value={k}>{PLAN_KIND_LABEL[k]}</option>)}</select></label>
            <label>Title<input name="title" maxLength={160} defaultValue={item?.title ?? ''} placeholder="Research Poster Day" /></label>
          </div>
          <div className="auth-row">
            <label>Date<input type="date" name="starts_on" defaultValue={item?.starts_on ?? ''} min={plan.starts_on} max={plan.ends_on} /></label>
            <label>Until (optional)<input type="date" name="ends_on" defaultValue={item?.ends_on ?? ''} min={plan.starts_on} max={plan.ends_on} /></label>
          </div>
          <fieldset><legend>For whom</legend>
            <div className="form-checks row">
              {AUDIENCES.map((a) => (
                <label key={a} className="check"><input type="checkbox" checked={aud.includes(a)} onChange={() => setAud((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))} /><span>{AUDIENCE_LABEL[a]}</span></label>
              ))}
            </div>
          </fieldset>
          <label>Lab (optional)<select name="lab_id" defaultValue={item?.lab_id ?? ''}><option value="">— whole school —</option>{(labs.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>Description<textarea name="description" rows={3} maxLength={2000} defaultValue={item?.description ?? ''} /></label>
          <label>Link<input name="url" defaultValue={item?.url ?? ''} placeholder="https://" /></label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <Button type="submit" disabled={saveItem.isPending}>{saveItem.isPending ? 'Saving…' : item ? 'Save' : 'Add date'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanSettings({ plan, onClose }: { plan: AcademicPlan; onClose: () => void }) {
  const { savePlan } = usePlanActions();
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    if (s('title').length < 3) return setError('Enter the title.');
    if (!s('starts_on') || !s('ends_on') || s('ends_on') < s('starts_on')) return setError('Check the dates.');
    if (pdf && pdf.size > 20 * 1024 * 1024) return setError('The PDF must be 20 MB or smaller.');
    setBusy(true);
    try {
      const pdf_url = pdf ? await uploadPlanPdf(pdf) : plan.pdf_url;
      await savePlan.mutateAsync({ id: plan.id, title: s('title'), starts_on: s('starts_on'), ends_on: s('ends_on'), intro: s('intro') || null, pdf_url });
      toast.success('Plan saved');
      onClose();
    } catch (x) { setError(humanError(x)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog wide">
        <DialogTitle>Plan settings</DialogTitle>
        <DialogDescription>Title, academic year and the official PDF for the dean's office.</DialogDescription>
        <form className="partner-form auth-form" onSubmit={submit} noValidate>
          <label>Title<input name="title" maxLength={120} defaultValue={plan.title} /></label>
          <div className="auth-row">
            <label>Starts<input type="date" name="starts_on" defaultValue={plan.starts_on} /></label>
            <label>Ends<input type="date" name="ends_on" defaultValue={plan.ends_on} /></label>
          </div>
          <label>Short introduction<textarea name="intro" rows={3} maxLength={2000} defaultValue={plan.intro ?? ''} /></label>
          <label className="file-pick"><FileUp size={14} />{pdf ? pdf.name : plan.pdf_url ? 'Replace the official PDF' : 'Upload the official PDF (≤ 20 MB)'}
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          </label>
          {plan.pdf_url && !pdf && <a className="small-note" href={plan.pdf_url} target="_blank" rel="noopener noreferrer">Current PDF</a>}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
