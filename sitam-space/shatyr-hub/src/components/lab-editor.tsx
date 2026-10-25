// Lab head editor — mirrors the lab form (labs.json fields). List answers: one item per line.

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ImagePlus, Lock, Plus, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  HEAD_ROLES, LAB_POSITION_LABEL, LAB_ROLE_ORDER, humanError, labSetupSteps, saveLab, uploadLabImage, useLabContacts, useLabInternal, useLabs, useProjects,
  type Lab, type LabInternal, type LabRole, type MemberDraft, type ProjectDraft, type SocialLink,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LAB_DIRECTIONS, LAB_FOCUS } from '@/lib/sitam-data';
import { TagInput } from '@/components/tag-input';
import { splitItems } from '@/components/lab-page';

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const nullable = (s: string) => (s.trim() ? s.trim() : null);
const ROLES: LabRole[] = LAB_ROLE_ORDER;
const SINGULAR = LAB_POSITION_LABEL;
const isHeadRole = (r: LabRole) => HEAD_ROLES.includes(r);

function Block({ title, note, children, wide }: { title: string; note?: string; children: ReactNode; wide?: boolean }) {
  return (
    <fieldset className={wide ? 'panel editor-block wide' : 'panel editor-block'}>
      <legend className="panel-title">{title}</legend>
      {note && <p className="small-note">{note}</p>}
      {children}
    </fieldset>
  );
}

/** The editor is split into 5 sections; only the chosen one is shown (all answers are kept while switching). */
const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'media', label: 'Logo & links' },
  { id: 'team', label: 'Team' },
  { id: 'projects', label: 'Projects' },
  { id: 'activities', label: 'Activities' },
  { id: 'partners', label: 'Partners' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function F({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="editor-field">
      <span>{label}{required && <b aria-hidden> *</b>}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function LabEditor({ lab, onDone }: { lab: Lab; onDone: () => void }) {
  const { user, caps } = useAuth();
  // Lead positions can be changed only by the lab lead / co-lead (the database enforces it too).
  const canEditHeads = caps.isAdmin; // heads are assigned by the coordinator only
  const internalQ = useLabInternal(lab.id, true);
  const contactsQ = useLabContacts(lab.id, true);
  const projectsQ = useProjects();
  if (internalQ.isLoading || contactsQ.isLoading || projectsQ.isLoading) {
    return <main className="container content-page"><p className="small-note">Loading the lab form…</p></main>;
  }
  return (
    <EditorForm
      key={lab.updated_at}
      lab={lab}
      internal={internalQ.data ?? null}
      contacts={contactsQ.data ?? []}
      projects={(projectsQ.data ?? []).filter((p) => p.lab_id === lab.id)}
      userId={user?.id ?? ''}
      canEditHeads={canEditHeads}
      onDone={onDone}
    />
  );
}

type Props = {
  lab: Lab;
  internal: LabInternal | null;
  contacts: { member_id: string; email: string | null; contact: string | null }[];
  projects: NonNullable<ReturnType<typeof useProjects>['data']>;
  userId: string;
  canEditHeads: boolean;
  onDone: () => void;
};

function EditorForm({ lab, internal, contacts, projects, userId, canEditHeads, onDone }: Props) {
  const contactOf = (id: string) => contacts.find((c) => c.member_id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<SectionId>('about');
  /** Show a problem on the section where it can be fixed. */
  const problem = (msg: string, at: SectionId) => { setTab(at); setError(msg); };
  const join = (a: string[] | undefined) => (a ?? []).join('\n');
  const [f, setF] = useState(() => ({
    name: lab.name,
    year_founded: lab.year_founded ? String(lab.year_founded) : '',
    founders: lab.founders.join(', '),
    description: lab.description,
    tags: lab.tags.join(', '),
    skills: (lab.skills ?? []).join(', '),
    contact_email: lab.contact_email ?? '',
    website: lab.website ?? '',
    location: lab.location,
    equipment: lab.equipment ?? '',
    seminars: join(lab.seminars),
    courses: join(lab.courses),
    organized_events: join(lab.organized_events),
    external_events: join(lab.external_events),
    awards: join(lab.awards),
    grants: join(lab.grants),
    notable_alumni: join(lab.notable_alumni),
    alumni_contributors: join(lab.alumni_contributors),
    current_partners: join(lab.current_partners),
    prospective_partners: join(lab.prospective_partners),
    orgs_kz: join(lab.orgs_kz),
    orgs_global: join(lab.orgs_global),
    events_kz: join(lab.events_kz),
    events_global: join(lab.events_global),
    photo_archive_link: lab.photo_archive_link ?? '',
    visitor_walkthrough: lab.visitor_walkthrough ?? '',
    live_demo: lab.live_demo ?? '',
    demo_stand: lab.demo_stand ?? '',
    upcoming_activities: join(lab.upcoming_activities),
    presenters: join(internal?.presenters),
    goals: join(internal?.goals),
    required_support: join(internal?.required_support),
    resource_gaps: join(internal?.resource_gaps),
    action_plan_link: internal?.action_plan_link ?? '',
  }));
  const [focus, setFocus] = useState<string[]>(lab.focus);
  const [direction, setDirection] = useState<string>(lab.direction ?? '');
  const [tagList, setTagList] = useState<string[]>(lab.tags);
  const [skillList, setSkillList] = useState<string[]>(lab.skills ?? []);
  const [equipList, setEquipList] = useState<string[]>(splitItems(lab.equipment));
  // suggestions: what the other labs already use
  const allLabs = useLabs();
  const known = (pick: (l: Lab) => string[]) => [...new Set((allLabs.data ?? []).flatMap(pick))].sort((a, b) => a.localeCompare(b));
  const tagSuggest = known((l) => l.tags);
  const skillSuggest = known((l) => l.skills ?? []);
  const equipSuggest = known((l) => splitItems(l.equipment));
  const [socials, setSocials] = useState<SocialLink[]>(lab.social_links.length ? lab.social_links : [{ platform: 'LinkedIn', url: '' }]);
  const [logo, setLogo] = useState(lab.logo_url);
  const [photos, setPhotos] = useState<string[]>(lab.photo_urls);
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    lab.lab_members
      .slice()
      .sort((a, b) => Number(!!a.is_past) - Number(!!b.is_past) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.sort_order - b.sort_order)
      .map((m) => ({ id: m.id, full_name: m.full_name, title: m.title ?? '', role: m.role, term: m.term ?? '', email: contactOf(m.id)?.email ?? '', contact: contactOf(m.id)?.contact ?? '',
        is_past: !!m.is_past, graduation_year: m.graduation_year ? String(m.graduation_year) : '' })),
  );
  const [projs, setProjs] = useState<ProjectDraft[]>(() =>
    projects.map((p) => ({
      id: p.id, title: p.title, kind: p.kind, status: p.status, summary: p.summary ?? '', year: p.year ? String(p.year) : '',
      github_url: p.github_url ?? '', demo_url: p.demo_url ?? '', paper_url: p.paper_url ?? '', tags: p.tags.join(', '),
    })),
  );
  const [removedProjects, setRemovedProjects] = useState<string[]>([]);

  const set = <K extends keyof typeof f>(k: K) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const text = (k: keyof typeof f, rows = 3, hint?: string) => <textarea rows={rows} value={f[k]} onChange={set(k)} placeholder={hint} />;
  const patchMember = (i: number, p: Partial<MemberDraft>) => setMembers((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const patchProject = (i: number, p: Partial<ProjectDraft>) => setProjs((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function upload(files: FileList | null, kind: 'logo' | 'photos') {
    if (!files?.length) return;
    try {
      const list = Array.from(files).slice(0, 10);
      for (const file of list) if (file.size > 10 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 10 MB.`);
      if (kind === 'logo') {
        const first = list[0];
        if (first) setLogo(await uploadLabImage(lab.id, first, 'logo'));
      } else {
        const urls = await Promise.all(list.map((file) => uploadLabImage(lab.id, file, 'photos')));
        setPhotos((p) => [...p, ...urls].slice(0, 30));
      }
      toast.success('Uploaded — press Save to keep it');
    } catch (e) {
      toast.error('Upload failed', { description: humanError(e) });
    }
  }

  async function save() {
    setError('');
    const missing = [
      !f.name.trim() && 'Lab name',
      !f.description.trim() && 'Description',
      !focus.length && 'Lab focus',
      !f.location.trim() && 'Location',
      // a student lead cannot create the lead row, so the lead is required only from people who can set it
      (canEditHeads || lab.lab_members.some((m) => m.role === 'lead')) && !members.some((m) => m.role === 'lead' && m.full_name.trim()) && 'Lab lead',
    ].filter(Boolean);
    if (missing.length) return problem(`Required: ${missing.join(', ')}.`, missing.length === 1 && missing[0] === 'Lab lead' ? 'team' : 'about');
    const year = f.year_founded.trim() ? Number(f.year_founded) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1990 || year > 2100)) return problem('Year founded must be a year like 2023.', 'about');
    const links: [string, SectionId][] = [
      [f.website, 'about'], [f.photo_archive_link, 'media'], [f.action_plan_link, 'activities'],
      ...socials.map((x): [string, SectionId] => [x.url, 'media']),
      ...projs.flatMap((p): [string, SectionId][] => [[p.demo_url, 'projects'], [p.github_url, 'projects'], [p.paper_url, 'projects']]),
    ];
    for (const [u, at] of links) if (u.trim() && !/^https?:\/\//i.test(u.trim())) return problem(`Links must start with https:// — check “${u}”.`, at);
    if (members.some((m) => m.full_name.trim().length < 2)) return problem('Every team row needs a full name (or remove the empty row).', 'team');
    if (members.some((m) => m.is_past && m.graduation_year && !/^(19|20)\d\d$/.test(m.graduation_year.trim()))) return problem('Graduation year must be a year like 2025.', 'team');
    if (f.contact_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact_email.trim())) return problem('Check the lab contact e-mail.', 'about');
    const csv = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
    if (projs.some((p) => p.title.trim().length < 2)) return problem('Every project needs a title (or remove the empty row).', 'projects');

    setBusy(true);
    try {
      await saveLab(
        lab,
        {
          name: f.name.trim(), year_founded: year, founders: f.founders.split(',').map((s) => s.trim()).filter(Boolean),
          description: f.description.trim(), focus, logo_url: logo, website: nullable(f.website),
          tags: tagList.slice(0, 20), skills: skillList.slice(0, 20), contact_email: nullable(f.contact_email.toLowerCase()),
          direction: direction || null, upcoming_activities: lines(f.upcoming_activities),
          social_links: socials.filter((s) => s.url.trim()).map((s) => ({ platform: s.platform.trim() || 'Link', url: s.url.trim() })),
          location: f.location.trim(), equipment: equipList.length ? equipList.join(', ') : null,
          seminars: lines(f.seminars), courses: lines(f.courses), organized_events: lines(f.organized_events), external_events: lines(f.external_events),
          awards: lines(f.awards), grants: lines(f.grants), notable_alumni: lines(f.notable_alumni), alumni_contributors: lines(f.alumni_contributors),
          current_partners: lines(f.current_partners), prospective_partners: lines(f.prospective_partners),
          orgs_kz: lines(f.orgs_kz), orgs_global: lines(f.orgs_global), events_kz: lines(f.events_kz), events_global: lines(f.events_global),
          photo_urls: photos, photo_archive_link: nullable(f.photo_archive_link),
          visitor_walkthrough: nullable(f.visitor_walkthrough), live_demo: nullable(f.live_demo), demo_stand: nullable(f.demo_stand),
          ...(!lab.setup_completed_at &&
          labSetupSteps({ ...lab, description: f.description.trim(), focus, tags: tagList, skills: skillList, location: f.location.trim(),
            contact_email: nullable(f.contact_email), website: nullable(f.website), social_links: socials.filter((x) => x.url.trim()),
            lab_members: members.map((m, i) => ({ id: m.id ?? `new-${i}`, lab_id: lab.id, user_id: null, full_name: m.full_name, title: m.title, role: m.role, term: m.term, can_edit: false, sort_order: i })),
          }).every((x) => x.done)
            ? { setup_completed_at: new Date().toISOString() }
            : {}),
        },
        {
          presenters: lines(f.presenters), goals: lines(f.goals), required_support: lines(f.required_support), resource_gaps: lines(f.resource_gaps),
          subscriptions: internal?.subscriptions ?? null, action_plan_link: nullable(f.action_plan_link),
        },
        members,
        { drafts: projs, removed: removedProjects },
        userId,
      );
      toast.success('Lab page updated');
      onDone();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container content-page lab-editor">
      <button type="button" className="back-link" onClick={onDone}><ArrowLeft size={14} />Back to the lab page</button>
      <span className="eyebrow">Edit lab · {lab.name}</span>
      <h1>Lab form</h1>
      <p className="page-intro">The same questions as the lab-head form, in 5 sections. Lists: one item per line. “Internal” (in Activities & partners) is visible only to lab heads and SITAM staff.</p>

      <div className="editor-tabs" role="tablist" aria-label="Lab form sections">
        {SECTIONS.map((x, i) => (
          <button key={x.id} type="button" role="tab" id={`lab-tab-${x.id}`} aria-selected={tab === x.id} aria-controls="lab-tab-panel"
            className={tab === x.id ? 'editor-tab is-active' : 'editor-tab'} onClick={() => setTab(x.id)}>
            <span aria-hidden>{i + 1}</span>{x.label}
          </button>
        ))}
      </div>

      <div className="editor-grid" role="tabpanel" id="lab-tab-panel" aria-labelledby={`lab-tab-${tab}`}>
        {tab === 'about' && <Block title="About the lab" wide>
          <F label="Lab name" required><input value={f.name} onChange={set('name')} maxLength={120} /></F>
          <div className="auth-row">
            <F label="Year founded"><input inputMode="numeric" value={f.year_founded} onChange={set('year_founded')} maxLength={4} /></F>
            <F label="Location / room" required><input value={f.location} onChange={set('location')} maxLength={120} /></F>
          </div>
          <F label="Founder(s)" hint="Comma-separated"><input value={f.founders} onChange={set('founders')} /></F>
          <F label="Description & focus areas" required>{text('description', 6)}</F>
          <div className="editor-field"><span>Research areas</span>
            <TagInput label="Research areas" value={tagList} onChange={setTagList} suggestions={tagSuggest} placeholder="Type and press Enter: NLP, Computer vision…" />
            <small className="field-hint">One chip per area. Pick a suggestion when it fits, so labs can be filtered by it.</small></div>
          <div className="editor-field"><span>Skills</span>
            <TagInput label="Skills" value={skillList} onChange={setSkillList} suggestions={skillSuggest} placeholder="Python, PyTorch, Arduino…" /></div>
          <div className="editor-field"><span>Equipment</span>
            <TagInput label="Equipment" value={equipList} onChange={setEquipList} suggestions={equipSuggest} placeholder="GPU server, 3D printer, sensors…" /></div>
          <F label="Direction" hint="The second filter on the Labs page">
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">— choose —</option>
              {LAB_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </F>
          <F label="Lab contact e-mail" hint="Public — for students and partners"><input type="email" value={f.contact_email} onChange={set('contact_email')} placeholder="lab@sdu.edu.kz" /></F>
          <fieldset className="editor-field">
            <span>Lab focus <b aria-hidden>*</b></span>
            <div className="check-row">
              {LAB_FOCUS.map((v) => (
                <label key={v} className="check">
                  <input type="checkbox" checked={focus.includes(v)} onChange={(e) => setFocus((s) => (e.target.checked ? [...s, v] : s.filter((x) => x !== v)))} />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <F label="Website"><input value={f.website} onChange={set('website')} placeholder="https://" /></F>
        </Block>}

        {tab === 'media' && <Block title="Logo, social media, photos" wide>
          <div className="logo-row">
            <span className="lab-icon lab-icon-lg">{logo ? <img src={logo} alt="Lab logo" className="lab-logo-img" referrerPolicy="no-referrer" /> : <ImagePlus />}</span>
            <span className="file-pick file-picked">
              <Upload size={16} /><span>{logo ? 'Replace logo' : 'Upload logo (PNG/JPG/WebP, ≤ 10 MB)'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files, 'logo')} />
            </span>
          </div>
          {socials.map((s, i) => (
            <div key={i} className="social-edit">
              <input aria-label="Platform" value={s.platform} onChange={(e) => setSocials((l) => l.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))} placeholder="Platform" />
              <input aria-label="URL" value={s.url} onChange={(e) => setSocials((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setSocials((l) => l.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSocials((l) => [...l, { platform: '', url: '' }])}><Plus />Add link</Button>
          {photos.length > 0 && (
            <div className="lab-gallery editable">
              {photos.map((p) => (
                <div key={p} className="gallery-item">
                  <img src={p} alt="" referrerPolicy="no-referrer" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((l) => l.filter((x) => x !== p))}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <span className="file-pick file-picked">
            <ImagePlus size={16} /><span>Add photos (≤ 10 MB each)</span>
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files, 'photos')} />
          </span>
          <F label="Photo archive link"><input value={f.photo_archive_link} onChange={set('photo_archive_link')} placeholder="https://drive.google.com/…" /></F>
        </Block>}

        {tab === 'team' && <Block title="Team" wide note={`Heads are assigned by the SITAM coordinator. Add members with “Manage members” on the lab page. E-mails and phones are private.`}>
          <div className="team-editor">
            {members.map((m, i) => {
              const locked = !canEditHeads && !!m.id && isHeadRole(lab.lab_members.find((x) => x.id === m.id)?.role ?? m.role);
              return (
              <div key={m.id ?? `new-${i}`} className={`team-row${isHeadRole(m.role) ? ' is-head' : ''}${m.is_past ? ' is-past' : ''}`}>
                <span className="team-num" aria-label={`Row ${i + 1}`}>{i + 1}</span>
                <input aria-label="Full name" placeholder="Full name" value={m.full_name} disabled={locked} onChange={(e) => patchMember(i, { full_name: e.target.value })} />
                <input aria-label="Title" placeholder="Title / year & major" value={m.title} disabled={locked} onChange={(e) => patchMember(i, { title: e.target.value })} />
                <select aria-label="Position" value={m.role} disabled={locked} onChange={(e) => patchMember(i, { role: e.target.value as LabRole })}>
                  {ROLES.filter((r) => canEditHeads || locked || !isHeadRole(r)).map((r) => <option key={r} value={r}>{SINGULAR[r]}</option>)}
                </select>
                {m.role === 'former_lead' ? (
                  <input aria-label="Term" placeholder="2023–2025" value={m.term} onChange={(e) => patchMember(i, { term: e.target.value })} />
                ) : (
                  <input aria-label="SDU e-mail" placeholder="SDU e-mail (private)" value={m.email} onChange={(e) => patchMember(i, { email: e.target.value })} />
                )}
                <input aria-label="Contact" placeholder="Phone / Telegram (private)" value={m.contact} onChange={(e) => patchMember(i, { contact: e.target.value })} />
                {!isHeadRole(m.role) && m.role !== 'former_lead' && (
                  <span className="team-past">
                    <label className="check"><input type="checkbox" checked={!!m.is_past} onChange={(e) => patchMember(i, { is_past: e.target.checked })} />Past member</label>
                    {m.is_past && <input aria-label="Graduation year" placeholder="Graduated (year)" inputMode="numeric" maxLength={4} value={m.graduation_year ?? ''} onChange={(e) => patchMember(i, { graduation_year: e.target.value })} />}
                  </span>
                )}
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={locked} onClick={() => setMembers((l) => l.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
              );
            })}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setMembers((l) => [...l, { full_name: '', title: '', role: 'member', term: '', email: '', contact: '', is_past: false, graduation_year: '' }])}><Plus />Add person</Button>
          <p className="small-note">Heads are at the top. Mark people who left as “Past member” and add the year they graduated — they move to “Past team” on the lab page.</p>
        </Block>}

        {tab === 'projects' && <Block title="Projects" wide note="Lab projects appear on the Projects page and the Overview. A demo link is optional — share it only if you want to.">
          <div className="project-editor">
            {projs.map((p, i) => (
              <div key={p.id ?? `new-${i}`} className="project-row">
                <input className="span-2" aria-label="Project title" placeholder="Project title" value={p.title} onChange={(e) => patchProject(i, { title: e.target.value })} />
                <select aria-label="Type" value={p.kind} onChange={(e) => patchProject(i, { kind: e.target.value as ProjectDraft['kind'] })}><option value="research">Research</option><option value="project">Project</option></select>
                <select aria-label="Status" value={p.status} onChange={(e) => patchProject(i, { status: e.target.value as ProjectDraft['status'] })}><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select>
                <input aria-label="Year" placeholder="Year" inputMode="numeric" maxLength={4} value={p.year} onChange={(e) => patchProject(i, { year: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove project" onClick={() => { if (p.id) setRemovedProjects((r) => [...r, p.id as string]); setProjs((l) => l.filter((_, j) => j !== i)); }}><Trash2 /></Button>
                <textarea className="span-all" rows={2} aria-label="Summary" placeholder="One or two sentences about the project" value={p.summary} onChange={(e) => patchProject(i, { summary: e.target.value })} />
                <input aria-label="Demo URL" placeholder="Demo (optional) https://" value={p.demo_url} onChange={(e) => patchProject(i, { demo_url: e.target.value })} />
                <input aria-label="GitHub URL" placeholder="Code https://" value={p.github_url} onChange={(e) => patchProject(i, { github_url: e.target.value })} />
                <input aria-label="Paper URL" placeholder="Paper https://" value={p.paper_url} onChange={(e) => patchProject(i, { paper_url: e.target.value })} />
                <input aria-label="Tags" placeholder="Tags, comma-separated" value={p.tags} onChange={(e) => patchProject(i, { tags: e.target.value })} />
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setProjs((l) => [...l, { title: '', kind: 'research', status: 'ongoing', summary: '', year: '', github_url: '', demo_url: '', paper_url: '', tags: '' }])}><Plus />Add project</Button>
        </Block>}

        {tab === 'activities' && <>
        <Block title="Upcoming activities" note="What the lab plans next — shown on the lab page next to its upcoming events. One per line.">
          <F label="Upcoming activities">{text('upcoming_activities', 4, 'Spring hackathon — March\nOpen lab day — April')}</F>
        </Block>

        <Block title="Teaching & events">
          <F label="Seminars / workshops (topic — audience)">{text('seminars', 4)}</F>
          <F label="Courses (title — audience — duration)">{text('courses', 3)}</F>
          <F label="Organized events">{text('organized_events', 3)}</F>
        </Block>

        <Block title="External activities you took part in" note="Archive of competitions, hackathons and conferences outside SDU. Results with teams are added on Events → Competitions.">
          <F label="External activities (one per line)">{text('external_events', 4)}</F>
          <F label="Conferences & events in Kazakhstan">{text('events_kz', 2)}</F>
          <F label="International conferences & events">{text('events_global', 2)}</F>
        </Block>

        <Block title="Achievements & alumni">
          <F label="Awards & competition wins">{text('awards', 3)}</F>
          <F label="Grants">{text('grants', 2)}</F>
          <F label="Notable alumni">{text('notable_alumni', 2)}</F>
          <F label="SDU alumni who could contribute">{text('alumni_contributors', 2)}</F>
        </Block>

        <Block title="Internal · heads & SITAM staff only" wide note="Not shown on the public page.">
          <p className="small-note"><Lock size={12} className="inline" /> Visible to lab managers and verified SITAM staff.</p>
          <div className="editor-grid inner">
            <F label="Students who present the lab (name, languages, contacts)">{text('presenters', 3)}</F>
            <F label="Main goals for the coming year">{text('goals', 3)}</F>
            <F label="Support needed from SDU / SITAM">{text('required_support', 3)}</F>
            <F label="Equipment & resource gaps">{text('resource_gaps', 3)}</F>
          </div>
          <F label="Academic Year Plan (link)"><input value={f.action_plan_link} onChange={set('action_plan_link')} placeholder="https://drive.google.com/…" /></F>
        </Block>
        </>}

        {tab === 'partners' && <>
        <Block title="Partners" wide note="One partner per line — each one is shown as its own card on the lab page.">
          <F label="Current partners">{text('current_partners', 5, 'Alash Electronics\nUSTEM Foundation')}</F>
        </Block>
        <Block title="Organizations" wide note="Organizations the lab follows or works with.">
          <div className="editor-grid inner">
            <F label="In Kazakhstan">{text('orgs_kz', 4)}</F>
            <F label="International">{text('orgs_global', 4)}</F>
          </div>
        </Block>
        </>}
      </div>

      {error && <p className="form-alert mt-4" role="alert">{error}</p>}
      <div className="editor-actions">
        <Button variant="outline" onClick={onDone} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy}><Save />{busy ? 'Saving…' : 'Save lab page'}</Button>
      </div>
    </main>
  );
}
