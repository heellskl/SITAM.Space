import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Bookmark, BookmarkCheck, FlaskConical, MapPin, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/search-bar';
import { humanError, useLabs, useToggleSavedLab, type Lab } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LAB_FOCUS } from '@/lib/sitam-data';

export function leadOf(lab: Lab): string {
  return lab.lab_members.find((m) => m.role === 'lead')?.full_name ?? 'Lead to be announced';
}

export function LabLogo({ lab, size = 22 }: { lab: Pick<Lab, 'logo_url' | 'name'>; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="lab-icon">
      {lab.logo_url && !broken ? (
        <img src={lab.logo_url} alt="" className="lab-logo-img" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <FlaskConical size={size} />
      )}
    </span>
  );
}

export function useSavedLabs() {
  const { user, caps, refresh } = useAuth();
  const toggle = useToggleSavedLab(user?.id, caps.savedLabs, () => void refresh());
  return {
    signedIn: !!user,
    saved: caps.savedLabs,
    toggle: (lab: Lab) =>
      toggle.mutate(lab.id, {
        onSuccess: (now) => toast.success(now ? 'Lab saved' : 'Removed from saved', { description: lab.name }),
        onError: (e) => toast.error(humanError(e)),
      }),
  };
}

/** `exclude`: lab ids already shown above (e.g. "My labs" on the Labs page). */
export function LabBrowser({ limit, compact = false, exclude }: { limit?: number; compact?: boolean; exclude?: string[] }) {
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<string>('All');
  const { data, isLoading, error } = useLabs();
  const { saved, toggle, signedIn } = useSavedLabs();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const skip = new Set(exclude ?? []);
    const list = (data ?? []).filter(
      (l) =>
        !skip.has(l.id) &&
        (focus === 'All' || l.focus.includes(focus)) &&
        `${l.name} ${l.description} ${l.focus.join(' ')} ${l.tags.join(' ')} ${(l.skills ?? []).join(' ')} ${l.lab_members.map((m) => m.full_name).join(' ')} ${l.location} ${l.ongoing_projects.join(' ')}`
          .toLowerCase()
          .includes(q),
    );
    return limit ? list.slice(0, limit) : list;
  }, [data, query, focus, limit, exclude]);

  return (
    <>
      {!compact && (
        <div className="lab-controls">
          <div className="filter-list" aria-label="Lab focus">
            {(['All', ...LAB_FOCUS] as const).map((c) => (
              <Button key={c} variant="ghost" className={focus === c ? 'filter active' : 'filter'} aria-pressed={focus === c} onClick={() => setFocus(c)}>
                {c === 'All' ? 'All labs' : c}
              </Button>
            ))}
          </div>
          <SearchBar value={query} onChange={setQuery} placeholder="Search labs, people, topics" />
        </div>
      )}

      {error && <p className="form-alert">{humanError(error)}</p>}
      {!compact && <p className="small-note mb-3" aria-live="polite">{isLoading ? 'Loading labs…' : `${shown.length} lab${shown.length === 1 ? '' : 's'}`}</p>}

      <div className="lab-grid">
        {isLoading && Array.from({ length: limit ?? 6 }, (_, i) => <div key={i} className="lab-card skeleton-card" aria-hidden />)}
        {shown.map((l) => {
          const isSaved = saved.includes(l.id);
          const team = l.lab_members.filter((m) => m.role !== 'former_lead').length;
          return (
            <div key={l.id} className="lab-card-wrap">
              <Link to="/labs/$slug" params={{ slug: l.slug }} className="lab-card" aria-label={`Open ${l.name}`}>
                <div className="lab-card-top">
                  <LabLogo lab={l} />
                  <ArrowUpRight className="card-arrow" />
                </div>
                <div className="lab-category">{l.focus.join(' · ') || 'Laboratory'}</div>
                <h3>{l.name}</h3>
                <p className="lab-desc">{l.description}</p>
                <div className="lab-card-bottom">
                  {l.location && <span><MapPin size={13} />{l.location}</span>}
                  <span><Users size={13} />{team} people</span>
                  {l.year_founded && <span>Since {l.year_founded}</span>}
                </div>
              </Link>
              {signedIn && (
                <button type="button" className={isSaved ? 'save-btn saved' : 'save-btn'} aria-pressed={isSaved} aria-label={isSaved ? `Remove ${l.name} from saved labs` : `Save ${l.name}`} onClick={() => toggle(l)}>
                  {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!isLoading && shown.length === 0 && (
        <div className="empty-state">
          <FlaskConical />
          <h3>No labs found</h3>
          <p>Try another search or focus.</p>
          {!compact && <Button variant="outline" onClick={() => { setFocus('All'); setQuery(''); }}>Clear filters</Button>}
        </div>
      )}
    </>
  );
}
