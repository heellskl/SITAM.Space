// Photo gallery for labs and events: photos live in Supabase Storage (bucket lab-assets), shown as a
// lazy-loaded grid; a click opens them full size (lightbox) with ← → keys, swipe-free buttons and a counter.

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function PhotoGallery({ photos, title, limit }: { photos: string[]; title: string; limit?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = limit && !all ? photos.slice(0, limit) : photos;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);
  if (!photos.length) return null;
  return (
    <>
      <div className="photo-grid">
        {shown.map((u, i) => (
          <button key={u} type="button" className="photo-tile" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`}>
            <img src={u} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      {limit && photos.length > limit && (
        <button type="button" className="photo-more" onClick={() => setAll((x) => !x)}>{all ? 'Show less' : `Show all ${photos.length} photos`}</button>
      )}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="lightbox" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">Photo {open !== null ? open + 1 : 0} of {photos.length}. Use the arrow keys to move between photos.</DialogDescription>
          {open !== null && <img src={photos[open]} alt={`${title}, photo ${open + 1}`} referrerPolicy="no-referrer" />}
          {photos.length > 1 && <>
            <button type="button" className="lightbox-nav prev" aria-label="Previous photo" onClick={() => go(-1)}><ChevronLeft /></button>
            <button type="button" className="lightbox-nav next" aria-label="Next photo" onClick={() => go(1)}><ChevronRight /></button>
          </>}
          <span className="lightbox-count">{open !== null ? open + 1 : 0} / {photos.length}</span>
          <button type="button" className="lightbox-close" aria-label="Close" onClick={() => setOpen(null)}><X /></button>
        </DialogContent>
      </Dialog>
    </>
  );
}
