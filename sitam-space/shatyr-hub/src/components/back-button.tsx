// "Back": returns to the page the person came from (Manage, Research → Researchers, a lab…),
// like the browser's back button. Opened from a direct link with no history → goes to `fallback`.

import { useRouter } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const router = useRouter();
  const back = () => {
    // idx > 0 = there is a page of this site before this one in the tab's history
    const idx = (window.history.state as { idx?: number; __TSR_index?: number } | null)?.__TSR_index ?? (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0 || (window.history.length > 1 && document.referrer.startsWith(window.location.origin))) router.history.back();
    else router.history.push(fallback);
  };
  return <button type="button" className="back-link" onClick={back}><ArrowLeft size={14} />{label}</button>;
}
