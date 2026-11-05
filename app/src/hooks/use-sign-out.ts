import { createElement, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { OutboxPendingError } from '@/stores/session-store';
import { signOut } from './use-auth';

/**
 * Canal UI de la purge D-17 (plan 34-04, WRQ-05).
 *
 * Premier appel : `signOut()` tente la déconnexion normalement. Si le goulot
 * `session-store.signOut` rejette une `OutboxPendingError` (des écritures
 * pendantes seront perdues), la confirm-dialog s'ouvre ; la confirmation
 * re-appelle `signOut({ acknowledgePendingWrites: true })` — seul le goulot
 * purge, ce hook ne fait que porter la question.
 *
 * Le dialog est rendu par `createElement` (fichier `.ts`) : il doit être
 * monté par l'appelant (`{dialog}` dans son JSX), une fois par composant —
 * les trois chemins de déconnexion (profile-form, mobile-drawer, refuse de
 * router) partagent la même classe, pas une instance (Pitfall 4).
 */
export function useSignOutWithConfirm(onDone?: () => void): {
  signOut: () => Promise<void>;
  dialog: ReactNode;
  busy: boolean;
} {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const finish = async (acknowledgePendingWrites: boolean) => {
    setBusy(true);
    try {
      await signOut({ acknowledgePendingWrites });
      setConfirmOpen(false);
      onDone?.();
    } catch (cause) {
      if (cause instanceof OutboxPendingError) {
        // D-17 : la question s'affiche — la déconnexion est bloquée jusqu'à
        // la confirmation explicite, l'utilisateur n'a RIEN perdu.
        setConfirmOpen(true);
        return;
      }
      toast(cause instanceof Error ? cause.message : 'Déconnexion impossible.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const dialog = createElement(ConfirmDialog, {
    open: confirmOpen,
    onOpenChange: setConfirmOpen,
    title: 'Écritures en attente',
    description:
      'Des écritures n’ont pas encore pu partir au serveur : elles seront perdues si vous vous déconnectez maintenant.',
    confirmLabel: 'Perdre les écritures et me déconnecter',
    onConfirm: () => void finish(true),
  });

  return { signOut: () => finish(false), dialog, busy };
}
