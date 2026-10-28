// Academic Year Plan data: plans (one is current) and their dated items. Everyone reads; the coordinator writes
// (row-level security on academic_plans / academic_plan_items). The official PDF goes to the "documents" bucket.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/api';

export type PlanAudience = 'students' | 'researchers' | 'industry';
export type PlanKind = 'grant_deadline' | 'poster_day' | 'conference' | 'hackathon' | 'report_deadline' | 'seminar' | 'other';
export type AcademicPlan = { id: string; title: string; starts_on: string; ends_on: string; pdf_url: string | null; intro: string | null; is_current: boolean };
export type PlanItem = {
  id: string; plan_id: string; title: string; kind: PlanKind; starts_on: string; ends_on: string | null; audiences: PlanAudience[];
  description: string | null; url: string | null; lab_id: string | null;
};
export type PlanItemDraft = Omit<PlanItem, 'id'> & { id: string | null };

export const AUDIENCE_LABEL: Record<PlanAudience, string> = { students: 'For Students', researchers: 'For Researchers', industry: 'For Industry Partners' };
export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  grant_deadline: 'Grant / R&D deadline', poster_day: 'Research Poster Day', conference: 'Conference', hackathon: 'Hackathon',
  report_deadline: 'Lab report due', seminar: 'Seminar / workshop', other: 'Other',
};

const err = (e: { message: string; code?: string } | null) => { if (e) throw Object.assign(new Error(e.message), { code: e.code }); };
const key = ['academic-plan'] as const;

export function useAcademicPlans() {
  return useQuery({
    queryKey: key, staleTime: 60_000,
    queryFn: async () => {
      const [p, i] = await Promise.all([
        db.from('academic_plans').select('*').order('starts_on', { ascending: false }),
        db.from('academic_plan_items').select('*').order('starts_on'),
      ]);
      err(p.error); err(i.error);
      return { plans: (p.data ?? []) as AcademicPlan[], items: (i.data ?? []) as PlanItem[] };
    },
  });
}

export function usePlanActions() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: key });
  return {
    saveItem: useMutation({
      mutationFn: async (d: PlanItemDraft) => {
        const { id, ...row } = d;
        const r = id ? await db.from('academic_plan_items').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id) : await db.from('academic_plan_items').insert(row);
        err(r.error);
      },
      onSuccess: done,
    }),
    deleteItem: useMutation({
      mutationFn: async (id: string) => { const r = await db.from('academic_plan_items').delete().eq('id', id); err(r.error); },
      onSuccess: done,
    }),
    savePlan: useMutation({
      mutationFn: async (p: Partial<AcademicPlan> & { id: string }) => {
        const { id, ...row } = p;
        const r = await db.from('academic_plans').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
        err(r.error);
      },
      onSuccess: done,
    }),
  };
}

/** Coordinator: upload the official PDF; returns its public link. */
export async function uploadPlanPdf(file: File) {
  const path = `academic-plan/${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-').toLowerCase()}`;
  const { error } = await db.storage.from('documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
  err(error);
  return db.storage.from('documents').getPublicUrl(path).data.publicUrl as string;
}

/** Fall = Sep–Dec, Spring = Jan–May, Summer = Jun–Aug. */
export function semesterOf(date: string): 'Fall' | 'Spring' | 'Summer' {
  const m = Number(date.slice(5, 7));
  return m >= 9 ? 'Fall' : m <= 5 ? 'Spring' : 'Summer';
}
