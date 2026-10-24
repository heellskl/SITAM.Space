import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/** "Login Required" modal (Events → Register when signed out). */
export function LoginRequiredDialog({ open, onClose }: { open: boolean; onClose: () => void; next?: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="hub-dialog login-required">
        <DialogTitle>Login Required</DialogTitle>
        <DialogDescription>You need to be logged in to continue.</DialogDescription>
        <div className="dialog-actions">
          <Button asChild><Link to="/login" onClick={onClose}>Sign in</Link></Button>
          <Button asChild variant="outline"><Link to="/register" onClick={onClose}>Register</Link></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
