import { useState } from 'react';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { CountBadge, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogActions, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useIsAdmin, useMembers } from '@/stores/household-store';
import type { HouseholdMemberRow } from '@/types';
import { removeMember, renameMember, setMemberRole } from '../api';
import { roleLabels, roleOrder } from '../types';
import type { Role } from '@/types';

const roleChangeNotice = 'Seul un administrateur change un rôle, via une opération serveur qui protège le dernier administrateur du foyer.';

export function MembersPanel() {
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const members = useMembers();
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const setMembers = useHouseholdStore((state) => state.setMembers);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<HouseholdMemberRow | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, setRenamePending] = useState(false);
  const [roleTarget, setRoleTarget] = useState<HouseholdMemberRow | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role>('membre');
  const [roleError, setRoleError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);

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
                    icon="edit"
                    onClick={() => {
                      setRenaming(member);
                      setDraftName(member.display_name);
                      setRenameError(null);
                    }}
                    aria-label={`Renommer ${member.display_name}`}
                  >
                    Renommer
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="people"
                    onClick={() => {
                      setRoleTarget(member);
                      setRoleDraft(member.role);
                      setRoleError(null);
                    }}
                    aria-label={`Changer le rôle de ${member.display_name}`}
                    aria-describedby="role-change-notice"
                  >
                    Rôle
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
          {roleChangeNotice}
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}        title={target ? `Retirer ${target.display_name} du foyer ?` : 'Retirer ce membre ?'}
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

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Renommer {renaming?.display_name}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!renaming) return;
              setRenamePending(true);
              setRenameError(null);
              try {
                await renameMember(renaming.id, draftName);
                setMembers(members.map((member) => (member.id === renaming.id ? { ...member, display_name: draftName.trim() } : member)));
                setRenaming(null);
                toast('Membre renommé.');
              } catch (renameError) {
                setRenameError(renameError instanceof Error ? renameError.message : 'Renommage impossible.');
              } finally {
                setRenamePending(false);
              }
            }}
          >
            <Field label="Prénom et nom" error={renameError ?? undefined}>
              {(props) => (
                <Input {...props} value={draftName} onChange={(event) => setDraftName(event.target.value)} autoComplete="off" />
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setRenaming(null)}>
                Annuler
              </Button>
              <Button type="submit" icon="check" disabled={renamePending}>
                {renamePending ? 'Enregistrement…' : 'Renommer'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Rôle de {roleTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!roleTarget) return;
              setRolePending(true);
              setRoleError(null);
              try {
                await setMemberRole(roleTarget.id, roleDraft);
                setMembers(members.map((member) => (member.id === roleTarget.id ? { ...member, role: roleDraft } : member)));
                setRoleTarget(null);
                toast(`${roleTarget.display_name} est désormais ${roleLabels[roleDraft].toLowerCase()}.`);
              } catch (roleRequestError) {
                setRoleError(roleRequestError instanceof Error ? roleRequestError.message : 'Changement de rôle impossible.');
              } finally {
                setRolePending(false);
              }
            }}
          >
            <Field label="Rôle" error={roleError ?? undefined}>
              {(props) => (
                <Select {...props} value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as Role)}>
                  {(Object.keys(roleLabels) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setRoleTarget(null)}>
                Annuler
              </Button>
              <Button type="submit" icon="check" disabled={rolePending}>
                {rolePending ? 'Enregistrement…' : 'Changer le rôle'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
