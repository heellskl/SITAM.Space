// Chips input with a shared list: type and press Enter (or a comma) to add, × to remove.
// The list under the field shows what other labs already use (most used first, with the number of labs),
// so every lab picks the same spelling — that is what filtering and sorting labs by tag relies on.

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';

export type TagSuggestion = string | { name: string; count: number };

export function TagInput({ value, onChange, suggestions = [], placeholder, max = 30, label }: {
  value: string[]; onChange: (next: string[]) => void; suggestions?: TagSuggestion[]; placeholder?: string; max?: number; label: string;
}) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const known = useMemo(() => suggestions.map((s) => (typeof s === 'string' ? { name: s, count: 0 } : s)), [suggestions]);
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());

  const term = draft.trim().toLowerCase();
  const options = useMemo(() => {
    const free = known.filter((s) => !has(s.name));
    const list = term ? free.filter((s) => s.name.toLowerCase().includes(term)).sort((a, b) =>
      Number(!b.name.toLowerCase().startsWith(term)) - Number(!a.name.toLowerCase().startsWith(term)) || b.count - a.count) : free;
    return list.slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, term, value]);
  const exact = known.some((s) => s.name.toLowerCase() === term);

  const add = (raw: string) => {
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) {
      // reuse the spelling another lab already uses ("pytorch" → "PyTorch")
      const same = known.find((x) => x.name.toLowerCase() === p.toLowerCase())?.name ?? p;
      if (!next.some((v) => v.toLowerCase() === same.toLowerCase()) && next.length < max) next.push(same.slice(0, 60));
    }
    onChange(next);
    setDraft('');
    setActive(0);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && options.length) { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % options.length); }
    else if (e.key === 'ArrowUp' && options.length) { e.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === ',') {
      if (open && options[active] && (e.key === 'Enter') && (term === '' || options[active]!.name.toLowerCase().includes(term))) {
        e.preventDefault(); add(options[active]!.name);
      } else if (draft.trim()) { e.preventDefault(); add(draft); }
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div className="tag-field">
      <div className="tag-input" onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== t)); }}><X size={12} /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          aria-label={label}
          role="combobox"
          aria-expanded={open && (options.length > 0 || !!term)}
          aria-controls={listId}
          aria-autocomplete="list"
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) add(v); else { setDraft(v); setOpen(true); setActive(0); } }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => { setOpen(false); if (inputRef.current?.value.trim()) add(inputRef.current.value); }, 150)}
          onKeyDown={onKey}
        />
      </div>
      {open && (options.length > 0 || (term && !exact)) && (
        <ul id={listId} className="tag-suggest" role="listbox" aria-label={`${label}: used by other labs`}>
          {!term && <li className="tag-suggest-head" aria-hidden>Used by other labs</li>}
          {options.map((s, i) => (
            <li key={s.name} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.name)} onMouseEnter={() => setActive(i)}>
                <span>{s.name}</span>{s.count > 0 && <small>{s.count} {s.count === 1 ? 'lab' : 'labs'}</small>}
              </button>
            </li>
          ))}
          {term && !exact && (
            <li role="option" aria-selected={false}>
              <button type="button" className="tag-suggest-new" onMouseDown={(e) => e.preventDefault()} onClick={() => add(draft)}>
                <Plus size={13} />Add “{draft.trim()}” as a new tag
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
