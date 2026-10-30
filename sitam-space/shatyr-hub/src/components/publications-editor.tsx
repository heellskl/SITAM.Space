// v18: a researcher (or the coordinator) keeps the papers of a researcher card up to date:
// add by DOI (details filled from Crossref) or by hand, edit citations, remove, or import a Scopus CSV export.
// The coordinator can also import one Scopus export with many SITAM authors (Admin). The database checks every right.

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { BookPlus, FileUp, Loader2, Pencil, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  formatDate, humanError, useImportPublications, usePublicationsUpdated, useRemovePublication, useSavePublication,
  type Professor, type PubImportItem, type PubInput, type Publication,
} from '@/lib/api';

const TYPES = ['Article', 'Conference paper', 'Review', 'Book chapter', 'Book', 'Other'];
const EMPTY: PubInput = { title: '', year: new Date().getFullYear(), type: 'Article', venue: '', doi: '', url: '', citations: 0, open_access: false };

/* ───────────── Scopus CSV export → rows ───────────── */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export type ScopusRow = { authorIds: string[]; item: PubImportItem };
export function parseScopusExport(text: string): ScopusRow[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.trim().toLowerCase() === n.toLowerCase()));
  const c = {
    ids: col('Author(s) ID', 'Author(s) IDs'), full: col('Author full names'), title: col('Title'), year: col('Year'),
    venue: col('Source title'), cites: col('Cited by'), doi: col('DOI'), link: col('Link'), type: col('Document Type'),
    oa: col('Open Access'), eid: col('EID'), kw: col('Author Keywords'), pub: col('Publisher'),
  };
  if (c.title < 0) throw new Error('This does not look like a Scopus CSV export: there is no "Title" column.');
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  return body.map((r) => ({
    authorIds: [...`${get(r, c.ids)} ${get(r, c.full)}`.matchAll(/\d{8,13}/g)].map((m) => m[0]),
    item: {
      title: get(r, c.title), year: get(r, c.year), venue: get(r, c.venue), publisher: get(r, c.pub), citations: get(r, c.cites) || '0',
      doi: get(r, c.doi), url: get(r, c.link), type: get(r, c.type), eid: get(r, c.eid), open_access: !!get(r, c.oa),
      keywords: get(r, c.kw).split(';').map((k) => k.trim()).filter(Boolean).slice(0, 20),
    },
  })).filter((r) => r.item.title.length >= 3);
}

/* ───────────── DOI → details (Crossref, public API) ───────────── */
async function lookupDoi(doi: string): Promise<Partial<PubInput>> {
  const clean = doi.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error('No paper with this DOI was found. Check it or fill the fields by hand.');
  const m = (await res.json()).message as {
    title?: string[]; 'container-title'?: string[]; issued?: { 'date-parts'?: number[][] }; type?: string; URL?: string; 'is-referenced-by-count'?: number;
  };
  const type = m.type === 'proceedings-article' ? 'Conference paper' : m.type === 'book-chapter' ? 'Book chapter' : m.type === 'book' ? 'Book' : 'Article';
  return {
    doi: clean, title: m.title?.[0] ?? '', venue: m['container-title']?.[0] ?? '', year: m.issued?.['date-parts']?.[0]?.[0] ?? null,
    type, url: m.URL ?? '', citations: m['is-referenced-by-count'] ?? 0,
  };
}

const updatedLabel = (iso: string | null | undefined) => (iso ? `Publications updated ${formatDate(iso)}` : 'Publications from the Scopus export');

export function PublicationsUpdated({ profId }: { profId: string }) {
  const q = usePublicationsUpdated(profId);
  if (!q.data) return null;
  return <p className="small-note pubs-updated">{updatedLabel(q.data[0]?.publications_updated_at)}</p>;
}

/* ───────────── the researcher's (or coordinator's) editor ───────────── */
export function ManagePublications({ prof, pubs }: { prof: Professor; pubs: Publication[] }) {
  const save = useSavePublication();
  const remove = useRemovePublication();
  const imp = useImportPublications();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PubInput>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [looking, setLooking] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof PubInput, v: PubInput[keyof PubInput]) => setForm((f) => ({ ...f, [k]: v }));

  const startAdd = () => { setForm(EMPTY); setEditing(null); setShowForm(true); setError(''); };
  const startEdit = (p: Publication) => {
    setForm({ title: p.title, year: p.year, type: p.type ?? 'Article', venue: p.venue ?? '', doi: p.doi ?? '', url: p.url ?? '', citations: p.citations, open_access: p.is_open_access });
    setEditing(p.id); setShowForm(true); setError('');
  };
  async function fillFromDoi() {
    if (!form.doi.trim()) return setError('Paste the DOI first, e.g. 10.1109/ACCESS.2024.1234567');
    setLooking(true); setError('');
    try { const d = await lookupDoi(form.doi); setForm((f) => ({ ...f, ...d })); }
    catch (e) { setError(e instanceof Error ? e.message : 'The DOI lookup did not work.'); }
    finally { setLooking(false); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.title.trim().length < 3) return setError('The title is required.');
    try {
      await save.mutateAsync({ prof: prof.id, id: editing, ...form, citations: Math.max(0, Number(form.citations) || 0) });
      toast.success(editing ? 'Paper updated' : 'Paper added');
      setShowForm(false); setEditing(null);
    } catch (err) { setError(humanError(err)); }
  }
  async function importFile(f: File) {
    setError('');
    try {
      const rows = parseScopusExport(await f.text());
      if (!rows.length) return setError('No papers were found in this file.');
      const r = await imp.mutateAsync({ prof: prof.id, items: rows.map((x) => x.item) });
      toast.success(`${r.added} new paper${r.added === 1 ? '' : 's'} added, ${r.updated} updated`);
    } catch (err) { setError(err instanceof Error && !('code' in err) ? err.message : humanError(err)); }
    finally { if (file.current) file.current.value = ''; }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><RefreshCw />Update publications</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hub-dialog wide pubs-dialog">
          <span className="eyebrow">Publications</span>
          <DialogTitle>{prof.full_name}</DialogTitle>
          <DialogDescription>Add new papers, update citations or import your Scopus export. Totals and the h-index update by themselves.</DialogDescription>

          <div className="pubs-actions">
            <Button size="sm" onClick={startAdd}><BookPlus />Add a paper</Button>
            <Button size="sm" variant="outline" onClick={() => file.current?.click()} disabled={imp.isPending}>
              {imp.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}Import Scopus CSV
            </Button>
            <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
          </div>
          <p className="small-note">Scopus CSV: open your author page in Scopus → select all documents → Export → CSV. New papers are added, known ones get fresh citations.</p>

          {showForm && (
            <form className="partner-form auth-form pubs-form" onSubmit={submit} noValidate>
              <div className="pubs-doi">
                <label>DOI<input value={form.doi} onChange={(e) => set('doi', e.target.value)} placeholder="10.1109/ACCESS.2024.1234567" /></label>
                <Button type="button" variant="outline" size="sm" onClick={() => void fillFromDoi()} disabled={looking}>
                  {looking ? <Loader2 className="animate-spin" /> : <Wand2 />}Fill from DOI
                </Button>
              </div>
              <label>Title<input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={600} required /></label>
              <div className="auth-row">
                <label>Year<input type="number" min={1950} max={2100} value={form.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)} /></label>
                <label>Type<select value={form.type} onChange={(e) => set('type', e.target.value)}>{[...new Set([...TYPES, form.type])].filter(Boolean).map((t) => <option key={t}>{t}</option>)}</select></label>
                <label>Citations<input type="number" min={0} value={form.citations} onChange={(e) => set('citations', Number(e.target.value))} /></label>
              </div>
              <label>Journal or conference<input value={form.venue} onChange={(e) => set('venue', e.target.value)} /></label>
              <label>Link<input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></label>
              <label className="check"><input type="checkbox" checked={form.open_access} onChange={(e) => set('open_access', e.target.checked)} />Open access</label>
              <div className="editor-actions">
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
                <Button type="submit" className="editor-save" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save paper' : 'Add paper'}</Button>
              </div>
            </form>
          )}
          {error && <p className="form-alert" role="alert">{error}</p>}

          <ul className="pubs-edit-list">
            {pubs.length === 0 && <li className="small-note">No papers yet.</li>}
            {pubs.map((p) => (
              <li key={p.id}>
                <div><strong>{p.title}</strong><small>{[p.year, p.venue, `${p.citations} citations`].filter(Boolean).join(' · ')}</small></div>
                <Button size="icon" variant="ghost" aria-label={`Edit ${p.title}`} title="Edit" onClick={() => startEdit(p)}><Pencil /></Button>
                {confirm === p.id ? (
                  <Button size="sm" variant="destructive" disabled={remove.isPending}
                    onClick={() => remove.mutate({ prof: prof.id, id: p.id }, { onSuccess: () => { toast.success('Paper removed'); setConfirm(null); }, onError: (err) => toast.error(humanError(err)) })}>Remove</Button>
                ) : (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${p.title}`} title="Remove from my card" onClick={() => setConfirm(p.id)}><Trash2 /></Button>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────── Admin: one Scopus export for many researchers + who has not updated ───────────── */
export function ScopusBulkImport() {
  const list = usePublicationsUpdated(undefined);
  const imp = useImportPublications();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const stale = useMemo(() => {
    const limit = Date.now() - 180 * 864e5;
    return (list.data ?? []).filter((p) => !p.publications_updated_at || new Date(p.publications_updated_at).getTime() < limit)
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [list.data]);
  if (list.data === null) return null; // v18 SQL not run yet

  async function run(f: File) {
    setBusy(true); setReport([]);
    try {
      const rows = parseScopusExport(await f.text());
      const byScopus = new Map((list.data ?? []).filter((p) => p.scopus_id).map((p) => [p.scopus_id!.trim(), p]));
      const groups = new Map<string, { name: string; items: PubImportItem[] }>();
      let unmatched = 0;
      for (const r of rows) {
        const hits = [...new Set(r.authorIds.map((id) => byScopus.get(id)).filter((p): p is NonNullable<typeof p> => !!p))];
        if (!hits.length) unmatched++;
        for (const p of hits) {
          const g = groups.get(p.id) ?? { name: p.full_name, items: [] };
          g.items.push(r.item);
          groups.set(p.id, g);
        }
      }
      const out: string[] = [];
      for (const [id, g] of groups) {
        try { const r = await imp.mutateAsync({ prof: id, items: g.items }); out.push(`${g.name}: ${r.added} new, ${r.updated} updated`); }
        catch (err) { out.push(`${g.name}: ${humanError(err)}`); }
      }
      if (unmatched) out.push(`${unmatched} paper${unmatched === 1 ? '' : 's'} had no SITAM researcher with a matching Scopus Author ID.`);
      if (!groups.size) out.unshift('No researcher matched. Check that the researcher cards have a Scopus Author ID.');
      setReport(out);
      toast.success('Scopus export imported');
    } catch (err) { toast.error(err instanceof Error ? err.message : humanError(err)); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  }

  return (
    <section className="panel" id="publications">
      <div className="panel-head">
        <h3 className="panel-title">Researchers' publications</h3>
        <Button size="sm" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />}Import Scopus CSV</Button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }} />
      </div>
      <p className="small-note">Researchers update their own papers on their page. If they don't, export the SITAM papers from Scopus (CSV with "Author(s) ID") and import them here: papers go to every researcher whose Scopus Author ID matches.</p>
      {report.length > 0 && <ul className="rows">{report.map((r) => <li key={r}><div><small>{r}</small></div></li>)}</ul>}
      {stale.length > 0 && (
        <details className="pubs-stale">
          <summary>Not updated for 6+ months · {stale.length}</summary>
          <ul className="rows">
            {stale.map((p) => (
              <li key={p.id}>
                <div><strong><Link to="/research/$username" params={{ username: p.username }}>{p.full_name}</Link></strong>
                  <small>{p.publications_updated_at ? `Updated ${formatDate(p.publications_updated_at)}` : 'Never updated on the site'}{p.scopus_id ? '' : ' · no Scopus ID'}</small></div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
