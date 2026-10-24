import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/publications')({
  beforeLoad: () => {
    throw redirect({ to: '/research', replace: true });
  },
});
