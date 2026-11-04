// v29: accounts created by SITAM with the first password (lab leads 2026) must set their own password
// at the first sign-in. The window cannot be closed until a new password is saved (or the person signs out).
import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { clearMustChangePassword, humanError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function FirstPasswordDialog() {
  const { profile, refresh, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!profile?.mustChangePassword) return null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    if (pw.length > 72) return setError('Password must be at most 72 characters.');
    if (pw === 'SduLab2026!') return setError('Choose a password different from the first one.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setError('');
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      await clearMustChangePassword();
      await refresh();
      toast.success('Password saved', { description: 'Next time sign in with your e-mail and this password.' });
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="first-password" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle><KeyRound size={18} /> Set your own password</DialogTitle>
          <DialogDescription>Your account was created by SITAM with a first password. Choose a new one to continue.</DialogDescription>
        </DialogHeader>
        <form className="partner-form auth-form" onSubmit={save} noValidate>
          <label>
            New password
            <input type="password" autoComplete="new-password" maxLength={72} placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          <label>
            Repeat new password
            <input type="password" autoComplete="new-password" maxLength={72} value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="editor-actions">
            <Button type="button" variant="ghost" onClick={() => void signOut()}>Log out</Button>
            <Button type="submit" className="editor-save" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
