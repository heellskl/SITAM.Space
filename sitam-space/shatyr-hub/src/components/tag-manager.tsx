// Admin → Tags: the shared list of research areas, skills and equipment of all labs.
// The coordinator renames a tag everywhere, merges spellings ("pytorch" → "PyTorch") or removes a tag.
// The database checks the coordinator right (admin_rename_lab_tag).

import { useState } from 'react';
import { Check, Merge, Pencil, Tags, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { humanError } from '@/lib/api';
import { TAG_KIND_LABEL, useRenameTag, useTagCatalog, type TagKind } from '@/lib/lab-tags';

export function TagManager() {
  const catalog = useTagCatalog();
  const rename = useRenameTag();
  const [kind, setKind] = useState<TagKind>('area');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const list = catalog[kind].filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));

  const run = (from: string, to: string | null) =>
    rename.mutate({ kind, from, to }, {
      onSuccess: (n) => {
        toast.success(to ? `“${from}” → “${to}”` : `“${from}” removed`, { description: `${n} ${n === 1 ? 'lab' : 'labs'} updated` });
        setEditing(null);
      },
      onError: (err) => toast.error(humanError(err)),
    });

  return (
    <section className="panel mt-6" aria-labelledby="tag-manager">
      <h3 className="panel-title" id="tag-manager"><Tags size={15} />Tags of all labs</h3>
      <p className="small-note mb-3">What one lab adds is suggested to every other lab. Rename a tag to fix its spelling everywhere; renaming it to an existing tag merges the two.</p>
      <div className="tag-admin-bar">
        <div className="view-switch" role="tablist" aria-label="Tag type">
          {(['area', 'skill', 'equipment'] as TagKind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => { setKind(k); setEditing(null); }}>
              {TAG_KIND_LABEL[k]} · {catalog[k].length}
            </button>
          ))}
        </div>
        <input className="tag-admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag" aria-label="Find a tag" />
      </div>
      <ul className="tag-admin-list">
        {list.map((t) => (
          <li key={t.name}>
            {editing === t.name ? (
              <form className="tag-admin-edit" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && draft.trim() !== t.name) run(t.name, draft.trim()); }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} aria-label={`New name for ${t.name}`} list="tag-admin-known" />
                <datalist id="tag-admin-known">{catalog[kind].filter((x) => x.name !== t.name).map((x) => <option key={x.name} value={x.name} />)}</datalist>
                <Button type="submit" size="sm" disabled={rename.isPending || !draft.trim() || draft.trim() === t.name}>
                  {catalog[kind].some((x) => x.name.toLowerCase() === draft.trim().toLowerCase() && x.name !== t.name) ? <><Merge />Merge</> : <><Check />Rename</>}
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}><X /></Button>
              </form>
            ) : (
              <>
                <span className="tag-admin-name">{t.name}</span>
                <small>{t.count} {t.count === 1 ? 'lab' : 'labs'}</small>
                <Button size="icon" variant="ghost" aria-label={`Rename ${t.name}`} onClick={() => { setEditing(t.name); setDraft(t.name); }}><Pencil /></Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${t.name} from all labs`} disabled={rename.isPending}
                  onClick={() => { if (window.confirm(`Remove “${t.name}” from ${t.count} ${t.count === 1 ? 'lab' : 'labs'}?`)) run(t.name, null); }}><Trash2 /></Button>
              </>
            )}
          </li>
        ))}
        {!catalog.loading && list.length === 0 && <li className="small-note">No tags.</li>}
      </ul>
    </section>
  );
}
