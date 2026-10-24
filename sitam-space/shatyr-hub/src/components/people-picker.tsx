import { useState } from 'react';
import { personName, useSearchPeople, type Person } from '@/lib/api';
import { ROLE_LABEL, type Role } from '@/lib/auth';

/** Search registered users by name or e-mail and pick one. */
export function PeoplePicker({ onPick, placeholder = 'Search users by name or e-mail', exclude = [] }: {
  onPick: (p: Person) => void; placeholder?: string; exclude?: string[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const res = useSearchPeople(q);
  const list = (res.data ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="people-pick">
      <input
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && q.trim().length >= 2 && (
        <ul className="people-pick-list" role="listbox">
          {res.isLoading && <li className="small-note p-2">Searching…</li>}
          {!res.isLoading && list.length === 0 && <li className="small-note p-2">Nobody found. People appear here after their first sign-in.</li>}
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(p); setQ(''); setOpen(false); }}>
                <strong>{personName(p)}</strong>
                <small>{p.email} · {ROLE_LABEL[p.role as Role] ?? p.role}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
