/**
 * Rubrique Membres d'un voyage (0120) : liste complète — membres du foyer
 * (cochables) + invités externes (lecture seule, ils rejoignent par code).
 *
 * Le cochage est réservé aux admins du foyer (section Paramètres) : en
 * ligne via l'Edge `member-add` / `member-remove` (RPC 0120, jamais le
 * dernier participant), en démo rejoué en local. L'onglet Infos affiche
 * déjà la liste en lecture seule.
 */

import { useMemo, useState } from 'react';
import { Panel } from '@/components/shared/module-shell';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMembers } from '@/stores/household-store';
import type { TripGuestRow } from '@/types';
import { addTripMember, removeTripMember } from '../api';

export interface TripMembersSectionProps {
  tripId: string;
  /** Participants actuels du voyage (ids de membres). */
  participantIds: string[];
  /** Invités externes (lecture seule). */
  guests: TripGuestRow[];
  /** Admin du foyer et voyage non figé : cochage proposé. */
  canManage: boolean;
  /** Voyage figé : lecture seule même pour les admins. */
  frozen?: boolean;
  /** Relit la fiche après chaque changement (participants + compteurs). */
  onChanged: () => void;
}

export function TripMembersSection({
  tripId,
  participantIds,
  guests,
  canManage,
  frozen = false,
  onChanged,
}: TripMembersSectionProps) {
  const toast = useToast();
  const members = useMembers();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const participants = useMemo(() => new Set(participantIds), [participantIds]);

  const toggle = (memberId: string, checked: boolean) => {
    if (!canManage || pendingId) return;
    setPendingId(memberId);
    (checked ? removeTripMember(tripId, memberId) : addTripMember(tripId, memberId))
      .then(() => {
        onChanged();
        toast(checked ? 'Membre retiré du voyage.' : 'Membre ajouté au voyage.');
      })
      .catch((toggleError: unknown) =>
        toast(toggleError instanceof Error ? toggleError.message : 'Modification impossible.', 'error'),
      )
      .finally(() => setPendingId(null));
  };

  return (
    <Panel
      id="trip-membres"
      title="Membres du voyage"
      description={
        canManage
          ? 'Cochez les voyageurs : membres du foyer et enfants — le budget reste aux adultes.'
          : 'Voyageurs du foyer et invités. Seuls les administrateurs du foyer peuvent modifier la liste.'
      }
    >
      {members.length === 0 ? (
        <EmptyState icon="users" title="Aucun membre" description="Le foyer n’a pas encore de membres." />
      ) : (
        <div className="grid gap-2" role="group" aria-label="Participants du voyage">
          {members.map((member) => {
            const checked = participants.has(member.id);
            const pending = pendingId === member.id;
            return (
              <label
                key={member.id}
                className={
                  checked
                    ? 'inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-accent bg-accent-faint px-2.5 text-[12px] font-semibold text-accent-strong'
                    : 'inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted'
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canManage || pending}
                  onChange={() => toggle(member.id, checked)}
                  className="accent-accent"
                  aria-label={`${checked ? 'Retirer' : 'Ajouter'} ${member.display_name} ${member.role === 'enfant' ? '(enfant, sans budget)' : ''}`}
                />
                <MemberAvatar member={member} size="sm" />
                {member.display_name}
                {member.role === 'enfant' ? (
                  <span className="text-[11px] font-bold text-muted">enfant · sans budget</span>
                ) : null}
                {pending ? '…' : ''}
              </label>
            );
          })}
        </div>
      )}
      {frozen && canManage ? (
        <p className="mt-2.5 mb-0 text-[11px] text-muted" role="status">
          Voyage figé : la liste reprendra à la réouverture.
        </p>
      ) : null}
      {guests.length > 0 ? (
        <p className="mt-2.5 mb-0 text-[12px] text-muted">
          Invités : {guests.map((guest) => guest.display_name).join(', ')} — ils rejoignent par code, sans compte.
        </p>
      ) : (
        <p className="mt-2.5 mb-0 text-[12px] text-muted" role="status">
          Aucun invité pour le moment — le partage par code se gère ci-dessous.
        </p>
      )}
    </Panel>
  );
}
