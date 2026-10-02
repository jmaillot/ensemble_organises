import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useToast } from '@/components/ui/toast';
import { useMembers } from '@/stores/household-store';
import { useArdoiseMembers } from '../hooks/use-ardoise';

export interface ArdoiseMembersDialogProps {
  ardoiseId: string;
  ardoiseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Faux pour les non-admins (la RLS refuse l'écriture) : liste seule. */
  canManage: boolean;
}

/**
 * Membres d'une ardoise : ajout de membres du foyer (admin/membre, enfants
 * exclus comme à la création) et retrait. Le retrait conserve l'historique
 * (dépenses, parts) mais le membre sort des soldes affichés.
 */
export function ArdoiseMembersDialog({ ardoiseId, ardoiseName, open, onOpenChange, canManage }: ArdoiseMembersDialogProps) {
  const toast = useToast();
  const householdMembers = useMembers();
  const { memberIds, isLoading, isMutating, addMembers, removeMember } = useArdoiseMembers(open ? ardoiseId : null);
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null);

  const sharers = householdMembers.filter((member) => member.role === 'admin' || member.role === 'membre');
  const inArdoise = sharers.filter((member) => memberIds.includes(member.id));
  const candidates = sharers.filter((member) => !memberIds.includes(member.id));

  const add = (memberId: string, name: string) => {
    void addMembers([memberId])
      .then(() => toast(`${name} ajouté à l’ardoise.`))
      .catch((addError: unknown) =>
        toast(addError instanceof Error ? addError.message : 'Ajout impossible.', 'error'),
      );
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    const { id, name } = pendingRemoval;
    setPendingRemoval(null);
    void removeMember(id)
      .then(() => toast(`${name} retiré de l’ardoise, historique conservé.`))
      .catch((removalError: unknown) =>
        toast(removalError instanceof Error ? removalError.message : 'Retrait impossible.', 'error'),
      );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow mb-2">Ardoise</p>
            <DialogTitle>Membres de « {ardoiseName} »</DialogTitle>
            <DialogDescription>
              {canManage
                ? 'Ajoutez des membres du foyer ou retirez-en. Le retrait conserve les dépenses.'
                : 'Seul un admin du foyer peut modifier les membres.'}
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <LoadingRows rows={2} />
          ) : inArdoise.length === 0 && candidates.length === 0 ? (
            <EmptyState icon="people" title="Aucun membre éligible" description="Le foyer ne compte aucun admin ni membre." />
          ) : (
            <div className="grid gap-4">
              <section className="grid gap-2">
                <h3 className="m-0 text-[11px] font-extrabold text-muted">
                  Dans l’ardoise ({inArdoise.length})
                </h3>
                {inArdoise.length === 0 ? (
                  <p className="m-0 text-[12px] text-muted">Personne pour le moment.</p>
                ) : (
                  <ul className="grid gap-2">
                    {inArdoise.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 rounded-[11px] border border-border px-3 py-2.5"
                      >
                        <MemberAvatar member={member} size="sm" />
                        <strong className="min-w-0 flex-1 truncate text-[13px]">{member.display_name}</strong>
                        {canManage ? (
                          <Button
                            variant="secondary"
                            onClick={() => setPendingRemoval({ id: member.id, name: member.display_name })}
                            disabled={isMutating}
                          >
                            Retirer
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {canManage && candidates.length > 0 ? (
                <section className="grid gap-2">
                  <h3 className="m-0 text-[11px] font-extrabold text-muted">
                    Ajouter ({candidates.length})
                  </h3>
                  <ul className="grid gap-2">
                    {candidates.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 rounded-[11px] border border-border px-3 py-2.5"
                      >
                        <MemberAvatar member={member} size="sm" />
                        <strong className="min-w-0 flex-1 truncate text-[13px]">{member.display_name}</strong>
                        <Button variant="secondary" onClick={() => add(member.id, member.display_name)} disabled={isMutating}>
                          Ajouter
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRemoval(null);
        }}
        title={`Retirer « ${pendingRemoval?.name ?? ''} » ?`}
        description="Ses dépenses restent dans l’historique, mais ses soldes ne seront plus calculés."
        confirmLabel="Retirer"
        onConfirm={confirmRemoval}
      />
    </>
  );
}
