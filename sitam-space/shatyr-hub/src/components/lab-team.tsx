// "Manage members" for lab leaders: add people, change their position inside the lab, remove them.
// The database is the source of truth for rights (lab_members_guard / column grants / RLS);
// this screen only hides what the current user is not allowed to do.

import { useMemo, useState } from 'react';
import { PeoplePicker } from '@/components/people-picker';
import { BackButton } from '@/components/back-button';
import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleDashed, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LabLogo } from '@/components/lab-browser';
import {
  HEAD_ROLES, LAB_POSITION_LABEL, LAB_ROLE_ORDER, MANAGER_ROLES, humanError, personName, useAddLabMember, usePeople, useRemoveLabMember, useUpdateLabMember,
  type Lab, type LabMember, type LabRole, type Person, positionOptions } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { gmailCompose } from '@/lib/utils';

const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('');
const isHead = (r: LabRole) => HEAD_ROLES.includes(r);

export function LabTeamManager({ lab, onEdit }: { lab: Lab; onEdit: () => void }) {
  const { user, caps, refresh } = useAuth();
  // The Head is assigned only by the coordinator (Admin page). The Head of this lab appoints / removes Co-Heads
  // (checked again in the database: lab_members_guard, add_lab_member).
  const canEditHeads = caps.isAdmin;
  const isLead = caps.managedLabs.some((m) => m.id === lab.id && m.role === 'lead');
  const add = useAddLabMember();
  const update = useUpdateLabMember();
  const remove = useRemoveLabMember();
  const [form, setForm] = useState({ role: 'member' as LabRole, title: '' });
  const [confirm, setConfirm] = useState<LabMember | null>(null);

  // Member-level positions (rights = member). Old student-lead labels stay visible on existing rows only.
  const MEMBER_POSITIONS: LabRole[] = ['student_lead', 'tech_lead', 'member', 'mentor', 'project_coordinator', 'research_assistant', 'student_researcher'];
  const positions: LabRole[] = canEditHeads ? LAB_ROLE_ORDER : isLead ? ['co_lead', ...MEMBER_POSITIONS] : MEMBER_POSITIONS;
  const addable: LabRole[] = canEditHeads || isLead ? ['co_lead', ...MEMBER_POSITIONS] : MEMBER_POSITIONS;
  const coHeadOk = canEditHeads || isLead;

  const team = useMemo(
    () => lab.lab_members.slice().sort((a, b) => LAB_ROLE_ORDER.indexOf(a.role) - LAB_ROLE_ORDER.indexOf(b.role) || a.sort_order - b.sort_order),
    [lab.lab_members],
  );
  const current = team.filter((m) => m.role !== 'former_lead');
  const people = usePeople(team.map((m) => m.user_id).filter((x): x is string => !!x));
  const emailOf = new Map((people.data ?? []).map((p) => [p.id, p.email]));
  const managers = current.filter((m) => MANAGER_ROLES.includes(m.role)).length;

  function addPerson(p: Person) {
    add.mutate(
      { labId: lab.id, fullName: personName(p), email: p.email, role: form.role, title: form.title },
      {
        onSuccess: () => { toast.success(`${personName(p)} added`); setForm({ ...form, title: '' }); },
        onError: (err) => toast.error(humanError(err)),
      },
    );
  }

  function changeRole(m: LabMember, role: LabRole) {
    if (role === m.role) return;
    update.mutate(
      { id: m.id, role },
      {
        onSuccess: () => {
          toast.success(`${m.full_name}: ${LAB_POSITION_LABEL[role]}`, {
            description: MANAGER_ROLES.includes(role) ? 'Can now manage this lab.' : MANAGER_ROLES.includes(m.role) ? 'No longer manages this lab.' : undefined,
          });
          if (user && m.user_id === user.id) void refresh();
        },
        onError: (err) => toast.error(humanError(err)),
      },
    );
  }

  function saveTitle(m: LabMember, title: string) {
    if ((m.title ?? '') === title.trim()) return;
    update.mutate({ id: m.id, title }, { onSuccess: () => toast.success('Saved'), onError: (err) => toast.error(humanError(err)) });
  }

  return (
    <main className="container content-page team-manage">
      <BackButton fallback={`/labs/${lab.slug}`} />
      <div className="page-head-row">
        <div>
          <span className="eyebrow">Manage members</span>
          <h1>{lab.name}</h1>
        </div>
        <Button variant="outline" onClick={onEdit}><Pencil />Edit lab info</Button>
      </div>

      <section className="panel">
        <h3 className="panel-title"><UserPlus size={15} />Add a member</h3>
        <div className="inline-form mb-3">
          <label className="small-note">Position{' '}
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as LabRole })}>
              {positionOptions(addable, undefined, coHeadOk).map((r) => <option key={r} value={r}>{LAB_POSITION_LABEL[r]}</option>)}
            </select>
          </label>
          <input value={form.title} maxLength={200} placeholder="Title (optional), e.g. 3rd year, CS" onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" />
        </div>
        <PeoplePicker placeholder="Search registered users by name or e-mail" exclude={team.map((m) => m.user_id).filter((x): x is string => !!x)} onPick={addPerson} />
      </section>

      <section className="panel">
        <h3 className="panel-title"><LabLogo lab={lab} size={16} /><Users size={15} />Team · {current.length} people · {managers} can manage</h3>
        {team.length === 0 ? (
          <div className="dash-empty"><strong>No members yet</strong>Add the first person above.</div>
        ) : (
          <table className="team-table">
            <thead><tr><th aria-label="Number">#</th><th>Person</th><th>Position</th><th>Title</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {team.map((m, i) => {
                const self = !!user && m.user_id === user.id;
                // the Head of the lab can change / remove Co-Heads (not themselves, not the Head)
                const locked = !canEditHeads && isHead(m.role) && !(isLead && m.role === 'co_lead' && !self);
                return (
                  <tr key={m.id} className={isHead(m.role) ? 'is-head' : m.is_past || m.role === 'former_lead' ? 'is-past' : undefined}>
                    <td className="team-num-cell">{i + 1}</td>
                    <td>
                      <div className="team-person">
                        <span className="avatar avatar-sm" aria-hidden>{initials(m.full_name)}</span>
                        <div>
                          <strong>{m.user_id ? <Link to="/people/$id" params={{ id: m.user_id }}>{m.full_name}</Link> : m.full_name}{self ? ' (you)' : ''}</strong>
                          {m.user_id && emailOf.get(m.user_id) && <a className="person-mail" href={gmailCompose(emailOf.get(m.user_id) ?? "")} target="_blank" rel="noopener noreferrer">{emailOf.get(m.user_id)}</a>}
                          <span className={m.user_id ? 'linked-badge' : 'linked-badge off'}>
                            {m.user_id ? <><CircleCheck size={11} />Account linked</> : <><CircleDashed size={11} />No account yet</>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {locked ? (
                        <span className="role-chip">{LAB_POSITION_LABEL[m.role]}</span>
                      ) : (
                        <select aria-label={`Position of ${m.full_name}`} value={m.role} disabled={update.isPending} onChange={(e) => changeRole(m, e.target.value as LabRole)}>
                          {positionOptions(positions, m.role, coHeadOk).map((r) => <option key={r} value={r}>{LAB_POSITION_LABEL[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {locked ? <small>{m.title}</small> : (
                        <input aria-label={`Title of ${m.full_name}`} defaultValue={m.title ?? ''} maxLength={200} placeholder="—" onBlur={(e) => saveTitle(m, e.target.value)} />
                      )}
                    </td>
                    <td>
                      {!locked && (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${m.full_name}`} title="Remove from lab" onClick={() => setConfirm(m)}><Trash2 /></Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirm?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave {lab.name}{confirm && MANAGER_ROLES.includes(confirm.role) ? ' and lose the right to manage it' : ''}. Their account is not deleted.
              To keep them in the lab history, set the position to “Former lead” instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const m = confirm;
                if (!m) return;
                remove.mutate(m.id, {
                  onSuccess: () => {
                    toast.success(`${m.full_name} removed`);
                    if (user && m.user_id === user.id) void refresh();
                  },
                  onError: (err) => toast.error(humanError(err)),
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
