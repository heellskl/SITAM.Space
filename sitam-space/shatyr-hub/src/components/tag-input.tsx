// Chips input: type and press Enter (or a comma) to add, × to remove. Suggestions come from what other labs
// already use, so the same tag is spelled the same way everywhere (needed for filtering and sorting later).

import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export function TagInput({ value, onChange, suggestions = [], placeholder, max = 30, label }: {
  value: string[]; onChange: (next: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number; label: string;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (raw: string) => {
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    const next = [...value];
    for (const p of parts) {
      // reuse the spelling another lab already uses ("pytorch" → "PyTorch")
      const known = suggestions.find((x) => x.toLowerCase() === p.toLowerCase()) ?? p;
      if (!next.some((v) => v.toLowerCase() === known.toLowerCase()) && next.length < max) next.push(known.slice(0, 60));
    }
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button>
        </span>
      ))}
      <input
        aria-label={label}
        list={listId}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
      />
      <datalist id={listId}>{suggestions.filter((x) => !has(x)).slice(0, 200).map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}
