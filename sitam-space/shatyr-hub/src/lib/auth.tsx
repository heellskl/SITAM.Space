import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { db, isMissingSchema, uploadCv } from '@/lib/api';
import { takePendingCv } from '@/lib/pending-cv';

/** Base account role, stored in profiles.role. "teacher" = Professor / Researcher, "phd" = PhD student. */
export type Role = 'student' | 'phd' | 'teacher' | 'partner' | 'admin';

/** SITAM bachelor's programmes (sdu.edu.kz → School of IT and Applied Mathematics → Bachelor's). */
export const MAJORS = [
  'Business Information Systems',
  'Computer Science',
  'Information Systems',
  'Mathematical and Computer Modelling',
  'Mathematics',
  'Multimedia Sciences',
  'Software Engineering',
  'Statistics and Data Science',
  'Other (type your own)',
] as const;

/** Students: stu.sdu.edu.kz, staff: sdu.edu.kz — any sub-domain of sdu.edu.kz is accepted. */
export const SDU_EMAIL = /^[^@\s]+@([a-z0-9-]+\.)*sdu\.edu\.kz$/i;
export const isSduEmail = (email: string) => SDU_EMAIL.test(email.trim());

export type Profile = {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  course?: number;
  major?: string;
  department?: string;
  position?: string;
  phone?: string;
  bio?: string;
  staffVerified: boolean;
  cvPath: string | null;
  cvFilename: string | null;
  cvUploadedAt: string | null;
  faculty?: string;
  groupName?: string;
  /** v12: second, personal e-mail (the SDU e-mail is `email`) */
  personalEmail?: string;
  avatarUrl?: string;
};

export type ManagedLab = { id: string; slug: string; name: string; role: string };
/** Every lab the user belongs to, with their position there (independent of the platform role). */
export type LabMembership = { id: string; slug: string; name: string; role: string; title: string | null; canEdit: boolean; isHead: boolean };
export type Company = { id: string; name: string; verified: boolean };
export type LabHeadRequest = { id: string; lab_id: string; lab_name: string; position: 'lead' | 'co_lead'; status: 'pending' | 'rejected'; decision_note: string | null; created_at: string };

/** Real permissions, computed by the database (my_context RPC). Additive, never exclusive. */
export type Capabilities = {
  isStudent: boolean;
  /** PhD student: applies like a student and publishes own research. */
  isPhd: boolean;
  /** Students and PhD students can apply; professors, partners and admins cannot. */
  canApply: boolean;
  isTeacher: boolean;
  isStaff: boolean; // verified teacher or admin
  isAdmin: boolean;
  /** SITAM coordinator (e-mail in the server list): admin panel, assigns lab heads. */
  isCoordinator: boolean;
  isPartner: boolean;
  managedLabs: ManagedLab[];
  /** All lab memberships (led or not). Older databases without v4 fall back to managedLabs. */
  labMemberships: LabMembership[];
  companies: Company[];
  savedLabs: string[];
  /** username of the linked research profile (Research Publications), if any */
  professorUsername: string | null;
  /** Can see an inbox of applications (lab head, verified company member, staff, admin). */
  canReview: boolean;
  /** Admins: student submissions waiting for review. */
  pendingModeration: number;
  /** Admins: Lab Head requests waiting for approval. */
  pendingLabHeads: number;
  /** The user's own Lab Head requests that are pending or were declined. */
  labHeadRequests: LabHeadRequest[];
  /** v17: labs / researcher pages that list this e-mail and wait for the coordinator's confirmation. */
  pendingClaims: string[];
  /** v17: existing companies this partner asked to join (waiting for the coordinator or a company owner). */
  pendingCompanies: string[];
};

const NO_CAPS: Capabilities = {
  isStudent: false, isPhd: false, canApply: false, isTeacher: false, isStaff: false, isAdmin: false, isCoordinator: false, isPartner: false,
  managedLabs: [], labMemberships: [], companies: [], savedLabs: [], professorUsername: null, canReview: false, pendingModeration: 0, pendingLabHeads: 0, labHeadRequests: [],
  pendingClaims: [], pendingCompanies: [],
};

type DbProfile = {
  id: string; role: Role; first_name: string; last_name: string; email: string; course: number | null; major: string | null;
  department: string | null; position: string | null; phone: string | null; bio: string | null; staff_verified: boolean | null;
  faculty?: string | null; group_name?: string | null; avatar_url?: string | null; personal_email?: string | null;
  cv_path: string | null; cv_filename: string | null; cv_uploaded_at: string | null;
};
type DbContext = {
  profile: DbProfile | null; is_staff: boolean; is_admin: boolean; is_coordinator?: boolean; managed_labs: ManagedLab[]; companies: Company[];
  lab_memberships?: { id: string; slug: string; name: string; role: string; title: string | null; can_edit: boolean; is_head: boolean }[];
  saved_labs: string[]; professor: { username: string; full_name: string } | null; pending_moderation?: number;
  pending_lab_heads?: number; lab_head_requests?: LabHeadRequest[];
  pending_claims?: string[]; pending_companies?: string[];
};

function toProfile(p: DbProfile): Profile {
  return {
    id: p.id,
    role: p.role,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    ...(p.course ? { course: p.course } : {}),
    ...(p.major ? { major: p.major } : {}),
    ...(p.department ? { department: p.department } : {}),
    ...(p.position ? { position: p.position } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.bio ? { bio: p.bio } : {}),
    ...(p.faculty ? { faculty: p.faculty } : {}),
    ...(p.group_name ? { groupName: p.group_name } : {}),
    ...(p.personal_email ? { personalEmail: p.personal_email } : {}),
    ...(p.avatar_url ? { avatarUrl: p.avatar_url } : {}),
    staffVerified: !!p.staff_verified,
    cvPath: p.cv_path,
    cvFilename: p.cv_filename,
    cvUploadedAt: p.cv_uploaded_at,
  };
}

/** Before migrations are applied we can only read what sign-up stored in user_metadata. */
function profileFromMetadata(user: User): Profile {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '');
  return {
    id: user.id,
    role: m['role'] === 'teacher' ? 'teacher' : m['role'] === 'partner' ? 'partner' : m['role'] === 'phd' ? 'phd' : 'student',
    firstName: str('first_name'),
    lastName: str('last_name'),
    email: user.email ?? '',
    ...(m['course'] ? { course: Number(m['course']) } : {}),
    ...(str('major') ? { major: str('major') } : {}),
    ...(str('department') ? { department: str('department') } : {}),
    staffVerified: false,
    cvPath: null,
    cvFilename: null,
    cvUploadedAt: null,
  };
}

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  caps: Capabilities;
  loading: boolean;
  /** Set when the database could not return this account's rights (my_context failed). */
  contextError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null, user: null, profile: null, caps: NO_CAPS, loading: true, contextError: null,
  refresh: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [caps, setCaps] = useState<Capabilities>(NO_CAPS);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setSessionLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setCaps(NO_CAPS);
      setContextError(null);
      return;
    }
    setCtxLoading(true);
    const { data, error } = await db.rpc('my_context');
    if (error || !data) {
      if (error && !isMissingSchema(error)) console.error('my_context failed', error);
      // Without my_context the site cannot know roles such as coordinator or lab head — say so instead of failing silently.
      setContextError(
        error && isMissingSchema(error)
          ? 'The database is not set up: run supabase/setup-new-database.sql in the Supabase SQL Editor.'
          : `Your rights could not be loaded from the database${error?.message ? `: ${error.message}` : ''}.`,
      );
      const p = profileFromMetadata(u);
      setProfile(p);
      setCaps({ ...NO_CAPS, isStudent: p.role === 'student', isPhd: p.role === 'phd', canApply: p.role === 'student' || p.role === 'phd', isTeacher: p.role === 'teacher' });
      setCtxLoading(false);
      return;
    }
    setContextError(null);
    const ctx = data as DbContext;
    let p = ctx.profile ? toProfile(ctx.profile) : profileFromMetadata(u);

    // CV chosen at sign-up but the user confirmed via the e-mail link (new tab):
    // upload it now from this browser's pending store.
    if ((p.role === 'student' || p.role === 'phd') && !p.cvPath) {
      const pending = await takePendingCv(u.email ?? '');
      if (pending) {
        try {
          await uploadCv(u.id, pending);
          p = { ...p, cvPath: `${u.id}/cv.pdf`, cvFilename: pending.name, cvUploadedAt: new Date().toISOString() };
        } catch (e) {
          console.error('Pending CV upload failed', e);
        }
      }
    }

    const managedLabs = ctx.managed_labs ?? [];
    const labMemberships: LabMembership[] = ctx.lab_memberships
      ? ctx.lab_memberships.map((m) => ({ id: m.id, slug: m.slug, name: m.name, role: m.role, title: m.title, canEdit: !!m.can_edit, isHead: !!m.is_head }))
      : managedLabs.map((m) => ({ ...m, title: null, canEdit: true, isHead: m.role === 'lead' || m.role === 'co_lead' }));
    const companies = ctx.companies ?? [];
    setProfile(p);
    setCaps({
      isStudent: p.role === 'student',
      isPhd: p.role === 'phd',
      canApply: p.role === 'student' || p.role === 'phd',
      isTeacher: p.role === 'teacher',
      isStaff: !!ctx.is_staff,
      isAdmin: !!ctx.is_admin,
      isCoordinator: !!ctx.is_coordinator,
      isPartner: p.role === 'partner',
      managedLabs,
      labMemberships,
      companies,
      savedLabs: ctx.saved_labs ?? [],
      professorUsername: ctx.professor?.username ?? null,
      canReview: managedLabs.length > 0 || companies.some((c) => c.verified) || !!ctx.is_staff,
      pendingModeration: Number(ctx.pending_moderation ?? 0),
      pendingLabHeads: Number(ctx.pending_lab_heads ?? 0),
      labHeadRequests: ctx.lab_head_requests ?? [],
      pendingClaims: ctx.pending_claims ?? [],
      pendingCompanies: ctx.pending_companies ?? [],
    });
    setCtxLoading(false);
  }, []);

  useEffect(() => {
    void load(user);
    // re-load only when the account changes, not on token refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Rights changed in the database (e.g. an e-mail added to coordinator_emails): pick them up when the tab is shown again.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void load(user); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, load]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user,
      profile,
      caps,
      loading: sessionLoading || ctxLoading,
      contextError,
      refresh: () => load(user),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, user, profile, caps, sessionLoading, ctxLoading, contextError, load],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Which workspace (home page) a user sees. One account can have several: e.g. Student + Lab head. */
export type Persona = 'guest' | 'lab_leader' | 'teacher' | 'student' | 'partner' | 'admin';
export const PERSONA_LABEL: Record<Persona, string> = {
  guest: 'Guest', lab_leader: 'Lab head', teacher: 'Teacher', student: 'Student', partner: 'Industry partner', admin: 'SITAM admin',
};

/** All workspaces the account may use, leader first. The primary role is always kept. */
export function personasOf(profile: Profile | null, caps: Capabilities): Persona[] {
  if (!profile) return ['guest'];
  const list: Persona[] = [];
  if (caps.managedLabs.length > 0) list.push('lab_leader');
  if (caps.isAdmin) list.push('admin');
  if (profile.role === 'partner') list.push('partner');
  else if (profile.role === 'teacher') list.push('teacher');
  else if (profile.role !== 'admin') list.push('student');
  return list.length ? list : ['student'];
}

export function personaOf(profile: Profile | null, caps: Capabilities): Persona {
  return personasOf(profile, caps)[0] ?? 'guest';
}

const WORKSPACE_KEY = 'sitam-workspace';
/** The workspace the user picked in the sidebar (falls back to the first available one). */
export function useWorkspace() {
  const { profile, caps } = useAuth();
  const options = personasOf(profile, caps);
  const [chosen, setChosen] = useState<Persona | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(WORKSPACE_KEY) as Persona | null;
      if (v) setChosen(v);
    } catch {
      /* storage blocked */
    }
    const onChange = (e: Event) => setChosen((e as CustomEvent<Persona>).detail);
    window.addEventListener('sitam-workspace', onChange);
    return () => window.removeEventListener('sitam-workspace', onChange);
  }, []);
  const active = chosen && options.includes(chosen) ? chosen : (options[0] ?? 'guest');
  const choose = (p: Persona) => {
    try { localStorage.setItem(WORKSPACE_KEY, p); } catch { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent('sitam-workspace', { detail: p }));
  };
  return { active, options, choose };
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  phd: 'PhD Student',
  teacher: 'Teacher',
  partner: 'Industry Partner',
  admin: 'SITAM Admin',
};
