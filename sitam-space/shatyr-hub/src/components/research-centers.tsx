// Research → Center of Research (v29): the two SITAM research centers. Each sub-tab shows the head of the center
// and only the labs assigned to that center (labs.center, set by the coordinator in Admin). A lab card opens the lab page.
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { LabCard } from '@/components/labs-feed';
import { LAB_CENTERS, useLabs, useProfessors, useProjects, type LabCenter } from '@/lib/api';
import { useMyLabs } from '@/lib/my-labs';

export function ResearchCenters({ terms }: { terms: string[] }) {
  const labs = useLabs();
  const projects = useProjects();
  const profs = useProfessors();
  const my = useMyLabs();
  const [center, setCenter] = useState<LabCenter>('ai');
  const info = LAB_CENTERS.find((c) => c.id === center)!;
  const head = (profs.data ?? []).find((p) => p.username === info.headUsername);

  const projectCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projects.data ?? []) if (p.lab_id) m.set(p.lab_id, (m.get(p.lab_id) ?? 0) + 1);
    return m;
  }, [projects.data]);

  const inCenter = useMemo(() => (labs.data ?? []).filter((l) => (l.kind ?? 'lab') === 'lab' && (l.center ?? 'ai') === center), [labs.data, center]);
  const found = useMemo(() => (!terms.length ? inCenter : inCenter.filter((l) => {
    const hay = `${l.name} ${l.tags.join(' ')} ${(l.skills ?? []).join(' ')} ${l.lab_members.map((m) => m.full_name).join(' ')}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  })), [inCenter, terms]);
  const count = (id: LabCenter) => (labs.data ?? []).filter((l) => (l.kind ?? 'lab') === 'lab' && (l.center ?? 'ai') === id).length;

  return (
    <div className="centers">
      <div className="seg centers-seg" role="tablist" aria-label="Research centers">
        {LAB_CENTERS.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={center === c.id} className={center === c.id ? 'is-on' : ''} onClick={() => setCenter(c.id)}>
            {c.name}{labs.data ? ` · ${count(c.id)}` : ''}
          </button>
        ))}
      </div>

      <section className="panel center-head">
        <div>
          <h2 className="panel-title">{info.name}</h2>
          <p className="small-note">{info.scope}</p>
        </div>
        <Link to="/research/$username" params={{ username: info.headUsername }} className="center-head-person">
          {head?.photo_url ? <img src={head.photo_url} alt="" /> : <span className="center-head-initials" aria-hidden>{info.head.split(' ').map((w) => w[0]).join('')}</span>}
          <span><small>Head of the center</small><strong>{info.head}</strong></span>
          <ArrowUpRight size={16} aria-hidden />
        </Link>
      </section>

      <div className="labcard-grid" aria-label={`Labs of the ${info.name}`}>
        {found.map((l) => <LabCard key={l.id} lab={l} projects={projectCount.get(l.id) ?? 0} mine={my.isMineLab(l.id)} />)}
      </div>
      {!labs.isLoading && found.length === 0 && (
        <p className="small-note">{terms.length ? 'Nothing found.' : 'No labs in this center yet. The SITAM coordinator assigns labs to a center.'}</p>
      )}
    </div>
  );
}
