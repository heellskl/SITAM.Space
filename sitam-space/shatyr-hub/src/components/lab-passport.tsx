// Lab Passport (Зертхана паспорты, v29 → v30): the official dean's-office document of a lab for a year,
// in the template of the 2026 passports (lab-passport-template.ts). Opened from the lab page (/labs/$slug?passport=1)
// by the heads of the lab and the coordinator. "Download Passport as PDF" prints the official A4 layout.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, ImagePlus, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/back-button';
import { PASSPORT_YEAR, humanError, useApproveLabPassport, useLabPassport, useSaveLabPassportDoc, type Lab } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_APPROVER, GENERAL_FIELDS, T, TABLES, compressImage, hasRows, passportFromLab, tableOf,
  type PassportDoc, type PassportLang, type PassportTable, type TableKey,
} from '@/lib/lab-passport-template';

const STATUS_LABEL = { draft: 'Draft', submitted: "Submitted to the dean's office", approved: 'Approved' } as const;
const ROMAN_HEADS: Record<1 | 2 | 3 | 4, keyof typeof T> = { 1: 's1', 2: 's2', 3: 's3', 4: 's4' };

/** Editable table: the columns of the template, one row per item; numbers (№) are added automatically. */
function TableEditor({ value, onChange }: { value: PassportTable; onChange: (t: PassportTable) => void }) {
  const n = value.columns.length;
  const set = (r: number, c: number, v: string) => onChange({ ...value, rows: value.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="pp-table-wrap">
      <table className="pp-table">
        <thead><tr><th className="pp-no">№</th>{value.columns.map((c, j) => <th key={j}>{c}</th>)}<th aria-label="Remove" /></tr></thead>
        <tbody>
          {value.rows.map((row, i) => (
            <tr key={i}>
              <td className="pp-no">{i + 1}</td>
              {Array.from({ length: n }, (_, j) => (
                <td key={j}><textarea rows={1} value={row[j] ?? ''} aria-label={`${value.columns[j]}, row ${i + 1}`} onChange={(e) => set(i, j, e.target.value)} /></td>
              ))}
              <td><button type="button" className="pp-del" aria-label={`Remove row ${i + 1}`} onClick={() => onChange({ ...value, rows: value.rows.filter((_, k) => k !== i) })}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, rows: [...value.rows, Array(n).fill('')] })}><Plus />Add a row</Button>
    </div>
  );
}

export function LabPassportForm({ lab }: { lab: Lab }) {
  const { caps } = useAuth();
  const year = PASSPORT_YEAR;
  const saved = useLabPassport(lab.id, year);
  const save = useSaveLabPassportDoc();
  const approve = useApproveLabPassport();
  const first = useMemo(() => passportFromLab(lab), [lab]);
  const [doc, setDoc] = useState<PassportDoc>(first);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // the saved passport replaces the first version from the lab profile
  useEffect(() => { if (saved.data?.doc) setDoc(saved.data.doc); }, [saved.data]);

  const L = doc.lang;
  const status = saved.data?.status;
  const setGeneral = (k: string, v: string) => setDoc({ ...doc, general: { ...doc.general, [k]: v } });
  const setTable = (k: TableKey, t: PassportTable) => setDoc({ ...doc, tables: { ...doc.tables, [k]: t } });
  const setLang = (lang: PassportLang) => {
    // switching the language changes empty column headers and the default approval block to that language
    const tables = { ...doc.tables };
    for (const t of TABLES) { const cur = tables[t.key]; if (!cur || !cur.rows.length) delete tables[t.key]; }
    const def = DEFAULT_APPROVER[doc.lang].join('\n') === doc.approver.join('\n') || !doc.approver.length;
    setDoc({ ...doc, lang, tables, approver: def ? DEFAULT_APPROVER[lang] : doc.approver });
  };

  const run = (submit: boolean) => {
    setNote(''); setError(null);
    save.mutate({ labId: lab.id, year, doc, submit }, { onSuccess: () => setNote(submit ? "Submitted to the dean's office." : 'Saved.'), onError: setError });
  };
  const pickPlan = async (f: File | undefined) => {
    if (!f) return;
    try { setDoc({ ...doc, plan_image: await compressImage(f) }); } catch (e) { setError(e); }
  };
  const download = () => {
    const title = document.title;
    document.title = `Lab Passport ${year} - ${doc.general.name || lab.name}`;
    document.body.classList.add('printing-passport');
    const done = () => { document.body.classList.remove('printing-passport'); document.title = title; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <main className="container content-page passport-page">
      <BackButton fallback={`/labs/${lab.slug}`} />
      <div className="page-head-row">
        <div>
          <h1>Lab Passport · {year}</h1>
          <p className="small-note">Зертхана паспорты — {lab.name}{status ? ` · ${STATUS_LABEL[status]}` : ''}{doc.general.type ? ` · ${doc.general.type}` : ''}</p>
        </div>
      </div>
      {!saved.data?.doc && !saved.isLoading && <p className="small-note">Filled in from the lab profile. Check every section, then save or submit it.</p>}

      <form className="partner-form passport-form" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        <div className="seg pp-lang" role="group" aria-label="Language of the passport">
          <button type="button" className={L === 'kk' ? 'is-on' : ''} onClick={() => setLang('kk')}>Қазақша</button>
          <button type="button" className={L === 'en' ? 'is-on' : ''} onClick={() => setLang('en')}>English</button>
        </div>

        <fieldset className="pp-section">
          <legend>{T.approve[L]}</legend>
          <label><span>Approval block (one line each)</span>
            <textarea rows={3} value={doc.approver.join('\n')} onChange={(e) => setDoc({ ...doc, approver: e.target.value.split('\n') })} />
          </label>
        </fieldset>

        <fieldset className="pp-section">
          <legend>1. {T.s1[L]}</legend>
          {GENERAL_FIELDS.map((f, i) => (
            <label key={f.key}><span>1.{i + 1} {f.label[L]}</span>
              {f.rows === 1
                ? <input value={doc.general[f.key] ?? ''} onChange={(e) => setGeneral(f.key, e.target.value)} />
                : <textarea rows={f.rows} value={doc.general[f.key] ?? ''} onChange={(e) => setGeneral(f.key, e.target.value)} />}
            </label>
          ))}
          {TABLES.filter((t) => t.section === 1).map((t, i) => (
            <div key={t.key} className="pp-block">
              <h3>1.{GENERAL_FIELDS.length + i + 1} {t.label[L]}</h3>
              <TableEditor value={tableOf(doc, t.key)} onChange={(v) => setTable(t.key, v)} />
            </div>
          ))}
        </fieldset>

        {([2, 3, 4] as const).map((sec) => (
          <fieldset key={sec} className="pp-section">
            <legend>{sec}. {T[ROMAN_HEADS[sec]][L]}</legend>
            {sec === 3 && (
              <div className="pp-block">
                <h3>{T.plan[L]}</h3>
                {doc.plan_image
                  ? <div className="pp-plan"><img src={doc.plan_image} alt="Plan of the room" /><Button type="button" size="sm" variant="ghost" onClick={() => setDoc({ ...doc, plan_image: '' })}><X />Remove the plan</Button></div>
                  : <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus />Add a plan picture</Button>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPlan(e.target.files?.[0]); e.target.value = ''; }} />
                <label><span>Legend / notes under the plan</span><textarea rows={2} value={doc.plan_note ?? ''} onChange={(e) => setDoc({ ...doc, plan_note: e.target.value })} /></label>
              </div>
            )}
            {TABLES.filter((t) => t.section === sec).map((t) => (
              <div key={t.key} className="pp-block">
                <h3>{t.label[L]}</h3>
                <TableEditor value={tableOf(doc, t.key)} onChange={(v) => setTable(t.key, v)} />
              </div>
            ))}
            {sec === 4 && (
              <label><span>{T.outcomes[L]}</span><textarea rows={4} value={doc.outcomes ?? ''} onChange={(e) => setDoc({ ...doc, outcomes: e.target.value })} /></label>
            )}
          </fieldset>
        ))}

        <fieldset className="pp-section pp-sign">
          <legend>{T.prepared[L]} / {T.agreed[L]}</legend>
          <label><span>{T.prepared[L]} — position</span><input value={doc.prepared.role ?? ''} onChange={(e) => setDoc({ ...doc, prepared: { ...doc.prepared, role: e.target.value } })} /></label>
          <label><span>{T.prepared[L]} — name</span><input value={doc.prepared.name ?? ''} onChange={(e) => setDoc({ ...doc, prepared: { ...doc.prepared, name: e.target.value } })} /></label>
          <label><span>{T.agreed[L]} — position</span><input value={doc.agreed.role ?? ''} onChange={(e) => setDoc({ ...doc, agreed: { ...doc.agreed, role: e.target.value } })} /></label>
          <label><span>{T.agreed[L]} — name</span><input value={doc.agreed.name ?? ''} onChange={(e) => setDoc({ ...doc, agreed: { ...doc.agreed, name: e.target.value } })} /></label>
        </fieldset>

        {error != null && <p className="form-alert">{humanError(error)}</p>}
        {note && <p className="small-note" role="status">{note}</p>}
        <div className="editor-actions pp-actions">
          <Button type="button" variant="outline" onClick={download}><Download />Download Passport as PDF</Button>
          <Button type="submit" variant="outline" disabled={save.isPending}><Save />Save draft</Button>
          <Button type="button" className="editor-save" disabled={save.isPending} onClick={() => run(true)}><Send />Submit to the dean's office</Button>
          {caps.isAdmin && status === 'submitted' && (
            <Button type="button" disabled={approve.isPending} onClick={() => { setError(null); approve.mutate({ labId: lab.id, year }, { onSuccess: () => setNote('Approved.'), onError: setError }); }}><CheckCircle2 />Approve</Button>
          )}
        </div>
      </form>

      <PassportDocument doc={doc} />
    </main>
  );
}

/** The printed passport, laid out like the dean's office .docx (shown only when printing). */
export function PassportDocument({ doc }: { doc: PassportDoc }) {
  const L = doc.lang;
  const g = doc.general;
  const items = GENERAL_FIELDS.filter((f) => (g[f.key] ?? '').trim() && g[f.key] !== '-');
  const tablesOf = (sec: 1 | 2 | 3 | 4) => TABLES.filter((t) => t.section === sec && hasRows(doc.tables[t.key]));
  const sec1Tables = tablesOf(1);
  const sections: { n: number; key: 2 | 3 | 4 }[] = [];
  const has2 = tablesOf(2).length > 0;
  const has3 = !!doc.plan_image || !!doc.plan_note?.trim() || tablesOf(3).length > 0;
  const has4 = tablesOf(4).length > 0 || !!doc.outcomes?.trim();
  let n = 2;
  if (has2) sections.push({ n: n++, key: 2 });
  if (has3) sections.push({ n: n++, key: 3 });
  if (has4) sections.push({ n: n++, key: 4 });

  const table = (k: TableKey) => {
    const t = doc.tables[k]!;
    return (
      <table className="pd-table">
        <thead><tr><th className="pd-no">{T.no[L]}</th>{t.columns.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
        <tbody>{t.rows.filter((r) => r.some((c) => c.trim())).map((r, i) => (
          <tr key={i}><td className="pd-no">{i + 1}</td>{t.columns.map((_, j) => <td key={j}>{(r[j] ?? '').split('\n').map((x, q) => <div key={q}>{x}</div>)}</td>)}</tr>
        ))}</tbody>
      </table>
    );
  };
  const para = (s: string) => s.split('\n').filter((x) => x.trim()).map((x, i) => <p key={i}>{x}</p>);

  return (
    <article className="passport-doc" aria-hidden>
      <div className="pd-approve">
        <strong>{T.approve[L]}</strong>
        {doc.approver.filter((x) => x.trim()).map((x, i) => <div key={i}>{x}</div>)}
        <div className="pd-sign-line">______________</div>
        <div>{T.date[L]}</div>
      </div>
      {doc.header_note?.length ? <div className="pd-note">{doc.header_note.map((x, i) => <div key={i}>{x}</div>)}</div> : null}
      <h1>{T.title[L]}</h1>

      <h2>1. {T.s1[L]}</h2>
      {items.map((f, i) => (
        <div key={f.key} className="pd-item">
          <b>1.{i + 1} {f.label[L]}:</b>{' '}
          {f.key === 'specialization' ? <div className="pd-text">{para(g[f.key] ?? '')}</div> : <span className="pd-inline">{(g[f.key] ?? '').split('\n').map((x, q) => <span key={q}>{q > 0 && <br />}{x}</span>)}</span>}
        </div>
      ))}
      {sec1Tables.map((t, i) => (
        <div key={t.key} className="pd-item">
          <b>1.{items.length + i + 1} {t.label[L]}:</b>
          {table(t.key)}
        </div>
      ))}

      {sections.map((s) => (
        <section key={s.key}>
          <h2>{s.n}. {T[ROMAN_HEADS[s.key]][L]}</h2>
          {(() => {
            let k = 0;
            const out: JSX.Element[] = [];
            if (s.key === 3 && (doc.plan_image || doc.plan_note?.trim())) {
              k += 1;
              out.push(<div key="plan" className="pd-item"><b>{s.n}.{k} {T.plan[L]}</b>{doc.plan_image && <img className="pd-plan" src={doc.plan_image} alt="" />}{doc.plan_note && <div className="pd-text">{para(doc.plan_note)}</div>}</div>);
            }
            for (const t of tablesOf(s.key)) { k += 1; out.push(<div key={t.key} className="pd-item"><b>{s.n}.{k} {t.label[L]}</b>{table(t.key)}</div>); }
            if (s.key === 4 && doc.outcomes?.trim()) { k += 1; out.push(<div key="out" className="pd-item"><b>{s.n}.{k} {T.outcomes[L]}</b><div className="pd-text">{para(doc.outcomes)}</div></div>); }
            return out;
          })()}
        </section>
      ))}

      <div className="pd-signs">
        {(['prepared', 'agreed'] as const).map((k) => (
          <div key={k} className="pd-sign">
            <b>{T[k][L]}</b>
            <div className="pd-sign-row"><span>{doc[k].role ?? ''}</span><i /><span>{doc[k].name ?? ''}</span></div>
            <small>{T.sign[L]}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
