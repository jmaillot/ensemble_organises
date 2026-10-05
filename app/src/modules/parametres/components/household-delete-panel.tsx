import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import { deleteHousehold } from '../api';

/**
 * Zone danger du foyer : suppression définitive par l'administrateur.
 * Tout passe par l'Edge Function `household-delete` (jamais d'écriture
 * directe) ; non rendue aux non-administrateurs.
 */
export function HouseholdDeletePanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const householdId = useHouseholdStore((state) => state.householdId);
  const resetHousehold = useHouseholdStore((state) => state.reset);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin || !householdId) return null;

  const onConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await deleteHousehold(householdId);
      // Le foyer n'existe plus côté serveur : tout cache devient mensonger.
      resetHousehold();
      queryClient.clear();
      setConfirmOpen(false);
      navigate('/foyer', { replace: true });
      toast(
        result.storage_cleanup === 'partial'
          ? 'Foyer supprimé. Quelques fichiers restants seront purgés.'
          : 'Foyer supprimé définitivement.',
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel
      title="Supprimer le foyer"
      description="Zone danger : réservée à l'administrateur du foyer."
    >
      <p className="m-0 text-[13px] text-muted">
        Efface définitivement tout le contenu du foyer — tâches, courses, calendrier, budget, souvenirs, photos,
        fichiers et invitations — pour tous ses membres. Les comptes et profils sont conservés. Cette action est
        irréversible.
      </p>
      {error ? (
        <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
          {error}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
          Supprimer le foyer
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer définitivement ce foyer ?"
        description="Tout son contenu sera effacé pour tous les membres, sans retour possible. Exportez d'abord ce que vous souhaitez conserver."
        confirmLabel={pending ? 'Suppression…' : 'Oui, tout supprimer'}
        onConfirm={() => {
          if (!pending) void onConfirm();
        }}
      />
    </Panel>
  );
}
