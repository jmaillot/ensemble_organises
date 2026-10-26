import { useEffect, useState } from 'react';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { CountBadge, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogActions, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { useHouseholdStore, useIsAdult, useMembers } from '@/stores/household-store';
import type { HouseholdMemberRow, MemberColorTag } from '@/types';
import { removeMember, renameMember, setMemberRole, CHILD_MANAGEABLE_MODULES } from '../api';
import { childAgeLabel, childGuardianNotice, useChildProfiles } from '../hooks/use-child-profiles';
import { roleLabels, roleOrder } from '../types';
import type { Role } from '@/types';

const roleChangeNotice = 'Seul un administrateur change un rôle, via une opération serveur qui protège le dernier administrateur du foyer.';

/** Libellés des espaces servables à un enfant (clés 0146+0157, libellés D-05). */
const childModuleLabels: Record<(typeof CHILD_MANAGEABLE_MODULES)[number], string> = {
  taches: 'Espace Tâches',
  routines: 'Espace Routines',
  messages: 'Espace Messages',
  anniversaires: 'Espace Anniversaires',
  menu: 'Espace Menu',
  voyages: 'Espace Voyages',
};

const memberColorLabels: Record<MemberColorTag, string> = {
  accent: 'Pétrole',
  ink: 'Encre',
  coral: 'Corail',
  amber: 'Ambre',
  violet: 'Violet',
};
const memberColors = Object.keys(memberColorLabels) as MemberColorTag[];

export function MembersPanel() {
  const toast = useToast();
  // D-01 : administrateur ET membre gèrent les profils enfants — les actions
  // de gestion des membres suivent useIsAdult, pas useIsAdmin.
  const isAdult = useIsAdult();
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

  // Profils enfants (D-02) : fiche, espaces, accès, suppression — tous les
  // écritures passent par le hook, donc par les RPC 0146/0148.
  const { save: saveChild, update: updateChild, setModules, archive: archiveChild, link, giveAccess } = useChildProfiles();
  const [creatingChild, setCreatingChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [childBirth, setChildBirth] = useState('');
  const [childColor, setChildColor] = useState<MemberColorTag>('amber');
  const [childError, setChildError] = useState<string | null>(null);
  const [childPending, setChildPending] = useState(false);
  const [editingChild, setEditingChild] = useState<HouseholdMemberRow | null>(null);
  const [childDraftName, setChildDraftName] = useState('');
  const [childDraftBirth, setChildDraftBirth] = useState('');
  // D-05 : la couleur fait partie de la fiche enrichie — éditable comme au
  // moment de la création, jamais figée sur la valeur d'origine.
  const [childEditColor, setChildEditColor] = useState<MemberColorTag>('amber');
  const [childEditError, setChildEditError] = useState<string | null>(null);
  const [childEditPending, setChildEditPending] = useState(false);
  const [modulesTarget, setModulesTarget] = useState<HouseholdMemberRow | null>(null);
  const [modulesDraft, setModulesDraft] = useState<string[]>([]);
  const [modulesPending, setModulesPending] = useState(false);
  const [accessTarget, setAccessTarget] = useState<HouseholdMemberRow | null>(null);
  const [accessLinkDraft, setAccessLinkDraft] = useState('');
  const [linkPending, setLinkPending] = useState(false);
  const [pendingLinkConfirm, setPendingLinkConfirm] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<HouseholdMemberRow | null>(null);

  const admins = members.filter((member) => member.role === 'admin');
  const ordered = [...members].sort(
    (left, right) => roleOrder.indexOf(left.role) - roleOrder.indexOf(right.role) || left.display_name.localeCompare(right.display_name),
  );
  const target = members.find((member) => member.id === pendingRemoval) ?? null;
  const isLastAdmin = target?.role === 'admin' && admins.length === 1;
  const children = members.filter((member) => member.role === 'enfant');
  // Comptes adultes reliables : les adultes du foyer, hors la fiche visée. La
  // base (0148) refuse seule une ligne sans compte — ici on liste, elle
  // décide (même règle que la RLS : le client propose, le serveur invalide).
  const adultAccounts = members.filter(
    (member) => member.role !== 'enfant' && member.id !== accessTarget?.id,
  );
  const openChildCreation = () => {
    setChildName('');
    setChildBirth('');
    setChildColor('amber');
    setChildError(null);
    setCreatingChild(true);
  };

  // D-21 : le lien d'invitation rappelable sur CET appareil est montré dans
  // la boîte ; sinon la fiche renvoie vers l'onglet Inviter (jamais un token
  // deviné). La recherche repart à chaque ouverture.
  const householdId = useHouseholdStore((state) => state.householdId);
  const [accessLinkUrl, setAccessLinkUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!accessTarget || !householdId) {
      setAccessLinkUrl(null);
      return;
    }
    let cancelled = false;
    giveAccess(householdId)
      .then((url) => {
        if (!cancelled) setAccessLinkUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAccessLinkUrl(null);
      });
    // `giveAccess` est une référence stable du module ; la relance porte sur
    // la fiche ouverte et le foyer courant.
    return () => {
      cancelled = true;
    };
  }, [accessTarget, householdId, giveAccess]);

  return (
    <Panel
      title="Les membres du foyer"
      description="Rôle et couleur de chacun : le code couleur est partagé dans toute l’application."
      action={<CountBadge value={members.length} label="membres" />}
    >
      <ul className="grid list-none gap-0 p-0">
        {ordered.map((member) => {
          const isSelf = member.id === currentMemberId;
          const isManagedChild = member.role === 'enfant';
          const age = isManagedChild ? childAgeLabel(member.birth_date) : null;
          return (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <MemberAvatar member={member} size="md" />
              <div className="min-w-0 flex-1">
                {/* A5 : un nom long est tronqué dans sa ligne, jamais débordé. */}
                <strong className="block truncate text-[13px]">
                  {member.display_name}
                  {isSelf ? <span className="ml-1.5 text-[11px] font-normal text-muted">vous</span> : null}
                </strong>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <i className={`size-2 rounded-full ${memberTagClass(member.color_tag)}`} aria-hidden="true" />
                  {roleLabels[member.role]}
                  {/* D-05 : l’âge sur la fiche, jamais un âge inventé. Le
                      point séparateur vit dans son nœud : l'âge reste un
                      texte exact, requêtable. */}
                  {age ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{age}</span>
                    </>
                  ) : null}
                </span>
              </div>
              <Badge tone={member.role === 'admin' ? 'accent' : isManagedChild ? 'amber' : 'muted'}>
                {roleLabels[member.role]}
              </Badge>
              {isAdult && isManagedChild ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="edit"
                    aria-label={`Modifier la fiche de ${member.display_name}`}
                    onClick={() => {
                      setEditingChild(member);
                      setChildDraftName(member.display_name);
                      setChildDraftBirth(member.birth_date ?? '');
                      setChildEditColor(member.color_tag);
                      setChildEditError(null);
                    }}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="grid"
                    aria-label={`Espaces de ${member.display_name}`}
                    onClick={() => {
                      setModulesTarget(member);
                      setModulesDraft([...member.managed_modules]);
                    }}
                  >
                    Espaces
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="link"
                    aria-label={`Donner accès à ${member.display_name}`}
                    onClick={() => {
                      setAccessTarget(member);
                      setAccessLinkDraft('');
                    }}
                  >
                    Donner accès
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    className="hover:bg-coral-soft hover:text-coral-text"
                    aria-label={`Supprimer la fiche de ${member.display_name}`}
                    onClick={() => setPendingArchive(member)}
                  >
                    Supprimer
                  </Button>
                </div>
              ) : null}
              {isAdult && !isManagedChild ? (
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
                    className="hover:bg-coral-soft hover:text-coral-text"
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
      {isAdult && children.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aucun profil enfant"
          description="Les enfants du foyer apparaissent dans les listes sans avoir besoin de compte. Créez une fiche pour chacun."
          className="min-h-0 py-6 text-left"
        />
      ) : null}
      {children.map((child) => (
        <p key={child.id} className="mb-0 mt-3 rounded-[14px] bg-bg p-3 text-[12px] text-muted">
          {childGuardianNotice(child.display_name)}
        </p>
      ))}
      {isAdult ? (
        <div className="mt-4">
          {/* Icône `people` : la fiche crée un membre du foyer, pas un ajout générique. */}
          <Button icon="people" onClick={openChildCreation}>
            Ajouter un enfant
          </Button>
        </div>
      ) : null}
      {isAdult ? (
        <p id="role-change-notice" className="mt-4 mb-0 rounded-[14px] bg-bg p-3 text-[12px] text-muted">
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
                  {/* « Enfant » exclu : une fiche enfant se crée par « Ajouter un
                      enfant » (0146), jamais par le rôle — la base refuse 22023,
                      proposer l'option ne ferait qu'offrir une erreure morte. */}
                  {(Object.keys(roleLabels) as Role[])
                    .filter((role) => role !== 'enfant')
                    .map((role) => (
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

      {/* D-02 : création d'une fiche enfant sans compte — RPC 0146, socle D-06. */}
      <Dialog
        open={creatingChild}
        onOpenChange={(open) => {
          if (!open) setCreatingChild(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Nouveau profil enfant</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={async (event) => {
              event.preventDefault();
              setChildPending(true);
              setChildError(null);
              try {
                await saveChild({
                  displayName: childName,
                  colorTag: childColor,
                  birthDate: childBirth || null,
                  avatarUrl: null,
                });
                setCreatingChild(false);
                toast(`La fiche de ${childName.trim().split(/\s+/)[0]} est créée.`);
              } catch (createError) {
                setChildError(createError instanceof Error ? createError.message : 'Création impossible.');
              } finally {
                setChildPending(false);
              }
            }}
          >
            <Field label="Prénom de l’enfant" error={childError ?? undefined}>
              {(props) => <Input {...props} value={childName} onChange={(event) => setChildName(event.target.value)} autoComplete="off" />}
            </Field>
            <Field label="Date de naissance (optionnelle)">
              {(props) => <Input {...props} type="date" value={childBirth} onChange={(event) => setChildBirth(event.target.value)} />}
            </Field>
            <Field label="Couleur">
              {(props) => (
                <Select {...props} value={childColor} onChange={(event) => setChildColor(event.target.value as MemberColorTag)}>
                  {memberColors.map((color) => (
                    <option key={color} value={color}>
                      {memberColorLabels[color]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setCreatingChild(false)}>
                Annuler
              </Button>
              <Button type="submit" icon="check" disabled={childPending}>
                {childPending ? 'Création…' : 'Ajouter la fiche'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* Édition de la fiche : même RPC, la base réécrit birth_date sans
          coalesce — le hook renvoie toujours la valeur courante. */}
      <Dialog
        open={editingChild !== null}
        onOpenChange={(open) => {
          if (!open) setEditingChild(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Modifier la fiche de {editingChild?.display_name}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editingChild) return;
              setChildEditPending(true);
              setChildEditError(null);
              try {
                await updateChild(editingChild.id, {
                  displayName: childDraftName,
                  colorTag: childEditColor,
                  birthDate: childDraftBirth || null,
                  avatarUrl: editingChild.avatar_url,
                });
                setEditingChild(null);
                toast('Fiche enfant mise à jour.');
              } catch (editError) {
                setChildEditError(editError instanceof Error ? editError.message : 'Mise à jour impossible.');
              } finally {
                setChildEditPending(false);
              }
            }}
          >
            <Field label="Prénom de l’enfant" error={childEditError ?? undefined}>
              {(props) => (
                <Input {...props} value={childDraftName} onChange={(event) => setChildDraftName(event.target.value)} autoComplete="off" />
              )}
            </Field>
            <Field label="Date de naissance (optionnelle)">
              {(props) => (
                <Input {...props} type="date" value={childDraftBirth} onChange={(event) => setChildDraftBirth(event.target.value)} />
              )}
            </Field>
            <Field label="Couleur">
              {(props) => (
                <Select {...props} value={childEditColor} onChange={(event) => setChildEditColor(event.target.value as MemberColorTag)}>
                  {memberColors.map((color) => (
                    <option key={color} value={color}>
                      {memberColorLabels[color]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setEditingChild(null)}>
                Annuler
              </Button>
              <Button type="submit" icon="check" disabled={childEditPending}>
                {childEditPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* D-05 : les espaces sont servis PAR MEMBRE (colonne managed_modules),
          jamais par le foyer (D-05) — le RPC porte la ligne membre. */}
      <Dialog
        open={modulesTarget !== null}
        onOpenChange={(open) => {
          if (!open) setModulesTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Espaces de {modulesTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            className="grid gap-3.5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!modulesTarget) return;
              setModulesPending(true);
              try {
                await setModules(modulesTarget.id, modulesDraft, {
                  birthDate: modulesTarget.birth_date,
                  avatarUrl: modulesTarget.avatar_url,
                });
                setModulesTarget(null);
                toast('Espaces enregistrés.');
              } catch (modulesError) {
                toast(modulesError instanceof Error ? modulesError.message : 'Enregistrement impossible.', 'error');
              } finally {
                setModulesPending(false);
              }
            }}
          >
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              {/* D-06 : la fiche décide où l'enfant peut figurer — le libellé
                  parle d'apparition dans l'espace, jamais de vision técnica. */}
              <legend className="mb-1 text-[12px] text-muted">
                Espaces où {modulesTarget?.display_name} peut figurer&nbsp;:
              </legend>
              {CHILD_MANAGEABLE_MODULES.map((moduleKey) => (
                <label key={moduleKey} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={modulesDraft.includes(moduleKey)}
                    onChange={(event) =>
                      setModulesDraft(
                        event.target.checked
                          ? [...modulesDraft, moduleKey]
                          : modulesDraft.filter((key) => key !== moduleKey),
                      )
                    }
                  />
                  {childModuleLabels[moduleKey]}
                </label>
              ))}
            </fieldset>
            <DialogActions>
              <Button variant="secondary" onClick={() => setModulesTarget(null)}>
                Annuler
              </Button>
              <Button type="submit" icon="check" disabled={modulesPending}>
                {modulesPending ? 'Enregistrement…' : 'Enregistrer les espaces'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* D-21 : le lien d'invitation du foyer sert aussi aux enfants sans
          compte ; sans token rappelable, la fiche renvoie vers Inviter. */}
      <Dialog
        open={accessTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAccessTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">Foyer</p>
            <DialogTitle>Donner accès à {accessTarget?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3.5">
            <p className="m-0 text-[13px]">
              Utilisez le lien d’invitation du foyer pour créer un vrai compte à son nom. Sans compte, un adulte agit pour
              elle ; s’il n’y a plus de lien rappelé sur cet appareil, régénérez-en un dans l’onglet « Inviter ».
            </p>
            {accessLinkUrl ? (
              <p className="m-0 break-all rounded-[14px] bg-bg p-3 text-[12px]">
                {accessLinkUrl}
              </p>
            ) : null}
            <Field label="Compte à relier">
              {(props) => (
                <Select {...props} value={accessLinkDraft} onChange={(event) => setAccessLinkDraft(event.target.value)}>
                  <option value="">Choisir un compte adulte</option>
                  {adultAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.display_name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setAccessTarget(null)}>
                Fermer
              </Button>
              <Button icon="link" disabled={!accessLinkDraft || linkPending} onClick={() => setPendingLinkConfirm(true)}>
                Lier le compte
              </Button>
            </DialogActions>
          </div>
        </DialogContent>
      </Dialog>

      {/* D-19 : fusion irréversible — confirmation explicite avant l'appel. */}
      <ConfirmDialog
        open={pendingLinkConfirm}
        onOpenChange={(open) => {
          if (!open) setPendingLinkConfirm(false);
        }}
        title={`Relier la fiche au compte choisi ?`}
        description="Irréversible : tout l’historique suivra le compte."
        confirmLabel="Relier le compte"
        onConfirm={async () => {
          if (!accessTarget || !accessLinkDraft) return;
          setLinkPending(true);
          // Prénom capturé avant le reset des deux modales : le toast suit la
          // fermeture sans perdre le sujet de la phrase.
          const linkedName = accessTarget.display_name;
          try {
            await link(accessTarget.id, accessLinkDraft);
            setAccessTarget(null);
            setPendingLinkConfirm(false);
            toast(`${linkedName} a désormais son propre accès. Tout son historique suit.`);
          } catch (linkError) {
            toast(linkError instanceof Error ? linkError.message : 'Liaison impossible.', 'error');
          } finally {
            setLinkPending(false);
          }
        }}
      />

      {/* D-04 : archivage doux, confirmé avant l'appel ; le filtre vivantes du
          store écarte la ligne, jamais une suppression en local. */}
      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null);
        }}
        title={pendingArchive ? `Supprimer la fiche de ${pendingArchive.display_name} ?` : 'Supprimer cette fiche ?'}
        description={`La fiche disparaît des listes et des sélecteurs. Les tâches passées et les complétions restent dans l'historique, attribuées à ${pendingArchive?.display_name ?? 'l’enfant'}.`}
        confirmLabel="Supprimer la fiche"
        onConfirm={async () => {
          if (!pendingArchive) return;
          // Le prénom est capturé AVANT le reset : le toast l'annonce, la
          // modale s'efface sans emporter la phrase.
          const archivedName = pendingArchive.display_name;
          try {
            await archiveChild(pendingArchive.id);
            setPendingArchive(null);
            toast(`La fiche de ${archivedName} est supprimée. Ses traces restent dans l’historique.`);
          } catch (archiveError) {
            toast(archiveError instanceof Error ? archiveError.message : 'Suppression impossible.', 'error');
          }
        }}
      />
    </Panel>
  );
}
