// One shared list of research areas, skills and equipment, built from what all labs already entered.
// A lab's new tag becomes a suggestion for every other lab, so the same thing is spelled the same way —
// that is what makes filtering and sorting labs by tag work. The coordinator cleans the list in Admin → Tags.

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db, useLabs, type Lab } from '@/lib/api';

export type TagKind = 'area' | 'skill' | 'equipment';
export type TagStat = { name: string; count: number; labs: string[] };
export const TAG_KIND_LABEL: Record<TagKind, string> = { area: 'Research areas', skill: 'Skills', equipment: 'Equipment' };

/** "a, b; c\nd" → ['a', 'b', 'c', 'd'] — equipment is kept as one text field. */
export const splitItems = (text: string | null | undefined) =>
  (text ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export const tagsOf = (l: Pick<Lab, 'tags' | 'skills' | 'equipment'>, kind: TagKind) =>
  kind === 'area' ? l.tags : kind === 'skill' ? (l.skills ?? []) : splitItems(l.equipment);

/** Tags of one kind with the number of labs using each; spelling = the one most labs use. Most used first. */
export function buildCatalog(labs: Lab[], kind: TagKind): TagStat[] {
  const by = new Map<string, { spellings: Map<string, number>; labs: Set<string> }>();
  for (const l of labs) {
    for (const raw of tagsOf(l, kind)) {
      const t = raw.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      const e = by.get(k) ?? { spellings: new Map(), labs: new Set<string>() };
      e.spellings.set(t, (e.spellings.get(t) ?? 0) + 1);
      e.labs.add(l.id);
      by.set(k, e);
    }
  }
  return [...by.values()]
    .map((e) => ({ name: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0], count: e.labs.size, labs: [...e.labs] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function useTagCatalog() {
  const labs = useLabs();
  return useMemo(() => {
    const list = labs.data ?? [];
    return { area: buildCatalog(list, 'area'), skill: buildCatalog(list, 'skill'), equipment: buildCatalog(list, 'equipment'), loading: labs.isLoading };
  }, [labs.data, labs.isLoading]);
}

/** Coordinator: rename / merge a tag in every lab, or remove it (next = null). Checked in SQL (admin_rename_lab_tag). */
export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: TagKind; from: string; to: string | null }) => {
      const { data, error } = await db.rpc('admin_rename_lab_tag', { p_kind: v.kind, p_old: v.from, p_new: v.to });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data as number;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['labs'] }); void qc.invalidateQueries({ queryKey: ['lab'] }); },
  });
}
