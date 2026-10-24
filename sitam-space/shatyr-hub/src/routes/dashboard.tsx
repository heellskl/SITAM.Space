import { createFileRoute, redirect } from '@tanstack/react-router';

// Old URL: the Research Dashboard is now "Research Publications" at /research.
export const Route = createFileRoute('/dashboard')({
  beforeLoad: () => {
    throw redirect({ to: '/research', replace: true });
  },
});
