import { createFileRoute, redirect } from '@tanstack/react-router';

// v12: Projects live inside Labs (tab "Projects"). Old links keep working.
export const Route = createFileRoute('/projects')({
  validateSearch: (s: Record<string, unknown>): { tab?: 'labs' | 'community' } => (s['tab'] === 'community' || s['tab'] === 'labs' ? { tab: s['tab'] } : {}),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/labs', search: { tab: 'projects', ...(search.tab === 'community' ? { ptab: 'community' as const } : {}) }, replace: true });
  },
});
