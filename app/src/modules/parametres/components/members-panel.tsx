import { useState } from 'react';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { CountBadge, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useIsAdmin, useMembers } from '@/stores/household-store';
import { removeMember } from '../api';
import { roleLabels, roleOrder } from '../types';

const roleChangeNotice = 'Bientôt disponible — passe par une Edge Function sécurisée';

export function MembersPanel() {
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const members = useMembers();
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const setMembers = useHouseholdStore((state) => state.setMembers);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const admins = members.filter((member) => member.role === 'admin');
  const ordered = [...members].sort(
    (left, right) => roleOrder.indexOf(left.role) - roleOrder.indexOf(right.role) || left.display_name.localeCompare(right.display_name),
  );
  const target = members.find((member) => member.id === pendingRemoval) ?? null;
  const isLastAdmin = target?.role === 'admin' && admins.length === 1;

  return (
    <Panel
      title="Les membres du foyer"
      description="Rôle et couleur de chacun : le code couleur est partagé dans toute l’application."
      action={<CountBadge value={members.length} label="membres" />}
    >
      <ul className="grid list-none gap-0 p-0">
        {ordered.map((member) => {
          const isSelf = member.id === currentMemberId;
          return (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <MemberAvatar member={member} size="md" />
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px]">
                  {member.display_name}
                  {isSelf ? <span className="ml-1.5 text-[10px] font-normal text-muted">vous</span> : null}
                </strong>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <i className={`size-2 rounded-full ${memberTagClass(member.color_tag)}`} aria-hidden="true" />
                  {roleLabels[member.role]}
                </span>
              </div>
              <Badge tone={member.role === 'admin' ? 'accent' : member.role === 'enfant' ? 'amber' : 'muted'}>
                {roleLabels[member.role]}
              </Badge>
              {isAdmin ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="people"
                    disabled
                    title={roleChangeNotice}
                    aria-describedby="role-change-notice"
                  >
                    Changer le rôle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    className="hover:bg-coral-soft hover:text-coral"
                    disabled={isSelf}
                    aria-label={`Retirer ${member.display_name} du foyer`}
                    onClick={() => setPendingRemoval(member.id)}
                  >
                    Retirer
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isAdmin ? (
        <p id="role-change-notice" className="mt-4 mb-0 rounded-[11px] bg-bg p-3 text-[11px] text-muted">
          {roleChangeNotice} : un rôle n’est jamais modifié depuis le client, la Row Level Security l’interdit (AGENTS.md §2.6).
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title={target ? `Retirer ${target.display_name} du foyer ?` : 'Retirer ce membre ?'}
        description={
          isLastAdmin
            ? 'C’est le dernier administrateur du foyer : demandez-lui de nommer un remplaçant avant de le retirer.'
            : 'Cette personne perdra l’accès au foyer. Ses messages et ses contributions restent dans l’historique.'
        }
        confirmLabel="Retirer du foyer"
        onConfirm={async () => {
          if (!target) return;
          try {
            await removeMember(target.id);
            setMembers(members.filter((member) => member.id !== target.id));
            toast(`${target.display_name} ne fait plus partie du foyer.`);
          } catch (removeError) {
            toast(removeError instanceof Error ? removeError.message : 'Retrait impossible.', 'error');
          } finally {
            setPendingRemoval(null);
          }
        }}
      />
    </Panel>
  );
}
