// "My labs first": for a lab head, everything tied to the labs they lead goes to the top of
// Labs, Projects, Research, Opportunities and Events. Display order only — rights are decided in the database.
import { useMemo } from 'react';
import { useLabs } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Word order and case do not matter: "Ivanov Ivan" === "ivan  IVANOV". */
export const personKey = (name: string) => name.toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');

export function useMyLabs() {
  const { caps } = useAuth();
  const labs = useLabs();
  return useMemo(() => {
    const ids = new Set(caps.managedLabs.map((l) => l.id));
    const people = new Set<string>();
    for (const l of labs.data ?? []) {
      if (!ids.has(l.id)) continue;
      for (const m of l.lab_members) if (m.role !== 'former_lead') people.add(personKey(m.full_name));
    }
    const isMineLab = (labId: string | null | undefined) => !!labId && ids.has(labId);
    return { ids, people, any: ids.size > 0, isMineLab };
  }, [caps.managedLabs, labs.data]);
}

/** Stable: items for which isMine() is true move to the front, every other order is kept. */
export function mineFirst<T>(list: readonly T[], isMine: (item: T) => boolean): T[] {
  return list
    .map((item, i) => ({ item, i, mine: isMine(item) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.i - b.i)
    .map((x) => x.item);
}
