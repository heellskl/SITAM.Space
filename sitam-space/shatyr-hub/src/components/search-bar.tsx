import { Search, X } from 'lucide-react';

/** The one search field used on every page (Labs, Events, Research, Projects): left-aligned and wide. */
export function SearchBar({ value, onChange, placeholder = 'Search', label, onSubmit }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; onSubmit?: () => void;
}) {
  return (
    <form className="site-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <label className="site-search-box">
        <Search size={18} aria-hidden />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} maxLength={100} />
        {value && <button type="button" className="site-search-clear" onClick={() => onChange('')} aria-label="Clear search"><X size={16} /></button>}
      </label>
    </form>
  );
}
